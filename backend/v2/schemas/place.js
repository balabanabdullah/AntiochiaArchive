import { LANGUAGES } from "../constants/vocabularies.js";
import {
  isNonEmptyString,
  isObject,
  validateBaseEntity,
  validateEnum,
  validateMultilingualText,
} from "./shared.js";

export const PLACE_ENTITY_TYPE = "place";

function validateLocalName(value, fieldPath) {
  if (!isObject(value)) return `${fieldPath} must be an object.`;

  if (value.language != null) {
    const error = validateEnum(value.language, `${fieldPath}.language`, LANGUAGES);
    if (error) return error;
  }

  if (value.script != null && typeof value.script !== "string") {
    return `${fieldPath}.script must be a string.`;
  }

  if (!isNonEmptyString(value.name)) {
    return `${fieldPath}.name is required and must be a non-empty string.`;
  }

  if (value.transliteration != null && typeof value.transliteration !== "string") {
    return `${fieldPath}.transliteration must be a string.`;
  }

  if (value.dialect != null && typeof value.dialect !== "string") {
    return `${fieldPath}.dialect must be a string.`;
  }

  return null;
}

function validateLocalNameArray(value, fieldPath) {
  if (value == null) return null;
  if (!Array.isArray(value)) return `${fieldPath} must be an array.`;
  for (const [index, item] of value.entries()) {
    const error = validateLocalName(item, `${fieldPath}[${index}]`);
    if (error) return error;
  }
  return null;
}

function validateCoordinates(value, fieldPath) {
  if (value == null) return null;
  if (!isObject(value)) return `${fieldPath} must be an object.`;
  if (typeof value.latitude !== "number" || value.latitude < -90 || value.latitude > 90) {
    return `${fieldPath}.latitude must be a number between -90 and 90.`;
  }
  if (typeof value.longitude !== "number" || value.longitude < -180 || value.longitude > 180) {
    return `${fieldPath}.longitude must be a number between -180 and 180.`;
  }
  return null;
}

// No actual place names or coordinates are seeded anywhere in this module;
// this is validation only, applied to future verified records.
export function validatePlace(entity) {
  const baseError = validateBaseEntity(entity, PLACE_ENTITY_TYPE, "place");
  if (baseError) return { valid: false, error: baseError };

  const officialNameError = validateMultilingualText(entity.officialName, "place.officialName");
  if (officialNameError) return { valid: false, error: officialNameError };

  const localNamesError = validateLocalNameArray(entity.localNames, "place.localNames");
  if (localNamesError) return { valid: false, error: localNamesError };

  const historicalNamesError = validateLocalNameArray(entity.historicalNames, "place.historicalNames");
  if (historicalNamesError) return { valid: false, error: historicalNamesError };

  const etymologyError = validateMultilingualText(entity.etymology, "place.etymology");
  if (etymologyError) return { valid: false, error: etymologyError };

  const coordinatesError = validateCoordinates(entity.coordinates, "place.coordinates");
  if (coordinatesError) return { valid: false, error: coordinatesError };

  return { valid: true };
}
