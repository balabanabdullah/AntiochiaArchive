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

/** Builds a store wired to real data/archive.json plus fixture native files. */
function buildStore({ entitiesFilePath, relationshipsFilePath }) {
  return createLocalMappedV2Store({
    loadArchive: loadRealArchive,
    loadEntities: ({ mappedEntities }) => loadNativeEntities({ filePath: entitiesFilePath, mappedEntities }),
    loadRelationships: ({ entities }) => loadNativeRelationships({ filePath: relationshipsFilePath, entities }),
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

async function setupFiles(dir, { entities = [], relationships = [] } = {}) {
  const entitiesFilePath = path.join(dir, "entities.json");
  const relationshipsFilePath = path.join(dir, "relationships.json");
  await writeJson(entitiesFilePath, { entities });
  await writeJson(relationshipsFilePath, { relationships });
  return { entitiesFilePath, relationshipsFilePath };
}

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
