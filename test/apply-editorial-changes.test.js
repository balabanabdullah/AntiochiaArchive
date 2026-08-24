import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { validatePackageShape, planChanges, applyPlanToEntities } from "../scripts/apply-editorial-changes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function place(overrides = {}) {
  return {
    id: "place-8001", slug: "existing-place", entityType: "place", title: { tr: "Var Olan Yer" }, status: "published", ...overrides,
  };
}

/* --------------------------------------------------------------------------
   Pure helpers
   -------------------------------------------------------------------------- */

test("validatePackageShape: accepts a well-formed package", () => {
  const pkg = { version: 1, createdAt: "x", changes: [{ changeId: "a", kind: "create", entityType: "place", proposedChanges: {} }] };
  assert.equal(validatePackageShape(pkg).valid, true);
});

test("validatePackageShape: rejects a non-1 version, a missing changes array, and duplicate changeIds", () => {
  assert.equal(validatePackageShape({ version: 2, changes: [] }).valid, false);
  assert.equal(validatePackageShape({ version: 1 }).valid, false);
  const dup = { version: 1, changes: [
    { changeId: "a", kind: "create", entityType: "place", proposedChanges: {} },
    { changeId: "a", kind: "create", entityType: "place", proposedChanges: {} },
  ] };
  const result = validatePackageShape(dup);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /duplicated/);
});

test("validatePackageShape: rejects an unknown entityType and a bad kind", () => {
  assert.equal(validatePackageShape({ version: 1, changes: [{ changeId: "a", kind: "create", entityType: "notreal", proposedChanges: {} }] }).valid, false);
  assert.equal(validatePackageShape({ version: 1, changes: [{ changeId: "a", kind: "delete", entityType: "place", proposedChanges: {} }] }).valid, false);
});

test("planChanges: dry-run — computes a valid plan without mutating the input entities array", () => {
  const entities = [place()];
  const snapshot = JSON.parse(JSON.stringify(entities));
  const pkg = { version: 1, changes: [{ changeId: "a", kind: "create", entityType: "place", proposedChanges: { id: "place-8002", slug: "new-place", title: { tr: "Yeni" } } }] };
  const { valid, plan } = planChanges(pkg, entities);
  assert.equal(valid, true);
  assert.equal(plan.length, 1);
  assert.deepEqual(entities, snapshot, "planChanges must never mutate its input");
});

test("planChanges: rejects a create change with an id colliding with an existing entity", () => {
  const entities = [place({ id: "place-8001" })];
  const pkg = { version: 1, changes: [{ changeId: "a", kind: "create", entityType: "place", proposedChanges: { id: "place-8001", slug: "different-slug", title: { tr: "X" } } }] };
  assert.equal(planChanges(pkg, entities).valid, false);
});

test("planChanges: rejects TWO create changes in the same package that collide with EACH OTHER (not just against existing data)", () => {
  const pkg = { version: 1, changes: [
    { changeId: "a", kind: "create", entityType: "place", proposedChanges: { id: "place-9101", slug: "dup-in-package", title: { tr: "A" } } },
    { changeId: "b", kind: "create", entityType: "place", proposedChanges: { id: "place-9102", slug: "dup-in-package", title: { tr: "B" } } },
  ] };
  const result = planChanges(pkg, []);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /slug/);
});

test("planChanges: rejects an edit change targeting an entity id that does not exist", () => {
  const pkg = { version: 1, changes: [{ changeId: "a", kind: "edit", entityType: "place", entityId: "place-does-not-exist", proposedChanges: { summary: { tr: "x" } } }] };
  assert.equal(planChanges(pkg, [place()]).valid, false);
});

test("planChanges: rejects any change that would set status to 'published' directly", () => {
  const createPkg = { version: 1, changes: [{ changeId: "a", kind: "create", entityType: "place", proposedChanges: { id: "place-9201", slug: "pub-test", title: { tr: "T" }, status: "published" } }] };
  assert.equal(planChanges(createPkg, []).valid, false);

  const editPkg = { version: 1, changes: [{ changeId: "a", kind: "edit", entityType: "place", entityId: "place-8001", proposedChanges: { status: "published" } }] };
  assert.equal(planChanges(editPkg, [place()]).valid, false);
});

test("planChanges: rejects a schema-invalid candidate (e.g. out-of-range coordinates)", () => {
  const pkg = { version: 1, changes: [{ changeId: "a", kind: "create", entityType: "place", proposedChanges: { id: "place-9301", slug: "bad-coords", title: { tr: "T" }, coordinates: { latitude: 999, longitude: 1 } } }] };
  assert.equal(planChanges(pkg, []).valid, false);
});

test("planChanges: rejects an edit attempting to change a locked field (id/entityType/slug)", () => {
  const pkg = { version: 1, changes: [{ changeId: "a", kind: "edit", entityType: "place", entityId: "place-8001", proposedChanges: { slug: "new-slug-not-allowed" } }] };
  assert.equal(planChanges(pkg, [place()]).valid, false);
});

test("applyPlanToEntities: a create step appends; an edit step replaces in place; no unrelated record is touched", () => {
  const untouched = place({ id: "place-8099", slug: "untouched", title: { tr: "Dokunulmamış" } });
  const target = place({ id: "place-8001", slug: "existing-place" });
  const data = { entities: [untouched, target] };
  const plan = [
    { kind: "create", entity: { id: "place-8100", slug: "brand-new", entityType: "place", title: { tr: "Yeni" }, status: "draft" } },
    { kind: "edit", entityId: "place-8001", entity: { ...target, summary: { tr: "Güncellendi" } } },
  ];
  const summary = applyPlanToEntities(data, plan);
  assert.deepEqual(summary, { created: ["place-8100"], edited: ["place-8001"] });
  assert.equal(data.entities.length, 3);
  assert.deepEqual(data.entities.find((e) => e.id === "place-8099"), untouched);
  assert.deepEqual(data.entities.find((e) => e.id === "place-8001").summary, { tr: "Güncellendi" });
});

/* --------------------------------------------------------------------------
   CLI end-to-end — scratch data only, never the real data/v2/entities.json
   -------------------------------------------------------------------------- */

function scratchDataDir(entities) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-apply-editorial-test-"));
  fs.writeFileSync(path.join(dir, "entities.json"), JSON.stringify({ entities }, null, 2));
  return dir;
}

function runCli(args) {
  return execFileSync("node", [path.resolve(REPO_ROOT, "scripts/apply-editorial-changes.js"), ...args], { cwd: REPO_ROOT, encoding: "utf-8" });
}

test("CLI dry-run (default): reports the plan but changes NOTHING on disk", () => {
  const dataDir = scratchDataDir([place()]);
  const pkgPath = path.join(dataDir, "package.json.tmp");
  fs.writeFileSync(pkgPath, JSON.stringify({ version: 1, changes: [{ changeId: "a", kind: "create", entityType: "place", proposedChanges: { id: "place-cli-0001", slug: "cli-dry-run-test", title: { tr: "T" } } }] }));

  const before = fs.readFileSync(path.join(dataDir, "entities.json"), "utf-8");
  const output = runCli(["--file", pkgPath, "--data-dir", dataDir]);
  const after = fs.readFileSync(path.join(dataDir, "entities.json"), "utf-8");

  assert.match(output, /DRY-RUN/);
  assert.equal(before, after, "a dry-run must never modify the data file");
});

test("CLI --apply: writes the planned changes to entities.json", () => {
  const dataDir = scratchDataDir([place()]);
  const pkgPath = path.join(dataDir, "package.json.tmp");
  fs.writeFileSync(pkgPath, JSON.stringify({ version: 1, changes: [{ changeId: "a", kind: "create", entityType: "place", proposedChanges: { id: "place-cli-0002", slug: "cli-apply-test", title: { tr: "T" } } }] }));

  const output = runCli(["--file", pkgPath, "--data-dir", dataDir, "--apply"]);
  assert.match(output, /APPLYING/);
  assert.match(output, /Applied\./);

  const after = JSON.parse(fs.readFileSync(path.join(dataDir, "entities.json"), "utf-8"));
  const created = after.entities.find((e) => e.id === "place-cli-0002");
  assert.ok(created);
  assert.equal(created.status, "draft");
});

test("CLI: an invalid package (schema failure) is rejected and NOTHING is written", () => {
  const dataDir = scratchDataDir([place()]);
  const pkgPath = path.join(dataDir, "package.json.tmp");
  fs.writeFileSync(pkgPath, JSON.stringify({ version: 1, changes: [{ changeId: "a", kind: "create", entityType: "place", proposedChanges: { id: "place-cli-bad", slug: "bad", title: { tr: "T" }, coordinates: { latitude: 999, longitude: 1 } } }] }));

  const before = fs.readFileSync(path.join(dataDir, "entities.json"), "utf-8");
  assert.throws(() => runCli(["--file", pkgPath, "--data-dir", dataDir, "--apply"]));
  const after = fs.readFileSync(path.join(dataDir, "entities.json"), "utf-8");
  assert.equal(before, after);
});

test("CLI: duplicate ids within the package are rejected atomically — neither change is written", () => {
  const dataDir = scratchDataDir([place()]);
  const pkgPath = path.join(dataDir, "package.json.tmp");
  fs.writeFileSync(pkgPath, JSON.stringify({ version: 1, changes: [
    { changeId: "a", kind: "create", entityType: "place", proposedChanges: { id: "place-cli-both", slug: "one", title: { tr: "A" } } },
    { changeId: "b", kind: "create", entityType: "place", proposedChanges: { id: "place-cli-both", slug: "two", title: { tr: "B" } } },
  ] }));

  assert.throws(() => runCli(["--file", pkgPath, "--data-dir", dataDir, "--apply"]));
  const after = JSON.parse(fs.readFileSync(path.join(dataDir, "entities.json"), "utf-8"));
  assert.equal(after.entities.length, 1, "neither colliding change should have been written");
});

test("CLI --apply against a scratch --data-dir never touches the real repository data/v2/entities.json", () => {
  const realPath = path.resolve(REPO_ROOT, "data/v2/entities.json");
  const before = fs.readFileSync(realPath, "utf-8");

  const dataDir = scratchDataDir([place()]);
  const pkgPath = path.join(dataDir, "package.json.tmp");
  fs.writeFileSync(pkgPath, JSON.stringify({ version: 1, changes: [{ changeId: "a", kind: "create", entityType: "place", proposedChanges: { id: "place-cli-0003", slug: "isolation-test", title: { tr: "T" } } }] }));
  runCli(["--file", pkgPath, "--data-dir", dataDir, "--apply"]);

  const after = fs.readFileSync(realPath, "utf-8");
  assert.equal(before, after, "the real repository data file must be byte-identical after a scratch-dir apply run");
});
