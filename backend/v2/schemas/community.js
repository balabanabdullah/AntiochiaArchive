import { EVIDENCE_TYPES } from "../constants/vocabularies.js";
import { validateBaseEntity, validateEnum } from "./shared.js";

export const COMMUNITY_ENTITY_TYPE = "community";

/**
 * A community is a documented cultural or social group. It is deliberately
 * separate from `belief`: a community is not modeled as "a religion", and
 * belief association must be expressed through a relationship record
 * (see relationship.js), never by embedding belief documents here.
 */
export function validateCommunity(entity) {
  const baseError = validateBaseEntity(entity, COMMUNITY_ENTITY_TYPE, "community");
  if (baseError) return { valid: false, error: baseError };

  const evidenceError = validateEnum(entity.evidenceType, "community.evidenceType", EVIDENCE_TYPES);
  if (evidenceError) return { valid: false, error: evidenceError };

  if (entity.beliefs != null) {
    return {
      valid: false,
      error: "community.beliefs must not be embedded; express belief association through a relationship record.",
    };
  }

  return { valid: true };
}
