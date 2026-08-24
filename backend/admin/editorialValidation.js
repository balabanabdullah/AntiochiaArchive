// Pure validation for editorial draft proposals — reuses the REAL v2 schema
// validators (backend/v2/schemas) rather than a separate, drift-prone admin
// copy, so a draft that would fail the real release pipeline is caught here
// too, at proposal time. Also checks id/slug collisions against the live
// merged v2 store, since a schema validator alone has no notion of "does
// this id already exist."

import { validateEntity } from "../v2/schemas/index.js";
import { ENTITY_TYPES, PUBLICATION_STATUS } from "../v2/constants/vocabularies.js";
import { DRAFT_STATUSES } from "./editorialStore.js";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const DRAFT_STATUS_TRANSITIONS = Object.freeze({
  draft: ["readyForReview", "rejected"],
  readyForReview: ["draft", "approved", "rejected"],
  approved: ["applied", "rejected"],
  rejected: ["draft"],
  applied: [],
});

export function isKnownEntityType(entityType) {
  return ENTITY_TYPES.includes(entityType);
}

export function isValidSlug(slug) {
  return typeof slug === "string" && SLUG_PATTERN.test(slug);
}

/** Whether `from` -> `to` is an allowed draft-status transition. Never allows skipping review (draft -> approved) or resurrecting an applied change. */
export function isAllowedDraftStatusTransition(from, to) {
  if (!DRAFT_STATUSES.includes(from) || !DRAFT_STATUSES.includes(to)) return false;
  return (DRAFT_STATUS_TRANSITIONS[from] || []).includes(to);
}

/**
 * Validates a "create" proposal: the full candidate entity object (as it
 * would need to look to pass the real schema) plus a slug-collision check
 * against every entity — of any status — already in the live store (a
 * published, draft, or inReview record all reserve their slug equally).
 * Never defaults a new record's status to "published" — the caller
 * (adminRoutes.js) always sets it to "draft" unless the admin explicitly
 * chose "inReview".
 */
export function validateCreateProposal(candidateEntity, existingEntities) {
  const errors = [];
  if (!candidateEntity || typeof candidateEntity !== "object") {
    return { valid: false, errors: ["proposedChanges must be an object."] };
  }
  if (!isKnownEntityType(candidateEntity.entityType)) {
    errors.push(`entityType must be one of: ${ENTITY_TYPES.join(", ")}.`);
  }
  if (candidateEntity.status && candidateEntity.status === "published") {
    errors.push("A new record proposal must never default to 'published' — leave it as draft/inReview.");
  }
  if (candidateEntity.slug && !isValidSlug(candidateEntity.slug)) {
    errors.push("slug must be lowercase letters/digits in single-hyphen groups (e.g. 'my-place').");
  }
  if (candidateEntity.id && existingEntities.some((e) => e.id === candidateEntity.id)) {
    errors.push(`id '${candidateEntity.id}' already exists — cannot reuse it.`);
  }
  if (candidateEntity.slug && existingEntities.some((e) => e.slug === candidateEntity.slug)) {
    errors.push(`slug '${candidateEntity.slug}' already exists — choose a different one.`);
  }
  if (errors.length) return { valid: false, errors };

  const schemaResult = validateEntity(candidateEntity);
  if (!schemaResult.valid) return { valid: false, errors: [schemaResult.error] };
  return { valid: true, errors: [] };
}

/**
 * Validates an "edit" proposal: `proposedChanges` is a partial patch, merged
 * onto the real current entity (fetched by the caller from the live store)
 * before schema validation — so the validator sees the entity AS IT WOULD
 * BECOME, not just the delta. `id`/`entityType`/`slug` may never be changed
 * by an edit proposal (an id/type change is really a different entity; a
 * slug change is a deliberate, separately-reviewed URL-stability decision
 * outside this v1 admin tool's scope).
 */
export function validateEditProposal(baseEntity, proposedChanges, existingEntities) {
  if (!baseEntity) return { valid: false, errors: ["The entity being edited was not found."] };
  if (!proposedChanges || typeof proposedChanges !== "object") {
    return { valid: false, errors: ["proposedChanges must be an object."] };
  }
  const errors = [];
  for (const lockedField of ["id", "entityType", "slug"]) {
    if (Object.hasOwn(proposedChanges, lockedField) && proposedChanges[lockedField] !== baseEntity[lockedField]) {
      errors.push(`'${lockedField}' cannot be changed by an edit proposal.`);
    }
  }
  if (Object.hasOwn(proposedChanges, "status") && proposedChanges.status === "published") {
    errors.push("An edit proposal must never set status to 'published' directly — publication happens through the reviewed apply step.");
  }
  if (errors.length) return { valid: false, errors };

  const merged = { ...baseEntity, ...proposedChanges };
  const schemaResult = validateEntity(merged);
  if (!schemaResult.valid) return { valid: false, errors: [schemaResult.error] };
  return { valid: true, errors: [] };
}

export function isValidPublicationStatus(status) {
  return PUBLICATION_STATUS.includes(status);
}
