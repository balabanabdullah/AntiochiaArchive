// LOCAL DEVELOPMENT / EDITORIAL PREVIEW ONLY: loads and validates
// data/v2/legacyReplacements.json — the reviewed record of which mapped v1
// entities a canonical v2-native research entity is confirmed to supersede.
// This file is migration/identity-control metadata, not cultural content: it
// starts populated only with human-reviewed decisions already recorded in
// tmp/v2-import-preview/legacy-reconciliation.json's `supersededByCanonical`
// entries (see V2-ARCHITECTURE.md "Legacy replacement layer").
//
// A replacement entry never suppresses anything by itself. Suppression only
// happens when its canonicalNativeEntityId is actually present among the
// loaded native v2 entities (see classifyLegacyReplacements below) — before
// that, the mapping is merely "pending" and the legacy mapped record stays
// fully visible. This lets the replacement map be authored and reviewed
// ahead of the canonical entity's own promotion, without ever making v2
// content disappear early.
//
// Pure and read-only: never writes data/v2/legacyReplacements.json, never
// contacts Firestore or Cloud Storage.

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Deliberately stricter than the general v2 entity schemas (see
// backend/v2/schemas/*.js, which validate known fields but do not reject
// unlisted extra ones): this file is small, hand-curated identity-control
// metadata, not bulk cultural content, so an unknown field is far more
// likely to be an authoring mistake worth catching immediately than a
// forward-compatible extension.
const KNOWN_REPLACEMENT_FIELDS = Object.freeze(["legacyMappedEntityId", "canonicalNativeEntityId", "reason"]);

// Matches every canonical research id format actually in use (structure-0001,
// belief-0007, place-0003, music-0011, story-0001, comm-0001, hist-0001):
// lowercase-letter prefix, hyphen, 4+ digits. Deliberately does not attempt
// to verify the id refers to a real, existing research record — that is
// exactly what "pending vs active" classification is for.
const CANONICAL_ID_PATTERN = /^[a-z]+-\d{4,}$/;

export function getLegacyReplacementsFilePath() {
  return process.env.V2_LEGACY_REPLACEMENTS_JSON_PATH
    ? path.resolve(process.env.V2_LEGACY_REPLACEMENTS_JSON_PATH)
    : path.resolve(__dirname, "../../../data/v2/legacyReplacements.json");
}

async function readJsonFile(filePath) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `V2 legacy replacements file is missing at '${filePath}'. A committed file (even if empty, `
        + '{ "replacements": [] }) is expected there — this looks like a configuration or repository problem, '
        + "not an empty dataset. See V2-ARCHITECTURE.md \"Legacy replacement layer\".",
      );
    }
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`V2 legacy replacements file at '${filePath}' is not valid JSON: ${error.message}`);
  }
}

/** Validates one replacement entry's shape in isolation (no cross-entry or set-membership checks). */
function validateReplacementShape(entry, index) {
  const fieldPath = `legacyReplacements.replacements[${index}]`;

  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return `${fieldPath} must be an object.`;
  }

  const unknownFields = Object.keys(entry).filter((key) => !KNOWN_REPLACEMENT_FIELDS.includes(key));
  if (unknownFields.length) {
    return `${fieldPath} has unknown field(s): ${unknownFields.join(", ")}. `
      + `Only ${KNOWN_REPLACEMENT_FIELDS.join(", ")} are accepted.`;
  }

  if (typeof entry.legacyMappedEntityId !== "string" || !entry.legacyMappedEntityId.trim()) {
    return `${fieldPath}.legacyMappedEntityId is required and must be a non-empty string.`;
  }

  if (typeof entry.canonicalNativeEntityId !== "string" || !CANONICAL_ID_PATTERN.test(entry.canonicalNativeEntityId)) {
    return `${fieldPath}.canonicalNativeEntityId must be a valid canonical research id `
      + "(lowercase-letter prefix, hyphen, 4+ digits — e.g. 'structure-0001').";
  }

  if (entry.legacyMappedEntityId === entry.canonicalNativeEntityId) {
    return `${fieldPath}: legacyMappedEntityId must not equal canonicalNativeEntityId (self-replacement).`;
  }

  // Mandatory and non-empty precisely because it is what makes a many-to-one
  // mapping (two legacy ids superseded by the same canonical id, e.g. the
  // St. Pierre structure+belief merge) a *documented* decision rather than an
  // accidental duplicate — see the shared reason text in
  // data/v2/legacyReplacements.json for that exact case.
  if (typeof entry.reason !== "string" || !entry.reason.trim()) {
    return `${fieldPath}.reason is required and must be a non-empty string documenting the reviewed evidence.`;
  }

  return null;
}

/**
 * Loads, shape-validates, and cross-validates data/v2/legacyReplacements.json
 * (or an injected filePath). `mappedEntities` is the real 23-record mapped
 * v1 baseline (see mapAndValidateArchive) — every legacyMappedEntityId must
 * reference one of those ids. Throws on the first problem found (malformed
 * shape, unknown field, duplicate legacyMappedEntityId, unknown legacy id) —
 * this is small, human-reviewed metadata, so it fails loudly exactly like
 * loadNativeEntities/loadNativeRelationships, never silently drops or skips
 * an entry.
 *
 * Duplicate canonicalNativeEntityId values (many-to-one) are allowed without
 * a separate flag: `reason` is mandatory on every entry, so any duplicate
 * target is inherently documented by construction.
 */
export async function loadLegacyReplacements({
  filePath = getLegacyReplacementsFilePath(),
  mappedEntities = [],
} = {}) {
  const parsed = await readJsonFile(filePath);
  if (!parsed || !Array.isArray(parsed.replacements)) {
    throw new Error(`V2 legacy replacements file at '${filePath}' must be a JSON object with a 'replacements' array.`);
  }

  const mappedIds = new Set(mappedEntities.map((entity) => entity.id));
  const seenLegacyIds = new Set();
  const replacements = [];

  for (const [index, entry] of parsed.replacements.entries()) {
    const shapeError = validateReplacementShape(entry, index);
    if (shapeError) throw new Error(shapeError);

    if (seenLegacyIds.has(entry.legacyMappedEntityId)) {
      throw new Error(
        `legacyReplacements.replacements[${index}]: legacyMappedEntityId '${entry.legacyMappedEntityId}' is `
        + "listed more than once. A legacy mapped record can be superseded by exactly one canonical entity — "
        + "two different replacement targets for the same legacy id is a contradiction, not a valid mapping.",
      );
    }
    seenLegacyIds.add(entry.legacyMappedEntityId);

    if (!mappedIds.has(entry.legacyMappedEntityId)) {
      throw new Error(
        `legacyReplacements.replacements[${index}]: legacyMappedEntityId '${entry.legacyMappedEntityId}' does `
        + "not exist in the mapped v1 baseline (the 23 records mapped from data/archive.json). Only a real "
        + "mapped v1 entity may be listed as superseded.",
      );
    }

    replacements.push({ ...entry });
  }

  return replacements;
}

/**
 * Splits validated replacement entries into active / pending against the
 * currently loaded native v2 entity set (data/v2/entities.json today —
 * empty until real cultural-data promotion, so every entry classifies as
 * pending until then).
 *
 *   ACTIVE:  canonicalNativeEntityId is present in nativeEntities — the
 *            legacy mapped record must be suppressed from the merged v2 view.
 *   PENDING: mapping is valid but the canonical target has not been
 *            promoted yet — the legacy mapped record stays fully visible.
 *
 * This function never throws: everything passed in has already been
 * validated by loadLegacyReplacements. It performs no suppression itself —
 * callers use `activeLegacyIdsToSuppress` to filter the merged entity set.
 */
export function classifyLegacyReplacements(replacements, nativeEntities) {
  const nativeIds = new Set(nativeEntities.map((entity) => entity.id));
  const active = [];
  const pending = [];

  for (const entry of replacements) {
    if (nativeIds.has(entry.canonicalNativeEntityId)) active.push(entry);
    else pending.push(entry);
  }

  return {
    active,
    pending,
    activeLegacyIdsToSuppress: new Set(active.map((entry) => entry.legacyMappedEntityId)),
  };
}
