import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import http from "node:http";
import express from "express";
import v2DetailRouter from "../../../v2/routes/v2DetailRoutes.js";
import { initializeV2Store } from "../../../v2/stores/v2Store.js";
import { closeSqlite } from "../../../db/sqliteConnection.js";
import { createEntity, publishEntity, archiveEntity } from "../../../admin/contentService.js";
import { _resetDetailAssetCacheForTests } from "../../../v2/render/detailAssetManifest.js";

const FIXTURE_INDEX_HTML = `<!doctype html><html><head>
  <link rel="stylesheet" href="/assets/style-testhash.css">
  <script src="/assets/lang-testhash.js"></script>
  <script src="/assets/archive-v2-api-testhash.js"></script>
  <script src="/assets/archive-store-testhash.js"></script>
  <script src="/assets/search-testhash.js"></script>
  <script src="/assets/music-testhash.js"></script>
  <script src="/assets/script-testhash.js"></script>
</head><body></body></html>`;

async function startTestServer(context) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-v2detail-routes-"));
  const originalPath = process.env.SQLITE_DB_PATH;
  const originalStorageRoot = process.env.LOCAL_STORAGE_ROOT;
  const originalV2Store = process.env.V2_DATA_STORE;
  const originalClientUrl = process.env.CLIENT_URL;
  process.env.V2_DATA_STORE = "sqlite";
  process.env.SQLITE_DB_PATH = path.join(dir, "test.db");
  process.env.LOCAL_STORAGE_ROOT = path.join(dir, "storage");
  await initializeV2Store();

  // renderEntityDetailHtml() resolves the live frontend's asset filenames
  // over real HTTP (detailAssetManifest.js) — this fixture server stands in
  // for "the deployed frontend" so these tests exercise the real fetch
  // path rather than a stub.
  const assetServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(FIXTURE_INDEX_HTML);
  });
  await new Promise((resolvePromise) => assetServer.listen(0, "127.0.0.1", resolvePromise));
  process.env.CLIENT_URL = `http://127.0.0.1:${assetServer.address().port}`;
  _resetDetailAssetCacheForTests();

  const app = express();
  app.use("/archive-v2", v2DetailRouter);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => assetServer.close(resolve));
    closeSqlite();
    if (originalPath === undefined) delete process.env.SQLITE_DB_PATH; else process.env.SQLITE_DB_PATH = originalPath;
    if (originalStorageRoot === undefined) delete process.env.LOCAL_STORAGE_ROOT; else process.env.LOCAL_STORAGE_ROOT = originalStorageRoot;
    if (originalV2Store === undefined) delete process.env.V2_DATA_STORE; else process.env.V2_DATA_STORE = originalV2Store;
    if (originalClientUrl === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = originalClientUrl;
    _resetDetailAssetCacheForTests();
    await fs.rm(dir, { recursive: true, force: true });
  });

  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

test("F: a brand-new SQLite entity resolves 200 at /archive-v2/:slug/ with zero build step", async (t) => {
  const baseUrl = await startTestServer(t);
  createEntity({ entityType: "historicalContext", proposedFields: { id: "hist-1", slug: "brand-new", title: { tr: "Yeni Kayıt" } }, actor: "test" });
  publishEntity({ id: "hist-1", actor: "test" });

  const response = await fetch(`${baseUrl}/archive-v2/brand-new`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Yeni Kayıt/);
});

test("H/J: archiving 404s the detail page; restoring brings it back", async (t) => {
  const baseUrl = await startTestServer(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "toggle-place", title: { tr: "T" } }, actor: "test" });
  publishEntity({ id: "place-1", actor: "test" });
  assert.equal((await fetch(`${baseUrl}/archive-v2/toggle-place`)).status, 200);

  archiveEntity({ id: "place-1", actor: "test" });
  assert.equal((await fetch(`${baseUrl}/archive-v2/toggle-place`)).status, 404);
});

test("an unknown slug 404s", async (t) => {
  const baseUrl = await startTestServer(t);
  const response = await fetch(`${baseUrl}/archive-v2/never-existed`);
  assert.equal(response.status, 404);
});

test("correctness pass, Section 3/4/5: an existing entity's edit shows up at the same URL immediately, using the SAME shared shell as a brand-new entity — no visual divergence between them", async (t) => {
  const baseUrl = await startTestServer(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "existing-place", title: { tr: "Eski Başlık" } }, actor: "test" });
  publishEntity({ id: "place-1", actor: "test" });

  const before = await fetch(`${baseUrl}/archive-v2/existing-place`);
  assert.equal(before.status, 200);
  const beforeHtml = await before.text();
  assert.match(beforeHtml, /Eski Başlık/);
  assert.match(beforeHtml, /class="site-header"/);

  const { editEntity } = await import("../../../admin/contentService.js");
  editEntity({ id: "place-1", proposedFields: { title: { tr: "Yeni Başlık" } }, actor: "test" });

  const after = await fetch(`${baseUrl}/archive-v2/existing-place`);
  assert.equal(after.status, 200);
  const afterHtml = await after.text();
  assert.match(afterHtml, /Yeni Başlık/, "the edit must be visible immediately, no rebuild");
  assert.ok(!afterHtml.includes("Eski Başlık"));
  assert.match(afterHtml, /class="site-header"/, "the edited page must use the same shared shell as the pre-edit version");
});

test("a temporarily unreachable asset manifest yields 503 (not a 404 that would trigger nginx's stale static fallback, and not a silently degraded page)", async (t) => {
  const baseUrl = await startTestServer(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "needs-assets", title: { tr: "T" } }, actor: "test" });
  publishEntity({ id: "place-1", actor: "test" });

  // Point CLIENT_URL at a closed port so the asset-manifest fetch fails,
  // with no cached manifest yet to fall back on. startTestServer's own
  // cleanup restores the real fixture CLIENT_URL regardless of this
  // mutation, since it captured the original value before this test ran.
  process.env.CLIENT_URL = "http://127.0.0.1:1";
  _resetDetailAssetCacheForTests();

  const response = await fetch(`${baseUrl}/archive-v2/needs-assets`);
  assert.equal(response.status, 503);
});

test("media/source entities (no slug, no detail page) never resolve here even by id-as-slug guessing", async (t) => {
  const baseUrl = await startTestServer(t);
  createEntity({ entityType: "media", proposedFields: { id: "media-1", mediaType: "image", mediaRole: "realArchiveMedia" }, actor: "test" });
  const response = await fetch(`${baseUrl}/archive-v2/media-1`);
  assert.equal(response.status, 404);
});

/* ---------------------------------------------------------------------- */
/* "UX refinement" round, Sections 12/14/15: historical-slug 301 redirect. */
/* ---------------------------------------------------------------------- */

test("a published entity's old slug 301-redirects to its new slug, and the new slug serves 200", async (t) => {
  const baseUrl = await startTestServer(t);
  const { changeEntitySlug } = await import("../../../admin/contentService.js");
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "test-kilise", title: { tr: "Test Kilise" } }, actor: "test" });
  publishEntity({ id: "place-1", actor: "test" });

  changeEntitySlug({ id: "place-1", newSlug: "test-kilise-yeni", confirmed: true, actor: "test" });

  const oldResponse = await fetch(`${baseUrl}/archive-v2/test-kilise`, { redirect: "manual" });
  assert.equal(oldResponse.status, 301);
  assert.equal(oldResponse.headers.get("location"), "/archive-v2/test-kilise-yeni/");

  const newResponse = await fetch(`${baseUrl}/archive-v2/test-kilise-yeni`);
  assert.equal(newResponse.status, 200);
  const html = await newResponse.text();
  assert.match(html, /Test Kilise/);
});

test("a slug changed twice redirects in a single hop from the oldest slug straight to the current one, never a chain", async (t) => {
  const baseUrl = await startTestServer(t);
  const { changeEntitySlug } = await import("../../../admin/contentService.js");
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "v1", title: { tr: "T" } }, actor: "test" });
  publishEntity({ id: "place-1", actor: "test" });
  changeEntitySlug({ id: "place-1", newSlug: "v2", confirmed: true, actor: "test" });
  changeEntitySlug({ id: "place-1", newSlug: "v3", confirmed: true, actor: "test" });

  const fromV1 = await fetch(`${baseUrl}/archive-v2/v1`, { redirect: "manual" });
  assert.equal(fromV1.status, 301);
  assert.equal(fromV1.headers.get("location"), "/archive-v2/v3/", "must jump straight to the CURRENT slug, not the intermediate v2");

  const fromV2 = await fetch(`${baseUrl}/archive-v2/v2`, { redirect: "manual" });
  assert.equal(fromV2.status, 301);
  assert.equal(fromV2.headers.get("location"), "/archive-v2/v3/");
});

test("an archived entity's old slug does not redirect to (or otherwise expose) its content — it 404s exactly like an unknown slug", async (t) => {
  const baseUrl = await startTestServer(t);
  const { changeEntitySlug } = await import("../../../admin/contentService.js");
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "was-public", title: { tr: "T" } }, actor: "test" });
  publishEntity({ id: "place-1", actor: "test" });
  changeEntitySlug({ id: "place-1", newSlug: "was-public-new", confirmed: true, actor: "test" });
  archiveEntity({ id: "place-1", actor: "test" });

  const response = await fetch(`${baseUrl}/archive-v2/was-public`, { redirect: "manual" });
  assert.equal(response.status, 404, "an old slug for a non-public entity must never redirect");
});

test("a never-published entity's slug change leaves no redirect at all (drafts have no external links worth preserving)", async (t) => {
  const baseUrl = await startTestServer(t);
  const { changeEntitySlug } = await import("../../../admin/contentService.js");
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "draft-old", title: { tr: "T" } }, actor: "test" });
  changeEntitySlug({ id: "place-1", newSlug: "draft-new", actor: "test" }); // never published: no confirmed flag needed

  const oldResponse = await fetch(`${baseUrl}/archive-v2/draft-old`, { redirect: "manual" });
  assert.equal(oldResponse.status, 404);
});
