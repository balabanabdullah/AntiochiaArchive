import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { initializeSqlite, closeSqlite, getSqlite } from "../../../db/sqliteConnection.js";
import { applyPendingMigrations } from "../../../db/migrate.js";
import {
  insertEntity, updateEntityRow, deleteEntityRow, getEntityByIdRow, idExists, slugExists,
  listEntitiesRows, listByTypeRows, countByType, countByStatus,
} from "../../../db/repositories/entityRepository.js";
import { V2QueryError } from "../../../v2/stores/errors.js";

async function withTempDb(t, run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-entity-repo-"));
  initializeSqlite({ path: path.join(dir, "test.db") });
  applyPendingMigrations({ verbose: false });
  t.after(async () => {
    closeSqlite();
    await fs.rm(dir, { recursive: true, force: true });
  });
  return run();
}

test("insertEntity persists a row readable by id, with real timestamps", async (t) => {
  await withTempDb(t, () => {
    const stored = insertEntity({ id: "place-1", entityType: "place", slug: "test-place", status: "draft", title: { tr: "Test" } });
    assert.equal(stored.id, "place-1");
    assert.ok(stored.createdAt);
    assert.equal(stored.createdAt, stored.updatedAt);
    const readBack = getEntityByIdRow("place-1");
    assert.deepEqual(readBack, stored);
  });
});

test("idExists/slugExists reflect what has actually been inserted", async (t) => {
  await withTempDb(t, () => {
    assert.equal(idExists("place-1"), false);
    assert.equal(slugExists("test-place"), false);
    insertEntity({ id: "place-1", entityType: "place", slug: "test-place", status: "draft", title: { tr: "T" } });
    assert.equal(idExists("place-1"), true);
    assert.equal(slugExists("test-place"), true);
  });
});

test("a second row with the same slug is rejected by the partial unique index", async (t) => {
  await withTempDb(t, () => {
    insertEntity({ id: "place-1", entityType: "place", slug: "dup-slug", status: "draft", title: { tr: "T" } });
    assert.throws(() => insertEntity({ id: "place-2", entityType: "place", slug: "dup-slug", status: "draft", title: { tr: "T2" } }));
  });
});

test("two status-less (media) rows with no slug at all do not collide with each other", async (t) => {
  await withTempDb(t, () => {
    insertEntity({ id: "media-1", entityType: "media", mediaType: "image", mediaRole: "realArchiveMedia" });
    // Must not throw — the partial unique index only applies where slug IS NOT NULL.
    insertEntity({ id: "media-2", entityType: "media", mediaType: "image", mediaRole: "realArchiveMedia" });
    assert.equal(idExists("media-1"), true);
    assert.equal(idExists("media-2"), true);
  });
});

test("updateEntityRow overwrites content, refreshes updatedAt, and preserves the published_at column when not explicitly overridden", async (t) => {
  await withTempDb(t, () => {
    const created = insertEntity({ id: "place-1", entityType: "place", slug: "s", status: "published", title: { tr: "T" } });
    const publishedAtColumn = () => getSqlite().prepare("SELECT published_at FROM entities WHERE id = ?").get("place-1").published_at;
    const originalPublishedAt = publishedAtColumn();
    assert.ok(originalPublishedAt, "insertEntity must stamp published_at when status is 'published'");

    const updated = updateEntityRow("place-1", { ...created, title: { tr: "T2" } });
    assert.equal(updated.title.tr, "T2");
    assert.notEqual(updated.updatedAt, created.updatedAt);
    assert.equal(publishedAtColumn(), originalPublishedAt, "an edit that doesn't touch status must not disturb published_at");

    const readBack = getEntityByIdRow("place-1");
    assert.equal(readBack.title.tr, "T2");
  });
});

test("deleteEntityRow removes the row; a repeat delete reports no change", async (t) => {
  await withTempDb(t, () => {
    insertEntity({ id: "place-1", entityType: "place", slug: "s", status: "draft", title: { tr: "T" } });
    assert.equal(deleteEntityRow("place-1"), true);
    assert.equal(getEntityByIdRow("place-1"), null);
    assert.equal(deleteEntityRow("place-1"), false);
  });
});

test("listEntitiesRows filters by entityType/status and paginates by id, exactly like memoryV2Store", async (t) => {
  await withTempDb(t, () => {
    insertEntity({ id: "place-a", entityType: "place", slug: "a", status: "published", title: { tr: "A" } });
    insertEntity({ id: "place-b", entityType: "place", slug: "b", status: "draft", title: { tr: "B" } });
    insertEntity({ id: "story-a", entityType: "story", slug: "c", status: "published", title: { tr: "C" } });

    const places = listEntitiesRows({ filters: { entityType: "place" } });
    assert.deepEqual(places.items.map((e) => e.id), ["place-a", "place-b"]);

    const publishedPlaces = listEntitiesRows({ filters: { entityType: "place", status: "published" } });
    assert.deepEqual(publishedPlaces.items.map((e) => e.id), ["place-a"]);

    const page1 = listEntitiesRows({ limit: 1 });
    assert.equal(page1.items.length, 1);
    assert.equal(page1.nextCursor, page1.items[0].id);
    const page2 = listEntitiesRows({ limit: 1, cursor: page1.nextCursor });
    assert.notEqual(page2.items[0]?.id, page1.items[0].id);
  });
});

test("listByTypeRows is equivalent to listEntitiesRows filtered by that type", async (t) => {
  await withTempDb(t, () => {
    insertEntity({ id: "place-a", entityType: "place", slug: "a", status: "published", title: { tr: "A" } });
    insertEntity({ id: "story-a", entityType: "story", slug: "b", status: "published", title: { tr: "B" } });
    const result = listByTypeRows("story");
    assert.deepEqual(result.items.map((e) => e.id), ["story-a"]);
  });
});

test("listEntitiesRows rejects the deferred communityId/beliefId/placeId filters with V2QueryError, matching every other V2Store", async (t) => {
  await withTempDb(t, () => {
    assert.throws(() => listEntitiesRows({ filters: { placeId: "place-1" } }), V2QueryError);
  });
});

test("countByType/countByStatus aggregate correctly", async (t) => {
  await withTempDb(t, () => {
    insertEntity({ id: "place-a", entityType: "place", slug: "a", status: "published", title: { tr: "A" } });
    insertEntity({ id: "place-b", entityType: "place", slug: "b", status: "draft", title: { tr: "B" } });
    insertEntity({ id: "story-a", entityType: "story", slug: "c", status: "published", title: { tr: "C" } });
    assert.deepEqual(countByType(), { place: 2, story: 1 });
    assert.deepEqual(countByStatus(), { published: 2, draft: 1 });
  });
});

test("tag and musicGenre filters mirror memoryV2Store's special-cased semantics", async (t) => {
  await withTempDb(t, () => {
    insertEntity({ id: "story-a", entityType: "story", slug: "a", status: "published", title: { tr: "A" }, tags: ["folk"] });
    insertEntity({ id: "music-a", entityType: "music", slug: "b", status: "published", title: { tr: "B" }, genre: "classical" });
    assert.deepEqual(listEntitiesRows({ filters: { tag: "folk" } }).items.map((e) => e.id), ["story-a"]);
    assert.deepEqual(listEntitiesRows({ filters: { musicGenre: "classical" } }).items.map((e) => e.id), ["music-a"]);
  });
});
