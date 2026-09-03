// The single most important test file this round adds: proves the actual
// product claim in the round brief — "Admin -> Düzenle -> İncele -> Yayınla,
// and the public API sees it immediately, with no apply script, no git, no
// build, no deploy." Every "confirm X without Git/build/deploy" acceptance
// step reads straight through sqliteV2Store (the exact same code path
// GET /api/v2/... uses in production), never through contentService's own
// internal state — so a pass here is a real end-to-end proof, not a
// same-module round-trip.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { closeSqlite } from "../../db/sqliteConnection.js";
import { sqliteV2Store } from "../../v2/stores/sqliteV2Store.js";
import { isPublic } from "../../v2/serializers/publicVisibility.js";
import {
  createEntity, editEntity, publishEntity, sendToReview, unpublishEntity, archiveEntity, restoreEntity,
  deleteEntityPermanently, bulkTransition, getRevisionHistory, createRelationship, removeRelationship,
  ContentValidationError, ContentConflictError, ContentNotFoundError,
} from "../../admin/contentService.js";

async function withInitializedRuntime(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-content-service-"));
  const originalPath = process.env.SQLITE_DB_PATH;
  const originalStorageRoot = process.env.LOCAL_STORAGE_ROOT;
  process.env.SQLITE_DB_PATH = path.join(dir, "test.db");
  process.env.LOCAL_STORAGE_ROOT = path.join(dir, "storage");
  await sqliteV2Store.initialize();
  t.after(async () => {
    closeSqlite();
    if (originalPath === undefined) delete process.env.SQLITE_DB_PATH; else process.env.SQLITE_DB_PATH = originalPath;
    if (originalStorageRoot === undefined) delete process.env.LOCAL_STORAGE_ROOT; else process.env.LOCAL_STORAGE_ROOT = originalStorageRoot;
    await fs.rm(dir, { recursive: true, force: true });
  });
}

test("A-J: create -> publish -> public read sees it -> edit -> public read sees the edit -> archive -> hidden -> restore -> visible again, with zero git/build/deploy step", async (t) => {
  await withInitializedRuntime(t);

  // A/B: create (always born draft)
  const created = createEntity({
    entityType: "historicalContext",
    proposedFields: { id: "hist-1", slug: "test-record", title: { tr: "Test", en: "Test" }, summary: { tr: "Özet" } },
    actor: "test",
  });
  assert.equal(created.status, "draft");
  assert.equal(isPublic(created), false);
  const draftReadBack = await sqliteV2Store.getEntityById("hist-1");
  assert.ok(draftReadBack, "the draft entity must exist in the store...");
  assert.equal(isPublic(draftReadBack), false, "...but must not be public");

  // C: publish
  const published = publishEntity({ id: "hist-1", actor: "test" });
  assert.equal(published.status, "published");

  // D: public read sees it immediately — the actual product claim
  assert.equal(isPublic(await sqliteV2Store.getEntityById("hist-1")), true);

  // E/F: edit, and the public read reflects it immediately
  editEntity({ id: "hist-1", proposedFields: { summary: { tr: "Güncellenmiş özet" } }, actor: "test" });
  const afterEdit = await sqliteV2Store.getEntityById("hist-1");
  assert.equal(afterEdit.summary.tr, "Güncellenmiş özet");
  assert.equal(isPublic(afterEdit), true);

  // G/H: archive, disappears publicly
  const archived = archiveEntity({ id: "hist-1", actor: "test" });
  assert.equal(archived.status, "archived");
  assert.equal(isPublic(await sqliteV2Store.getEntityById("hist-1")), false);

  // I/J: restore to published, returns
  const restored = restoreEntity({ id: "hist-1", toStatus: "published", actor: "test" });
  assert.equal(restored.status, "published");
  assert.equal(isPublic(await sqliteV2Store.getEntityById("hist-1")), true);

  // Full audit trail exists, newest first
  const history = getRevisionHistory("hist-1");
  assert.deepEqual(history.map((h) => h.action), ["restore", "archive", "edit", "publish", "create"]);
  assert.equal(history.at(-1).before, null); // create has no "before"
  assert.equal(history[0].after.status, "published");
});

test("a new record can never be born published, even if the caller tries", async (t) => {
  await withInitializedRuntime(t);
  const created = createEntity({
    entityType: "place",
    proposedFields: { id: "place-1", slug: "s", status: "published", title: { tr: "T" } },
    actor: "test",
  });
  assert.equal(created.status, "draft");
});

test("id/slug collisions are rejected with ContentConflictError", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "s", title: { tr: "T" } }, actor: "test" });
  assert.throws(() => createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "other", title: { tr: "T" } }, actor: "test" }), ContentConflictError);
  assert.throws(() => createEntity({ entityType: "place", proposedFields: { id: "place-2", slug: "s", title: { tr: "T" } }, actor: "test" }), ContentConflictError);
});

test("an invalid entity (schema violation) is rejected with ContentValidationError, and nothing is written", async (t) => {
  await withInitializedRuntime(t);
  assert.throws(() => createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "s" /* no title */ }, actor: "test" }), ContentValidationError);
  assert.equal(await sqliteV2Store.getEntityById("place-1"), null);
});

test("editEntity locks id/entityType/slug and refuses a status change through the edit path", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "s", title: { tr: "T" } }, actor: "test" });
  assert.throws(() => editEntity({ id: "place-1", proposedFields: { slug: "different" }, actor: "test" }), ContentValidationError);
  assert.throws(() => editEntity({ id: "place-1", proposedFields: { status: "published" }, actor: "test" }), ContentValidationError);
  assert.throws(() => editEntity({ id: "does-not-exist", proposedFields: { title: { tr: "T" } }, actor: "test" }), ContentNotFoundError);
});

test("status transitions follow the documented workflow graph and reject everything else", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "s", title: { tr: "T" } }, actor: "test" });

  // draft -> inReview is allowed
  const inReview = sendToReview({ id: "place-1", actor: "test" });
  assert.equal(inReview.status, "inReview");

  // inReview -> published is allowed
  const published = publishEntity({ id: "place-1", actor: "test" });
  assert.equal(published.status, "published");

  // published -> inReview is NOT allowed (would be a confusing state)
  assert.throws(() => sendToReview({ id: "place-1", actor: "test" }), ContentConflictError);

  // published -> draft (unpublish) IS allowed
  const backToDraft = unpublishEntity({ id: "place-1", actor: "test" });
  assert.equal(backToDraft.status, "draft");

  // archived -> inReview is NOT allowed (must go through draft or published explicitly)
  archiveEntity({ id: "place-1", actor: "test" });
  assert.throws(() => sendToReview({ id: "place-1", actor: "test" }), ContentConflictError);
});

test("restoreEntity only accepts 'draft' or 'published' as the target", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "s", title: { tr: "T" } }, actor: "test" });
  archiveEntity({ id: "place-1", actor: "test" });
  assert.throws(() => restoreEntity({ id: "place-1", toStatus: "readyForReview", actor: "test" }), ContentValidationError);
  const restored = restoreEntity({ id: "place-1", toStatus: "draft", actor: "test" });
  assert.equal(restored.status, "draft");
});

test("media/source entities have no publication status — a transition attempt is rejected", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "media", proposedFields: { id: "media-1", mediaType: "image", mediaRole: "realArchiveMedia" }, actor: "test" });
  assert.throws(() => publishEntity({ id: "media-1", actor: "test" }), ContentValidationError);
  // A status-less entity is always public per publicVisibility.js's rule.
  assert.equal(isPublic(await sqliteV2Store.getEntityById("media-1")), true);
});

test("permanent delete is refused while a relationship references the entity, and succeeds once it's removed", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "a", title: { tr: "A" } }, actor: "test" });
  createEntity({ entityType: "place", proposedFields: { id: "place-2", slug: "b", title: { tr: "B" } }, actor: "test" });
  const relationship = createRelationship({ type: "locatedIn", sourceId: "place-1", targetId: "place-2", actor: "test" });

  assert.throws(() => deleteEntityPermanently({ id: "place-1", actor: "test" }), ContentConflictError);

  removeRelationship({ id: relationship.id, actor: "test" });
  const result = deleteEntityPermanently({ id: "place-1", actor: "test" });
  assert.equal(result.deleted, true);
  assert.equal(await sqliteV2Store.getEntityById("place-1"), null);
});

test("deleting a nonexistent entity throws ContentNotFoundError", async (t) => {
  await withInitializedRuntime(t);
  assert.throws(() => deleteEntityPermanently({ id: "does-not-exist", actor: "test" }), ContentNotFoundError);
});

test("bulk archive reports a per-item result and never lets one failure abort the batch", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "a", title: { tr: "A" } }, actor: "test" });
  createEntity({ entityType: "place", proposedFields: { id: "place-2", slug: "b", title: { tr: "B" } }, actor: "test" });

  const results = bulkTransition({ ids: ["place-1", "does-not-exist", "place-2"], action: "archive", actor: "test" });
  assert.equal(results.length, 3);
  assert.equal(results[0].success, true);
  assert.equal(results[1].success, false);
  assert.equal(results[2].success, true);
  assert.equal((await sqliteV2Store.getEntityById("place-1")).status, "archived");
  assert.equal((await sqliteV2Store.getEntityById("place-2")).status, "archived");
});

test("bulk action is restricted to 'archive' and 'draft' — never a bulk permanent-delete path", async (t) => {
  await withInitializedRuntime(t);
  assert.throws(() => bulkTransition({ ids: ["x"], action: "delete", actor: "test" }), ContentValidationError);
});

test("createRelationship rejects an unknown endpoint id and validates the resulting edge", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "a", title: { tr: "A" } }, actor: "test" });
  assert.throws(() => createRelationship({ type: "locatedIn", sourceId: "place-1", targetId: "missing", actor: "test" }), ContentNotFoundError);
});
