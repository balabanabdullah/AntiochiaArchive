#!/usr/bin/env node
// Developer-side, human-run script that turns an APPROVED editorial change
// package (exported from the admin panel — GET /api/admin/editorial/drafts/
// export) into an actual edit of the canonical repository JSON.
//
// This is the ONLY place an editorial draft's content can ever reach
// data/v2/entities.json. The admin backend (backend/admin/*) never writes
// there itself — see editorialStore.js's header for why. Running this
// script does not commit, push, or deploy anything: that stays a separate,
// deliberate, human decision (git add / git commit / the documented release
// process), exactly like every other data change in this repository.
//
// Usage:
//   node scripts/apply-editorial-changes.js --file package.json                # dry-run (default)
//   node scripts/apply-editorial-changes.js --file package.json --apply        # writes data/v2/entities.json
//   node scripts/apply-editorial-changes.js --file package.json --data-dir tmp/scratch   # point at a scratch copy (tests)
//
// Safety model: the WHOLE package is validated before anything is written.
// A single invalid/colliding change rejects the entire package — there is
// no partial-apply mode, so a canonical file can never be left half-updated.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { validateEntity } from "../backend/v2/schemas/index.js";
import { ENTITY_TYPES } from "../backend/v2/constants/vocabularies.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      args[key] = value;
    }
  }
  return args;
}

/** Structural validation of the package itself — shape, not content. */
export function validatePackageShape(pkg) {
  const errors = [];
  if (!pkg || typeof pkg !== "object") return { valid: false, errors: ["Package must be a JSON object."] };
  if (pkg.version !== 1) errors.push("version must be 1.");
  if (!Array.isArray(pkg.changes)) errors.push("changes must be an array.");
  if (errors.length) return { valid: false, errors };

  const seenChangeIds = new Set();
  for (const [i, change] of pkg.changes.entries()) {
    const at = `changes[${i}]`;
    if (!change || typeof change !== "object") { errors.push(`${at} must be an object.`); continue; }
    if (!change.changeId || typeof change.changeId !== "string") errors.push(`${at}.changeId is required.`);
    if (seenChangeIds.has(change.changeId)) errors.push(`${at}.changeId '${change.changeId}' is duplicated in this package.`);
    seenChangeIds.add(change.changeId);
    if (change.kind !== "create" && change.kind !== "edit") errors.push(`${at}.kind must be 'create' or 'edit'.`);
    if (!ENTITY_TYPES.includes(change.entityType)) errors.push(`${at}.entityType must be one of: ${ENTITY_TYPES.join(", ")}.`);
    if (change.kind === "edit" && !change.entityId) errors.push(`${at}.entityId is required for an edit change.`);
    if (!change.proposedChanges || typeof change.proposedChanges !== "object") errors.push(`${at}.proposedChanges must be an object.`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validates every change against the REAL current entity set (schema +
 * id/slug collisions, including collisions between two "create" changes in
 * the same package) and returns, per change, the exact mutation to apply.
 * Never mutates `entities` — purely computes what WOULD happen.
 */
export function planChanges(pkg, entities) {
  const errors = [];
  const plan = [];
  const workingSet = [...entities]; // grows as "create" changes are planned, so later changes see earlier ones
  const byId = new Map(entities.map((e) => [e.id, e]));

  for (const [i, change] of pkg.changes.entries()) {
    const at = `changes[${i}] (${change.changeId})`;

    if (change.kind === "create") {
      const candidate = { status: "draft", ...change.proposedChanges, entityType: change.entityType };
      if (candidate.status === "published") {
        errors.push(`${at}: a create change must never set status to 'published' directly.`);
        continue;
      }
      if (!candidate.id) { errors.push(`${at}: proposedChanges.id is required for a create change.`); continue; }
      if (!candidate.slug || !SLUG_PATTERN.test(candidate.slug)) { errors.push(`${at}: proposedChanges.slug is missing or invalid.`); continue; }
      if (workingSet.some((e) => e.id === candidate.id)) { errors.push(`${at}: id '${candidate.id}' already exists.`); continue; }
      if (workingSet.some((e) => e.slug === candidate.slug)) { errors.push(`${at}: slug '${candidate.slug}' already exists.`); continue; }
      const schemaResult = validateEntity(candidate);
      if (!schemaResult.valid) { errors.push(`${at}: ${schemaResult.error}`); continue; }
      workingSet.push(candidate);
      plan.push({ changeId: change.changeId, kind: "create", entity: candidate });
      continue;
    }

    // kind === "edit"
    const base = byId.get(change.entityId);
    if (!base) { errors.push(`${at}: entity '${change.entityId}' was not found.`); continue; }
    for (const locked of ["id", "entityType", "slug"]) {
      if (Object.hasOwn(change.proposedChanges, locked) && change.proposedChanges[locked] !== base[locked]) {
        errors.push(`${at}: '${locked}' cannot be changed by an edit change.`);
      }
    }
    if (Object.hasOwn(change.proposedChanges, "status") && change.proposedChanges.status === "published") {
      errors.push(`${at}: an edit change must never set status to 'published' directly.`);
    }
    const merged = { ...base, ...change.proposedChanges };
    const schemaResult = validateEntity(merged);
    if (!schemaResult.valid) errors.push(`${at}: ${schemaResult.error}`);
    if (errors.some((e) => e.startsWith(at))) continue;
    plan.push({ changeId: change.changeId, kind: "edit", entityId: change.entityId, entity: merged });
  }

  return { valid: errors.length === 0, errors, plan };
}

function readEntitiesFile(dataDir) {
  const filePath = path.join(dataDir, "entities.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  return { filePath, data: JSON.parse(raw) };
}

/** Applies a validated plan to `data.entities` in place and returns a summary. Pure aside from the mutation of the passed-in object. */
export function applyPlanToEntities(data, plan) {
  const summary = { created: [], edited: [] };
  for (const step of plan) {
    if (step.kind === "create") {
      data.entities.push(step.entity);
      summary.created.push(step.entity.id);
    } else {
      const index = data.entities.findIndex((e) => e.id === step.entityId);
      data.entities[index] = step.entity;
      summary.edited.push(step.entityId);
    }
  }
  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error("Usage: node scripts/apply-editorial-changes.js --file <change-package.json> [--apply] [--data-dir data/v2]");
    process.exitCode = 1;
    return;
  }
  const isApply = args.apply === true;
  const dataDir = path.resolve(REPO_ROOT, args["data-dir"] || "data/v2");

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.resolve(args.file), "utf-8"));
  } catch (error) {
    console.error(`Could not read/parse ${args.file}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const shape = validatePackageShape(pkg);
  if (!shape.valid) {
    console.error("Package rejected — shape errors:\n" + shape.errors.map((e) => `  - ${e}`).join("\n"));
    process.exitCode = 1;
    return;
  }

  const { filePath, data } = readEntitiesFile(dataDir);
  const { valid, errors, plan } = planChanges(pkg, data.entities);
  if (!valid) {
    console.error("Package rejected — validation errors:\n" + errors.map((e) => `  - ${e}`).join("\n"));
    process.exitCode = 1;
    return;
  }

  console.log(`${isApply ? "APPLYING" : "DRY-RUN"}: ${plan.length} change(s) from ${args.file}`);
  for (const step of plan) {
    console.log(`  ${step.kind === "create" ? "CREATE" : "EDIT  "} ${step.kind === "create" ? step.entity.id : step.entityId} (${step.entity.entityType})`);
  }

  if (!isApply) {
    console.log("\nDry-run only — no files were written. Re-run with --apply to write data/v2/entities.json.");
    return;
  }

  applyPlanToEntities(data, plan);
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  fs.writeFileSync(filePath, serialized);

  // Keep the Cloud-Run-bundled copy in sync (see backend/test/v2/dataBundleDrift.test.js)
  // — only when applying against the real repository data dir, never a test scratch dir.
  if (dataDir === path.resolve(REPO_ROOT, "data/v2")) {
    fs.writeFileSync(path.resolve(REPO_ROOT, "backend/data/v2/entities.json"), serialized);
  }

  console.log(`\nApplied. Updated: ${filePath}`);
  console.log("This script did NOT run tests/build, and did NOT git add/commit/push/deploy.");
  console.log("Before committing: run `npm test`, `cd backend && npm test`, and `npm run build` and confirm all pass.");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
