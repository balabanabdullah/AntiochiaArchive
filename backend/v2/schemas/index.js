import { COMMUNITY_ENTITY_TYPE, validateCommunity } from "./community.js";
import { BELIEF_ENTITY_TYPE, validateBelief } from "./belief.js";
import { PLACE_ENTITY_TYPE, validatePlace } from "./place.js";
import { STRUCTURE_ENTITY_TYPE, validateStructure } from "./structure.js";
import { STORY_ENTITY_TYPE, validateStory } from "./story.js";
import { MUSIC_ENTITY_TYPE, validateMusic } from "./music.js";
import { PROVERB_ENTITY_TYPE, validateProverb } from "./proverb.js";
import { HISTORICAL_CONTEXT_ENTITY_TYPE, validateHistoricalContext } from "./historicalContext.js";
import { MEDIA_ENTITY_TYPE, validateMedia } from "./media.js";
import { SOURCE_ENTITY_TYPE, validateSourceEntity } from "./source.js";

export const ENTITY_VALIDATORS = Object.freeze({
  [COMMUNITY_ENTITY_TYPE]: validateCommunity,
  [BELIEF_ENTITY_TYPE]: validateBelief,
  [PLACE_ENTITY_TYPE]: validatePlace,
  [STRUCTURE_ENTITY_TYPE]: validateStructure,
  [STORY_ENTITY_TYPE]: validateStory,
  [MUSIC_ENTITY_TYPE]: validateMusic,
  [PROVERB_ENTITY_TYPE]: validateProverb,
  [HISTORICAL_CONTEXT_ENTITY_TYPE]: validateHistoricalContext,
  [MEDIA_ENTITY_TYPE]: validateMedia,
  [SOURCE_ENTITY_TYPE]: validateSourceEntity,
});

/** Dispatches to the correct schema validator based on entity.entityType. */
export function validateEntity(entity) {
  if (!entity || typeof entity !== "object" || Array.isArray(entity)) {
    return { valid: false, error: "entity must be an object." };
  }

  const validator = ENTITY_VALIDATORS[entity.entityType];
  if (!validator) {
    return {
      valid: false,
      error: `entity.entityType must be one of: ${Object.keys(ENTITY_VALIDATORS).join(", ")}.`,
    };
  }

  return validator(entity);
}

export * from "./shared.js";
export * from "./community.js";
export * from "./belief.js";
export * from "./place.js";
export * from "./structure.js";
export * from "./story.js";
export * from "./music.js";
export * from "./proverb.js";
export * from "./historicalContext.js";
export * from "./media.js";
export * from "./source.js";
export * from "./relationship.js";
export * from "./consent.js";
