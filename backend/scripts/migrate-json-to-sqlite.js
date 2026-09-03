#!/usr/bin/env node
// Imports the existing canonical JSON dataset (data/archive.json mapped
// through the validated v1->v2 mapper, plus data/v2/entities.json and
// data/v2/relationships.json) into the SQLite runtime database (Section 6,
// 37, 41 of the "no-code CMS" round brief).
//
// Deliberately reuses backend/v2/stores/localMappedV2Store.js — the SAME
// merge pipeline that already serves V2_DATA_STORE=local today (v1 mapping,
// legacy-replacement suppression, native v2 validation, relationship
// referential-integrity checking) — rather than re-deriving any of that
// logic here. This is what guarantees the imported SQLite dataset is
// byte-identical in content to what `local` mode already serves: every id,
// slug, status, coordinate, source reference, media reference, and
// relationship comes from the exact same already-trusted, already-tested
// code path. A discrepancy here would mean localMappedV2Store itself is
// broken, not this script.
//
// Usage:
//   node scripts/migrate-json-to-sqlite.js --dry-run   # validates + reports counts, writes nothing
//   node scripts/migrate-json-to-sqlite.js --apply     # writes into SQLITE_DB_PATH
//
// Idempotent: an id/slug already present in the target database is skipped
// (reported, never duplicated, never overwritten) — safe to re-run after a
// partial import or to pick up nothing-changed reassurance.

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createLocalMappedV2Store } from "../v2/stores/localMappedV2Store.js";
import { initializeSqlite } from "../db/sqliteConnection.js";
import { applyPendingMigrations } from "../db/migrate.js";
import { insertEntity, idExists, slugExists, countByType } from "../db/repositories/entityRepository.js";
import { insertRelationship, relationshipIdExists } from "../db/repositories/relationshipRepository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(BACKEND_ROOT, ".env") });

const flags = new Set(process.argv.slice(2));
const dryRun = flags.has("--dry-run");
const apply = flags.has("--apply");
const knownFlags = new Set(["--dry-run", "--apply"]);

function validateOptions() {
  for (const flag of flags) {
    if (!knownFlags.has(flag)) throw new Error(`Unknown option: ${flag}`);
  }
  if (dryRun === apply) {
    throw new Error("Choose exactly one migration mode: --dry-run or --apply.");
  }
}

async function loadSourceEntities() {
  const store = createLocalMappedV2Store();
  await store.initialize();
  const entities = (await store.listEntities({ limit: 100000 })).items;
  const relationships = (await store.listRelationships({ limit: 100000 })).items;
  return { entities, relationships };
}

function countByTypeOf(entities) {
  const out = {};
  for (const entity of entities) out[entity.entityType] = (out[entity.entityType] || 0) + 1;
  return out;
}

async function migrate() {
  validateOptions();
  const { entities, relationships } = await loadSourceEntities();
  const sourceCounts = countByTypeOf(entities);

  console.log(`Source (data/archive.json + data/v2/*.json, merged+validated): ${entities.length} entities, ${relationships.length} relationships.`);
  console.log("By type:", JSON.stringify(sourceCounts));
  console.log(`Migration mode: ${dryRun ? "dry-run" : "apply"}`);

  if (dryRun) {
    console.log("Dry run complete. SQLite was not opened and no data was written.");
    return;
  }

  initializeSqlite();
  applyPendingMigrations({ verbose: false });

  let entitiesInserted = 0;
  let entitiesSkipped = 0;
  for (const entity of entities) {
    if (idExists(entity.id) || (entity.slug && slugExists(entity.slug))) {
      entitiesSkipped += 1;
      continue;
    }
    insertEntity(entity);
    entitiesInserted += 1;
  }

  let relationshipsInserted = 0;
  let relationshipsSkipped = 0;
  for (const relationship of relationships) {
    if (relationshipIdExists(relationship.id)) {
      relationshipsSkipped += 1;
      continue;
    }
    insertRelationship(relationship);
    relationshipsInserted += 1;
  }

  const targetCounts = countByType();
  const countsMatch = Object.keys(sourceCounts).every((type) => (targetCounts[type] || 0) >= sourceCounts[type]);

  console.log(`Inserted ${entitiesInserted} entities (skipped ${entitiesSkipped} already present).`);
  console.log(`Inserted ${relationshipsInserted} relationships (skipped ${relationshipsSkipped} already present).`);
  console.log("SQLite counts by type after import:", JSON.stringify(targetCounts));
  if (!countsMatch) {
    throw new Error("Post-import count verification FAILED: SQLite per-type counts do not cover the source counts. No further writes were attempted, but investigate before trusting this database.");
  }
  console.log("Count verification PASSED: every source entity type is fully represented in SQLite.");
}

migrate().catch((error) => {
  console.error(`[Migration] ${error.message}`);
  process.exitCode = 1;
});
