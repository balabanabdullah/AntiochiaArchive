import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import express from "express";
import { runtimeSitemapHandler, sitemapIndexHandler } from "../../../v2/render/runtimeSitemap.js";
import { initializeV2Store } from "../../../v2/stores/v2Store.js";
import { closeSqlite } from "../../../db/sqliteConnection.js";
import { createEntity, publishEntity, archiveEntity } from "../../../admin/contentService.js";
import { createPage, publishPage, archivePage } from "../../../admin/pageService.js";

async function startTestServer(context) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-runtime-sitemap-"));
  const originalPath = process.env.SQLITE_DB_PATH;
  const originalStorageRoot = process.env.LOCAL_STORAGE_ROOT;
  const originalV2Store = process.env.V2_DATA_STORE;
  process.env.V2_DATA_STORE = "sqlite";
  process.env.SQLITE_DB_PATH = path.join(dir, "test.db");
  process.env.LOCAL_STORAGE_ROOT = path.join(dir, "storage");
  await initializeV2Store();

  const app = express();
  app.get("/sitemap-runtime.xml", runtimeSitemapHandler);
  app.get("/sitemap-index.xml", sitemapIndexHandler);
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

  return `http://127.0.0.1:${server.address().port}`;
}

test("T: publishing an entity and a page makes both appear in the dynamic sitemap automatically", async (t) => {
  const baseUrl = await startTestServer(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "sitemap-place", title: { tr: "T" } }, actor: "test" });
  publishEntity({ id: "place-1", actor: "test" });
  const page = createPage({ fields: { slug: "sitemap-page", title: { tr: "T" } }, actor: "test" });
  publishPage({ id: page.id, actor: "test" });

  const xml = await (await fetch(`${baseUrl}/sitemap-runtime.xml`)).text();
  assert.match(xml, /archive-v2\/sitemap-place\//);
  assert.match(xml, /sayfa\/sitemap-page\//);
});

test("U: archiving removes the entity/page from the dynamic sitemap automatically", async (t) => {
  const baseUrl = await startTestServer(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "will-archive", title: { tr: "T" } }, actor: "test" });
  publishEntity({ id: "place-1", actor: "test" });
  const page = createPage({ fields: { slug: "page-will-archive", title: { tr: "T" } }, actor: "test" });
  publishPage({ id: page.id, actor: "test" });

  let xml = await (await fetch(`${baseUrl}/sitemap-runtime.xml`)).text();
  assert.match(xml, /will-archive/);
  assert.match(xml, /page-will-archive/);

  archiveEntity({ id: "place-1", actor: "test" });
  archivePage({ id: page.id, actor: "test" });

  xml = await (await fetch(`${baseUrl}/sitemap-runtime.xml`)).text();
  assert.ok(!xml.includes("archive-v2/will-archive/"));
  assert.ok(!xml.includes("sayfa/page-will-archive/"));
});

test("draft/inReview entities and pages never appear in the dynamic sitemap", async (t) => {
  const baseUrl = await startTestServer(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "still-draft", title: { tr: "T" } }, actor: "test" });
  createPage({ fields: { slug: "still-draft-page", title: { tr: "T" } }, actor: "test" });

  const xml = await (await fetch(`${baseUrl}/sitemap-runtime.xml`)).text();
  assert.ok(!xml.includes("still-draft"));
});

test("COMMIT ÖNCESİ round, Section 3: after a published page's slug changes, the sitemap carries ONLY the new URL, never the old one", async (t) => {
  const baseUrl = await startTestServer(t);
  const { changePageSlug } = await import("../../../admin/pageService.js");
  const page = createPage({ fields: { slug: "old-page-slug", title: { tr: "T" } }, actor: "test" });
  publishPage({ id: page.id, actor: "test" });
  changePageSlug({ id: page.id, newSlug: "new-page-slug", confirmed: true, actor: "test" });

  const xml = await (await fetch(`${baseUrl}/sitemap-runtime.xml`)).text();
  assert.match(xml, /sayfa\/new-page-slug\//);
  assert.ok(!xml.includes("old-page-slug"), "the OLD slug must never appear in the sitemap once the page has moved");
});

test("sitemap-index.xml references both the static sitemap.xml and the live runtime one, as a valid sitemap index", async (t) => {
  const baseUrl = await startTestServer(t);
  const xml = await (await fetch(`${baseUrl}/sitemap-index.xml`)).text();
  assert.match(xml, /<sitemapindex/);
  assert.match(xml, /\/sitemap\.xml/);
  assert.match(xml, /\/sitemap-runtime\.xml/);
});

test("release-blocker Section 11: an existing (pre-import) entity's archive/restore cycle is reflected exactly once each transition in the runtime sitemap, and never appears in the static one", async (t) => {
  const baseUrl = await startTestServer(t);
  // "Existing" here means: already present in the canonical dataset before
  // this test's own SQLite database was created — createEntity() below
  // mirrors what scripts/migrate-json-to-sqlite.js would have imported.
  createEntity({ entityType: "place", proposedFields: { id: "place-existing", slug: "sitemap-union-existing", title: { tr: "T" } }, actor: "test" });
  publishEntity({ id: "place-existing", actor: "test" });

  const staticXml = await fs.readFile(path.resolve(import.meta.dirname, "../../../../dist/sitemap.xml"), "utf8").catch(() => "");
  assert.ok(!staticXml.includes("sitemap-union-existing"), "the static sitemap must never carry a runtime entity URL, imported or not");

  let runtimeXml = await (await fetch(`${baseUrl}/sitemap-runtime.xml`)).text();
  assert.equal((runtimeXml.match(/sitemap-union-existing/g) || []).length, 1, "published: exactly one appearance");

  archiveEntity({ id: "place-existing", actor: "test" });
  runtimeXml = await (await fetch(`${baseUrl}/sitemap-runtime.xml`)).text();
  assert.equal((runtimeXml.match(/sitemap-union-existing/g) || []).length, 0, "archived: zero appearances anywhere in the active sitemap system");

  const { restoreEntity } = await import("../../../admin/contentService.js");
  restoreEntity({ id: "place-existing", toStatus: "published", actor: "test" });
  runtimeXml = await (await fetch(`${baseUrl}/sitemap-runtime.xml`)).text();
  assert.equal((runtimeXml.match(/sitemap-union-existing/g) || []).length, 1, "restored: exactly one appearance again, not duplicated");
});
