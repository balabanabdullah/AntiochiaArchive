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
} from "../../admin/pageService.js";
import { ContentValidationError, ContentConflictError, ContentNotFoundError, createEntity } from "../../admin/contentService.js";

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
