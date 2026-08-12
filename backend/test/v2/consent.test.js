import test from "node:test";
import assert from "node:assert/strict";
import { validateConsentRecord } from "../../v2/schemas/consent.js";

test("valid consent record passes validation", () => {
  const consent = {
    consentStatus: "granted",
    displayNamePermission: true,
    audioPublicationPermission: false,
    transcriptPermission: true,
    photoPermission: false,
    anonymizationMode: "partial",
  };
  assert.deepEqual(validateConsentRecord(consent), { valid: true });
});

test("consent record requires a controlled consentStatus", () => {
  const result = validateConsentRecord({ consentStatus: "verbal-only" });
  assert.equal(result.valid, false);
  assert.match(result.error, /consentStatus must be one of/);
});

test("consent record rejects non-boolean permission fields", () => {
  const result = validateConsentRecord({ consentStatus: "granted", photoPermission: "yes" });
  assert.equal(result.valid, false);
  assert.match(result.error, /photoPermission must be a boolean/);
});
