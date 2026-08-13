// Route-level tests for /api/v2 backed by V2_DATA_STORE=local — the local,
// real-mapped-data runtime built on top of the validated v1 -> v2 mapper.
// These exercise the actual data/archive.json, not a fixture, so counts here
// double as a regression check on the mapper's real output shape.

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import v2Router from "../../v2/routes/v2Routes.js";
import { initializeV2Store } from "../../v2/stores/v2Store.js";

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function startLocalTestServer(context) {
  const original = process.env.V2_DATA_STORE;
  process.env.V2_DATA_STORE = "local";
  context.after(() => restoreEnvironment("V2_DATA_STORE", original));

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

test("GET /api/v2/entities returns all 23 mapped entities under the local store", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/entities?limit=100`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.length, 23);
  assert.equal(body.meta.count, 23);
});

test("GET /api/v2/structures returns 8 (4 structures + 4 belief sites)", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/structures?limit=100`);
  const body = await response.json();
  assert.equal(body.data.length, 8);
});

test("GET /api/v2/stories returns 3", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/stories?limit=100`);
  const body = await response.json();
  assert.equal(body.data.length, 3);
});

test("GET /api/v2/music returns 3", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/music?limit=100`);
  const body = await response.json();
  assert.equal(body.data.length, 3);
});

test("GET /api/v2/historical-contexts returns 3", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/historical-contexts?limit=100`);
  const body = await response.json();
  assert.equal(body.data.length, 3);
});

test("GET /api/v2/media returns 6", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/media?limit=100`);
  const body = await response.json();
  assert.equal(body.data.length, 6);
});

test("GET /api/v2/beliefs returns 0 — no broad belief-tradition entity has been authored yet", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/beliefs`);
  const body = await response.json();
  assert.deepEqual(body.data, []);
});

test("GET /api/v2/communities, /places, /proverbs return 0", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  for (const path of ["communities", "places", "proverbs"]) {
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(`${baseUrl}/api/v2/${path}`);
    // eslint-disable-next-line no-await-in-loop
    const body = await response.json();
    assert.deepEqual(body.data, [], `${path} must be empty`);
  }
});

test("GET /api/v2/entities/:id looks up st1, b4 (structure), and g3 (media) correctly", async (context) => {
  const baseUrl = await startLocalTestServer(context);

  const st1 = await (await fetch(`${baseUrl}/api/v2/entities/st1`)).json();
  assert.equal(st1.data.id, "st1");
  assert.equal(st1.data.entityType, "structure");

  const b4 = await (await fetch(`${baseUrl}/api/v2/entities/b4`)).json();
  assert.equal(b4.data.id, "b4");
  assert.equal(b4.data.entityType, "structure");

  const g3 = await (await fetch(`${baseUrl}/api/v2/entities/g3`)).json();
  assert.equal(g3.data.id, "g3");
  assert.equal(g3.data.entityType, "media");
});

test("pagination over the real mapped set: no duplicates, no gaps, deterministic order", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const seen = [];
  let cursor = null;
  let guard = 0;

  do {
    const url = new URL(`${baseUrl}/api/v2/entities`);
    url.searchParams.set("limit", "5");
    if (cursor) url.searchParams.set("cursor", cursor);
    // eslint-disable-next-line no-await-in-loop
    const body = await (await fetch(url)).json();
    for (const item of body.data) {
      assert.ok(!seen.includes(item.id), `duplicate id ${item.id} across pages`);
      seen.push(item.id);
    }
    cursor = body.meta.nextCursor;
    guard += 1;
    assert.ok(guard <= 10, "pagination loop guard tripped");
  } while (cursor);

  assert.equal(seen.length, 23);
  assert.deepEqual(seen, [...seen].sort());
});

test("filters: tag=beliefSite returns exactly the 4 mapped belief-site structures", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/structures?tag=beliefSite`);
  const body = await response.json();
  assert.equal(body.data.length, 4);
  assert.deepEqual(body.data.map((item) => item.id).sort(), ["b1", "b2", "b3", "b4"]);
});

test("filters: musicGenre reflects preserved v1 categoryKey values as-is, not a final taxonomy", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/music?musicGenre=folk`);
  const body = await response.json();
  assert.equal(body.data.length, 2);
});

test("filters: storyCategory yields no results — migrated stories intentionally leave it unset", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/stories?storyCategory=familyMemory`);
  const body = await response.json();
  assert.deepEqual(body.data, []);
});

test("public responses never leak migration-internal fields", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/entities/st1`);
  const body = await response.json();

  for (const forbidden of [
    "sourceVersion", "sourceCategory", "sourceRecordId", "migrationNote", "sources", "consentRef",
  ]) {
    assert.equal(Object.hasOwn(body.data, forbidden), false, `${forbidden} must not be public`);
  }
});

test("structure/story/historicalContext/music entities with a real image expose a safe public media summary", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/entities/st1`);
  const body = await response.json();

  assert.ok(body.data.media);
  assert.equal(body.data.media.path, "/images/structures/habib-i-neccar-camii-antakya-2018.webp");
  assert.equal(body.data.media.license, "CC BY-SA 4.0");
  assert.equal(Object.hasOwn(body.data.media, "isPlaceholder"), false);
});

test("placeholder entities expose no media field at all", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/entities/h2`);
  const body = await response.json();
  assert.equal(Object.hasOwn(body.data, "media"), false);
});

test("gallery/media entities expose a usable public image path and provenance", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/entities/g3`);
  const body = await response.json();

  assert.equal(body.data.entityType, "media");
  assert.equal(body.data.derivativeStoragePaths.length, 1);
  assert.ok(body.data.alt);
  assert.ok(body.data.caption);
  assert.equal(Object.hasOwn(body.data, "originalStoragePath"), false);
  assert.equal(Object.hasOwn(body.data, "checksum"), false);
});

test("v1 GET /api/archive is unaffected while V2_DATA_STORE=local is active (side-by-side)", async (context) => {
  const { getArchive } = await import("../../archiveController.js");
  const { initializeDataStore } = await import("../../dataStore.js");
  const { ARCHIVE_CATEGORIES } = await import("../../dataModel.js");

  await initializeDataStore();
  await startLocalTestServer(context);

  const recorder = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await getArchive({}, recorder);

  assert.equal(recorder.statusCode, 200);
  const total = ARCHIVE_CATEGORIES.reduce((sum, category) => sum + recorder.body.data[category].length, 0);
  assert.equal(total, 23);
});
