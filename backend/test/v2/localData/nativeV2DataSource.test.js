// Fixtures in this file use obviously fictional ids/slugs (e.g.
// "community-test-1") and are written only to temporary files created and
// destroyed by each test — never to the committed data/v2/entities.json or
// data/v2/relationships.json, which must remain empty. See
// V2-ARCHITECTURE.md "No cultural content authored in this task".

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  loadNativeEntities,
  loadNativeRelationships,
  getNativeEntitiesFilePath,
  getNativeRelationshipsFilePath,
} from "../../../v2/localData/nativeV2DataSource.js";

async function withTempDir(context) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-v2-native-"));
  context.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

const MAPPED_FIXTURE = Object.freeze([
  { id: "b4", slug: "hz-hizir-ziyareti-samandag", entityType: "structure" },
  { id: "st1", slug: "habib-i-neccar-camii", entityType: "structure" },
]);

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

test("getNativeEntitiesFilePath / getNativeRelationshipsFilePath default to data/v2/*.json", () => {
  assert.match(getNativeEntitiesFilePath().replace(/\\/g, "/"), /data\/v2\/entities\.json$/);
  assert.match(getNativeRelationshipsFilePath().replace(/\\/g, "/"), /data\/v2\/relationships\.json$/);
});

test("loadNativeEntities returns [] for an empty entities file", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "entities.json");
  await writeJson(filePath, { entities: [] });

  const entities = await loadNativeEntities({ filePath, mappedEntities: MAPPED_FIXTURE });
  assert.deepEqual(entities, []);
});

test("loadNativeRelationships returns [] for an empty relationships file", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "relationships.json");
  await writeJson(filePath, { relationships: [] });

  const relationships = await loadNativeRelationships({ filePath, entities: MAPPED_FIXTURE });
  assert.deepEqual(relationships, []);
});

test("a valid native community/belief/place fixture set loads and validates", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "entities.json");
  await writeJson(filePath, { entities: [COMMUNITY_FIXTURE, BELIEF_FIXTURE, PLACE_FIXTURE] });

  const entities = await loadNativeEntities({ filePath, mappedEntities: MAPPED_FIXTURE });
  assert.equal(entities.length, 3);
  assert.deepEqual(entities.map((entity) => entity.entityType).sort(), ["belief", "community", "place"]);
});

test("missing entities file fails loudly instead of pretending an empty dataset", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "does-not-exist.json");

  await assert.rejects(
    loadNativeEntities({ filePath, mappedEntities: [] }),
    /file is missing at.*configuration or repository problem/s,
  );
});

test("missing relationships file fails loudly instead of pretending an empty dataset", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "does-not-exist.json");

  await assert.rejects(
    loadNativeRelationships({ filePath, entities: [] }),
    /file is missing at.*configuration or repository problem/s,
  );
});

test("malformed JSON in the entities file fails with a clear message", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "entities.json");
  await fs.writeFile(filePath, "{ not valid json", "utf-8");

  await assert.rejects(loadNativeEntities({ filePath, mappedEntities: [] }), /not valid JSON/);
});

test("an entities file without an 'entities' array is rejected", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "entities.json");
  await writeJson(filePath, { foo: "bar" });

  await assert.rejects(loadNativeEntities({ filePath, mappedEntities: [] }), /must be a JSON object with an 'entities' array/);
});

test("an invalid native entity (unsupported entityType) is rejected, not silently skipped", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "entities.json");
  await writeJson(filePath, {
    entities: [{ id: "bad-1", slug: "bad-1", entityType: "notARealType", status: "published", title: { en: "T" } }],
  });

  await assert.rejects(loadNativeEntities({ filePath, mappedEntities: [] }), /failed v2 schema validation/);
});

test("a native entity id colliding with a mapped v1 entity id is rejected", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "entities.json");
  await writeJson(filePath, {
    entities: [{ ...COMMUNITY_FIXTURE, id: "b4" }],
  });

  await assert.rejects(loadNativeEntities({ filePath, mappedEntities: MAPPED_FIXTURE }), /id 'b4' collides/);
});

test("a duplicate id within the native entities file is rejected", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "entities.json");
  await writeJson(filePath, {
    entities: [COMMUNITY_FIXTURE, { ...BELIEF_FIXTURE, id: "community-test-1" }],
  });

  await assert.rejects(loadNativeEntities({ filePath, mappedEntities: [] }), /collides/);
});

test("a native entity slug colliding with a mapped v1 slug is rejected", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "entities.json");
  await writeJson(filePath, {
    entities: [{ ...COMMUNITY_FIXTURE, id: "community-test-2", slug: "habib-i-neccar-camii" }],
  });

  await assert.rejects(loadNativeEntities({ filePath, mappedEntities: MAPPED_FIXTURE }), /slug 'habib-i-neccar-camii' collides/);
});

test("a duplicate slug within the native entities file is rejected", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "entities.json");
  await writeJson(filePath, {
    entities: [COMMUNITY_FIXTURE, { ...BELIEF_FIXTURE, id: "belief-test-2", slug: "community-test-1" }],
  });

  await assert.rejects(loadNativeEntities({ filePath, mappedEntities: [] }), /slug 'community-test-1' collides/);
});

test("a relationship referencing a missing sourceId is rejected as an orphan, not dropped", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "relationships.json");
  await writeJson(filePath, {
    relationships: [{
      id: "rel-test-1", type: "hasBelief", sourceId: "does-not-exist", sourceType: "community",
      targetId: "belief-test-1", targetType: "belief",
    }],
  });

  await assert.rejects(
    loadNativeRelationships({ filePath, entities: [BELIEF_FIXTURE] }),
    /sourceId 'does-not-exist' does not reference any known entity/,
  );
});

test("a relationship referencing a missing targetId is rejected as an orphan, not dropped", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "relationships.json");
  await writeJson(filePath, {
    relationships: [{
      id: "rel-test-1", type: "hasBelief", sourceId: "community-test-1", sourceType: "community",
      targetId: "does-not-exist", targetType: "belief",
    }],
  });

  await assert.rejects(
    loadNativeRelationships({ filePath, entities: [COMMUNITY_FIXTURE] }),
    /targetId 'does-not-exist' does not reference any known entity/,
  );
});

test("a relationship with a sourceType that doesn't match the actual entity is rejected", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "relationships.json");
  await writeJson(filePath, {
    relationships: [{
      id: "rel-test-1", type: "hasBelief", sourceId: "community-test-1", sourceType: "belief",
      targetId: "belief-test-1", targetType: "belief",
    }],
  });

  await assert.rejects(
    loadNativeRelationships({ filePath, entities: [COMMUNITY_FIXTURE, BELIEF_FIXTURE] }),
    /sourceType 'belief' does not match the actual entityType 'community'/,
  );
});

test("a relationship with a targetType that doesn't match the actual entity is rejected", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "relationships.json");
  await writeJson(filePath, {
    relationships: [{
      id: "rel-test-1", type: "hasBelief", sourceId: "community-test-1", sourceType: "community",
      targetId: "belief-test-1", targetType: "community",
    }],
  });

  await assert.rejects(
    loadNativeRelationships({ filePath, entities: [COMMUNITY_FIXTURE, BELIEF_FIXTURE] }),
    /targetType 'community' does not match the actual entityType 'belief'/,
  );
});

test("a valid relationship between two native entities is accepted", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "relationships.json");
  await writeJson(filePath, {
    relationships: [{
      id: "rel-test-1", type: "hasBelief", sourceId: "community-test-1", sourceType: "community",
      targetId: "belief-test-1", targetType: "belief", status: "published",
    }],
  });

  const relationships = await loadNativeRelationships({ filePath, entities: [COMMUNITY_FIXTURE, BELIEF_FIXTURE] });
  assert.equal(relationships.length, 1);
});

test("a valid relationship pointing at a mapped v1 structure is accepted", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "relationships.json");
  await writeJson(filePath, {
    relationships: [{
      id: "rel-test-1", type: "hasSite", sourceId: "belief-test-1", sourceType: "belief",
      targetId: "b4", targetType: "structure", status: "published",
    }],
  });

  const relationships = await loadNativeRelationships({
    filePath,
    entities: [BELIEF_FIXTURE, ...MAPPED_FIXTURE],
  });
  assert.equal(relationships.length, 1);
  assert.equal(relationships[0].targetId, "b4");
});

test("a duplicate relationship id within the file is rejected", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "relationships.json");
  await writeJson(filePath, {
    relationships: [
      {
        id: "rel-test-1", type: "hasBelief", sourceId: "community-test-1", sourceType: "community",
        targetId: "belief-test-1", targetType: "belief",
      },
      {
        id: "rel-test-1", type: "relatedTo", sourceId: "belief-test-1", sourceType: "belief",
        targetId: "place-test-1", targetType: "place",
      },
    ],
  });

  await assert.rejects(
    loadNativeRelationships({ filePath, entities: [COMMUNITY_FIXTURE, BELIEF_FIXTURE, PLACE_FIXTURE] }),
    /duplicate relationship id 'rel-test-1'/,
  );
});

test("relationship edges are not auto-inverted: only the authored direction is returned", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "relationships.json");
  await writeJson(filePath, {
    relationships: [{
      id: "rel-test-1", type: "hasBelief", sourceId: "community-test-1", sourceType: "community",
      targetId: "belief-test-1", targetType: "belief", status: "published",
    }],
  });

  const relationships = await loadNativeRelationships({ filePath, entities: [COMMUNITY_FIXTURE, BELIEF_FIXTURE] });
  assert.equal(relationships.length, 1);
  assert.equal(relationships[0].sourceId, "community-test-1");
  assert.equal(relationships[0].targetId, "belief-test-1");
  // No synthesized inverse (belief --practicedBy--> community) edge exists.
  assert.equal(relationships.some((r) => r.sourceId === "belief-test-1" && r.targetId === "community-test-1"), false);
});
