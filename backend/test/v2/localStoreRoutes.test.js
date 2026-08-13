// Route-level tests for /api/v2 backed by V2_DATA_STORE=local — the local,
// real-mapped-data runtime built on top of the validated v1 -> v2 mapper,
// merged with the promoted canonical research batch (data/v2/entities.json,
// 168 entities) and the active legacy replacement layer (7 mapped v1
// records superseded), after the final canonical publication review (see
// V2-ARCHITECTURE.md "Cultural entity publication review"). These exercise
// the actual committed data files, not a fixture, so counts here double as
// a regression check on the real, live system.
//
// 61 of 184 total entities in the store are currently PUBLIC. The
// publication review deliberately held back entire categories this first
// pass — community, belief, and place are ALL still non-public (0 each),
// pending a dedicated review of ethnic/religious identity presentation and
// unverified local-toponym content — plus specific structures/music records
// with an explicit, PART-5-documented identity/chronology/terminology
// problem (structure-0001/0002/0003/0004, music-0004, music-0011), plus
// every oralHistoryLead story (39 of 47) which is a future interview topic,
// never actual testimony.

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

async function paginateAll(baseUrl, path, limit = 100) {
  const seen = [];
  let cursor = null;
  let guard = 0;
  do {
    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set("limit", String(limit));
    if (cursor) url.searchParams.set("cursor", cursor);
    // eslint-disable-next-line no-await-in-loop
    const body = await (await fetch(url)).json();
    for (const item of body.data) {
      assert.ok(!seen.some((s) => s.id === item.id), `duplicate id ${item.id} across pages`);
      seen.push(item);
    }
    cursor = body.meta.nextCursor;
    guard += 1;
    assert.ok(guard <= 10, "pagination loop guard tripped");
  } while (cursor);
  return seen;
}

test("GET /api/v2/entities, paginated across pages, returns exactly the 61 currently-public entities with no duplicates or gaps", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const all = await paginateAll(baseUrl, "/api/v2/entities");
  assert.equal(all.length, 61);
  for (const item of all) {
    assert.equal(item.status === "published" || item.entityType === "media" || item.entityType === "source", true, `${item.id} must be public`);
  }
  assert.deepEqual(all.map((e) => e.id), [...all.map((e) => e.id)].sort());
});

test("GET /api/v2/structures returns the 15 published structures, including canonical replacements with strong uncontested evidence", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/structures?limit=100`);
  const body = await response.json();
  const ids = body.data.map((item) => item.id).sort();
  assert.equal(ids.length, 15);
  assert.ok(ids.includes("st3"), "the sole unaffected mapped v1 structure");
  assert.ok(ids.includes("structure-0005"), "Samandağ Khidr Shrine — confirmed identity, no PART-5 chronology flag");
  assert.ok(ids.includes("structure-0020"), "Traditional Antakya Houses ensemble");
  // The 4 structures with an explicit, PART-5-documented chronology
  // conflict (unresolved-group-0011) must NOT be public yet, even though
  // their site identity is settled.
  for (const heldId of ["structure-0001", "structure-0002", "structure-0003", "structure-0004"]) {
    assert.equal(ids.includes(heldId), false, `${heldId} has an open PART-5 chronology conflict and must stay non-public`);
  }
});

test("GET /api/v2/stories returns 11 (s1-s3 unaffected, story-0001..0008 published-source records) — zero oralHistoryLead records", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/stories?limit=100`);
  const body = await response.json();
  const ids = body.data.map((item) => item.id).sort();
  assert.deepEqual(ids, ["s1", "s2", "s3", "story-0001", "story-0002", "story-0003", "story-0004", "story-0005", "story-0006", "story-0007", "story-0008"]);
  for (const item of body.data) {
    assert.notEqual(item.storyRecordType, "oralHistoryLead", `${item.id} is an interview lead and must never be public`);
  }
});

test("GET /api/v2/music returns 7 (m1-m3 unaffected, 4 native records) — music-0004 (Finn/unverified) and music-0011 (Necef İlahileri) excluded", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/music?limit=100`);
  const body = await response.json();
  const ids = body.data.map((item) => item.id).sort();
  assert.equal(ids.length, 7);
  assert.ok(["m1", "m2", "m3"].every((id) => ids.includes(id)));
  assert.equal(ids.includes("music-0004"), false, "Finn terminology explicitly unverified (unresolved-group-0006)");
  assert.equal(ids.includes("music-0011"), false, "Necef İlahileri not a verified local category (unresolved-group-0006)");
});

test("GET /api/v2/historical-contexts returns 22 (h1-h3 unaffected, 19 high-confidence native records)", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/historical-contexts?limit=100`);
  const body = await response.json();
  assert.equal(body.data.length, 22);
});

test("GET /api/v2/media returns 6 (g1-g6 — media/source are statusless and always public)", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/media?limit=100`);
  const body = await response.json();
  assert.equal(body.data.length, 6);
  for (const item of body.data) {
    assert.notEqual(item.entityType, "source", "no source entity was promoted, none should ever appear");
  }
});

test("GET /api/v2/beliefs, /communities, /places, /proverbs all return 0 — held back this publication pass pending dedicated identity-sensitivity review", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  for (const path of ["beliefs", "communities", "places", "proverbs"]) {
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(`${baseUrl}/api/v2/${path}`);
    // eslint-disable-next-line no-await-in-loop
    const body = await response.json();
    assert.deepEqual(body.data, [], `${path} must be empty`);
  }
});

test("GET /api/v2/entities/:id: structure-0005 (newly published canonical replacement) and g3 (media) resolve correctly", async (context) => {
  const baseUrl = await startLocalTestServer(context);

  const structure0005 = await (await fetch(`${baseUrl}/api/v2/entities/structure-0005`)).json();
  assert.equal(structure0005.data.id, "structure-0005");
  assert.equal(structure0005.data.entityType, "structure");
  assert.equal(structure0005.data.status, "published");

  const g3 = await (await fetch(`${baseUrl}/api/v2/entities/g3`)).json();
  assert.equal(g3.data.id, "g3");
  assert.equal(g3.data.entityType, "media");
});

test("GET /api/v2/entities/:id: b4 is gone (suppressed by the now-active replacement to structure-0005), not just non-public", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/entities/b4`);
  assert.equal(response.status, 404);
});

test("GET /api/v2/entities/:id: structure-0001 exists (superseded st1) but stays 404 — explicit PART-5 chronology conflict, held inReview", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/entities/structure-0001`);
  const body = await response.json();
  assert.equal(response.status, 404);
  assert.equal(body.success, false);
});

test("GET /api/v2/entities/:id: an oralHistoryLead story 404s exactly like a missing id", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/entities/story-0009`);
  const body = await response.json();
  assert.equal(response.status, 404);
  assert.equal(body.success, false);
});

test("filters: tag=beliefSite returns 0 — the 4 mapped belief-site structures were suppressed, and structure-0002/0003/0004 aren't published yet", async (context) => {
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

test("a real, published native structure exposes only its allowlisted public fields", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/entities/structure-0005`);
  const body = await response.json();

  assert.equal(body.data.status, "published");
  for (const forbidden of ["researchExtensions", "confidence", "unresolvedQuestions", "editorialNotes"]) {
    assert.equal(Object.hasOwn(body.data, forbidden), false, `${forbidden} is internal research metadata and must not be public`);
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

// --- Relationship public safety ---------------------------------------

test("GET /api/v2/relationships currently returns 0 — every promoted relationship is still status:inReview (relationship status was explicitly out of scope for this publication review)", async (context) => {
  const baseUrl = await startLocalTestServer(context);
  const response = await fetch(`${baseUrl}/api/v2/relationships?limit=100`);
  const body = await response.json();
  assert.deepEqual(body.data, []);
});

test("a relationship published on its own status but pointing at a non-public entity does NOT leak that entity's existence", async (context) => {
  // Regression test for the exact gap Section 10 warns about: filtering
  // relationships by their own status alone is not enough. This drives the
  // real store/route stack directly (bypassing the fixture-free live data,
  // since none of the committed relationships are published) by
  // temporarily monkey-patching listRelationships on the live store to
  // inject one synthetic published relationship pointing at a real
  // non-public entity (story-0009, an oralHistoryLead).
  const baseUrl = await startLocalTestServer(context);
  const { getV2Store } = await import("../../v2/stores/v2Store.js");
  const store = getV2Store();
  const originalListRelationships = store.listRelationships;

  const leakProbeRelationship = {
    id: "leak-probe-1",
    type: "associatedWith",
    sourceId: "st3",
    sourceType: "structure",
    targetId: "story-0009",
    targetType: "story",
    status: "published",
  };

  store.listRelationships = async (options) => {
    const real = await originalListRelationships.call(store, options);
    return { ...real, items: [...real.items, leakProbeRelationship], count: real.count + 1 };
  };
  context.after(() => { store.listRelationships = originalListRelationships; });

  const response = await fetch(`${baseUrl}/api/v2/relationships?limit=100`);
  const body = await response.json();
  assert.equal(
    body.data.some((r) => r.id === "leak-probe-1"),
    false,
    "a relationship pointing at a non-public entity (story-0009, an oralHistoryLead) must never appear publicly, even if its own status is published",
  );
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
