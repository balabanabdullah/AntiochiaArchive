import { LANGUAGES } from "../constants/vocabularies.js";
import {
  isNonEmptyString,
  validateBaseEntity,
  validateEnum,
  validateIdArray,
  validateMultilingualText,
} from "./shared.js";

export const PROVERB_ENTITY_TYPE = "proverb";

export function validateProverb(entity) {
  const baseError = validateBaseEntity(entity, PROVERB_ENTITY_TYPE, "proverb");
  if (baseError) return { valid: false, error: baseError };

  if (!isNonEmptyString(entity.originalText)) {
    return { valid: false, error: "proverb.originalText is required and must be a non-empty string." };
  }

  if (entity.language != null) {
    const error = validateEnum(entity.language, "proverb.language", LANGUAGES);
    if (error) return { valid: false, error };
  }

  if (entity.dialect != null && typeof entity.dialect !== "string") {
    return { valid: false, error: "proverb.dialect must be a string." };
  }

  if (entity.transliteration != null && typeof entity.transliteration !== "string") {
    return { valid: false, error: "proverb.transliteration must be a string." };
  }

  for (const [field, label] of [
    ["literalMeaning", "proverb.literalMeaning"],
    ["culturalMeaning", "proverb.culturalMeaning"],
    ["translations", "proverb.translations"],
    ["usageContext", "proverb.usageContext"],
    ["example", "proverb.example"],
  ]) {
    const error = validateMultilingualText(entity[field], label);
    if (error) return { valid: false, error };
  }

  const audioError = validateIdArray(entity.audioMediaIds, "proverb.audioMediaIds");
  if (audioError) return { valid: false, error: audioError };

  if (entity.speakerRef != null && !isNonEmptyString(entity.speakerRef)) {
    return { valid: false, error: "proverb.speakerRef must be a non-empty string reference." };
  }

  const sourceIdsError = validateIdArray(entity.sourceIds, "proverb.sourceIds");
  if (sourceIdsError) return { valid: false, error: sourceIdsError };

  return { valid: true };
}
