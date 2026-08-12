import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createFakeFirestore } from "../../../v2/testSupport/fakeFirestore.js";
import { createFirestoreV2Store, V2_ENTITIES_COLLECTION, V2_RELATIONSHIPS_COLLECTION } from "../../../v2/stores/firestoreV2Store.js";
import { V2QueryError } from "../../../v2/stores/errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function seedEntities() {
  return {
    e1: { id: "e1", entityType: "story", status: "published", storyCategory: "familyMemory", tags: ["memory"] },
    e2: { id: "e2", entityType: "story", status: "draft", storyCategory: "localLegend", tags: ["legend"] },
    e3: { id: "e3", entityType: "music", genre: "folk", tags: ["folk"] },
    e4: { id: "e4", entityType: "structure", tags: ["mosque"] },
    e5: { id: "e5", entityType: "story", originalLanguage: "tr", dialect: "hatay", tags: [] },
  };
}

function seedRelationships() {
  return {
    r1: { id: "r1", type: "locatedIn", sourceId: "e4", targetId: "e5" },
    r2: { id: "r2", type: "depicts", sourceId: "e3", targetId: "e4" },
  };
}

function storeWithSeed() {
  const database = createFakeFirestore({
    [V2_ENTITIES_COLLECTION]: seedEntities(),
    [V2_RELATIONSHIPS_COLLECTION]: seedRelationships(),
  });
  return { store: createFirestoreV2Store({ getDatabase: () => database }), database };
}

test("firestoreV2Store source contains no Firestore write calls", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../v2/stores/firestoreV2Store.js"), "utf8");
  const forbiddenPatterns = [
    /\.set\(/, /\.add\(/, /\.update\(/, /\.delete\(/, /\.create\(/, /batch\s*\(/, /runTransaction\(/,
  ];
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern, `forbidden write pattern found: ${pattern}`);
  }
});

test("firestoreV2Store does not expose any mutation method on the returned store object", () => {
  const { store } = storeWithSeed();
  for (const method of ["set", "add", "update", "delete", "batch", "runTransaction", "create"]) {
    assert.equal(Object.hasOwn(store, method), false, `store must not expose ${method}`);
  }
});

test("listByType filters by entityType and returns matching entities", async () => {
  const { store } = storeWithSeed();
  const page = await store.listByType("story", { limit: 20 });
  assert.deepEqual(page.items.map((item) => item.id).sort(), ["e1", "e2", "e5"]);
});

test("listByType composes an additional equality filter (status)", async () => {
  const { store } = storeWithSeed();
  const page = await store.listByType("story", { limit: 20, filters: { status: "published" } });
  assert.deepEqual(page.items.map((item) => item.id), ["e1"]);
});

test("listByType composes a storyCategory filter", async () => {
  const { store } = storeWithSeed();
  const page = await store.listByType("story", { limit: 20, filters: { storyCategory: "localLegend" } });
  assert.deepEqual(page.items.map((item) => item.id), ["e2"]);
});

test("listByType composes originalLanguage and dialect filters", async () => {
  const { store } = storeWithSeed();
  const page = await store.listByType("story", { limit: 20, filters: { originalLanguage: "tr", dialect: "hatay" } });
  assert.deepEqual(page.items.map((item) => item.id), ["e5"]);
});

test("listEntities translates musicGenre into a genre equality filter", async () => {
  const { store } = storeWithSeed();
  const page = await store.listEntities({ limit: 20, filters: { musicGenre: "folk" } });
  assert.deepEqual(page.items.map((item) => item.id), ["e3"]);
});

test("listEntities translates tag into an array-contains filter", async () => {
  const { store } = storeWithSeed();
  const page = await store.listEntities({ limit: 20, filters: { tag: "mosque" } });
  assert.deepEqual(page.items.map((item) => item.id), ["e4"]);
});

test("listByType returns an empty page for an unsupported entity type without querying", async () => {
  const { store } = storeWithSeed();
  const page = await store.listByType("religion", { limit: 20 });
  assert.deepEqual(page, { items: [], nextCursor: null, count: 0 });
});

for (const field of ["communityId", "beliefId", "placeId"]) {
  test(`listEntities rejects the deferred '${field}' filter with a safe V2QueryError`, async () => {
    const { store } = storeWithSeed();
    await assert.rejects(
      store.listEntities({ filters: { [field]: "some-id" } }),
      (error) => error instanceof V2QueryError && /not denormalized/.test(error.message),
    );
  });
}

test("cursor pagination walks the full result set without gaps or repeats", async () => {
  const { store } = storeWithSeed();
  const page1 = await store.listEntities({ limit: 2 });
  assert.equal(page1.items.length, 2);
  assert.ok(page1.nextCursor);

  const page2 = await store.listEntities({ limit: 2, cursor: page1.nextCursor });
  assert.equal(page2.items.length, 2);
  assert.ok(page2.nextCursor);

  const page3 = await store.listEntities({ limit: 2, cursor: page2.nextCursor });
  assert.equal(page3.items.length, 1);
  assert.equal(page3.nextCursor, null);

  const allIds = [...page1.items, ...page2.items, ...page3.items].map((item) => item.id).sort();
  assert.deepEqual(allIds, ["e1", "e2", "e3", "e4", "e5"]);
});

test("an invalid cursor token is rejected as a safe V2QueryError", async () => {
  const { store } = storeWithSeed();
  await assert.rejects(
    store.listEntities({ cursor: "not-a-real-cursor!!" }),
    (error) => error instanceof V2QueryError,
  );
});

test("a cursor referencing a deleted/nonexistent document is rejected", async () => {
  const { store } = storeWithSeed();
  const bogusCursor = Buffer.from(JSON.stringify({ id: "does-not-exist" }), "utf8").toString("base64url");
  await assert.rejects(
    store.listEntities({ cursor: bogusCursor }),
    (error) => error instanceof V2QueryError && /page boundary/.test(error.message),
  );
});

test("getEntityById returns the entity or null", async () => {
  const { store } = storeWithSeed();
  assert.deepEqual(await store.getEntityById("e1"), { id: "e1", entityType: "story", status: "published", storyCategory: "familyMemory", tags: ["memory"] });
  assert.equal(await store.getEntityById("does-not-exist"), null);
});

test("listRelationships filters by a controlled relationship type", async () => {
  const { store } = storeWithSeed();
  const page = await store.listRelationships({ filters: { type: "locatedIn" } });
  assert.deepEqual(page.items.map((item) => item.id), ["r1"]);
});

test("listRelationships returns an empty page for an unsupported relationship type", async () => {
  const { store } = storeWithSeed();
  const page = await store.listRelationships({ filters: { type: "worshippedBy" } });
  assert.deepEqual(page, { items: [], nextCursor: null, count: 0 });
});

test("getRelatedEntities merges sourceId and targetId matches without duplicates", async () => {
  const { store } = storeWithSeed();
  const page = await store.getRelatedEntities("e4");
  assert.deepEqual(page.items.map((item) => item.id).sort(), ["e3", "e5"]);
});

test("getRelatedEntities returns an empty page when nothing references the id", async () => {
  const { store } = storeWithSeed();
  const page = await store.getRelatedEntities("e1");
  assert.deepEqual(page, { items: [], nextCursor: null, count: 0 });
});

test("a missing composite index surfaces as a safe V2QueryError, not a raw scan", async () => {
  const failingDatabase = {
    collection() {
      const query = {
        where: () => query,
        orderBy: () => query,
        limit: () => query,
        async get() {
          const error = new Error("9 FAILED_PRECONDITION: The query requires an index.");
          error.code = 9;
          throw error;
        },
      };
      return query;
    },
  };
  const store = createFirestoreV2Store({ getDatabase: () => failingDatabase });
  await assert.rejects(
    store.listEntities({}),
    (error) => error instanceof V2QueryError && /index/.test(error.message),
  );
});
