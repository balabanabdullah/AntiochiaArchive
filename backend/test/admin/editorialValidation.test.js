import test from "node:test";
import assert from "node:assert/strict";
import {
  isKnownEntityType, isValidSlug, isAllowedDraftStatusTransition, validateCreateProposal, validateEditProposal,
} from "../../admin/editorialValidation.js";

function place(overrides = {}) {
  return {
    id: "place-9001",
    slug: "test-place",
    entityType: "place",
    title: { tr: "Test Yeri" },
    status: "draft",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("isKnownEntityType / isValidSlug", () => {
  assert.equal(isKnownEntityType("place"), true);
  assert.equal(isKnownEntityType("relationship"), false);
  assert.equal(isValidSlug("altinozu-hatay"), true);
  assert.equal(isValidSlug("Altinozu"), false);
  assert.equal(isValidSlug("altinozu_hatay"), false);
  assert.equal(isValidSlug(""), false);
});

test("isAllowedDraftStatusTransition: never allows skipping review or resurrecting an applied change", () => {
  assert.equal(isAllowedDraftStatusTransition("draft", "readyForReview"), true);
  assert.equal(isAllowedDraftStatusTransition("readyForReview", "approved"), true);
  assert.equal(isAllowedDraftStatusTransition("approved", "applied"), true);
  assert.equal(isAllowedDraftStatusTransition("draft", "approved"), false, "cannot skip review");
  assert.equal(isAllowedDraftStatusTransition("applied", "draft"), false, "cannot resurrect an applied change");
  assert.equal(isAllowedDraftStatusTransition("rejected", "readyForReview"), false, "a rejected change must go back through draft first");
  assert.equal(isAllowedDraftStatusTransition("draft", "notarealstatus"), false);
});

test("validateCreateProposal: accepts a valid, schema-passing, non-colliding candidate", () => {
  const candidate = place();
  const result = validateCreateProposal(candidate, []);
  assert.equal(result.valid, true, result.errors.join("; "));
});

test("validateCreateProposal: rejects an unknown entityType", () => {
  const result = validateCreateProposal({ ...place(), entityType: "notARealType" }, []);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /entityType/);
});

test("validateCreateProposal: never allows a new record to default straight to 'published'", () => {
  const result = validateCreateProposal({ ...place(), status: "published" }, []);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /published/);
});

test("validateCreateProposal: rejects a duplicate id or slug against ANY existing entity, regardless of that entity's own status", () => {
  const existing = [place({ id: "place-9001", slug: "other-slug", status: "draft" })];
  const dupId = validateCreateProposal(place({ id: "place-9001", slug: "unique-slug" }), existing);
  assert.equal(dupId.valid, false);
  assert.match(dupId.errors.join(" "), /id/);

  const existingSlug = [place({ id: "place-9999", slug: "test-place", status: "inReview" })];
  const dupSlug = validateCreateProposal(place({ id: "place-0001" }), existingSlug);
  assert.equal(dupSlug.valid, false);
  assert.match(dupSlug.errors.join(" "), /slug/);
});

test("validateCreateProposal: rejects an invalid slug shape", () => {
  const result = validateCreateProposal(place({ slug: "Not A Slug!" }), []);
  assert.equal(result.valid, false);
});

test("validateCreateProposal: coordinate validation is inherited from the real place schema (out-of-range lat/lng rejected)", () => {
  const result = validateCreateProposal(place({ coordinates: { latitude: 999, longitude: 36.1 } }), []);
  assert.equal(result.valid, false);
});

test("validateEditProposal: accepts a valid partial patch merged onto the base entity", () => {
  const base = place({ status: "draft" });
  const result = validateEditProposal(base, { summary: { tr: "Yeni özet" } }, [base]);
  assert.equal(result.valid, true, result.errors.join("; "));
});

test("validateEditProposal: rejects when the base entity is missing", () => {
  const result = validateEditProposal(null, { summary: { tr: "x" } }, []);
  assert.equal(result.valid, false);
});

test("validateEditProposal: rejects an attempt to change id/entityType/slug", () => {
  const base = place();
  for (const field of ["id", "entityType", "slug"]) {
    const result = validateEditProposal(base, { [field]: "something-else" }, [base]);
    assert.equal(result.valid, false, `${field} change should be rejected`);
  }
});

test("validateEditProposal: never allows an edit to set status to 'published' directly", () => {
  const base = place();
  const result = validateEditProposal(base, { status: "published" }, [base]);
  assert.equal(result.valid, false);
});

test("validateEditProposal: rejects a patch that would make the entity schema-invalid", () => {
  const base = place();
  const result = validateEditProposal(base, { coordinates: { latitude: "not-a-number", longitude: 36.1 } }, [base]);
  assert.equal(result.valid, false);
});
