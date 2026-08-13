// Integration tests for the full LocalMappedV2Store merge pipeline: real
// data/archive.json (23 mapped v1 records) + native v2 entities/
// relationships loaded from temporary fixture files (never the committed
// data/v2/entities.json / data/v2/relationships.json, which must remain
// empty — see V2-ARCHITECTURE.md "No cultural content authored in this
// task"). Fixture ids are obviously fictional (e.g. "community-test-1").

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { createLocalMappedV2Store } from "../../../v2/stores/localMappedV2Store.js";
import { loadNativeEntities, loadNativeRelationships } from "../../../v2/localData/nativeV2DataSource.js";
import { loadLegacyReplacements } from "../../../v2/localData/legacyReplacements.js";
import { assertValidArchive } from "../../../dataModel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_ARCHIVE_PATH = path.resolve(__dirname, "../../../../data/archive.json");

async function loadRealArchive() {
  const raw = await fs.readFile(REAL_ARCHIVE_PATH, "utf-8");
  return assertValidArchive(JSON.parse(raw));
}

async function withTempDir(context) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-v2-merge-"));
  context.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Builds a store wired to real data/archive.json plus fixture native files.
 * `replacementsFilePath` is optional: omitted, it falls back to the real,
 * committed data/v2/legacyReplacements.json — safe to leave as the default
 * in every test that doesn't care about it, because every one of that
 * file's 7 real entries only ever classifies as ACTIVE when its
 * canonicalNativeEntityId is present among the fixture native entities.
 * None of the plain community-test-1 / belief-test-1 / place-test-1
 * fixtures below use ids like "structure-0001", so the real file's entries
 * stay PENDING (no suppression) for every test that doesn't explicitly
 * introduce one of those canonical ids itself.
 */
function buildStore({ entitiesFilePath, relationshipsFilePath, replacementsFilePath }) {
  return createLocalMappedV2Store({
    loadArchive: loadRealArchive,
    loadEntities: ({ mappedEntities }) => loadNativeEntities({ filePath: entitiesFilePath, mappedEntities }),
    loadRelationships: ({ entities }) => loadNativeRelationships({ filePath: relationshipsFilePath, entities }),
    ...(replacementsFilePath
      ? { loadReplacements: ({ mappedEntities }) => loadLegacyReplacements({ filePath: replacementsFilePath, mappedEntities }) }
      : {}),
  });
}

const COMMUNITY_FIXTURE = Object.freeze({
  id: "community-test-1",
  slug: "community-test-1",
  entityType: "community",
  status: "published",
  title: { en: "Test Community Fixture" },
});

const BELIEF_FIXTURE = Object.freeze({
  id: "belief-test-1",
  slug: "belief-test-1",
  entityType: "belief",
  status: "published",
  title: { en: "Test Belief Fixture" },
});

const PLACE_FIXTURE = Object.freeze({
  id: "place-test-1",
  slug: "place-test-1",
  entityType: "place",
  status: "published",
  title: { en: "Test Place Fixture" },
});

async function setupFiles(dir, { entities = [], relationships = [], replacements = null } = {}) {
  const entitiesFilePath = path.join(dir, "entities.json");
  const relationshipsFilePath = path.join(dir, "relationships.json");
  await writeJson(entitiesFilePath, { entities });
  await writeJson(relationshipsFilePath, { relationships });
  const result = { entitiesFilePath, relationshipsFilePath };
  if (replacements) {
    const replacementsFilePath = path.join(dir, "legacyReplacements.json");
    await writeJson(replacementsFilePath, { replacements });
    result.replacementsFilePath = replacementsFilePath;
  }
  return result;
}

const CANONICAL_STRUCTURE_FIXTURE = Object.freeze({
  id: "structure-0005",
  slug: "canonical-khidr-shrine-test",
  entityType: "structure",
  status: "published",
  title: { en: "Shrine of Khidr (Canonical Test Fixture)" },
});

test("empty native entity + relationship files: local store still returns exactly 23 mapped records", async (context) => {
  const dir = await withTempDir(context);
  const paths = await setupFiles(dir);
  const store = buildStore(paths);
  await store.initialize();

  const page = await store.listEntities({ limit: 100 });
  assert.equal(page.count, 23);
  const relationships = await store.listRelationships({});
  assert.equal(relationships.count, 0);
});

test("a valid native community fixture merges correctly alongside the 23 mapped records", async (context) => {
  const dir = await withTempDir(context);
  const paths = await setupFiles(dir, { entities: [COMMUNITY_FIXTURE] });
  const store = buildStore(paths);
  await store.initialize();

  const all = await store.listEntities({ limit: 100 });
  assert.equal(all.count, 24);
  const communities = await store.listByType("community", {});
  assert.deepEqual(communities.items.map((e) => e.id), ["community-test-1"]);
});

test("a valid native belief fixture merges correctly alongside the 23 mapped records", async (context) => {
  const dir = await withTempDir(context);
  const paths = await setupFiles(dir, { entities: [BELIEF_FIXTURE] });
  const store = buildStore(paths);
  await store.initialize();

  const all = await store.listEntities({ limit: 100 });
  assert.equal(all.count, 24);
  const beliefs = await store.listByType("belief", {});
  assert.deepEqual(beliefs.items.map((e) => e.id), ["belief-test-1"]);
});

test("a valid native place fixture merges correctly alongside the 23 mapped records", async (context) => {
  const dir = await withTempDir(context);
  const paths = await setupFiles(dir, { entities: [PLACE_FIXTURE] });
  const store = buildStore(paths);
  await store.initialize();

  const all = await store.listEntities({ limit: 100 });
  assert.equal(all.count, 24);
  const places = await store.listByType("place", {});
  assert.deepEqual(places.items.map((e) => e.id), ["place-test-1"]);
});

test("a native entity id colliding with a mapped v1 id fails startup, not just a warning", async (context) => {
  const dir = await withTempDir(context);
  const paths = await setupFiles(dir, { entities: [{ ...COMMUNITY_FIXTURE, id: "b4" }] });
  const store = buildStore(paths);
  await assert.rejects(store.initialize(), /id 'b4' collides/);
});

test("a native entity slug colliding with a mapped v1 slug fails startup", async (context) => {
  const dir = await withTempDir(context);
  const paths = await setupFiles(dir, {
    entities: [{ ...COMMUNITY_FIXTURE, id: "community-test-9", slug: "habib-i-neccar-camii" }],
  });
  const store = buildStore(paths);
  await assert.rejects(store.initialize(), /slug 'habib-i-neccar-camii' collides/);
});

test("an invalid native entity fails startup rather than being silently dropped", async (context) => {
  const dir = await withTempDir(context);
  const paths = await setupFiles(dir, {
    entities: [{ id: "bad-1", slug: "bad-1", entityType: "community", status: "not-a-real-status", title: { en: "T" } }],
  });
  const store = buildStore(paths);
  await assert.rejects(store.initialize(), /failed v2 schema validation/);
});

test("a relationship with a missing source entity fails startup", async (context) => {
  const dir = await withTempDir(context);
  const paths = await setupFiles(dir, {
    entities: [BELIEF_FIXTURE],
    relationships: [{
      id: "rel-test-1", type: "hasBelief", sourceId: "does-not-exist", sourceType: "community",
      targetId: "belief-test-1", targetType: "belief",
    }],
  });
  const store = buildStore(paths);
  await assert.rejects(store.initialize(), /sourceId 'does-not-exist' does not reference any known entity/);
});

test("a relationship with a missing target entity fails startup", async (context) => {
  const dir = await withTempDir(context);
  const paths = await setupFiles(dir, {
    entities: [COMMUNITY_FIXTURE],
    relationships: [{
      id: "rel-test-1", type: "hasBelief", sourceId: "community-test-1", sourceType: "community",
      targetId: "does-not-exist", targetType: "belief",
    }],
  });
  const store = buildStore(paths);
  await assert.rejects(store.initialize(), /targetId 'does-not-exist' does not reference any known entity/);
});

test("a relationship with a sourceType mismatch fails startup", async (context) => {
  const dir = await withTempDir(context);
  const paths = await setupFiles(dir, {
    entities: [COMMUNITY_FIXTURE, BELIEF_FIXTURE],
    relationships: [{
      id: "rel-test-1", type: "hasBelief", sourceId: "community-test-1", sourceType: "belief",
      targetId: "belief-test-1", targetType: "belief",
    }],
  });
  const store = buildStore(paths);
  await assert.rejects(store.initialize(), /sourceType 'belief' does not match the actual entityType 'community'/);
});

test("a relationship with a targetType mismatch fails startup", async (context) => {
  const dir = await withTempDir(context);
  const paths = await setupFiles(dir, {
    entities: [COMMUNITY_FIXTURE, BELIEF_FIXTURE],
    relationships: [{
      id: "rel-test-1", type: "hasBelief", sourceId: "community-test-1", sourceType: "community",
      targetId: "belief-test-1", targetType: "community",
    }],
  });
  const store = buildStore(paths);
  await assert.rejects(store.initialize(), /targetType 'community' does not match the actual entityType 'belief'/);
});

test("a valid relationship from a native belief to a mapped v1 structure (b4) is accepted end-to-end", async (context) => {
  const dir = await withTempDir(context);
  const paths = await setupFiles(dir, {
    entities: [BELIEF_FIXTURE],
    relationships: [{
      id: "rel-test-1", type: "hasSite", sourceId: "belief-test-1", sourceType: "belief",
      targetId: "b4", targetType: "structure", status: "published",
    }],
  });
  const store = buildStore(paths);
  await store.initialize();

  const relationships = await store.listRelationships({});
  assert.equal(relationships.count, 1);

  const related = await store.getRelatedEntities("b4", {});
  assert.deepEqual(related.items.map((e) => e.id), ["belief-test-1"]);
});

test("existing mapped records are unchanged after a native merge (counts by entityType)", async (context) => {
  const dir = await withTempDir(context);
  const paths = await setupFiles(dir, { entities: [COMMUNITY_FIXTURE, BELIEF_FIXTURE, PLACE_FIXTURE] });
  const store = buildStore(paths);
  await store.initialize();

  const page = await store.listEntities({ limit: 100 });
  const counts = {};
  for (const entity of page.items) counts[entity.entityType] = (counts[entity.entityType] || 0) + 1;
  assert.deepEqual(counts, {
    historicalContext: 3,
    story: 3,
    structure: 8,
    music: 3,
    media: 6,
    community: 1,
    belief: 1,
    place: 1,
  });

  for (const id of ["b1", "b2", "b3", "b4"]) {
    // eslint-disable-next-line no-await-in-loop
    const entity = await store.getEntityById(id);
    assert.equal(entity.entityType, "structure");
  }
});

// --- Legacy replacement layer ---------------------------------------------
//
// These tests use the REAL, committed data/v2/legacyReplacements.json (via
// buildStore's default — no replacementsFilePath override) wherever
// possible, since its b4 -> structure-0005 entry is exactly what's needed to
// prove active/pending behavior end-to-end against the actual shipped file.

test("a pending legacy replacement (canonical target not promoted yet) does not suppress the legacy mapped entity", async (context) => {
  const dir = await withTempDir(context);
  // No native entities at all: data/v2/legacyReplacements.json's real
  // b4 -> structure-0005 entry has no canonical target to find, so it must
  // classify as pending.
  const paths = await setupFiles(dir);
  const store = buildStore(paths);
  await store.initialize();

  const page = await store.listEntities({ limit: 100 });
  assert.equal(page.count, 23);
  const b4 = await store.getEntityById("b4");
  assert.ok(b4);
  assert.equal(b4.entityType, "structure");

  const { active, pending } = store.getLegacyReplacementClassification();
  assert.equal(active.length, 0);
  assert.ok(pending.some((entry) => entry.legacyMappedEntityId === "b4" && entry.canonicalNativeEntityId === "structure-0005"));
});

test("an active legacy replacement suppresses only the superseded legacy entity, and the canonical entity is returned instead", async (context) => {
  const dir = await withTempDir(context);
  const paths = await setupFiles(dir, { entities: [CANONICAL_STRUCTURE_FIXTURE] });
  const store = buildStore(paths);
  await store.initialize();

  // 23 mapped - 1 suppressed (b4) + 1 native (structure-0005) = 23.
  const page = await store.listEntities({ limit: 100 });
  assert.equal(page.count, 23);

  const b4 = await store.getEntityById("b4");
  assert.equal(b4, null, "the superseded legacy mapped entity must be gone");

  const canonical = await store.getEntityById("structure-0005");
  assert.ok(canonical);
  assert.equal(canonical.title.en, "Shrine of Khidr (Canonical Test Fixture)");

  const { active } = store.getLegacyReplacementClassification();
  assert.deepEqual(active.map((entry) => entry.legacyMappedEntityId), ["b4"]);
});

test("active replacement suppression is scoped precisely: unrelated mapped entities remain side by side, untouched", async (context) => {
  const dir = await withTempDir(context);
  const paths = await setupFiles(dir, { entities: [CANONICAL_STRUCTURE_FIXTURE] });
  const store = buildStore(paths);
  await store.initialize();

  // b1, b2, b3 have no active replacement in this fixture (their canonical
  // targets — structure-0002/0003/0004 — were not promoted here) and must
  // remain exactly as before, side by side with the new canonical entity.
  for (const id of ["b1", "b2", "b3", "st1", "st2", "st4"]) {
    // eslint-disable-next-line no-await-in-loop
    const entity = await store.getEntityById(id);
    assert.ok(entity, `${id} should still be present (its replacement, if any, is still pending)`);
  }
});

test("an unexpected native id/slug collision still hard-fails even though a legacy replacement file exists", async (context) => {
  const dir = await withTempDir(context);
  // "structure-0005" is a real legacyReplacements.json canonical id, but
  // this fixture's id collides with a DIFFERENT mapped v1 entity ('b1') that
  // no entry in the real file names it as superseding — must still fail.
  const paths = await setupFiles(dir, { entities: [{ ...CANONICAL_STRUCTURE_FIXTURE, id: "b1" }] });
  const store = buildStore(paths);
  await assert.rejects(store.initialize(), /id 'b1' collides/);
});

test("a relationship targeting the canonical entity resolves normally once its replacement is active", async (context) => {
  const dir = await withTempDir(context);
  const paths = await setupFiles(dir, {
    entities: [BELIEF_FIXTURE, CANONICAL_STRUCTURE_FIXTURE],
    relationships: [{
      id: "rel-canonical-1", type: "hasSite", sourceId: "belief-test-1", sourceType: "belief",
      targetId: "structure-0005", targetType: "structure", status: "published",
    }],
  });
  const store = buildStore(paths);
  await store.initialize();

  const relationships = await store.listRelationships({});
  assert.equal(relationships.count, 1);
  assert.equal(relationships.items[0].targetId, "structure-0005");

  const related = await store.getRelatedEntities("structure-0005", {});
  assert.deepEqual(related.items.map((e) => e.id), ["belief-test-1"]);

  // The suppressed legacy id must not be independently resolvable at all —
  // proving the relationship truly points at the canonical replacement, not
  // a record that merely coexists with the old one.
  const legacy = await store.getEntityById("b4");
  assert.equal(legacy, null);
});

test("an invalid legacy replacement entry fails LocalMappedV2Store startup loudly, not silently", async (context) => {
  const dir = await withTempDir(context);
  const paths = await setupFiles(dir, {
    replacements: [{ legacyMappedEntityId: "does-not-exist", canonicalNativeEntityId: "structure-0099", reason: "test" }],
  });
  const store = buildStore(paths);
  await assert.rejects(store.initialize(), /does not exist in the mapped v1 baseline/);
});

test("calling getLegacyReplacementClassification before initialize() throws a clear error", () => {
  const store = createLocalMappedV2Store();
  assert.throws(() => store.getLegacyReplacementClassification(), /has not been initialized/);
});
