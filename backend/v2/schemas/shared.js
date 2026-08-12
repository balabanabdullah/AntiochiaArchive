// Reusable validation primitives shared by every v2 entity schema.

import { LANGUAGES, PUBLICATION_STATUS } from "../constants/vocabularies.js";

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isHttpUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(String(value)).protocol);
  } catch {
    return false;
  }
}

export function validateEnum(value, fieldPath, allowedValues, { required = false } = {}) {
  if (value == null) return required ? `${fieldPath} is required.` : null;
  if (typeof value !== "string" || !allowedValues.includes(value)) {
    return `${fieldPath} must be one of: ${allowedValues.join(", ")}.`;
  }
  return null;
}

export function validateIsoDateString(value, fieldPath) {
  if (value == null) return null;
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    return `${fieldPath} must be a valid date string.`;
  }
  return null;
}

export function validateStringArray(value, fieldPath) {
  if (value == null) return null;
  if (!Array.isArray(value)) return `${fieldPath} must be an array.`;
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !item.trim()) {
      return `${fieldPath}[${index}] must be a non-empty string.`;
    }
  }
  return null;
}

// mediaIds / sourceIds / evidenceSourceIds and similar reference-id arrays
// all share the same "array of non-empty string ids" shape.
export function validateIdArray(value, fieldPath) {
  return validateStringArray(value, fieldPath);
}

export function validateMultilingualText(value, fieldPath, { required = false } = {}) {
  if (value == null) return required ? `${fieldPath} is required.` : null;
  if (!isObject(value)) return `${fieldPath} must be an object.`;
  for (const [language, text] of Object.entries(value)) {
    if (!LANGUAGES.includes(language)) return `${fieldPath}.${language} is not a supported language.`;
    if (typeof text !== "string") return `${fieldPath}.${language} must be a string.`;
  }
  return null;
}

// Requires the multilingual object to exist and carry at least one populated
// language, without requiring every language to be filled in.
export function validateNonEmptyMultilingualText(value, fieldPath) {
  const shapeError = validateMultilingualText(value, fieldPath, { required: true });
  if (shapeError) return shapeError;
  const hasContent = Object.values(value).some((text) => typeof text === "string" && text.trim());
  if (!hasContent) return `${fieldPath} must include at least one non-empty language value.`;
  return null;
}

export function validateMultilingualStringArrays(value, fieldPath) {
  if (value == null) return null;
  if (!isObject(value)) return `${fieldPath} must be an object.`;
  for (const [language, list] of Object.entries(value)) {
    if (!LANGUAGES.includes(language)) return `${fieldPath}.${language} is not a supported language.`;
    const error = validateStringArray(list, `${fieldPath}.${language}`);
    if (error) return error;
  }
  return null;
}

/**
 * Validates the fields every v2 entity has in common:
 * id, slug, entityType, status, title, summary, alternateNames, languages,
 * tags, createdAt, updatedAt.
 *
 * Returns an error string, or null when the base shape is valid. Callers
 * validate their own entity-specific fields on top of this.
 */
export function validateBaseEntity(entity, expectedEntityType, fieldPath = "entity") {
  if (!isObject(entity)) return `${fieldPath} must be an object.`;

  if (!isNonEmptyString(entity.id)) {
    return `${fieldPath}.id is required and must be a non-empty string.`;
  }

  if (!isNonEmptyString(entity.slug) || !SLUG_PATTERN.test(entity.slug)) {
    return `${fieldPath}.slug must be a lowercase, hyphenated stable identifier.`;
  }

  if (entity.entityType !== expectedEntityType) {
    return `${fieldPath}.entityType must be '${expectedEntityType}'.`;
  }

  const statusError = validateEnum(entity.status, `${fieldPath}.status`, PUBLICATION_STATUS);
  if (statusError) return statusError;

  const titleError = validateNonEmptyMultilingualText(entity.title, `${fieldPath}.title`);
  if (titleError) return titleError;

  const summaryError = validateMultilingualText(entity.summary, `${fieldPath}.summary`);
  if (summaryError) return summaryError;

  const alternateNamesError = validateMultilingualStringArrays(entity.alternateNames, `${fieldPath}.alternateNames`);
  if (alternateNamesError) return alternateNamesError;

  const languagesError = validateStringArray(entity.languages, `${fieldPath}.languages`);
  if (languagesError) return languagesError;
  if (Array.isArray(entity.languages)) {
    for (const language of entity.languages) {
      if (!LANGUAGES.includes(language)) {
        return `${fieldPath}.languages must only contain: ${LANGUAGES.join(", ")}.`;
      }
    }
  }

  const tagsError = validateStringArray(entity.tags, `${fieldPath}.tags`);
  if (tagsError) return tagsError;

  const createdAtError = validateIsoDateString(entity.createdAt, `${fieldPath}.createdAt`);
  if (createdAtError) return createdAtError;

  const updatedAtError = validateIsoDateString(entity.updatedAt, `${fieldPath}.updatedAt`);
  if (updatedAtError) return updatedAtError;

  return null;
}
