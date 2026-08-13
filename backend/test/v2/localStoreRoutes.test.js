// Route-level tests for /api/v2 backed by V2_DATA_STORE=local — the local,
// real-mapped-data runtime built on top of the validated v1 -> v2 mapper,
// now merged with the promoted canonical research batch (data/v2/entities.json,
// 168 entities) and the active legacy replacement layer (7 mapped v1
// records superseded — see V2-ARCHITECTURE.md "Legacy replacement layer").
// These exercise the actual committed data files, not a fixture, so counts
// here double as a regression check on the real, live system.
//
// Only 17 of 184 total entities in the store are currently PUBLIC (status
// 'published', or media/source which carry no status concept at all) — the
// vast majority of the newly promoted batch is correctly still 'inReview'
// or 'draft' per the publication-status policy (see buildImportPreview.js),
// so it stays invisible to every public route exactly as designed. The 6
// mapped v1 records superseded by a confirmed, now-active legacy
// replacement (st1, b1, st2, b2, b3, b4 — st4 too, 7 total) are gone
// entirely, not just non-public; their canonical replacements
// (structure-0001..0005, structure-0020) exist in the store but are
// themselves not yet 'published', so they are correctly invisible to every
// public route too, for now.

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

test("GET /api/v2/entities, paginated across pages, returns exactly the 17 currently-public entities with no duplicates or gaps", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const seen = [];
  let cursor = null;
  let guard = 0;

  do {
    const url = new URL(`${baseUrl}/api/v2/entities`);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    // eslint-disable-next-line no-await-in-loop
    const body = await (await fetch(url)).json();
    for (const item of body.data) {
      assert.ok(!seen.includes(item.id), `duplicate id ${item.id} across pages`);
      assert.equal(item.status === "published" || item.entityType === "media" || item.entityType === "source", true, `${item.id} must be public`);
      seen.push(item.id);
    }
    cursor = body.meta.nextCursor;
    guard += 1;
    // The store has 184 raw entities behind a server-enforced limit<=100,
    // so reaching all public ones legitimately takes more than one page —
    // this guard just bounds runaway pagination, not "should be 1 page".
    assert.ok(guard <= 10, "pagination loop guard tripped");
  } while (cursor);

  assert.equal(seen.length, 17);
  assert.deepEqual(seen, [...seen].sort());
});

test("GET /api/v2/structures returns 1 (only st3 — the sole mapped v1 structure with no active replacement, still published)", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/structures?limit=100`);
  const body = await response.json();
  assert.deepEqual(body.data.map((item) => item.id), ["st3"]);
});

test("GET /api/v2/stories returns 3 (s1, s2, s3 — no active replacement targets any v1 story)", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/stories?limit=100`);
  const body = await response.json();
  assert.deepEqual(body.data.map((item) => item.id).sort(), ["s1", "s2", "s3"]);
});

test("GET /api/v2/music returns 4 (m1, m2, m3 unaffected, plus one published native record)", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/music?limit=100`);
  const body = await response.json();
  assert.equal(body.data.length, 4);
  assert.ok(["m1", "m2", "m3"].every((id) => body.data.some((item) => item.id === id)));
});

test("GET /api/v2/historical-contexts returns 3 (h1, h2, h3 — unaffected, no replacement targets historicalContext)", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/historical-contexts?limit=100`);
  const body = await response.json();
  assert.deepEqual(body.data.map((item) => item.id).sort(), ["h1", "h2", "h3"]);
});

test("GET /api/v2/media returns 6 (g1-g6 — media/source are statusless and always public)", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/media?limit=100`);
  const body = await response.json();
  assert.equal(body.data.length, 6);
});

test("GET /api/v2/beliefs, /communities, /places, /proverbs return 0 — promoted content in those categories is not yet 'published'", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  for (const path of ["beliefs", "communities", "places", "proverbs"]) {
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(`${baseUrl}/api/v2/${path}`);
    // eslint-disable-next-line no-await-in-loop
    const body = await response.json();
    assert.deepEqual(body.data, [], `${path} must be empty`);
  }
});

test("GET /api/v2/entities/:id: st3 (public structure) and g3 (media) resolve correctly", async (context) => {
  const baseUrl = await startLocalTestServer(context);

  const st3 = await (await fetch(`${baseUrl}/api/v2/entities/st3`)).json();
  assert.equal(st3.data.id, "st3");
  assert.equal(st3.data.entityType, "structure");

  const g3 = await (await fetch(`${baseUrl}/api/v2/entities/g3`)).json();
  assert.equal(g3.data.id, "g3");
  assert.equal(g3.data.entityType, "media");
});

test("GET /api/v2/entities/:id: st1 is gone (suppressed by an active legacy replacement), not just non-public", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/entities/st1`);
  assert.equal(response.status, 404);
});

test("GET /api/v2/entities/:id: structure-0001 exists (it superseded st1) but is not yet published, so the public route 404s exactly like a missing id", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/entities/structure-0001`);
  const body = await response.json();
  assert.equal(response.status, 404);
  assert.equal(body.success, false);
  // Same response shape as a truly nonexistent id — a client must not be
  // able to distinguish "exists but unpublished" from "doesn't exist".
});

test("pagination over the live store: no duplicates, no gaps across a full sweep of raw entities (public route)", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const seen = [];
  let cursor = null;
  let guard = 0;

  do {
    const url = new URL(`${baseUrl}/api/v2/entities`);
    url.searchParams.set("limit", "50");
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

  assert.equal(seen.length, 17);
});

test("filters: tag=beliefSite now returns 0 — the 4 mapped belief-site structures were suppressed by active replacements, and their canonical successors aren't published yet", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/structures?tag=beliefSite`);
  const body = await response.json();
  assert.deepEqual(body.data, []);
});

test("filters: musicGenre reflects preserved v1 categoryKey values as-is, not a final taxonomy", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/music?musicGenre=folk`);
  const body = await response.json();
  assert.deepEqual(body.data.map((item) => item.id).sort(), ["m1", "m3"]);
});

test("filters: storyCategory yields no results — migrated v1 stories intentionally leave it unset", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/stories?storyCategory=familyMemory`);
  const body = await response.json();
  assert.deepEqual(body.data, []);
});

test("public responses never leak migration-internal fields", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/entities/h1`);
  const body = await response.json();

  for (const forbidden of [
    "sourceVersion", "sourceCategory", "sourceRecordId", "migrationNote", "sources", "consentRef",
  ]) {
    assert.equal(Object.hasOwn(body.data, forbidden), false, `${forbidden} must not be public`);
  }
});

test("structure/story/historicalContext/music entities with a real image expose a safe public media summary", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/entities/st3`);
  const body = await response.json();

  assert.ok(body.data.media);
  assert.equal(body.data.media.path, "/images/structures/daphne-roma-mozaigi-antakya.webp");
  assert.equal(body.data.media.license, "Public Domain");
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
