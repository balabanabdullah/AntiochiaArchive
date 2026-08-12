import {
  ENTITY_TYPES,
  LANGUAGES,
  PUBLICATION_STATUS,
  STORY_CATEGORY_TYPES,
} from "../constants/vocabularies.js";

// Prepares the future filter contract only — EmptyV2Store has no data to
// filter over yet, so validated filters are accepted but not yet applied.
export const SUPPORTED_FILTER_FIELDS = Object.freeze([
  "entityType",
  "communityId",
  "beliefId",
  "placeId",
  "language",
  "dialect",
  "storyCategory",
  "musicGenre",
  "tag",
  "status",
]);

const RESERVED_QUERY_FIELDS = Object.freeze(["limit", "cursor"]);

const CONTROLLED_FILTER_VALUES = Object.freeze({
  entityType: ENTITY_TYPES,
  language: LANGUAGES,
  status: PUBLICATION_STATUS,
  storyCategory: STORY_CATEGORY_TYPES,
});

export function validateFilters(query = {}) {
  const filters = {};

  for (const [key, value] of Object.entries(query)) {
    if (RESERVED_QUERY_FIELDS.includes(key)) continue;

    if (!SUPPORTED_FILTER_FIELDS.includes(key)) {
      return { valid: false, error: `Unsupported filter field: ${key}.` };
    }

    if (typeof value !== "string" || !value.trim()) {
      return { valid: false, error: `${key} must be a non-empty string.` };
    }

    const controlledValues = CONTROLLED_FILTER_VALUES[key];
    if (controlledValues && !controlledValues.includes(value)) {
      return { valid: false, error: `${key} must be one of: ${controlledValues.join(", ")}.` };
    }

    filters[key] = value.trim();
  }

  return { valid: true, filters };
}
