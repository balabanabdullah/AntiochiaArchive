// Confirms sqliteV2Store honors the exact same V2Store contract as every
// other store (see memoryV2Store.test.js for the sibling suite this
// mirrors) — the property that lets v2Routes.js/adminRoutes.js work
// unmodified regardless of which store is selected.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { closeSqlite } from "../../../db/sqliteConnection.js";
import { insertEntity } from "../../../db/repositories/entityRepository.js";
import { insertRelationship } from "../../../db/repositories/relationshipRepository.js";
import { sqliteV2Store } from "../../../v2/stores/sqliteV2Store.js";

async function withInitializedStore(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-sqlite-v2store-"));
  const originalPath = process.env.SQLITE_DB_PATH;
  const originalStorageRoot = process.env.LOCAL_STORAGE_ROOT;
  process.env.SQLITE_DB_PATH = path.join(dir, "test.db");
  process.env.LOCAL_STORAGE_ROOT = path.join(dir, "storage");
  await sqliteV2Store.initialize();
  t.after(async () => {
    closeSqlite();
    if (originalPath === undefined) delete process.env.SQLITE_DB_PATH; else process.env.SQLITE_DB_PATH = originalPath;
    if (originalStorageRoot === undefined) delete process.env.LOCAL_STORAGE_ROOT; else process.env.LOCAL_STORAGE_ROOT = originalStorageRoot;
    await fs.rm(dir, { recursive: true, force: true });
  });
}

test("initialize() opens the db, applies migrations, and is idempotent (calling twice does not throw)", async (t) => {
  await withInitializedStore(t);
  await sqliteV2Store.initialize();
});

test("listEntities/getEntityById/listByType read what the repositories wrote, matching the V2Store return shape", async (t) => {
  await withInitializedStore(t);
  insertEntity({ id: "place-1", entityType: "place", slug: "p1", status: "published", title: { tr: "P1" } });
  insertEntity({ id: "story-1", entityType: "story", slug: "s1", status: "draft", title: { tr: "S1" } });

  const all = await sqliteV2Store.listEntities({});
  assert.deepEqual(all.items.map((e) => e.id).sort(), ["place-1", "story-1"]);
  assert.equal(all.count, 2);
  assert.equal(all.nextCursor, null);

  const one = await sqliteV2Store.getEntityById("place-1");
  assert.equal(one.slug, "p1");
  assert.equal(await sqliteV2Store.getEntityById("does-not-exist"), null);

  const byType = await sqliteV2Store.listByType("story");
  assert.deepEqual(byType.items.map((e) => e.id), ["story-1"]);
});

test("listRelationships and getRelatedEntities resolve both directions of an edge", async (t) => {
  await withInitializedStore(t);
  insertEntity({ id: "place-1", entityType: "place", slug: "p1", status: "published", title: { tr: "P1" } });
  insertEntity({ id: "place-2", entityType: "place", slug: "p2", status: "published", title: { tr: "P2" } });
  insertRelationship({ id: "rel-1", type: "locatedIn", sourceId: "place-1", sourceType: "place", targetId: "place-2", targetType: "place" });

  const relationships = await sqliteV2Store.listRelationships({});
  assert.equal(relationships.items.length, 1);

  const relatedToPlace1 = await sqliteV2Store.getRelatedEntities("place-1");
  assert.deepEqual(relatedToPlace1.items.map((e) => e.id), ["place-2"]);
  const relatedToPlace2 = await sqliteV2Store.getRelatedEntities("place-2");
  assert.deepEqual(relatedToPlace2.items.map((e) => e.id), ["place-1"]);
});

test("cursor pagination on listEntities walks the full set deterministically", async (t) => {
  await withInitializedStore(t);
  for (const letter of ["a", "b", "c"]) {
    insertEntity({ id: `place-${letter}`, entityType: "place", slug: letter, status: "published", title: { tr: letter } });
  }
  let cursor = null;
  const seen = [];
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const page = await sqliteV2Store.listEntities({ limit: 1, cursor });
    if (!page.items.length) break;
    seen.push(...page.items.map((e) => e.id));
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  assert.deepEqual(seen, ["place-a", "place-b", "place-c"]);
});
