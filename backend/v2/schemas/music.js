import { LANGUAGES } from "../constants/vocabularies.js";
import {
  isNonEmptyString,
  validateBaseEntity,
  validateEnum,
  validateIdArray,
  validateMultilingualText,
} from "./shared.js";

export const MUSIC_ENTITY_TYPE = "music";

// genre/subgenre are intentionally free-form strings: this schema does not
// hardcode a taxonomy such as Mawal/Ataba/Fann as the complete set of
// values. Those remain documentation examples only.
export function validateMusic(entity) {
  const baseError = validateBaseEntity(entity, MUSIC_ENTITY_TYPE, "music");
  if (baseError) return { valid: false, error: baseError };

  if (entity.genre != null && !isNonEmptyString(entity.genre)) {
    return { valid: false, error: "music.genre must be a non-empty string." };
  }

  if (entity.subgenre != null && typeof entity.subgenre !== "string") {
    return { valid: false, error: "music.subgenre must be a string." };
  }

  if (entity.performerRef != null && !isNonEmptyString(entity.performerRef)) {
    return { valid: false, error: "music.performerRef must be a non-empty string reference." };
  }

  if (entity.originalLanguage != null) {
    const error = validateEnum(entity.originalLanguage, "music.originalLanguage", LANGUAGES);
    if (error) return { valid: false, error };
  }

  if (entity.dialect != null && typeof entity.dialect !== "string") {
    return { valid: false, error: "music.dialect must be a string." };
  }

  const lyricsError = validateMultilingualText(entity.lyrics, "music.lyrics");
  if (lyricsError) return { valid: false, error: lyricsError };

  const transcriptError = validateMultilingualText(entity.transcript, "music.transcript");
  if (transcriptError) return { valid: false, error: transcriptError };

  const translationsError = validateMultilingualText(entity.translations, "music.translations");
  if (translationsError) return { valid: false, error: translationsError };

  const audioError = validateIdArray(entity.audioMediaIds, "music.audioMediaIds");
  if (audioError) return { valid: false, error: audioError };

  const sourceIdsError = validateIdArray(entity.sourceIds, "music.sourceIds");
  if (sourceIdsError) return { valid: false, error: sourceIdsError };

  return { valid: true };
}
