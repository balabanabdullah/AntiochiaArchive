import test from "node:test";
import assert from "node:assert/strict";
import { validateFilters } from "../../v2/validators/filters.js";

test("filters accept known, valid fields", () => {
  const result = validateFilters({ entityType: "story", language: "tr", tag: "migration" });
  assert.deepEqual(result, {
    valid: true,
    filters: { entityType: "story", language: "tr", tag: "migration" },
  });
});

test("filters ignore reserved pagination fields", () => {
  const result = validateFilters({ limit: "10", cursor: "abc", tag: "music" });
  assert.equal(result.valid, true);
  assert.deepEqual(result.filters, { tag: "music" });
});

test("filters reject an unsupported filter field", () => {
  const result = validateFilters({ favoriteColor: "blue" });
  assert.equal(result.valid, false);
  assert.match(result.error, /Unsupported filter field: favoriteColor/);
});

test("filters reject an uncontrolled entityType value", () => {
  const result = validateFilters({ entityType: "religion" });
  assert.equal(result.valid, false);
  assert.match(result.error, /entityType must be one of/);
});

test("filters reject an empty filter value", () => {
  const result = validateFilters({ tag: "" });
  assert.equal(result.valid, false);
  assert.match(result.error, /tag must be a non-empty string/);
});
