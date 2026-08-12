import test from "node:test";
import assert from "node:assert/strict";
import { validateCommunity } from "../../v2/schemas/community.js";
import { validateEntity } from "../../v2/schemas/index.js";

function validCommunity() {
  return {
    id: "community-1",
    slug: "sample-community",
    entityType: "community",
    status: "draft",
    title: { en: "Sample Community" },
  };
}

test("valid base entity passes schema validation", () => {
  assert.deepEqual(validateCommunity(validCommunity()), { valid: true });
});

test("invalid entityType is rejected", () => {
  const entity = validCommunity();
  entity.entityType = "religion";
  const result = validateCommunity(entity);
  assert.equal(result.valid, false);
  assert.match(result.error, /entityType must be 'community'/);
});

test("validateEntity dispatcher rejects an unsupported entityType", () => {
  const entity = validCommunity();
  entity.entityType = "not-a-real-type";
  const result = validateEntity(entity);
  assert.equal(result.valid, false);
  assert.match(result.error, /entityType must be one of/);
});

test("invalid slug is rejected", () => {
  const entity = validCommunity();
  entity.slug = "Invalid Slug!";
  const result = validateCommunity(entity);
  assert.equal(result.valid, false);
  assert.match(result.error, /slug/);
});

test("multilingual title validation accepts partial language coverage", () => {
  const entity = validCommunity();
  entity.title = { en: "English only" };
  assert.deepEqual(validateCommunity(entity), { valid: true });
});

test("multilingual title validation rejects an unsupported language key", () => {
  const entity = validCommunity();
  entity.title = { en: "English", fr: "French" };
  const result = validateCommunity(entity);
  assert.equal(result.valid, false);
  assert.match(result.error, /title\.fr is not a supported language/);
});

test("multilingual title validation rejects an entirely empty title", () => {
  const entity = validCommunity();
  entity.title = { tr: "", en: "", ar: "" };
  const result = validateCommunity(entity);
  assert.equal(result.valid, false);
  assert.match(result.error, /at least one non-empty language value/);
});

test("multilingual title validation rejects a missing title", () => {
  const entity = validCommunity();
  delete entity.title;
  const result = validateCommunity(entity);
  assert.equal(result.valid, false);
  assert.match(result.error, /title is required/);
});
