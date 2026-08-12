import { MEDIA_ROLES, MEDIA_TYPES, RIGHTS_STATUS } from "../constants/vocabularies.js";
import {
  isNonEmptyString,
  isObject,
  validateEnum,
  validateIsoDateString,
  validateStringArray,
} from "./shared.js";

export const MEDIA_ENTITY_TYPE = "media";

/**
 * Media is a first-class entity, not an attachment. It intentionally does
 * not reuse validateBaseEntity: media has no slug/title/languages, and it
 * carries storage-internal fields (originalStoragePath, checksum) that must
 * never reach the public serializer allowlist.
 */
export function validateMedia(entity) {
  if (!isObject(entity)) return { valid: false, error: "media must be an object." };

  if (!isNonEmptyString(entity.id)) {
    return { valid: false, error: "media.id is required and must be a non-empty string." };
  }

  if (entity.entityType !== MEDIA_ENTITY_TYPE) {
    return { valid: false, error: `media.entityType must be '${MEDIA_ENTITY_TYPE}'.` };
  }

  const mediaTypeError = validateEnum(entity.mediaType, "media.mediaType", MEDIA_TYPES, { required: true });
  if (mediaTypeError) return { valid: false, error: mediaTypeError };

  const mediaRoleError = validateEnum(entity.mediaRole, "media.mediaRole", MEDIA_ROLES, { required: true });
  if (mediaRoleError) return { valid: false, error: mediaRoleError };

  if (entity.originalStoragePath != null && !isNonEmptyString(entity.originalStoragePath)) {
    return { valid: false, error: "media.originalStoragePath must be a non-empty string." };
  }

  const derivativesError = validateStringArray(entity.derivativeStoragePaths, "media.derivativeStoragePaths");
  if (derivativesError) return { valid: false, error: derivativesError };

  for (const field of ["mimeType", "source", "author", "license", "rightsNote", "checksum"]) {
    if (entity[field] != null && typeof entity[field] !== "string") {
      return { valid: false, error: `media.${field} must be a string.` };
    }
  }

  for (const field of ["size", "duration", "width", "height"]) {
    if (entity[field] != null && (typeof entity[field] !== "number" || entity[field] < 0)) {
      return { valid: false, error: `media.${field} must be a non-negative number.` };
    }
  }

  const rightsStatusError = validateEnum(entity.rightsStatus, "media.rightsStatus", RIGHTS_STATUS);
  if (rightsStatusError) return { valid: false, error: rightsStatusError };

  if (entity.aiGenerated != null && typeof entity.aiGenerated !== "boolean") {
    return { valid: false, error: "media.aiGenerated must be a boolean." };
  }

  const createdAtError = validateIsoDateString(entity.createdAt, "media.createdAt");
  if (createdAtError) return { valid: false, error: createdAtError };

  return { valid: true };
}
