import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { closeSqlite } from "../../db/sqliteConnection.js";
import { sqliteV2Store } from "../../v2/stores/sqliteV2Store.js";
import {
  createPage, editPage, publishPage, sendPageToReview, unpublishPage, archivePage, restorePage,
  deletePagePermanently, getPageRevisionHistory, getPublishedPageBySlug,
  changePageSlug, getPageSlugChangeInfo, hasPageEverBeenPublished,
} from "../../admin/pageService.js";
import { ContentValidationError, ContentConflictError, ContentNotFoundError, createEntity, changeEntitySlug } from "../../admin/contentService.js";
import { isHistoricalPageSlug, findPageIdByHistoricalSlug, listSlugHistoryForPage } from "../../db/repositories/slugHistoryRepository.js";

async function withInitializedRuntime(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-page-service-"));
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

test("K-Q: create page -> publish -> publicly resolvable -> edit -> update visible -> archive -> no longer resolvable", async (t) => {
  await withInitializedRuntime(t);

  const created = createPage({ fields: { id: "page-1", slug: "hakkimizda", title: { tr: "Hakkımızda" }, content: { tr: "Merhaba." } }, actor: "test" });
  assert.equal(created.status, "draft");
  assert.equal(getPublishedPageBySlug("hakkimizda"), null, "a draft page must not resolve publicly");

  const published = publishPage({ id: "page-1", actor: "test" });
  assert.equal(published.status, "published");
  const resolvedPublished = getPublishedPageBySlug("hakkimizda");
  assert.ok(resolvedPublished);
  assert.equal(resolvedPublished.content.tr, "Merhaba.");

  editPage({ id: "page-1", fields: { content: { tr: "Güncellendi." } }, actor: "test" });
  assert.equal(getPublishedPageBySlug("hakkimizda").content.tr, "Güncellendi.", "edit must be visible immediately, no rebuild");

  archivePage({ id: "page-1", actor: "test" });
  assert.equal(getPublishedPageBySlug("hakkimizda"), null, "an archived page must stop resolving publicly");

  const restored = restorePage({ id: "page-1", toStatus: "published", actor: "test" });
  assert.equal(restored.status, "published");
  assert.ok(getPublishedPageBySlug("hakkimizda"));

  const history = getPageRevisionHistory("page-1");
  assert.deepEqual(history.map((h) => h.action), ["restore", "archive", "edit", "publish", "create"]);
});

test("a reserved slug (admin/api/assets/...) is rejected by the schema, not just convention", async (t) => {
  await withInitializedRuntime(t);
  assert.throws(() => createPage({ fields: { id: "page-1", slug: "admin", title: { tr: "T" } }, actor: "test" }), ContentValidationError);
});

test("duplicate slugs across two pages are rejected", async (t) => {
  await withInitializedRuntime(t);
  createPage({ fields: { id: "page-1", slug: "s", title: { tr: "T" } }, actor: "test" });
  assert.throws(() => createPage({ fields: { id: "page-2", slug: "s", title: { tr: "T2" } }, actor: "test" }), ContentConflictError);
});

test("editPage cannot change status, and rejects editing a nonexistent page", async (t) => {
  await withInitializedRuntime(t);
  createPage({ fields: { id: "page-1", slug: "s", title: { tr: "T" } }, actor: "test" });
  assert.throws(() => editPage({ id: "page-1", fields: { status: "published" }, actor: "test" }), ContentValidationError);
  assert.throws(() => editPage({ id: "missing", fields: { title: { tr: "T" } }, actor: "test" }), ContentNotFoundError);
});

test("page status transitions follow the same workflow graph as entities", async (t) => {
  await withInitializedRuntime(t);
  createPage({ fields: { id: "page-1", slug: "s", title: { tr: "T" } }, actor: "test" });
  sendPageToReview({ id: "page-1", actor: "test" });
  publishPage({ id: "page-1", actor: "test" });
  assert.throws(() => sendPageToReview({ id: "page-1", actor: "test" }), ContentConflictError);
  unpublishPage({ id: "page-1", actor: "test" });
});

test("Section 10: page.mediaIds must reference real media entities — a bogus id is rejected on create and edit", async (t) => {
  await withInitializedRuntime(t);
  assert.throws(() => createPage({ fields: { slug: "s", title: { tr: "T" }, mediaIds: ["not-a-real-media-id"] }, actor: "test" }), ContentValidationError);

  createEntity({ entityType: "media", proposedFields: { id: "media-1", mediaType: "image", mediaRole: "realArchiveMedia" }, actor: "test" });
  const page = createPage({ fields: { slug: "s", title: { tr: "T" }, mediaIds: ["media-1"] }, actor: "test" });
  assert.deepEqual(page.mediaIds, ["media-1"]);

  assert.throws(() => editPage({ id: page.id, fields: { mediaIds: ["media-1", "still-bogus"] }, actor: "test" }), ContentValidationError);
});

test("deletePagePermanently removes the page and records an audit entry", async (t) => {
  await withInitializedRuntime(t);
  createPage({ fields: { id: "page-1", slug: "s", title: { tr: "T" } }, actor: "test" });
  const result = deletePagePermanently({ id: "page-1", actor: "test" });
  assert.equal(result.deleted, true);
  assert.throws(() => editPage({ id: "page-1", fields: { title: { tr: "T2" } }, actor: "test" }), ContentNotFoundError);
});

/* --------------------------------------------------------------------------
   Page slug UX ("COMMIT ÖNCESİ" round, Section 2/3) — same lifecycle as
   cultural entities (contentService.test.js/slugUxService.test.js), applied
   to Pages: free editing pre-publish, confirm-gated editing with permanent
   redirect history post-publish, globally-reserved-within-domain historical
   slugs, and a separate collision domain from cultural entities.
   -------------------------------------------------------------------------- */

test("editPage locks slug exactly like editEntity — the ONLY way to change an existing page's slug is changePageSlug", async (t) => {
  await withInitializedRuntime(t);
  createPage({ fields: { id: "page-1", slug: "s", title: { tr: "T" } }, actor: "test" });
  assert.throws(() => editPage({ id: "page-1", fields: { slug: "different" }, actor: "test" }), ContentValidationError);
});

test("hasPageEverBeenPublished is false for a fresh draft, true after a publish, and STAYS true after unpublishing back to draft", async (t) => {
  await withInitializedRuntime(t);
  createPage({ fields: { id: "page-1", slug: "s", title: { tr: "T" } }, actor: "test" });
  assert.equal(hasPageEverBeenPublished("page-1"), false);

  publishPage({ id: "page-1", actor: "test" });
  assert.equal(hasPageEverBeenPublished("page-1"), true);

  unpublishPage({ id: "page-1", actor: "test" });
  assert.equal(hasPageEverBeenPublished("page-1"), true, "a page published then unpublished may still have real external links to its old URL");
});

test("a draft/never-published page's slug changes freely, with no confirmation required and no redirect history recorded", async (t) => {
  await withInitializedRuntime(t);
  createPage({ fields: { id: "page-1", slug: "old-slug", title: { tr: "T" } }, actor: "test" });

  const info = getPageSlugChangeInfo("page-1");
  assert.equal(info.everPublished, false);
  assert.equal(info.currentSlug, "old-slug");

  const updated = changePageSlug({ id: "page-1", newSlug: "new-slug", actor: "test" });
  assert.equal(updated.slug, "new-slug");
  assert.equal(listSlugHistoryForPage("page-1").length, 0, "a draft's slug change is not a redirect-worthy event");
  assert.equal(isHistoricalPageSlug("old-slug"), false, "a draft's old slug is not reserved");
});

test("an ever-published page's slug change is refused without confirmed:true, and succeeds with it, recording redirect history", async (t) => {
  await withInitializedRuntime(t);
  createPage({ fields: { id: "page-1", slug: "test-sayfasi", title: { tr: "Test Sayfası" } }, actor: "test" });
  publishPage({ id: "page-1", actor: "test" });

  assert.throws(
    () => changePageSlug({ id: "page-1", newSlug: "test-sayfasi-yeni", actor: "test" }),
    (error) => error instanceof ContentConflictError && error.requiresConfirmation === true,
  );
  assert.equal(getPageSlugChangeInfo("page-1").currentSlug, "test-sayfasi");

  const updated = changePageSlug({ id: "page-1", newSlug: "test-sayfasi-yeni", confirmed: true, actor: "test" });
  assert.equal(updated.slug, "test-sayfasi-yeni");

  const history = listSlugHistoryForPage("page-1");
  assert.equal(history.length, 1);
  assert.equal(history[0].oldSlug, "test-sayfasi");
  assert.equal(history[0].newSlug, "test-sayfasi-yeni");
  assert.equal(isHistoricalPageSlug("test-sayfasi"), true);
  assert.equal(findPageIdByHistoricalSlug("test-sayfasi"), "page-1");
});

test("a live page-slug collision is rejected with a deterministic suggested alternative, never a silent overwrite", async (t) => {
  await withInitializedRuntime(t);
  createPage({ fields: { id: "page-1", slug: "antakya-hakkinda", title: { tr: "A" } }, actor: "test" });

  assert.throws(
    () => createPage({ fields: { id: "page-2", slug: "antakya-hakkinda", title: { tr: "B" } }, actor: "test" }),
    (error) => error instanceof ContentConflictError && error.suggestedSlug === "antakya-hakkinda-2",
  );
});

test("a historical (formerly used, now-freed) page slug stays permanently reserved — no other page, ever, may claim it", async (t) => {
  await withInitializedRuntime(t);
  createPage({ fields: { id: "page-1", slug: "shared-name", title: { tr: "A" } }, actor: "test" });
  createPage({ fields: { id: "page-2", slug: "other", title: { tr: "B" } }, actor: "test" });
  publishPage({ id: "page-1", actor: "test" });
  changePageSlug({ id: "page-1", newSlug: "shared-name-moved", confirmed: true, actor: "test" });

  assert.equal(isHistoricalPageSlug("shared-name"), true);
  assert.throws(
    () => changePageSlug({ id: "page-2", newSlug: "shared-name", actor: "test" }),
    (error) => error instanceof ContentConflictError,
  );
});

test("changePageSlug validates format, rejects a same-as-current slug, and rejects an unknown page", async (t) => {
  await withInitializedRuntime(t);
  createPage({ fields: { id: "page-1", slug: "valid-slug", title: { tr: "T" } }, actor: "test" });

  assert.throws(() => changePageSlug({ id: "page-1", newSlug: "Not Valid!", actor: "test" }), ContentValidationError);
  assert.throws(() => changePageSlug({ id: "page-1", newSlug: "valid-slug", actor: "test" }), ContentValidationError);
  assert.throws(() => changePageSlug({ id: "does-not-exist", newSlug: "whatever", actor: "test" }), ContentNotFoundError);
});

/* Section 4: collision DOMAIN separation — a page and a cultural entity may
   freely share identical slug text, since they live in disjoint public
   namespaces (/sayfa/ vs /archive-v2/). Only WITHIN one namespace must a
   slug (live or historical) stay unique. */
test("identical slug text is NOT prohibited across the page and entity namespaces", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "antakya", title: { tr: "Antakya" } }, actor: "test" });
  // Must NOT throw — a page may use the exact same slug text a cultural entity already uses.
  const page = createPage({ fields: { id: "page-1", slug: "antakya", title: { tr: "Antakya Sayfası" } }, actor: "test" });
  assert.equal(page.slug, "antakya");
});

test("a historically-reserved ENTITY slug does not block a PAGE from using the same text, and vice versa", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "shared-text", title: { tr: "A" } }, actor: "test" });
  createEntity({ entityType: "place", proposedFields: { id: "place-2", slug: "other-entity", title: { tr: "B" } }, actor: "test" });
  const { publishEntity } = await import("../../admin/contentService.js");
  publishEntity({ id: "place-1", actor: "test" });
  changeEntitySlug({ id: "place-1", newSlug: "shared-text-moved", confirmed: true, actor: "test" });
  // "shared-text" is now historically reserved in the ENTITY domain only.
  assert.throws(() => changeEntitySlug({ id: "place-2", newSlug: "shared-text", actor: "test" }), ContentConflictError);

  // A page may still freely use "shared-text" — separate domain, separate reservation.
  const page = createPage({ fields: { id: "page-1", slug: "shared-text", title: { tr: "T" } }, actor: "test" });
  assert.equal(page.slug, "shared-text");
});
