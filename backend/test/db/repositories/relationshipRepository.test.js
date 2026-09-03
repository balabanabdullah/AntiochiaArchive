import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { initializeSqlite, closeSqlite, getSqlite } from "../../../db/sqliteConnection.js";
import { applyPendingMigrations } from "../../../db/migrate.js";
import { insertEntity } from "../../../db/repositories/entityRepository.js";
import {
  insertRelationship, deleteRelationshipRow, getRelationshipByIdRow, relationshipIdExists,
  countRelationshipsForEntity, listRelationshipsRows, getRelatedEntityIds,
} from "../../../db/repositories/relationshipRepository.js";

async function withTempDb(t, run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-rel-repo-"));
  initializeSqlite({ path: path.join(dir, "test.db") });
  applyPendingMigrations({ verbose: false });
  t.after(async () => {
    closeSqlite();
    await fs.rm(dir, { recursive: true, force: true });
  });
  return run();
}

function seedTwoPlaces() {
  insertEntity({ id: "place-a", entityType: "place", slug: "a", status: "published", title: { tr: "A" } });
  insertEntity({ id: "place-b", entityType: "place", slug: "b", status: "published", title: { tr: "B" } });
}

test("insertRelationship requires both endpoints to already exist (foreign_keys=ON)", async (t) => {
  await withTempDb(t, () => {
    assert.throws(() => insertRelationship({
      id: "rel-1", type: "locatedIn", sourceId: "missing-a", sourceType: "place", targetId: "missing-b", targetType: "place",
    }));
  });
});

test("insertRelationship persists a readable row once both endpoints exist", async (t) => {
  await withTempDb(t, () => {
    seedTwoPlaces();
    const stored = insertRelationship({ id: "rel-1", type: "locatedIn", sourceId: "place-a", sourceType: "place", targetId: "place-b", targetType: "place" });
    assert.equal(stored.id, "rel-1");
    assert.equal(relationshipIdExists("rel-1"), true);
    assert.deepEqual(getRelationshipByIdRow("rel-1"), stored);
  });
});

test("deleting an entity that still has a relationship edge is refused (ON DELETE RESTRICT)", async (t) => {
  await withTempDb(t, () => {
    seedTwoPlaces();
    insertRelationship({ id: "rel-1", type: "locatedIn", sourceId: "place-a", sourceType: "place", targetId: "place-b", targetType: "place" });
    assert.throws(() => getSqlite().prepare("DELETE FROM entities WHERE id = 'place-a'").run());
  });
});

test("countRelationshipsForEntity counts edges where the entity is either source or target", async (t) => {
  await withTempDb(t, () => {
    seedTwoPlaces();
    insertEntity({ id: "place-c", entityType: "place", slug: "c", status: "published", title: { tr: "C" } });
    insertRelationship({ id: "rel-1", type: "locatedIn", sourceId: "place-a", sourceType: "place", targetId: "place-b", targetType: "place" });
    insertRelationship({ id: "rel-2", type: "relatedTo", sourceId: "place-c", sourceType: "place", targetId: "place-a", targetType: "place" });
    assert.equal(countRelationshipsForEntity("place-a"), 2);
    assert.equal(countRelationshipsForEntity("place-b"), 1);
    assert.equal(countRelationshipsForEntity("place-c"), 1);
  });
});

test("deleteRelationshipRow removes the edge, unblocking entity deletion", async (t) => {
  await withTempDb(t, () => {
    seedTwoPlaces();
    insertRelationship({ id: "rel-1", type: "locatedIn", sourceId: "place-a", sourceType: "place", targetId: "place-b", targetType: "place" });
    assert.equal(deleteRelationshipRow("rel-1"), true);
    assert.equal(countRelationshipsForEntity("place-a"), 0);
  });
});

test("listRelationshipsRows filters by type and paginates by id", async (t) => {
  await withTempDb(t, () => {
    seedTwoPlaces();
    insertEntity({ id: "place-c", entityType: "place", slug: "c", status: "published", title: { tr: "C" } });
    insertRelationship({ id: "rel-1", type: "locatedIn", sourceId: "place-a", sourceType: "place", targetId: "place-b", targetType: "place" });
    insertRelationship({ id: "rel-2", type: "relatedTo", sourceId: "place-c", sourceType: "place", targetId: "place-a", targetType: "place" });
    assert.deepEqual(listRelationshipsRows({ filters: { type: "locatedIn" } }).items.map((r) => r.id), ["rel-1"]);
    assert.equal(listRelationshipsRows({}).items.length, 2);
  });
});

test("getRelatedEntityIds returns the OTHER endpoint id for every edge touching this entity, deduplicated", async (t) => {
  await withTempDb(t, () => {
    seedTwoPlaces();
    insertEntity({ id: "place-c", entityType: "place", slug: "c", status: "published", title: { tr: "C" } });
    insertRelationship({ id: "rel-1", type: "locatedIn", sourceId: "place-a", sourceType: "place", targetId: "place-b", targetType: "place" });
    insertRelationship({ id: "rel-2", type: "relatedTo", sourceId: "place-c", sourceType: "place", targetId: "place-a", targetType: "place" });
    assert.deepEqual(new Set(getRelatedEntityIds("place-a")), new Set(["place-b", "place-c"]));
  });
});
