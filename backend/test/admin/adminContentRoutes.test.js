import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import express from "express";
import adminContentRouter from "../../admin/adminContentRoutes.js";
import adminEditorialRouter from "../../admin/adminRoutes.js";
import v2Router from "../../v2/routes/v2Routes.js";
import { publicPageJsonRouter } from "../../pages/pageRoutes.js";
import { initializeV2Store } from "../../v2/stores/v2Store.js";
import { initializeEditorialStore } from "../../admin/editorialStore.js";
import { _resetForTests } from "../../admin/adminSession.js";
import { closeSqlite } from "../../db/sqliteConnection.js";

const TEST_TOKEN = "integration-test-admin-token";
const ORIGINAL_ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const ORIGINAL_V2_STORE = process.env.V2_DATA_STORE;
const ORIGINAL_SQLITE_PATH = process.env.SQLITE_DB_PATH;
const ORIGINAL_STORAGE_ROOT = process.env.LOCAL_STORAGE_ROOT;

test.after(() => {
  if (ORIGINAL_ADMIN_TOKEN === undefined) delete process.env.ADMIN_TOKEN; else process.env.ADMIN_TOKEN = ORIGINAL_ADMIN_TOKEN;
  if (ORIGINAL_V2_STORE === undefined) delete process.env.V2_DATA_STORE; else process.env.V2_DATA_STORE = ORIGINAL_V2_STORE;
  if (ORIGINAL_SQLITE_PATH === undefined) delete process.env.SQLITE_DB_PATH; else process.env.SQLITE_DB_PATH = ORIGINAL_SQLITE_PATH;
  if (ORIGINAL_STORAGE_ROOT === undefined) delete process.env.LOCAL_STORAGE_ROOT; else process.env.LOCAL_STORAGE_ROOT = ORIGINAL_STORAGE_ROOT;
});

async function startTestServer(context, { storeName = "sqlite" } = {}) {
  process.env.ADMIN_TOKEN = TEST_TOKEN;
  process.env.V2_DATA_STORE = storeName;
  if (storeName === "sqlite") {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-admin-content-routes-"));
    process.env.SQLITE_DB_PATH = path.join(dir, "test.db");
    process.env.LOCAL_STORAGE_ROOT = path.join(dir, "storage");
    context.after(async () => {
      closeSqlite();
      await fs.rm(dir, { recursive: true, force: true });
    });
  }
  _resetForTests();
  await initializeV2Store();
  await initializeEditorialStore();

  const app = express();
  app.use(express.json({ limit: "64kb" }));
  app.use("/api/admin/editorial", adminEditorialRouter);
  app.use("/api/admin/content", adminContentRouter);
  app.use("/api/v2", v2Router);
  app.use("/api/pages", publicPageJsonRouter);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

function cookieHeader(response) {
  return response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}
function csrfFrom(cookieHeaderStr) {
  const match = cookieHeaderStr.match(/aa_admin_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/api/admin/editorial/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: TEST_TOKEN }),
  });
  assert.equal(response.status, 200);
  const cookie = cookieHeader(response);
  return { cookie, csrf: csrfFrom(cookie) };
}
function authHeaders({ cookie, csrf }) {
  return { Cookie: cookie, "X-CSRF-Token": csrf, "Content-Type": "application/json" };
}

test("every /api/admin/content route requires a session, even before the sqlite-runtime check", async (t) => {
  const baseUrl = await startTestServer(t);
  const response = await fetch(`${baseUrl}/api/admin/content/entities`);
  assert.equal(response.status, 401);
});

test("when V2_DATA_STORE is not sqlite, an authenticated request gets a clear 409, not a crash", async (t) => {
  const baseUrl = await startTestServer(t, { storeName: "local" });
  const auth = await login(baseUrl);
  const response = await fetch(`${baseUrl}/api/admin/content/entities`, { headers: authHeaders(auth) });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.match(body.error, /SQLite/);
});

test("create -> publish -> public API sees it, over real HTTP", async (t) => {
  const baseUrl = await startTestServer(t);
  const auth = await login(baseUrl);

  const createResponse = await fetch(`${baseUrl}/api/admin/content/entities`, {
    method: "POST", headers: authHeaders(auth),
    body: JSON.stringify({ entityType: "place", fields: { id: "place-http-1", slug: "http-place", title: { tr: "HTTP Yer" } } }),
  });
  assert.equal(createResponse.status, 201);
  const created = (await createResponse.json()).data;
  assert.equal(created.status, "draft");

  const publishResponse = await fetch(`${baseUrl}/api/admin/content/entities/place-http-1/transition`, {
    method: "POST", headers: authHeaders(auth), body: JSON.stringify({ toStatus: "published" }),
  });
  assert.equal(publishResponse.status, 200);

  const publicResponse = await fetch(`${baseUrl}/api/v2/entities/place-http-1`);
  assert.equal(publicResponse.status, 200);
  const publicBody = await publicResponse.json();
  assert.equal(publicBody.data.slug, "http-place");
});

test("a write without the CSRF header is rejected (403), even with a valid session cookie", async (t) => {
  const baseUrl = await startTestServer(t);
  const auth = await login(baseUrl);
  const response = await fetch(`${baseUrl}/api/admin/content/entities`, {
    method: "POST",
    headers: { Cookie: auth.cookie, "Content-Type": "application/json" }, // no X-CSRF-Token
    body: JSON.stringify({ entityType: "place", fields: { id: "x", slug: "x", title: { tr: "T" } } }),
  });
  assert.equal(response.status, 403);
});

test("permanent delete without confirm:true is refused (400)", async (t) => {
  const baseUrl = await startTestServer(t);
  const auth = await login(baseUrl);
  await fetch(`${baseUrl}/api/admin/content/entities`, {
    method: "POST", headers: authHeaders(auth),
    body: JSON.stringify({ entityType: "place", fields: { id: "place-1", slug: "s", title: { tr: "T" } } }),
  });
  const response = await fetch(`${baseUrl}/api/admin/content/entities/place-1`, {
    method: "DELETE", headers: authHeaders(auth), body: JSON.stringify({}),
  });
  assert.equal(response.status, 400);
});

test("bulk archive returns a per-item result array", async (t) => {
  const baseUrl = await startTestServer(t);
  const auth = await login(baseUrl);
  await fetch(`${baseUrl}/api/admin/content/entities`, {
    method: "POST", headers: authHeaders(auth), body: JSON.stringify({ entityType: "place", fields: { id: "place-1", slug: "a", title: { tr: "A" } } }),
  });
  const response = await fetch(`${baseUrl}/api/admin/content/entities/bulk`, {
    method: "POST", headers: authHeaders(auth), body: JSON.stringify({ ids: ["place-1", "missing"], action: "archive" }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.length, 2);
  assert.equal(body.data[0].success, true);
  assert.equal(body.data[1].success, false);
});

test("pages: create -> publish -> resolves at /sayfa and /api/pages; archive -> both 404", async (t) => {
  const baseUrl = await startTestServer(t);
  const auth = await login(baseUrl);

  const createResponse = await fetch(`${baseUrl}/api/admin/content/pages`, {
    method: "POST", headers: authHeaders(auth),
    body: JSON.stringify({ slug: "http-page", title: { tr: "HTTP Sayfa" }, content: { tr: "İçerik." } }),
  });
  assert.equal(createResponse.status, 201);
  const page = (await createResponse.json()).data;

  await fetch(`${baseUrl}/api/admin/content/pages/${page.id}/transition`, {
    method: "POST", headers: authHeaders(auth), body: JSON.stringify({ toStatus: "published" }),
  });

  const jsonResponse = await fetch(`${baseUrl}/api/pages/http-page`);
  assert.equal(jsonResponse.status, 200);

  await fetch(`${baseUrl}/api/admin/content/pages/${page.id}/transition`, {
    method: "POST", headers: authHeaders(auth), body: JSON.stringify({ toStatus: "archived" }),
  });
  const afterArchive = await fetch(`${baseUrl}/api/pages/http-page`);
  assert.equal(afterArchive.status, 404);
});
