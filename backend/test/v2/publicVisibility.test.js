import assert from "node:assert/strict";
import test from "node:test";
import { isPublic, isPublicRelationship, filterPublicRelationships } from "../../v2/serializers/publicVisibility.js";

test("isPublic requires status === 'published' for status-bearing entity types", () => {
  assert.equal(isPublic({ entityType: "belief", status: "published" }), true);
  assert.equal(isPublic({ entityType: "belief", status: "inReview" }), false);
  assert.equal(isPublic({ entityType: "belief", status: "draft" }), false);
  assert.equal(isPublic({ entityType: "belief" }), false);
  assert.equal(isPublic(null), false);
  assert.equal(isPublic(undefined), false);
});

test("isPublic treats statusless entity types (media, source) as always public", () => {
  assert.equal(isPublic({ entityType: "media" }), true);
  assert.equal(isPublic({ entityType: "source" }), true);
  assert.equal(isPublic({ entityType: "media", status: "draft" }), true);
});

test("isPublicRelationship requires the relationship's own status AND both connected entities to be public", async () => {
  const entities = new Map([
    ["a", { entityType: "belief", status: "published" }],
    ["b", { entityType: "belief", status: "published" }],
    ["c", { entityType: "story", status: "inReview" }], // an oralHistoryLead-shaped non-public entity
  ]);
  const getEntityById = async (id) => entities.get(id) || null;

  assert.equal(
    await isPublicRelationship({ status: "published", sourceId: "a", targetId: "b" }, getEntityById),
    true,
  );
  assert.equal(
    await isPublicRelationship({ status: "inReview", sourceId: "a", targetId: "b" }, getEntityById),
    false,
    "relationship's own status must be published",
  );
  assert.equal(
    await isPublicRelationship({ status: "published", sourceId: "a", targetId: "c" }, getEntityById),
    false,
    "must not leak a non-public entity's existence even when the relationship itself is published",
  );
  assert.equal(
    await isPublicRelationship({ status: "published", sourceId: "a", targetId: "missing" }, getEntityById),
    false,
    "a dangling reference must never be treated as public",
  );
});

test("filterPublicRelationships returns only the relationships where both ends resolve to public entities", async () => {
  const entities = new Map([
    ["a", { entityType: "belief", status: "published" }],
    ["b", { entityType: "belief", status: "published" }],
    ["lead", { entityType: "story", status: "inReview" }],
  ]);
  const getEntityById = async (id) => entities.get(id) || null;
  const relationships = [
    { id: "r1", status: "published", sourceId: "a", targetId: "b" },
    { id: "r2", status: "published", sourceId: "a", targetId: "lead" },
    { id: "r3", status: "inReview", sourceId: "a", targetId: "b" },
  ];

  const publicOnes = await filterPublicRelationships(relationships, getEntityById);
  assert.deepEqual(publicOnes.map((r) => r.id), ["r1"]);
});

test("isPublicRelationship accepts a plain lookup function, not a full store object (generalized signature)", async () => {
  // The whole point of extracting this out of v2Routes.js was to decouple it
  // from the store abstraction — a caller with just an in-memory Map (like
  // scripts/v2-archive-release.js building an id -> entity index) must be
  // able to call this with nothing more than `(id) => map.get(id)`.
  const byId = new Map([
    ["x", { entityType: "place", status: "published" }],
    ["y", { entityType: "place", status: "published" }],
  ]);
  const result = await isPublicRelationship(
    { status: "published", sourceId: "x", targetId: "y" },
    (id) => byId.get(id) ?? null,
  );
  assert.equal(result, true);
});
