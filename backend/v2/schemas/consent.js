import { isObject, validateEnum } from "./shared.js";

// Private schema. Consent records must never be included in a public
// serializer output (see ../serializers/publicSerializer.js) — only an
// opaque reference id (e.g. story.consentRef) may travel with a public
// entity, never this record itself.

export const CONSENT_STATUS = Object.freeze(["pending", "granted", "denied", "withdrawn"]);
export const ANONYMIZATION_MODES = Object.freeze(["none", "partial", "full"]);

export function validateConsentRecord(consent) {
  if (!isObject(consent)) return { valid: false, error: "consent record must be an object." };

  const statusError = validateEnum(consent.consentStatus, "consent.consentStatus", CONSENT_STATUS, { required: true });
  if (statusError) return { valid: false, error: statusError };

  for (const field of [
    "displayNamePermission",
    "audioPublicationPermission",
    "transcriptPermission",
    "photoPermission",
  ]) {
    if (consent[field] != null && typeof consent[field] !== "boolean") {
      return { valid: false, error: `consent.${field} must be a boolean.` };
    }
  }

  const anonymizationError = validateEnum(consent.anonymizationMode, "consent.anonymizationMode", ANONYMIZATION_MODES);
  if (anonymizationError) return { valid: false, error: anonymizationError };

  return { valid: true };
}
