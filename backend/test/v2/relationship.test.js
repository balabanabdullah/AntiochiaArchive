import test from "node:test";
import assert from "node:assert/strict";
import { validateRelationship } from "../../v2/schemas/relationship.js";

function validRelationship(overrides = {}) {
  return {
    id: "relationship-1",
    type: "locatedIn",
    sourceId: "structure-1",
    sourceType: "structure",
    targetId: "place-1",
    targetType: "place",
    ...overrides,
  };
}

test("valid relationship passes validation", () => {
  assert.deepEqual(validateRelationship(validRelationship()), { valid: true });
});

test("invalid relationship type is rejected", () => {
  const result = validateRelationship(validRelationship({ type: "worshippedBy" }));
  assert.equal(result.valid, false);
  assert.match(result.error, /type must be one of/);
});

test("self relationship is rejected by default", () => {
  const result = validateRelationship(validRelationship({ sourceId: "place-1", targetId: "place-1" }));
  assert.equal(result.valid, false);
  assert.match(result.error, /must not reference the same entity/);
});

test("self relationship can be explicitly allowed", () => {
  const relationship = validRelationship({ sourceId: "place-1", targetId: "place-1" });
  assert.deepEqual(validateRelationship(relationship, { allowSelfRelationship: true }), { valid: true });
});

test("relationship rejects an unsupported entity type", () => {
  const result = validateRelationship(validRelationship({ sourceType: "religion" }));
  assert.equal(result.valid, false);
  assert.match(result.error, /sourceType must be one of/);
});

test("relationship requires non-empty ids", () => {
  const result = validateRelationship(validRelationship({ sourceId: "" }));
  assert.equal(result.valid, false);
  assert.match(result.error, /sourceId is required/);
});
