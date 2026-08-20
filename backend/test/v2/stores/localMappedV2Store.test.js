// This file has two distinct concerns, deliberately kept separate:
//
//   1. The pure v1 -> v2 MAPPING (mapAndValidateArchive over the real
//      data/archive.json) — always exactly 23 records, unaffected by
//      whatever native content data/v2/entities.json currently holds or
//      which legacy replacements are active. Tested by calling
//      mapAndValidateArchive() directly, never through the merged store.
//
//   2. The real, currently-committed MERGED v2 STORE (createLocalMappedV2Store
//      wired to every real data/v2/*.json file) — its served entity set
//      legitimately changes as canonical content is promoted and legacy
//      replacements go active. These tests assert today's real, live
//      totals so drift is caught immediately, not the pre-promotion "just
//      the 23 mapped records" baseline that was only ever true before any
//      canonical entity existed.

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

// --- 1. Pure v1 -> v2 mapping (always 23, regardless of v2 promotion state) ---

test("mapAndValidateArchive maps the real data/archive.json into exactly 23 entities", async () => {
  const archive = await loadRealArchive();
  const mapped = mapAndValidateArchive(archive);
  assert.equal(mapped.length, 23);
});

test("mapped entityType counts match the reviewed 23-record archive", async () => {
  const archive = await loadRealArchive();
  const mapped = mapAndValidateArchive(archive);
  const counts = {};
  for (const entity of mapped) counts[entity.entityType] = (counts[entity.entityType] || 0) + 1;
  assert.deepEqual(counts, {
    historicalContext: 3,
    story: 3,
    structure: 8,
    music: 3,
    media: 6,
  });
});

test("the v1 mapper itself never creates community/belief/place/proverb/source entities", async () => {
  const archive = await loadRealArchive();
  const mapped = mapAndValidateArchive(archive);
  for (const type of ["community", "belief", "place", "proverb", "source"]) {
    assert.equal(mapped.filter((entity) => entity.entityType === type).length, 0, `expected zero mapped ${type} entities`);
  }
});

test("b1-b4 (v1 beliefs-category records) map to entityType 'structure', never 'belief'", async () => {
  const archive = await loadRealArchive();
  const mapped = mapAndValidateArchive(archive);
  const byId = new Map(mapped.map((entity) => [entity.id, entity]));
  for (const id of ["b1", "b2", "b3", "b4"]) {
    const entity = byId.get(id);
    assert.ok(entity, `${id} should exist in the mapped output`);
    assert.equal(entity.entityType, "structure");
    assert.ok(entity.tags.includes("beliefSite"));
  }
});

test("all six gallery entries (g1-g6) map to entityType 'media'", async () => {
  const archive = await loadRealArchive();
  const mapped = mapAndValidateArchive(archive);
  const byId = new Map(mapped.map((entity) => [entity.id, entity]));
  for (const id of ["g1", "g2", "g3", "g4", "g5", "g6"]) {
    const entity = byId.get(id);
    assert.ok(entity, `${id} should exist in the mapped output`);
    assert.equal(entity.entityType, "media");
  }
});

test("placeholder records remain valid mapped entities and carry no invented media", async () => {
  const archive = await loadRealArchive();
  const mapped = mapAndValidateArchive(archive);
  const byId = new Map(mapped.map((entity) => [entity.id, entity]));
  for (const id of ["h2", "s3", "b3", "m1", "m2", "m3", "g1"]) {
    const entity = byId.get(id);
    assert.ok(entity, `${id} should exist in the mapped output`);
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

// --- 2. The real, currently-committed merged v2 store -----------------------
//
// Wired to the real data/v2/entities.json, relationships.json, and
// legacyReplacements.json — reflects whatever has actually been promoted.
// These numbers are expected to change (deliberately) as future promotions
// happen; when they do, update this block, not delete it — it exists so a
// silent regression in the real committed files is caught by `npm test`.

test("real merged store: mapped v1 entities superseded by an active legacy replacement are suppressed", async () => {
  const store = realStore();
  await store.initialize();
  for (const id of ["st1", "b1", "st2", "b2", "b3", "b4", "st4"]) {
    // eslint-disable-next-line no-await-in-loop
    const entity = await store.getEntityById(id);
    assert.equal(entity, null, `${id} should be suppressed (superseded by an active legacy replacement)`);
  }
});

test("real merged store: canonical entities named by an active legacy replacement are present and win", async () => {
  const store = realStore();
  await store.initialize();
  for (const id of ["structure-0001", "structure-0002", "structure-0003", "structure-0004", "structure-0005", "structure-0020"]) {
    // eslint-disable-next-line no-await-in-loop
    const entity = await store.getEntityById(id);
    assert.ok(entity, `${id} should be present`);
    assert.equal(entity.entityType, "structure");
  }
  const { active, pending } = store.getLegacyReplacementClassification();
  assert.equal(active.length, 7);
  assert.equal(pending.length, 0);
});

test("real merged store: v1-only records with no replacement (keepLegacyOnlyPendingReview) remain visible", async () => {
  const store = realStore();
  await store.initialize();
  for (const id of ["h1", "h2", "h3", "s1", "s2", "s3", "st3", "m1", "m2", "m3", "g1", "g2", "g3", "g4", "g5", "g6"]) {
    // eslint-disable-next-line no-await-in-loop
    const entity = await store.getEntityById(id);
    assert.ok(entity, `${id} (no confirmed replacement) should remain visible`);
  }
});

test("real merged store: total served entity count matches 23 mapped minus 7 active suppressions plus 268 promoted native entities", async () => {
  const store = realStore();
  await store.initialize();
  const page = await store.listEntities({ limit: 500 });
  assert.equal(page.count, 284);
});

// --- 3. Hatay local-toponym round: 100 new place entities ---
// (place-0029..place-0128, added for user-supplied local Hatay-Arabic
// village/neighborhood names — see tmp/hatay-toponym-research.json). Created
// inReview, then individually reviewed and published on explicit human
// instruction in the same session (see conversation record) — this is the
// human-editorial-review step the inReview status exists to gate, not an
// automated publish.

test("real merged store: exactly 100 Hatay local-toponym place entities (place-0029..place-0128), all published", async () => {
  const store = realStore();
  await store.initialize();
  const page = await store.listEntities({ limit: 500 });
  const newPlaces = page.items.filter((e) => {
    if (e.entityType !== "place") return false;
    const num = Number(e.id.split("-")[1]);
    return num >= 29 && num <= 128;
  });
  assert.equal(newPlaces.length, 100);
  assert.ok(newPlaces.every((e) => e.status === "published"), "every Hatay local-toponym place is published as of the explicit human publish decision");
});

test("real merged store: a published Hatay local-toponym place passes the same publication-visibility gate as any other public place", async () => {
  const store = realStore();
  await store.initialize();
  const { isPublic } = await import("../../../v2/serializers/publicVisibility.js");
  const entity = await store.getEntityById("place-0029");
  assert.ok(entity, "the record exists in the store");
  assert.equal(isPublic(entity), true, "published toponym places must pass the publication-visibility gate the routes/serializer rely on");
});

test("real merged store: the 3 pre-existing draft places enriched with local names this round (Batıayaz/Tekebaşı/Mağaracık) were NOT part of the publish decision and remain draft", async () => {
  const store = realStore();
  await store.initialize();
  for (const id of ["place-0019", "place-0020", "place-0021"]) {
    // eslint-disable-next-line no-await-in-loop
    const entity = await store.getEntityById(id);
    assert.equal(entity.status, "draft", `${id} must stay draft — only the 100 new toponym entities were published, not these pre-existing enrichments`);
  }
});

test("real merged store: every new place has a unique id and slug, no collision with the 28 pre-existing places or each other", async () => {
  const store = realStore();
  await store.initialize();
  const page = await store.listEntities({ limit: 500 });
  const allPlaces = page.items.filter((e) => e.entityType === "place");
  assert.equal(allPlaces.length, 128, "28 pre-existing + 100 new");
  assert.equal(new Set(allPlaces.map((e) => e.id)).size, 128, "no duplicate ids");
  assert.equal(new Set(allPlaces.map((e) => e.slug)).size, 128, "no duplicate slugs");
});

test("real merged store: user-supplied local Hatay-Arabic names are preserved byte-for-byte, never converted to Arabic script", async () => {
  const store = realStore();
  await store.initialize();
  // A spot check across the real dataset: underscores and Arabizi digit-letters
  // (3/7/5 standing in for Arabic letters) must survive completely unmodified.
  const antakyaAreaPlace = (await store.listEntities({ limit: 500 })).items.find(
    (e) => e.entityType === "place" && e.localNames?.some((n) => n.name.includes("_") || /\d/.test(n.name)),
  );
  assert.ok(antakyaAreaPlace, "at least one new/enriched place must carry an underscore or Arabizi-digit local name");
  const localName = antakyaAreaPlace.localNames.find((n) => n.name.includes("_") || /\d/.test(n.name));
  assert.ok(!/[؀-ۿ]/.test(localName.name), "must never contain Arabic-script characters");
  assert.equal(localName.language, "ar");
  assert.equal(localName.script, "Latin");
});

test("real merged store: no local name is the literal '?' placeholder — an unknown user local name is omitted, never stored as data", async () => {
  const store = realStore();
  await store.initialize();
  const page = await store.listEntities({ limit: 500 });
  const allPlaces = page.items.filter((e) => e.entityType === "place");
  for (const place of allPlaces) {
    for (const localName of place.localNames || []) {
      assert.notEqual(localName.name, "?", `${place.id} must never store the literal "?" as a local name`);
    }
  }
});
