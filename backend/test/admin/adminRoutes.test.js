import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import adminEditorialRouter from "../../admin/adminRoutes.js";
import v2Router from "../../v2/routes/v2Routes.js";
import { initializeV2Store } from "../../v2/stores/v2Store.js";
import { initializeEditorialStore } from "../../admin/editorialStore.js";
import { _resetForTests } from "../../admin/adminSession.js";

const ORIGINAL_ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const ORIGINAL_V2_STORE = process.env.V2_DATA_STORE;
const TEST_TOKEN = "integration-test-admin-token";

async function startTestServer(context) {
  process.env.ADMIN_TOKEN = TEST_TOKEN;
  process.env.V2_DATA_STORE = "local"; // real, committed repository data — deterministic, already proven reliable elsewhere in this test suite
  _resetForTests();
  await initializeV2Store();
  await initializeEditorialStore();

  const app = express();
  app.use(express.json({ limit: "64kb" }));
  app.use("/api/admin/editorial", adminEditorialRouter);
  app.use("/api/v2", v2Router);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

test.after(() => {
  if (ORIGINAL_ADMIN_TOKEN === undefined) delete process.env.ADMIN_TOKEN; else process.env.ADMIN_TOKEN = ORIGINAL_ADMIN_TOKEN;
  if (ORIGINAL_V2_STORE === undefined) delete process.env.V2_DATA_STORE; else process.env.V2_DATA_STORE = ORIGINAL_V2_STORE;
});

function cookieHeader(response) {
  return response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

function csrfFrom(cookieHeaderStr) {
  const match = cookieHeaderStr.match(/aa_admin_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Logs in and returns { cookie, csrf } ready to attach to subsequent requests. */
async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/api/admin/editorial/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: TEST_TOKEN }),
  });
  assert.equal(response.status, 200);
  const cookie = cookieHeader(response);
  return { cookie, csrf: csrfFrom(cookie) };
}

/* --------------------------------------------------------------------------
   AUTH
   -------------------------------------------------------------------------- */

test("GET /session is reachable without auth and reports authenticated:false", async (context) => {
  const baseUrl = await startTestServer(context);
  const response = await fetch(`${baseUrl}/api/admin/editorial/session`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.authenticated, false);
});

test("every editorial route is blocked (401) with no session at all", async (context) => {
  const baseUrl = await startTestServer(context);
  for (const path of ["/dashboard", "/entities", "/drafts"]) {
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(`${baseUrl}/api/admin/editorial${path}`);
    assert.equal(response.status, 401, `${path} must require auth`);
  }
});

test("POST /login with the wrong token is rejected (401) and issues no session cookie", async (context) => {
  const baseUrl = await startTestServer(context);
  const response = await fetch(`${baseUrl}/api/admin/editorial/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "definitely-wrong" }),
  });
  assert.equal(response.status, 401);
  assert.equal(response.headers.getSetCookie().length, 0);
});

test("POST /login with the correct token succeeds and the resulting session authorizes admin routes", async (context) => {
  const baseUrl = await startTestServer(context);
  const { cookie } = await login(baseUrl);
  assert.ok(cookie);

  const sessionCheck = await fetch(`${baseUrl}/api/admin/editorial/session`, { headers: { Cookie: cookie } });
  assert.equal((await sessionCheck.json()).data.authenticated, true);

  const dashboard = await fetch(`${baseUrl}/api/admin/editorial/dashboard`, { headers: { Cookie: cookie } });
  assert.equal(dashboard.status, 200);
});

test("GET /dashboard reports the active editorial storage mode, so the UI never silently implies durability the deployment doesn't have", async (context) => {
  const baseUrl = await startTestServer(context);
  const { cookie } = await login(baseUrl);
  const response = await fetch(`${baseUrl}/api/admin/editorial/dashboard`, { headers: { Cookie: cookie } });
  const body = await response.json();
  // The test server initializes the editorial store with EDITORIAL_DATA_STORE
  // unset, i.e. the real default — this assertion is exactly what protects
  // against that default silently drifting to something durable-sounding.
  assert.equal(body.data.editorialStoreName, "memory");
});

/* --------------------------------------------------------------------------
   ENVIRONMENT SAFETY BADGE (manual QA round)
   -------------------------------------------------------------------------- */

test("GET /session reports environment metadata even before login — the badge must render on the login screen itself", async (context) => {
  const baseUrl = await startTestServer(context);
  const response = await fetch(`${baseUrl}/api/admin/editorial/session`);
  const body = await response.json();
  assert.equal(body.data.environment, "local", "K_SERVICE is unset in this test process, so this must read 'local'");
  assert.equal(body.data.runtimeContentStore, "local", "matches this test server's real V2_DATA_STORE=local");
  assert.equal(body.data.mediaStorageDriver, null, "media storage is only meaningful once V2_DATA_STORE=sqlite is active");
});

test("environment reports 'production' when K_SERVICE is set (the same authoritative signal the SQLite-on-Cloud-Run guard uses), never guessed from a hostname", async (context) => {
  const originalKService = process.env.K_SERVICE;
  process.env.K_SERVICE = "antiochia-archive-backend";
  context.after(() => { if (originalKService === undefined) delete process.env.K_SERVICE; else process.env.K_SERVICE = originalKService; });

  const baseUrl = await startTestServer(context);
  const response = await fetch(`${baseUrl}/api/admin/editorial/session`);
  const body = await response.json();
  assert.equal(body.data.environment, "production");
});

test("GET /dashboard also carries the same environment metadata, and neither /session nor /dashboard ever leaks ADMIN_TOKEN or a filesystem path", async (context) => {
  const baseUrl = await startTestServer(context);
  const { cookie } = await login(baseUrl);
  const response = await fetch(`${baseUrl}/api/admin/editorial/dashboard`, { headers: { Cookie: cookie } });
  const body = await response.json();
  assert.equal(body.data.environment, "local");
  assert.equal(body.data.runtimeContentStore, "local");

  const sessionResponse = await fetch(`${baseUrl}/api/admin/editorial/session`, { headers: { Cookie: cookie } });
  const sessionBody = await sessionResponse.json();

  for (const raw of [JSON.stringify(body), JSON.stringify(sessionBody)]) {
    assert.ok(!raw.includes(TEST_TOKEN), "the admin token must never appear in an API response body");
    assert.ok(!/[A-Za-z]:[\\/]/.test(raw), "no Windows-style filesystem path may leak into an admin API response");
    assert.ok(!raw.toLowerCase().includes("var/database"), "no SQLite storage path may leak into an admin API response");
  }
});

test("logout invalidates the session — a subsequent request with the same cookie is 401", async (context) => {
  const baseUrl = await startTestServer(context);
  const { cookie } = await login(baseUrl);

  const logout = await fetch(`${baseUrl}/api/admin/editorial/logout`, { method: "POST", headers: { Cookie: cookie } });
  assert.equal(logout.status, 200);

  const after = await fetch(`${baseUrl}/api/admin/editorial/dashboard`, { headers: { Cookie: cookie } });
  assert.equal(after.status, 401);
});

test("a state-changing request with a valid session but WITHOUT the CSRF header is rejected (403)", async (context) => {
  const baseUrl = await startTestServer(context);
  const { cookie } = await login(baseUrl);
  const response = await fetch(`${baseUrl}/api/admin/editorial/drafts`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "create", entityType: "place", proposedChanges: { id: "place-9999-nocsrf", slug: "no-csrf-test", title: { tr: "X" } } }),
  });
  assert.equal(response.status, 403);
});

test("GET requests never require the CSRF header, even with a valid session", async (context) => {
  const baseUrl = await startTestServer(context);
  const { cookie } = await login(baseUrl);
  const response = await fetch(`${baseUrl}/api/admin/editorial/drafts`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
});

/* --------------------------------------------------------------------------
   ENTITIES (admin-visible, every status)
   -------------------------------------------------------------------------- */

test("GET /entities?status=draft returns real non-public entities that GET /api/v2/entities/:id 404s for", async (context) => {
  const baseUrl = await startTestServer(context);
  const { cookie } = await login(baseUrl);

  const adminResponse = await fetch(`${baseUrl}/api/admin/editorial/entities?status=draft&type=place`, { headers: { Cookie: cookie } });
  const adminBody = await adminResponse.json();
  assert.equal(adminResponse.status, 200);
  const found = adminBody.data.find((e) => e.id === "place-0019");
  assert.ok(found, "place-0019 (a real draft place) must be visible to an authenticated admin");
  assert.equal(found.status, "draft");

  const publicResponse = await fetch(`${baseUrl}/api/v2/entities/place-0019`);
  assert.equal(publicResponse.status, 404, "the exact same record must 404 on the public API");
});

test("GET /entities/:id returns the raw store entity — a status a public GET would never even reach", async (context) => {
  const baseUrl = await startTestServer(context);
  const { cookie } = await login(baseUrl);
  const response = await fetch(`${baseUrl}/api/admin/editorial/entities/place-0019`, { headers: { Cookie: cookie } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.id, "place-0019");
  assert.equal(body.data.status, "draft", "admin sees the real status the public serializer/gate would never expose at all");
});

/* --------------------------------------------------------------------------
   EDITORIAL DRAFT WORKFLOW
   -------------------------------------------------------------------------- */

test("full draft lifecycle: create -> readyForReview -> approved -> applied", async (context) => {
  const baseUrl = await startTestServer(context);
  const { cookie, csrf } = await login(baseUrl);
  const headers = { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": csrf };

  const createResponse = await fetch(`${baseUrl}/api/admin/editorial/drafts`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      kind: "create",
      entityType: "place",
      proposedChanges: { id: "place-lifecycle-test-0001", slug: "lifecycle-test-place", title: { tr: "Test" }, coordinates: { latitude: 36.2, longitude: 36.1 } },
    }),
  });
  assert.equal(createResponse.status, 201);
  const created = (await createResponse.json()).data;
  assert.equal(created.status, "draft");

  for (const nextStatus of ["readyForReview", "approved", "applied"]) {
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(`${baseUrl}/api/admin/editorial/drafts/${created.changeId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: nextStatus }),
    });
    assert.equal(response.status, 200, `transition to ${nextStatus}`);
    // eslint-disable-next-line no-await-in-loop
    assert.equal((await response.json()).data.status, nextStatus);
  }
});

test("draft-status transition rejects skipping review (draft -> approved directly)", async (context) => {
  const baseUrl = await startTestServer(context);
  const { cookie, csrf } = await login(baseUrl);
  const headers = { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": csrf };

  const createResponse = await fetch(`${baseUrl}/api/admin/editorial/drafts`, {
    method: "POST",
    headers,
    body: JSON.stringify({ kind: "create", entityType: "place", proposedChanges: { id: "place-skip-test-0001", slug: "skip-review-test", title: { tr: "T" } } }),
  });
  const created = (await createResponse.json()).data;

  const response = await fetch(`${baseUrl}/api/admin/editorial/drafts/${created.changeId}`, {
    method: "PATCH", headers, body: JSON.stringify({ status: "approved" }),
  });
  assert.equal(response.status, 409);
});

test("a create proposal with a duplicate slug against a REAL existing published entity is rejected", async (context) => {
  const baseUrl = await startTestServer(context);
  const { cookie, csrf } = await login(baseUrl);
  const response = await fetch(`${baseUrl}/api/admin/editorial/drafts`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: JSON.stringify({ kind: "create", entityType: "place", proposedChanges: { id: "place-dup-test-0001", slug: "antakya", title: { tr: "T" } } }),
  });
  assert.equal(response.status, 400);
});

test("a create proposal with invalid coordinates is rejected via the real place schema", async (context) => {
  const baseUrl = await startTestServer(context);
  const { cookie, csrf } = await login(baseUrl);
  const response = await fetch(`${baseUrl}/api/admin/editorial/drafts`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: JSON.stringify({
      kind: "create", entityType: "place",
      proposedChanges: { id: "place-badcoord-0001", slug: "bad-coord-test", title: { tr: "T" }, coordinates: { latitude: 999, longitude: 36.1 } },
    }),
  });
  assert.equal(response.status, 400);
});

test("an edit proposal against a nonexistent entityId is rejected", async (context) => {
  const baseUrl = await startTestServer(context);
  const { cookie, csrf } = await login(baseUrl);
  const response = await fetch(`${baseUrl}/api/admin/editorial/drafts`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: JSON.stringify({ kind: "edit", entityType: "place", entityId: "place-does-not-exist", proposedChanges: { summary: { tr: "x" } } }),
  });
  assert.equal(response.status, 400);
});

test("an edit proposal against a real published place is accepted and never mutates the live public entity", async (context) => {
  const baseUrl = await startTestServer(context);
  const { cookie, csrf } = await login(baseUrl);

  const before = await (await fetch(`${baseUrl}/api/v2/entities/place-0029`)).json();

  const response = await fetch(`${baseUrl}/api/admin/editorial/drafts`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: JSON.stringify({ kind: "edit", entityType: "place", entityId: "place-0029", proposedChanges: { summary: { tr: "Taslak — henüz uygulanmadı." } } }),
  });
  assert.equal(response.status, 201);

  const after = await (await fetch(`${baseUrl}/api/v2/entities/place-0029`)).json();
  assert.deepEqual(after.data.summary, before.data.summary, "the live public record must be untouched by an unapplied draft");
});

/* --------------------------------------------------------------------------
   PUBLICATION SAFETY — the exact incident class this round guards against
   -------------------------------------------------------------------------- */

test("an approved (but not applied) draft for a brand-new entity NEVER appears anywhere on the public v2 API", async (context) => {
  const baseUrl = await startTestServer(context);
  const { cookie, csrf } = await login(baseUrl);
  const headers = { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": csrf };

  const createResponse = await fetch(`${baseUrl}/api/admin/editorial/drafts`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      kind: "create", entityType: "place",
      proposedChanges: { id: "place-leak-test-0001", slug: "public-safety-leak-test", title: { tr: "Sızıntı Testi" } },
    }),
  });
  const created = (await createResponse.json()).data;
  await fetch(`${baseUrl}/api/admin/editorial/drafts/${created.changeId}`, { method: "PATCH", headers, body: JSON.stringify({ status: "readyForReview" }) });
  await fetch(`${baseUrl}/api/admin/editorial/drafts/${created.changeId}`, { method: "PATCH", headers, body: JSON.stringify({ status: "approved" }) });

  const byId = await fetch(`${baseUrl}/api/v2/entities/place-leak-test-0001`);
  assert.equal(byId.status, 404);

  const list = await fetch(`${baseUrl}/api/v2/entities?limit=100`);
  const listBody = await list.json();
  assert.equal(listBody.success, true);
  assert.ok(!listBody.data.some((e) => e.id === "place-leak-test-0001"), "an approved-but-unapplied draft must never appear in the public entity list");

  const places = await fetch(`${baseUrl}/api/v2/places?limit=100`);
  const placesBody = await places.json();
  assert.equal(placesBody.success, true);
  assert.ok(!placesBody.data.some((e) => e.slug === "public-safety-leak-test"), "must never leak into the public places list either");
});
