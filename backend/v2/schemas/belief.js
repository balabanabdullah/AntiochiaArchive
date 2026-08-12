import { EVIDENCE_TYPES } from "../constants/vocabularies.js";
import { validateBaseEntity, validateEnum } from "./shared.js";

export const BELIEF_ENTITY_TYPE = "belief";

/**
 * A belief entity represents a broad belief tradition (a faith, practice, or
 * living tradition), not an individual shrine, church, or mosque — those are
 * `structure` entities linked back to a belief through a relationship
 * record.
 */
export function validateBelief(entity) {
  const baseError = validateBaseEntity(entity, BELIEF_ENTITY_TYPE, "belief");
  if (baseError) return { valid: false, error: baseError };

  const evidenceError = validateEnum(entity.evidenceType, "belief.evidenceType", EVIDENCE_TYPES);
  if (evidenceError) return { valid: false, error: evidenceError };

  if (entity.sites != null || entity.structures != null) {
    return {
      valid: false,
      error: "belief must not embed structure/site records; express association through a relationship record.",
    };
  }

  return { valid: true };
}
