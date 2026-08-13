import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createLocalMappedV2Store, mapAndValidateArchive } from "../../../v2/stores/localMappedV2Store.js";
import { assertValidArchive } from "../../../dataModel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_ARCHIVE_PATH = path.resolve(__dirname, "../../../../data/archive.json");

async function loadRealArchive() {
  const raw = await fs.readFile(REAL_ARCHIVE_PATH, "utf-8");
  return assertValidArchive(JSON.parse(raw));
}

function realStore() {
  return createLocalMappedV2Store({ loadArchive: loadRealArchive });
}

test("initializes from the real data/archive.json into exactly 23 mapped entities", async () => {
  const store = realStore();
  await store.initialize();
  const page = await store.listEntities({ limit: 100 });
  assert.equal(page.count, 23);
});

test("mapped entityType counts match the reviewed 23-record archive", async () => {
  const store = realStore();
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
  });
});

test("no community/belief/place/proverb/source entities are created", async () => {
  const store = realStore();
  await store.initialize();
  for (const type of ["community", "belief", "place", "proverb", "source"]) {
    const page = await store.listByType(type, {});
    assert.equal(page.count, 0, `expected zero ${type} entities`);
  }
});

test("b1-b4 (v1 beliefs-category records) map to entityType 'structure', never 'belief'", async () => {
  const store = realStore();
  await store.initialize();
  for (const id of ["b1", "b2", "b3", "b4"]) {
    const entity = await store.getEntityById(id);
    assert.ok(entity, `${id} should exist`);
    assert.equal(entity.entityType, "structure");
    assert.ok(entity.tags.includes("beliefSite"));
  }
});

test("all six gallery entries (g1-g6) map to entityType 'media'", async () => {
  const store = realStore();
  await store.initialize();
  for (const id of ["g1", "g2", "g3", "g4", "g5", "g6"]) {
    const entity = await store.getEntityById(id);
    assert.ok(entity, `${id} should exist`);
    assert.equal(entity.entityType, "media");
  }
});

test("placeholder records remain valid entities and carry no invented media", async () => {
  const store = realStore();
  await store.initialize();
  for (const id of ["h2", "s3", "b3", "m1", "m2", "m3", "g1"]) {
    const entity = await store.getEntityById(id);
    assert.ok(entity, `${id} should exist`);
    if (entity.entityType === "media") {
      assert.deepEqual(entity.derivativeStoragePaths, []);
    } else {
      const preview = entity.media?.[0];
      assert.equal(preview?.isPlaceholder, true);
      assert.equal(preview?.path, null);
    }
  }
});

test("fails loudly at startup if a mapped entity is invalid, rather than dropping it", async () => {
  const brokenArchive = {
    history: [{ id: "h1", slug: "Not A Valid Slug!", title: { en: "T" }, body: { en: "B" } }],
    stories: [],
    structures: [],
    beliefs: [],
    music: [],
    gallery: [],
  };
  const store = createLocalMappedV2Store({ loadArchive: async () => brokenArchive });
  await assert.rejects(
    store.initialize(),
    (error) => error instanceof Error
      && /LocalMappedV2Store/.test(error.message)
      && /h1/.test(error.message)
      && /failed v2 schema validation/.test(error.message),
  );
});

test("reading before initialize() throws a clear error instead of returning empty/partial data", async () => {
  const store = realStore();
  await assert.rejects(store.listEntities({}), /has not been initialized/);
  await assert.rejects(store.getEntityById("st1"), /has not been initialized/);
});

test("mapAndValidateArchive never mutates the input archive", async () => {
  const archive = await loadRealArchive();
  const snapshot = JSON.parse(JSON.stringify(archive));
  mapAndValidateArchive(archive);
  assert.deepEqual(archive, snapshot);
});
