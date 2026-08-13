// Route-level tests for native editorial data flowing through /api/v2 —
// relationship endpoints, publication-status visibility, and referential
// integrity, exercised end-to-end via V2_ENTITIES_JSON_PATH /
// V2_RELATIONSHIPS_JSON_PATH pointed at temporary fixture files. Fixture ids
// are obviously fictional (e.g. "community-test-1") and are never written to
// the committed data/v2/entities.json / data/v2/relationships.json.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import express from "express";
import v2Router from "../../v2/routes/v2Routes.js";
import { initializeV2Store } from "../../v2/stores/v2Store.js";

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function withTempDir(context) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-v2-native-routes-"));
  context.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

async function startServerWithFixtures(context, { entities = [], relationships = [] } = {}) {
  const dir = await withTempDir(context);
  const entitiesFilePath = path.join(dir, "entities.json");
  const relationshipsFilePath = path.join(dir, "relationships.json");
  await writeJson(entitiesFilePath, { entities });
  await writeJson(relationshipsFilePath, { relationships });

  const original = {
    V2_DATA_STORE: process.env.V2_DATA_STORE,
    V2_ENTITIES_JSON_PATH: process.env.V2_ENTITIES_JSON_PATH,
    V2_RELATIONSHIPS_JSON_PATH: process.env.V2_RELATIONSHIPS_JSON_PATH,
  };
  process.env.V2_DATA_STORE = "local";
  process.env.V2_ENTITIES_JSON_PATH = entitiesFilePath;
  process.env.V2_RELATIONSHIPS_JSON_PATH = relationshipsFilePath;
  context.after(() => {
    restoreEnvironment("V2_DATA_STORE", original.V2_DATA_STORE);
    restoreEnvironment("V2_ENTITIES_JSON_PATH", original.V2_ENTITIES_JSON_PATH);
    restoreEnvironment("V2_RELATIONSHIPS_JSON_PATH", original.V2_RELATIONSHIPS_JSON_PATH);
  });

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

const COMMUNITY_FIXTURE = Object.freeze({
  id: "community-test-1",
  slug: "community-test-1",
  entityType: "community",
  status: "published",
  title: { en: "Test Community Fixture" },
});

const DRAFT_COMMUNITY_FIXTURE = Object.freeze({
  id: "community-test-2",
  slug: "community-test-2",
  entityType: "community",
  status: "draft",
  title: { en: "Draft Community Fixture" },
  internalEditorialNotes: "Needs a second source before publishing.",
});

const BELIEF_FIXTURE = Object.freeze({
  id: "belief-test-1",
  slug: "belief-test-1",
  entityType: "belief",
  status: "published",
  title: { en: "Test Belief Fixture" },
});

test("with empty native files, /api/v2/relationships and native-type lists remain empty and 23 mapped entities are unaffected", async (context) => {
  const baseUrl = await startServerWithFixtures(context);

  const entities = await (await fetch(`${baseUrl}/api/v2/entities?limit=100`)).json();
  assert.equal(entities.data.length, 23);

  for (const path of ["communities", "beliefs", "places", "proverbs", "relationships"]) {
    // eslint-disable-next-line no-await-in-loop
    const body = await (await fetch(`${baseUrl}/api/v2/${path}`)).json();
    assert.deepEqual(body.data, [], `${path} must be empty`);
  }
});

test("GET /api/v2/communities includes a published native community fixture", async (context) => {
  const baseUrl = await startServerWithFixtures(context, { entities: [COMMUNITY_FIXTURE] });
  const body = await (await fetch(`${baseUrl}/api/v2/communities`)).json();
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].id, "community-test-1");
});

test("a draft native entity is not exposed publicly via list or direct lookup", async (context) => {
  const baseUrl = await startServerWithFixtures(context, {
    entities: [COMMUNITY_FIXTURE, DRAFT_COMMUNITY_FIXTURE],
  });

  const list = await (await fetch(`${baseUrl}/api/v2/communities`)).json();
  assert.deepEqual(list.data.map((e) => e.id), ["community-test-1"]);

  const direct = await fetch(`${baseUrl}/api/v2/entities/community-test-2`);
  const directBody = await direct.json();
  assert.equal(direct.status, 404);
  assert.deepEqual(directBody, { success: false, error: "Entity not found." });

  const allEntities = await (await fetch(`${baseUrl}/api/v2/entities?limit=100`)).json();
  assert.equal(allEntities.data.length, 24); // 23 mapped + 1 published native, draft excluded
});

test("private/internal fields on a native entity never reach the public response", async (context) => {
  const baseUrl = await startServerWithFixtures(context, {
    entities: [{ ...COMMUNITY_FIXTURE, id: "community-test-3", slug: "community-test-3", internalEditorialNotes: "secret reviewer note", adminOnly: { reviewerId: "x" } }],
  });

  const body = await (await fetch(`${baseUrl}/api/v2/entities/community-test-3`)).json();
  assert.equal(body.data.id, "community-test-3");
  assert.equal(Object.hasOwn(body.data, "internalEditorialNotes"), false);
  assert.equal(Object.hasOwn(body.data, "adminOnly"), false);
});

test("GET /api/v2/relationships returns a published relationship in the public shape", async (context) => {
  const baseUrl = await startServerWithFixtures(context, {
    entities: [COMMUNITY_FIXTURE, BELIEF_FIXTURE],
    relationships: [{
      id: "rel-test-1", type: "hasBelief", sourceId: "community-test-1", sourceType: "community",
      targetId: "belief-test-1", targetType: "belief", status: "published", note: "editorial note",
    }],
  });

  const body = await (await fetch(`${baseUrl}/api/v2/relationships`)).json();
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].id, "rel-test-1");
  assert.equal(body.data[0].sourceId, "community-test-1");
  assert.equal(body.data[0].targetId, "belief-test-1");
});

test("GET /api/v2/relationships excludes a non-published relationship", async (context) => {
  const baseUrl = await startServerWithFixtures(context, {
    entities: [COMMUNITY_FIXTURE, BELIEF_FIXTURE],
    relationships: [{
      id: "rel-test-1", type: "hasBelief", sourceId: "community-test-1", sourceType: "community",
      targetId: "belief-test-1", targetType: "belief", status: "draft",
    }],
  });

  const body = await (await fetch(`${baseUrl}/api/v2/relationships`)).json();
  assert.deepEqual(body.data, []);
});

test("GET /api/v2/relationships filters by a controlled type", async (context) => {
  const baseUrl = await startServerWithFixtures(context, {
    entities: [COMMUNITY_FIXTURE, BELIEF_FIXTURE],
    relationships: [
      {
        id: "rel-test-1", type: "hasBelief", sourceId: "community-test-1", sourceType: "community",
        targetId: "belief-test-1", targetType: "belief", status: "published",
      },
      {
        id: "rel-test-2", type: "relatedTo", sourceId: "community-test-1", sourceType: "community",
        targetId: "belief-test-1", targetType: "belief", status: "published",
      },
    ],
  });

  const body = await (await fetch(`${baseUrl}/api/v2/relationships?type=hasBelief`)).json();
  assert.deepEqual(body.data.map((r) => r.id), ["rel-test-1"]);
});

test("GET /api/v2/relationships rejects an uncontrolled type value", async (context) => {
  const baseUrl = await startServerWithFixtures(context);
  const response = await fetch(`${baseUrl}/api/v2/relationships?type=notARealType`);
  assert.equal(response.status, 400);
});

test("relationship pagination walks the full set without duplicates", async (context) => {
  const relationships = [];
  const entities = [COMMUNITY_FIXTURE];
  for (let i = 1; i <= 7; i += 1) {
    entities.push({
      id: `belief-test-${i}`, slug: `belief-test-${i}`, entityType: "belief", status: "published",
      title: { en: `Belief ${i}` },
    });
    relationships.push({
      id: `rel-test-${i}`, type: "hasBelief", sourceId: "community-test-1", sourceType: "community",
      targetId: `belief-test-${i}`, targetType: "belief", status: "published",
    });
  }
  const baseUrl = await startServerWithFixtures(context, { entities, relationships });

  const seen = new Set();
  let cursor = null;
  let guard = 0;
  do {
    const url = new URL(`${baseUrl}/api/v2/relationships`);
    url.searchParams.set("limit", "3");
    if (cursor) url.searchParams.set("cursor", cursor);
    // eslint-disable-next-line no-await-in-loop
    const body = await (await fetch(url)).json();
    for (const item of body.data) seen.add(item.id);
    cursor = body.meta.nextCursor;
    guard += 1;
    assert.ok(guard <= 10, "pagination loop guard tripped");
  } while (cursor);

  assert.equal(seen.size, 7);
});

test("GET /api/v2/entities/:id/related pairs a mapped v1 structure with its native relationship and entity", async (context) => {
  const baseUrl = await startServerWithFixtures(context, {
    entities: [BELIEF_FIXTURE],
    relationships: [{
      id: "rel-test-1", type: "hasSite", sourceId: "belief-test-1", sourceType: "belief",
      targetId: "b4", targetType: "structure", status: "published",
    }],
  });

  const body = await (await fetch(`${baseUrl}/api/v2/entities/b4/related`)).json();
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].entity.id, "belief-test-1");
  assert.equal(body.data[0].relationship.id, "rel-test-1");
  assert.equal(body.data[0].relationship.sourceId, "belief-test-1");
  assert.equal(body.data[0].relationship.targetId, "b4");
});

test("GET /api/v2/entities/:id/related returns 404 for an unknown id", async (context) => {
  const baseUrl = await startServerWithFixtures(context);
  const response = await fetch(`${baseUrl}/api/v2/entities/does-not-exist/related`);
  assert.equal(response.status, 404);
});

test("v1 GET /api/archive is unaffected by native editorial data (side-by-side)", async (context) => {
  const { getArchive } = await import("../../archiveController.js");
  const { initializeDataStore } = await import("../../dataStore.js");
  const { ARCHIVE_CATEGORIES } = await import("../../dataModel.js");

  await initializeDataStore();
  await startServerWithFixtures(context, { entities: [COMMUNITY_FIXTURE] });

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
