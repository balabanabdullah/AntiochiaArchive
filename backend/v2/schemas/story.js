import { EVIDENCE_TYPES, LANGUAGES, STORY_CATEGORY_TYPES } from "../constants/vocabularies.js";
import {
  isNonEmptyString,
  isObject,
  validateBaseEntity,
  validateEnum,
  validateIdArray,
  validateIsoDateString,
  validateMultilingualText,
  validateStringArray,
} from "./shared.js";

export const STORY_ENTITY_TYPE = "story";

export function validateStory(entity) {
  const baseError = validateBaseEntity(entity, STORY_ENTITY_TYPE, "story");
  if (baseError) return { valid: false, error: baseError };

  const categoryError = validateEnum(entity.storyCategory, "story.storyCategory", STORY_CATEGORY_TYPES);
  if (categoryError) return { valid: false, error: categoryError };

  const themesError = validateStringArray(entity.themes, "story.themes");
  if (themesError) return { valid: false, error: themesError };

  if (entity.narratorRef != null && !isNonEmptyString(entity.narratorRef)) {
    return { valid: false, error: "story.narratorRef must be a non-empty string reference." };
  }

  if (entity.originalLanguage != null) {
    const error = validateEnum(entity.originalLanguage, "story.originalLanguage", LANGUAGES);
    if (error) return { valid: false, error };
  }

  if (entity.dialect != null && typeof entity.dialect !== "string") {
    return { valid: false, error: "story.dialect must be a string." };
  }

  if (entity.storyPlaceId != null && !isNonEmptyString(entity.storyPlaceId)) {
    return { valid: false, error: "story.storyPlaceId must be a non-empty string reference." };
  }

  if (entity.period != null) {
    if (!isObject(entity.period)) return { valid: false, error: "story.period must be an object." };
    const labelError = validateMultilingualText(entity.period.label, "story.period.label");
    if (labelError) return { valid: false, error: labelError };
  }

  const recordingDateError = validateIsoDateString(entity.recordingDate, "story.recordingDate");
  if (recordingDateError) return { valid: false, error: recordingDateError };

  const transcriptError = validateMultilingualText(entity.transcript, "story.transcript");
  if (transcriptError) return { valid: false, error: transcriptError };

  const translationsError = validateMultilingualText(entity.translations, "story.translations");
  if (translationsError) return { valid: false, error: translationsError };

  const audioError = validateIdArray(entity.audioMediaIds, "story.audioMediaIds");
  if (audioError) return { valid: false, error: audioError };

  const illustrationError = validateIdArray(entity.illustrationMediaIds, "story.illustrationMediaIds");
  if (illustrationError) return { valid: false, error: illustrationError };

  // consentRef only points at a private consent record (see consent.js); the
  // record itself must never travel with the public story document.
  if (entity.consentRef != null && !isNonEmptyString(entity.consentRef)) {
    return { valid: false, error: "story.consentRef must be a non-empty string reference." };
  }

  const evidenceError = validateEnum(entity.evidenceType, "story.evidenceType", EVIDENCE_TYPES);
  if (evidenceError) return { valid: false, error: evidenceError };

  return { valid: true };
}
