// "UX refinement" round, Issue 2 (Sections 9-16): safe/user-friendly slug
// management. Mirrors contentService.test.js's real-runtime pattern (every
// assertion reads through the actual sqliteV2Store/repository code paths a
// live request would use, never a same-module round-trip) — a pass here is
// a genuine end-to-end proof for the slug lifecycle: free editing pre-
// publish, confirm-gated editing with permanent redirect history post-
// publish, and globally-reserved historical slugs.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { closeSqlite } from "../../db/sqliteConnection.js";
import { sqliteV2Store } from "../../v2/stores/sqliteV2Store.js";
import {
  createEntity, publishEntity, archiveEntity, unpublishEntity,
  changeEntitySlug, getSlugChangeInfo, hasEverBeenPublished,
  ContentValidationError, ContentConflictError, ContentNotFoundError,
} from "../../admin/contentService.js";
import { isHistoricalSlug, findEntityIdByHistoricalSlug, listSlugHistoryForEntity } from "../../db/repositories/slugHistoryRepository.js";

async function withInitializedRuntime(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-slug-ux-"));
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

test("hasEverBeenPublished is false for a fresh draft, true after a publish, and STAYS true after unpublishing back to draft", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "s", title: { tr: "T" } }, actor: "test" });
  assert.equal(hasEverBeenPublished("place-1"), false);

  publishEntity({ id: "place-1", actor: "test" });
  assert.equal(hasEverBeenPublished("place-1"), true);

  unpublishEntity({ id: "place-1", actor: "test" });
  assert.equal(hasEverBeenPublished("place-1"), true, "an entity published then unpublished may still have real external links to its old URL");
});

test("a draft/never-published entity's slug changes freely, with no confirmation required and no redirect history recorded", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "old-slug", title: { tr: "T" } }, actor: "test" });

  const info = getSlugChangeInfo("place-1");
  assert.equal(info.everPublished, false);
  assert.equal(info.currentSlug, "old-slug");

  const updated = changeEntitySlug({ id: "place-1", newSlug: "new-slug", actor: "test" });
  assert.equal(updated.slug, "new-slug");
  assert.equal(listSlugHistoryForEntity("place-1").length, 0, "a draft's slug change is not a redirect-worthy event");
  assert.equal(isHistoricalSlug("old-slug"), false, "a draft's old slug is not reserved");
});

test("an ever-published entity's slug change is refused without confirmed:true, and succeeds with it, recording redirect history", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "test-kilise", title: { tr: "Test Kilise" } }, actor: "test" });
  publishEntity({ id: "place-1", actor: "test" });

  assert.throws(
    () => changeEntitySlug({ id: "place-1", newSlug: "test-kilise-yeni", actor: "test" }),
    (error) => error instanceof ContentConflictError && error.requiresConfirmation === true,
  );
  // The refused attempt above must not have written anything.
  assert.equal(getSlugChangeInfo("place-1").currentSlug, "test-kilise");

  const updated = changeEntitySlug({ id: "place-1", newSlug: "test-kilise-yeni", confirmed: true, actor: "test" });
  assert.equal(updated.slug, "test-kilise-yeni");

  const history = listSlugHistoryForEntity("place-1");
  assert.equal(history.length, 1);
  assert.equal(history[0].oldSlug, "test-kilise");
  assert.equal(history[0].newSlug, "test-kilise-yeni");
  assert.equal(isHistoricalSlug("test-kilise"), true);
  assert.equal(findEntityIdByHistoricalSlug("test-kilise"), "place-1");
});

test("a live slug collision is rejected with a deterministic suggested alternative, never a silent overwrite", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "besikli-magara", title: { tr: "A" } }, actor: "test" });
  createEntity({ entityType: "place", proposedFields: { id: "place-2", slug: "other", title: { tr: "B" } }, actor: "test" });

  assert.throws(
    () => changeEntitySlug({ id: "place-2", newSlug: "besikli-magara", actor: "test" }),
    (error) => error instanceof ContentConflictError && error.suggestedSlug === "besikli-magara-2",
  );
  // A second, already-taken suggestion is skipped in favor of the next free one.
  createEntity({ entityType: "place", proposedFields: { id: "place-3", slug: "besikli-magara-2", title: { tr: "C" } }, actor: "test" });
  assert.throws(
    () => changeEntitySlug({ id: "place-2", newSlug: "besikli-magara", actor: "test" }),
    (error) => error instanceof ContentConflictError && error.suggestedSlug === "besikli-magara-3",
  );
});

test("a historical (formerly used, now-freed) slug stays permanently reserved — no other record, ever, may claim it", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "shared-name", title: { tr: "A" } }, actor: "test" });
  createEntity({ entityType: "place", proposedFields: { id: "place-2", slug: "other", title: { tr: "B" } }, actor: "test" });
  publishEntity({ id: "place-1", actor: "test" });
  // place-1 moves away from "shared-name" — it is now a free-looking slug
  // (no live entity holds it), but it is historically reserved forever.
  changeEntitySlug({ id: "place-1", newSlug: "shared-name-moved", confirmed: true, actor: "test" });

  assert.equal(isHistoricalSlug("shared-name"), true);
  assert.throws(
    () => changeEntitySlug({ id: "place-2", newSlug: "shared-name", actor: "test" }),
    (error) => error instanceof ContentConflictError,
  );
});

test("changeEntitySlug validates format, rejects a same-as-current slug, and rejects an unknown entity", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "valid-slug", title: { tr: "T" } }, actor: "test" });

  assert.throws(() => changeEntitySlug({ id: "place-1", newSlug: "Not Valid!", actor: "test" }), ContentValidationError);
  assert.throws(() => changeEntitySlug({ id: "place-1", newSlug: "valid-slug", actor: "test" }), ContentValidationError);
  assert.throws(() => changeEntitySlug({ id: "does-not-exist", newSlug: "whatever", actor: "test" }), ContentNotFoundError);
});

test("media/source entities have no slug at all, so changeEntitySlug refuses them", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "media", proposedFields: { id: "media-1", mediaType: "image", mediaRole: "realArchiveMedia" }, actor: "test" });
  assert.throws(() => changeEntitySlug({ id: "media-1", newSlug: "anything", actor: "test" }), ContentValidationError);
  assert.equal(getSlugChangeInfo("media-1").everPublished, false);
});

test("archiving an ever-published entity does not un-reserve its slug history, and getSlugChangeInfo still reports everPublished:true", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "old", title: { tr: "T" } }, actor: "test" });
  publishEntity({ id: "place-1", actor: "test" });
  changeEntitySlug({ id: "place-1", newSlug: "new", confirmed: true, actor: "test" });
  archiveEntity({ id: "place-1", actor: "test" });

  assert.equal(getSlugChangeInfo("place-1").everPublished, true);
  assert.equal(isHistoricalSlug("old"), true);
});
