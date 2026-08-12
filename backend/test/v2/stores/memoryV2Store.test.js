import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryV2Store } from "../../../v2/stores/memoryV2Store.js";
import { V2QueryError } from "../../../v2/stores/errors.js";

function fixtureStore() {
  return createMemoryV2Store({
    entities: [
      { id: "e1", entityType: "story", status: "published", tags: ["memory"] },
      { id: "e2", entityType: "story", status: "draft", tags: ["legend"] },
      { id: "e3", entityType: "music", genre: "folk", tags: ["folk"] },
    ],
    relationships: [
      { id: "r1", type: "locatedIn", sourceId: "e1", targetId: "e3" },
    ],
  });
}

test("listEntities returns all fixture entities", async () => {
  const store = fixtureStore();
  const page = await store.listEntities({});
  assert.deepEqual(page.items.map((item) => item.id).sort(), ["e1", "e2", "e3"]);
});

test("listByType filters by entityType", async () => {
  const store = fixtureStore();
  const page = await store.listByType("story", {});
  assert.deepEqual(page.items.map((item) => item.id).sort(), ["e1", "e2"]);
});

test("getEntityById returns the entity or null", async () => {
  const store = fixtureStore();
  assert.equal((await store.getEntityById("e1")).id, "e1");
  assert.equal(await store.getEntityById("missing"), null);
});

test("filters support status, tag, and musicGenre", async () => {
  const store = fixtureStore();
  assert.deepEqual((await store.listEntities({ filters: { status: "draft" } })).items.map((i) => i.id), ["e2"]);
  assert.deepEqual((await store.listEntities({ filters: { tag: "folk" } })).items.map((i) => i.id), ["e3"]);
  assert.deepEqual((await store.listEntities({ filters: { musicGenre: "folk" } })).items.map((i) => i.id), ["e3"]);
});

for (const field of ["communityId", "beliefId", "placeId"]) {
  test(`rejects the deferred '${field}' filter, matching FirestoreV2Store`, async () => {
    const store = fixtureStore();
    await assert.rejects(
      store.listEntities({ filters: { [field]: "x" } }),
      (error) => error instanceof V2QueryError,
    );
  });
}

test("pagination walks the fixture set deterministically by id order", async () => {
  const store = fixtureStore();
  const page1 = await store.listEntities({ limit: 2 });
  assert.deepEqual(page1.items.map((i) => i.id), ["e1", "e2"]);
  assert.equal(page1.nextCursor, "e2");

  const page2 = await store.listEntities({ limit: 2, cursor: page1.nextCursor });
  assert.deepEqual(page2.items.map((i) => i.id), ["e3"]);
  assert.equal(page2.nextCursor, null);
});

test("listRelationships and getRelatedEntities resolve both directions", async () => {
  const store = fixtureStore();
  const relationships = await store.listRelationships({});
  assert.deepEqual(relationships.items.map((i) => i.id), ["r1"]);

  const relatedToE1 = await store.getRelatedEntities("e1", {});
  assert.deepEqual(relatedToE1.items.map((i) => i.id), ["e3"]);

  const relatedToE3 = await store.getRelatedEntities("e3", {});
  assert.deepEqual(relatedToE3.items.map((i) => i.id), ["e1"]);
});

test("the default exported memoryV2Store is empty and never mutated by fixtures", async () => {
  const { memoryV2Store } = await import("../../../v2/stores/memoryV2Store.js");
  const page = await memoryV2Store.listEntities({});
  assert.deepEqual(page, { items: [], nextCursor: null, count: 0 });
});
