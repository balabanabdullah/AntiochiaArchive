import test from "node:test";
import assert from "node:assert/strict";
import { validatePagination, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from "../../v2/validators/pagination.js";

test("pagination defaults limit when none is given", () => {
  const result = validatePagination({});
  assert.equal(result.valid, true);
  assert.equal(result.limit, DEFAULT_PAGE_LIMIT);
  assert.equal(result.cursor, null);
});

test("pagination accepts a valid positive integer limit", () => {
  const result = validatePagination({ limit: "10" });
  assert.equal(result.valid, true);
  assert.equal(result.limit, 10);
});

test("pagination rejects a non-integer limit", () => {
  const result = validatePagination({ limit: "abc" });
  assert.equal(result.valid, false);
  assert.match(result.error, /positive integer/);
});

test("pagination rejects a zero or negative limit", () => {
  assert.equal(validatePagination({ limit: "0" }).valid, false);
  assert.equal(validatePagination({ limit: "-5" }).valid, false);
});

test("pagination rejects a limit above the safe maximum", () => {
  const result = validatePagination({ limit: String(MAX_PAGE_LIMIT + 1) });
  assert.equal(result.valid, false);
  assert.match(result.error, new RegExp(`not exceed ${MAX_PAGE_LIMIT}`));
});

test("pagination accepts and trims a cursor string", () => {
  const result = validatePagination({ cursor: " abc123 " });
  assert.equal(result.valid, true);
  assert.equal(result.cursor, "abc123");
});

test("pagination rejects a blank cursor", () => {
  const result = validatePagination({ cursor: "   " });
  assert.equal(result.valid, false);
  assert.match(result.error, /cursor must be a non-empty string/);
});
