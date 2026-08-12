import { EVIDENCE_TYPES } from "../constants/vocabularies.js";
import { isObject, validateBaseEntity, validateEnum, validateMultilingualText } from "./shared.js";

export const HISTORICAL_CONTEXT_ENTITY_TYPE = "historicalContext";

export function validateHistoricalContext(entity) {
  const baseError = validateBaseEntity(entity, HISTORICAL_CONTEXT_ENTITY_TYPE, "historicalContext");
  if (baseError) return { valid: false, error: baseError };

  const evidenceError = validateEnum(entity.evidenceType, "historicalContext.evidenceType", EVIDENCE_TYPES);
  if (evidenceError) return { valid: false, error: evidenceError };

  if (entity.period != null) {
    if (!isObject(entity.period)) return { valid: false, error: "historicalContext.period must be an object." };
    const labelError = validateMultilingualText(entity.period.label, "historicalContext.period.label");
    if (labelError) return { valid: false, error: labelError };
  }

  return { valid: true };
}
