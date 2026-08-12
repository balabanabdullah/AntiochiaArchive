import { ENTITY_TYPES, PUBLICATION_STATUS, RELATIONSHIP_TYPES } from "../constants/vocabularies.js";
import { isNonEmptyString, isObject, validateEnum, validateIdArray } from "./shared.js";

/**
 * Shared relationship (edge) schema connecting two entities. This module
 * only validates shape — it does not create or assume any actual cultural
 * relationships between records.
 */
export function validateRelationship(relationship, { allowSelfRelationship = false } = {}) {
  if (!isObject(relationship)) return { valid: false, error: "relationship must be an object." };

  if (!isNonEmptyString(relationship.id)) {
    return { valid: false, error: "relationship.id is required and must be a non-empty string." };
  }

  const typeError = validateEnum(relationship.type, "relationship.type", RELATIONSHIP_TYPES, { required: true });
  if (typeError) return { valid: false, error: typeError };

  if (!isNonEmptyString(relationship.sourceId)) {
    return { valid: false, error: "relationship.sourceId is required and must be a non-empty string." };
  }

  if (!isNonEmptyString(relationship.targetId)) {
    return { valid: false, error: "relationship.targetId is required and must be a non-empty string." };
  }

  const sourceTypeError = validateEnum(relationship.sourceType, "relationship.sourceType", ENTITY_TYPES, { required: true });
  if (sourceTypeError) return { valid: false, error: sourceTypeError };

  const targetTypeError = validateEnum(relationship.targetType, "relationship.targetType", ENTITY_TYPES, { required: true });
  if (targetTypeError) return { valid: false, error: targetTypeError };

  if (!allowSelfRelationship && relationship.sourceId === relationship.targetId) {
    return {
      valid: false,
      error: "relationship.sourceId and relationship.targetId must not reference the same entity.",
    };
  }

  const evidenceSourceIdsError = validateIdArray(relationship.evidenceSourceIds, "relationship.evidenceSourceIds");
  if (evidenceSourceIdsError) return { valid: false, error: evidenceSourceIdsError };

  if (relationship.note != null && typeof relationship.note !== "string") {
    return { valid: false, error: "relationship.note must be a string." };
  }

  const statusError = validateEnum(relationship.status, "relationship.status", PUBLICATION_STATUS);
  if (statusError) return { valid: false, error: statusError };

  return { valid: true };
}
