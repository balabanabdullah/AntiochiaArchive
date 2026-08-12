import { SOURCE_TYPES } from "../constants/vocabularies.js";
import { isHttpUrl, isNonEmptyString, isObject, validateEnum } from "./shared.js";

export const SOURCE_ENTITY_TYPE = "source";

const SOURCE_TEXT_FIELDS = Object.freeze([
  "title",
  "author",
  "publisher",
  "year",
  "url",
  "locator",
  "accessedAt",
  "language",
  "rights",
  "note",
]);

/**
 * A source is the record's historical/editorial evidence (a book, article,
 * oral history, etc). This is a distinct concept from media rights
 * provenance (see media.js rightsStatus/license) — a source documents where
 * a *claim* comes from, not who may reuse an *image*.
 */
export function validateSourceEntity(entity) {
  if (!isObject(entity)) return { valid: false, error: "source must be an object." };

  if (!isNonEmptyString(entity.id)) {
    return { valid: false, error: "source.id is required and must be a non-empty string." };
  }

  if (entity.entityType != null && entity.entityType !== SOURCE_ENTITY_TYPE) {
    return { valid: false, error: `source.entityType must be '${SOURCE_ENTITY_TYPE}'.` };
  }

  const typeError = validateEnum(entity.type, "source.type", SOURCE_TYPES);
  if (typeError) return { valid: false, error: typeError };

  for (const field of SOURCE_TEXT_FIELDS) {
    if (entity[field] != null && typeof entity[field] !== "string") {
      return { valid: false, error: `source.${field} must be a string.` };
    }
  }

  if (entity.url && !isHttpUrl(entity.url)) {
    return { valid: false, error: "source.url must use http or https." };
  }

  return { valid: true };
}
