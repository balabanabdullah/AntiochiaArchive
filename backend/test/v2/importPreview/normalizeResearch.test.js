// All fixtures here are synthetic/fictional (e.g. "hist-test-1",
// "comm-test-1") — never real research content.

import test from "node:test";
import assert from "node:assert/strict";
import {
  isSentinel, cleanMultilingual, cleanStringArray, normalizePeriod, primaryEvidenceType,
  applyPublicationStatusPolicy, normalizeHistoricalContext, normalizePlace, normalizeStory,
  normalizeMusic, normalizeSource, normalizeMedia, normalizeRelationship,
  IDENTITY_RESOLVED_SOURCE_IDS,
} from "../../../v2/importPreview/normalizeResearch.js";
import { validateEntity } from "../../../v2/schemas/index.js";
import { validateRelationship } from "../../../v2/schemas/relationship.js";

test("isSentinel recognizes known uncertainty markers and rejects real text", () => {
  for (const value of ["UNKNOWN", "NEEDS VERIFICATION", "needs translation review", "NOT YET RESEARCHED", "UNRESOLVED", "  ", ""]) {
    assert.equal(isSentinel(value), true, `expected sentinel: ${value}`);
  }
  for (const value of ["Habib-i Neccar Mosque", "2024", "Arabic"]) {
    assert.equal(isSentinel(value), false, `expected NOT sentinel: ${value}`);
  }
});

test("cleanMultilingual drops sentinel-valued languages but keeps real ones", () => {
  const result = cleanMultilingual({ tr: "Gerçek metin", en: "Real text", ar: "NEEDS VERIFICATION" });
  assert.deepEqual(result, { tr: "Gerçek metin", en: "Real text" });
});

test("cleanMultilingual returns undefined when every language is a sentinel", () => {
  assert.equal(cleanMultilingual({ en: "UNKNOWN", ar: "NEEDS VERIFICATION" }), undefined);
});

test("cleanStringArray filters sentinel/empty elements", () => {
  assert.deepEqual(cleanStringArray(["Real name", "NEEDS VERIFICATION", "", "Another real one"]), ["Real name", "Another real one"]);
  assert.equal(cleanStringArray(["UNKNOWN"]), undefined);
});

test("primaryEvidenceType takes the first listed (research orders strongest-first)", () => {
  assert.equal(primaryEvidenceType(["verifiedHistorical", "oralHistory"]), "verifiedHistorical");
  assert.equal(primaryEvidenceType([]), undefined);
  assert.equal(primaryEvidenceType(undefined), undefined);
});

test("normalizePeriod wraps a plain string into period.label.en", () => {
  assert.deepEqual(normalizePeriod("Hellenistic"), { label: { en: "Hellenistic" } });
});

test("normalizePeriod combines a {start,end} object into one label, dropping sentinel halves", () => {
  assert.deepEqual(normalizePeriod({ start: "UNKNOWN", end: "present" }), { label: { en: "present" } });
  assert.deepEqual(normalizePeriod({ start: "300 BCE", end: "present" }), { label: { en: "300 BCE – present" } });
});

test("applyPublicationStatusPolicy never upgrades draft/inReview/archived", () => {
  for (const status of ["draft", "inReview", "archived"]) {
    const result = applyPublicationStatusPolicy({ entityType: "place", status, sourceIds: [] });
    assert.equal(result.status, status);
    assert.equal(result.downgraded, false);
  }
});

test("applyPublicationStatusPolicy keeps 'published' only when every sourceId is identity-resolved", () => {
  const resolved = applyPublicationStatusPolicy({
    entityType: "music", status: "published", sourceIds: [IDENTITY_RESOLVED_SOURCE_IDS[0]],
  });
  assert.equal(resolved.status, "published");
  assert.equal(resolved.downgraded, false);

  const unresolved = applyPublicationStatusPolicy({
    entityType: "place", status: "published", sourceIds: ["source-9999"],
  });
  assert.equal(unresolved.status, "inReview");
  assert.equal(unresolved.downgraded, true);
  assert.equal(unresolved.reason, "unresolvedSourceCitation");
});

test("applyPublicationStatusPolicy always forces draft for an ORAL_HISTORY_LEAD, regardless of research status", () => {
  const result = applyPublicationStatusPolicy({
    entityType: "story", storyRecordType: "ORAL_HISTORY_LEAD", status: "inReview", sourceIds: [],
  });
  assert.equal(result.status, "draft");
  assert.equal(result.reason, "oralHistoryLead");
});

test("normalizeHistoricalContext strips sentinels and validates against the real schema", () => {
  const record = {
    id: "hist-test-1",
    slug: "test-historical-context",
    entityType: "historicalContext",
    status: "inReview",
    evidenceType: ["verifiedHistorical", "scholarlyInterpretation"],
    title: { tr: "Test Başlık", en: "Test Title", ar: "NEEDS VERIFICATION" },
    summary: { en: "Summary text." },
    period: "Test Period",
    tags: ["test-tag", "NEEDS VERIFICATION"],
    dates: { start: "UNKNOWN", end: "100 CE" },
  };
  const entity = normalizeHistoricalContext(record);
  entity.status = "inReview";

  assert.equal(entity.title.ar, undefined);
  assert.equal(entity.evidenceType, "verifiedHistorical");
  assert.deepEqual(entity.tags, ["test-tag"]);
  assert.deepEqual(entity.period, { label: { en: "Test Period" } });
  assert.equal(Object.hasOwn(entity, "dates"), false); // moved into researchExtensions, not top-level
  assert.deepEqual(entity.researchExtensions.dates, { start: "UNKNOWN", end: "100 CE" });

  assert.deepEqual(validateEntity(entity), { valid: true });
});

test("normalizePlace omits coordinates when the value is a sentinel and wraps historicalNames", () => {
  const record = {
    id: "place-test-1",
    slug: "test-place",
    entityType: "place",
    status: "inReview",
    evidenceType: ["verifiedHistorical"],
    title: { en: "Test Place" },
    officialName: "Test Official Name",
    coordinates: "NEEDS VERIFICATION",
    historicalNames: ["Old Name", "NEEDS VERIFICATION"],
  };
  const entity = normalizePlace(record);

  assert.equal(Object.hasOwn(entity, "coordinates"), false);
  assert.deepEqual(entity.officialName, { tr: "Test Official Name" });
  assert.deepEqual(entity.historicalNames, [{ name: "Old Name" }]);
  assert.deepEqual(validateEntity(entity), { valid: true });
});

test("normalizeStory maps a valid storyCategory directly and forces storyPlaceId from the first placeId", () => {
  const record = {
    id: "story-test-1",
    slug: "test-story",
    entityType: "story",
    status: "inReview",
    evidenceType: ["oralHistory"],
    title: { en: "Test Story" },
    category: "dailyLife",
    placeIds: ["place-test-1", "place-test-2"],
    storyRecordType: "publishedOralHistorySource",
  };
  const entity = normalizeStory(record);

  assert.equal(entity.storyCategory, "dailyLife");
  assert.equal(entity.storyPlaceId, "place-test-1");
  assert.equal(entity.storyRecordType, "publishedOralHistorySource");
  assert.deepEqual(entity.researchExtensions.placeIds, ["place-test-1", "place-test-2"]);
  assert.deepEqual(validateEntity(entity), { valid: true });
});

test("normalizeStory drops an uncontrolled category rather than failing validation", () => {
  const record = {
    id: "story-test-2", slug: "test-story-2", entityType: "story", status: "draft",
    evidenceType: ["oralHistory"], title: { en: "T" }, category: "notAControlledCategory",
  };
  const entity = normalizeStory(record);
  assert.equal(Object.hasOwn(entity, "storyCategory"), false);
  assert.deepEqual(validateEntity(entity), { valid: true });
});

test("normalizeMusic drops the universal 'UNKNOWN' subgenre sentinel and maps ArabicSpelling to alternateNames.ar", () => {
  const record = {
    id: "music-test-1", slug: "test-music", entityType: "music", status: "inReview",
    evidenceType: ["oralHistory"], title: { en: "T" }, genre: "test genre", subgenre: "UNKNOWN",
    ArabicSpelling: "اختبار",
  };
  const entity = normalizeMusic(record);
  assert.equal(Object.hasOwn(entity, "subgenre"), false);
  assert.deepEqual(entity.alternateNames, { ar: ["اختبار"] });
  assert.deepEqual(validateEntity(entity), { valid: true });
});

test("normalizeSource maps a controlled research `type` alias and stringifies a numeric year", () => {
  const record = {
    sourceId: "source-test-1", type: "academicArticle", title: "Test Article", year: 2024, language: "English",
  };
  const entity = normalizeSource(record);
  assert.equal(entity.type, "article");
  assert.equal(entity.year, "2024");
  assert.deepEqual(validateEntity(entity), { valid: true });
});

test("normalizeSource omits an uncontrolled research `type` rather than guessing", () => {
  const record = { sourceId: "source-test-2", type: "digitalMemoryProject", title: "Test Project" };
  const entity = normalizeSource(record);
  assert.equal(Object.hasOwn(entity, "type"), false);
  assert.deepEqual(validateEntity(entity), { valid: true });
});

test("normalizeMedia never maps to rightsStatus 'cleared' and maps historicalPhoto/photo to image", () => {
  const record = {
    mediaId: "media-test-1", mediaType: "historicalPhoto", rightsStatus: "NEEDS_VERIFICATION", safeToPublish: false,
  };
  const entity = normalizeMedia(record);
  assert.equal(entity.mediaType, "image");
  assert.equal(entity.rightsStatus, "pendingReview");
  assert.notEqual(entity.rightsStatus, "cleared");
  assert.deepEqual(validateEntity(entity), { valid: true });
});

test("normalizeMedia maps a restricted research rightsStatus to the schema's 'restricted'", () => {
  const record = {
    mediaId: "media-test-2", mediaType: "photo", rightsStatus: "RESTRICTED_NONCOMMERCIAL_NO_DERIVATIVES",
    license: "CC BY-NC-ND 4.0", safeToPublish: false,
  };
  const entity = normalizeMedia(record);
  assert.equal(entity.rightsStatus, "restricted");
  assert.equal(entity.license, "CC BY-NC-ND 4.0");
  assert.deepEqual(validateEntity(entity), { valid: true });
});

test("normalizeRelationship always assigns status 'inReview', never 'published'", () => {
  const record = {
    relationshipId: "relationship-test-1", sourceEntityId: "music-test-1", sourceType: "music",
    type: "associatedWith", targetEntityId: "comm-test-1", targetType: "community",
    evidenceSourceIds: ["source-test-1"],
  };
  const relationship = normalizeRelationship(record);
  assert.equal(relationship.status, "inReview");
  assert.deepEqual(validateRelationship(relationship), { valid: true });
});

test("normalizeRelationship rejects an uncontrolled relationship type", () => {
  const record = {
    relationshipId: "relationship-test-2", sourceEntityId: "a", sourceType: "music",
    type: "notAControlledType", targetEntityId: "b", targetType: "community",
  };
  assert.throws(() => normalizeRelationship(record), /uncontrolled type/);
});
