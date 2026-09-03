import test from "node:test";
import assert from "node:assert/strict";
import { validateSourceEntity } from "../../../v2/schemas/source.js";

const BASE = { id: "source-1", entityType: "source", type: "book" };

test("Section 7: qualityClassification accepts every documented value and is optional", () => {
  for (const value of ["primary", "academic", "institutional", "localHistory", "oralHistory", "popular", "unverified"]) {
    assert.equal(validateSourceEntity({ ...BASE, qualityClassification: value }).valid, true, value);
  }
  assert.equal(validateSourceEntity(BASE).valid, true, "omitted entirely must still be valid");
});

test("an unknown qualityClassification value is rejected", () => {
  const result = validateSourceEntity({ ...BASE, qualityClassification: "definitely-true" });
  assert.equal(result.valid, false);
  assert.match(result.error, /qualityClassification/);
});
