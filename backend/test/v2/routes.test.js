import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import v2Router from "../../v2/routes/v2Routes.js";
import { initializeV2Store } from "../../v2/stores/v2Store.js";
import { ENTITY_TYPES } from "../../v2/constants/vocabularies.js";
import { DEFAULT_PAGE_LIMIT } from "../../v2/validators/pagination.js";

async function startTestServer(context) {
  await initializeV2Store();
  const app = express();
  app.use("/api/v2", v2Router);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

test("GET /api/v2 exposes only safe metadata", async (context) => {
  const baseUrl = await startTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.version, "v2");
  assert.equal(body.data.status, "foundation");
  assert.deepEqual(body.data.supportedEntityTypes, ENTITY_TYPES);

  const serialized = JSON.stringify(body);
  for (const forbidden of ["GOOGLE_CLOUD_PROJECT", "ADMIN_TOKEN", "firestore", "service-account", "/backend/", "process.env"]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
  }
});

test("GET /api/v2/communities returns a valid empty response", async (context) => {
  const baseUrl = await startTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/communities`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    success: true,
    data: [],
    meta: { version: "v2", count: 0, limit: DEFAULT_PAGE_LIMIT, cursor: null, nextCursor: null },
  });
});

test("GET /api/v2/beliefs returns a valid empty response", async (context) => {
  const baseUrl = await startTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/beliefs`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    success: true,
    data: [],
    meta: { version: "v2", count: 0, limit: DEFAULT_PAGE_LIMIT, cursor: null, nextCursor: null },
  });
});

test("GET /api/v2/entities returns a valid empty response", async (context) => {
  const baseUrl = await startTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/entities`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.data, []);
  assert.equal(body.meta.count, 0);
});

test("GET /api/v2/entities/:id returns the established 404 style for an unknown id", async (context) => {
  const baseUrl = await startTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/entities/does-not-exist`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(body, { success: false, error: "Entity not found." });
});

test("GET /api/v2/entities rejects an invalid limit", async (context) => {
  const baseUrl = await startTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/entities?limit=0`);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.match(body.error, /positive integer/);
});

test("GET /api/v2/entities rejects an unsupported filter field", async (context) => {
  const baseUrl = await startTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/entities?favoriteColor=blue`);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.match(body.error, /Unsupported filter field/);
});
