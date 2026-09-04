// "COMMIT ÖNCESİ" round, Section 3: the public /sayfa/:slug HTML route's
// historical-slug 301 redirect — the page-domain equivalent of
// test/v2/routes/v2DetailRoutes.test.js's entity redirect tests, reusing
// the same shared slug_history table (see slugHistoryRepository.js).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import express from "express";
import { publicPageHtmlRouter } from "../../pages/pageRoutes.js";
import { initializeV2Store } from "../../v2/stores/v2Store.js";
import { closeSqlite } from "../../db/sqliteConnection.js";
import { createPage, publishPage, archivePage, changePageSlug } from "../../admin/pageService.js";

async function startTestServer(context) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-page-routes-"));
  const originalPath = process.env.SQLITE_DB_PATH;
  const originalStorageRoot = process.env.LOCAL_STORAGE_ROOT;
  const originalV2Store = process.env.V2_DATA_STORE;
  process.env.V2_DATA_STORE = "sqlite";
  process.env.SQLITE_DB_PATH = path.join(dir, "test.db");
  process.env.LOCAL_STORAGE_ROOT = path.join(dir, "storage");
  await initializeV2Store();

  const app = express();
  app.use("/sayfa", publicPageHtmlRouter);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    closeSqlite();
    if (originalPath === undefined) delete process.env.SQLITE_DB_PATH; else process.env.SQLITE_DB_PATH = originalPath;
    if (originalStorageRoot === undefined) delete process.env.LOCAL_STORAGE_ROOT; else process.env.LOCAL_STORAGE_ROOT = originalStorageRoot;
    if (originalV2Store === undefined) delete process.env.V2_DATA_STORE; else process.env.V2_DATA_STORE = originalV2Store;
    await fs.rm(dir, { recursive: true, force: true });
  });

  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

test("a published page's old slug 301-redirects to its new slug, and the new slug serves 200", async (t) => {
  const baseUrl = await startTestServer(t);
  const page = createPage({ fields: { slug: "test-sayfasi", title: { tr: "Test Sayfası" }, content: { tr: "İçerik." } }, actor: "test" });
  publishPage({ id: page.id, actor: "test" });

  changePageSlug({ id: page.id, newSlug: "test-sayfasi-yeni", confirmed: true, actor: "test" });

  const oldResponse = await fetch(`${baseUrl}/sayfa/test-sayfasi`, { redirect: "manual" });
  assert.equal(oldResponse.status, 301);
  assert.equal(oldResponse.headers.get("location"), "/sayfa/test-sayfasi-yeni/");

  const newResponse = await fetch(`${baseUrl}/sayfa/test-sayfasi-yeni`);
  assert.equal(newResponse.status, 200);
  const html = await newResponse.text();
  assert.match(html, /Test Sayfası/);
  assert.match(html, /<link rel="canonical" href="[^"]*\/sayfa\/test-sayfasi-yeni\/">/, "canonical must point only to the NEW URL");
  assert.ok(!html.includes("test-sayfasi/\""), "the OLD slug must never appear as a canonical/self-referential URL on the new page");
});

test("a page slug changed twice redirects in a single hop from the oldest slug straight to the current one, never a chain", async (t) => {
  const baseUrl = await startTestServer(t);
  const page = createPage({ fields: { slug: "v1", title: { tr: "T" }, content: { tr: "İçerik." } }, actor: "test" });
  publishPage({ id: page.id, actor: "test" });
  changePageSlug({ id: page.id, newSlug: "v2", confirmed: true, actor: "test" });
  changePageSlug({ id: page.id, newSlug: "v3", confirmed: true, actor: "test" });

  const fromV1 = await fetch(`${baseUrl}/sayfa/v1`, { redirect: "manual" });
  assert.equal(fromV1.status, 301);
  assert.equal(fromV1.headers.get("location"), "/sayfa/v3/", "must jump straight to the CURRENT slug, not the intermediate v2");

  const fromV2 = await fetch(`${baseUrl}/sayfa/v2`, { redirect: "manual" });
  assert.equal(fromV2.status, 301);
  assert.equal(fromV2.headers.get("location"), "/sayfa/v3/");
});

test("an archived page's old slug does not redirect to (or otherwise expose) its content — it 404s exactly like an unknown slug", async (t) => {
  const baseUrl = await startTestServer(t);
  const page = createPage({ fields: { slug: "was-public", title: { tr: "T" }, content: { tr: "İçerik." } }, actor: "test" });
  publishPage({ id: page.id, actor: "test" });
  changePageSlug({ id: page.id, newSlug: "was-public-new", confirmed: true, actor: "test" });
  archivePage({ id: page.id, actor: "test" });

  const response = await fetch(`${baseUrl}/sayfa/was-public`, { redirect: "manual" });
  assert.equal(response.status, 404, "an old slug for a non-published page must never redirect");

  const currentAlso404s = await fetch(`${baseUrl}/sayfa/was-public-new`, { redirect: "manual" });
  assert.equal(currentAlso404s.status, 404, "the CURRENT slug of an archived page must not expose content either");
});

test("a never-published page's slug change leaves no redirect at all (drafts have no external links worth preserving)", async (t) => {
  const baseUrl = await startTestServer(t);
  const page = createPage({ fields: { slug: "draft-old", title: { tr: "T" }, content: { tr: "İçerik." } }, actor: "test" });
  changePageSlug({ id: page.id, newSlug: "draft-new", actor: "test" }); // never published: no confirmed flag needed

  const oldResponse = await fetch(`${baseUrl}/sayfa/draft-old`, { redirect: "manual" });
  assert.equal(oldResponse.status, 404);
});

test("an unknown slug 404s", async (t) => {
  const baseUrl = await startTestServer(t);
  const response = await fetch(`${baseUrl}/sayfa/never-existed`);
  assert.equal(response.status, 404);
});
