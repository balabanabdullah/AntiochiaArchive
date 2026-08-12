import { isObject, isNonEmptyString, validateBaseEntity, validateIdArray } from "./shared.js";

export const STRUCTURE_ENTITY_TYPE = "structure";

/**
 * A structure (building, monument, bridge, sacred site, or other built
 * work). Community, belief, and place associations belong in relationship
 * records — this schema forbids embedding those as full objects so a
 * structure document cannot silently drift out of sync with its related
 * entities.
 */
export function validateStructure(entity) {
  const baseError = validateBaseEntity(entity, STRUCTURE_ENTITY_TYPE, "structure");
  if (baseError) return { valid: false, error: baseError };

  if (entity.structureType != null && !isNonEmptyString(entity.structureType)) {
    return { valid: false, error: "structure.structureType must be a non-empty string." };
  }

  const mediaIdsError = validateIdArray(entity.mediaIds, "structure.mediaIds");
  if (mediaIdsError) return { valid: false, error: mediaIdsError };

  const sourceIdsError = validateIdArray(entity.sourceIds, "structure.sourceIds");
  if (sourceIdsError) return { valid: false, error: sourceIdsError };

  for (const field of ["community", "belief", "place"]) {
    if (isObject(entity[field])) {
      return {
        valid: false,
        error: `structure.${field} must not embed a full entity object; use a relationship record instead.`,
      };
    }
  }

  return { valid: true };
}
