// Transforms parsed research records (see researchParser.js) into the v2
// entity/relationship/source shape, applying an explicit, documented
// no-invention policy at every step. This module never validates against
// the real v2 schemas itself (buildImportPreview.js does that with the real
// validators) and never writes anything — it only transforms and reports.
//
// Core policy (see V2-ARCHITECTURE.md "Import preview workflow" for the
// full rationale):
//   1. A research field whose value is a known uncertainty sentinel
//      (UNKNOWN, NEEDS VERIFICATION, "NEEDS ...", NO RELIABLE SOURCE FOUND,
//      NOT YET RESEARCHED, UNRESOLVED) is never passed through as if it
//      were real content — it is omitted (per-language-key for multilingual
//      fields, per-element for arrays, or the whole field for scalars).
//   2. `status: "published"` from the research is never copied blindly —
//      it is kept only when every one of the entity's sourceIds is one of
//      the few identity-level-restored sources; otherwise it is downgraded
//      to "inReview". draft/inReview/archived are never upgraded.
//   3. storyRecordType "ORAL_HISTORY_LEAD" always forces status "draft",
//      independent of whatever status the research already assigned.
//   4. Fields with no current v2 schema equivalent (confidence, embedded
//      association arrays like associatedCommunities, etc.) are preserved
//      as unvalidated, non-public extension fields — never dropped
//      silently, never promoted to a public/schema field without a
//      documented decision (see FIELD_DECISIONS below and the generated
//      report's `fieldMappingTable`).

const SENTINEL_EXACT = new Set([
  "UNKNOWN",
  "NEEDS VERIFICATION",
  "NO RELIABLE SOURCE FOUND",
  "NOT YET RESEARCHED",
  "UNRESOLVED",
  "N/A",
  "NOT APPLICABLE",
]);

export function isSentinel(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return true;
  const upper = trimmed.toUpperCase();
  if (SENTINEL_EXACT.has(upper)) return true;
  if (upper.startsWith("NEEDS ")) return true;
  if (upper.startsWith("NO RELIABLE")) return true;
  if (upper.startsWith("NOT APPLICABLE")) return true;
  return false;
}

/** Drops sentinel-valued language keys from a {tr,en,ar} object; drops the whole field if nothing survives. */
export function cleanMultilingual(value) {
  if (!value || typeof value !== "object") return undefined;
  const cleaned = {};
  for (const [lang, text] of Object.entries(value)) {
    if (typeof text === "string" && !isSentinel(text) && text.trim()) cleaned[lang] = text;
  }
  return Object.keys(cleaned).length ? cleaned : undefined;
}

/** Wraps a single-language plain string into a {en: string} (or {tr:...}) multilingual container. */
export function wrapAsMultilingual(value, lang = "en") {
  if (typeof value !== "string" || isSentinel(value)) return undefined;
  return { [lang]: value };
}

/** Filters sentinel/empty elements out of a string array; returns undefined if nothing survives. */
export function cleanStringArray(value) {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value.filter((item) => typeof item === "string" && !isSentinel(item) && item.trim());
  return cleaned.length ? cleaned : undefined;
}

/** Research evidenceType is always a list; the v2 schema field is a single enum. Primary = first listed (research orders strongest-first). */
export function primaryEvidenceType(evidenceTypeList) {
  if (!Array.isArray(evidenceTypeList) || !evidenceTypeList.length) return undefined;
  const [first] = evidenceTypeList;
  return typeof first === "string" && !isSentinel(first) ? first : undefined;
}

/** research `period` is either a free string or a {start,end} object; v2 schema wants {label: multilingualText}. */
export function normalizePeriod(period) {
  if (typeof period === "string") {
    const label = wrapAsMultilingual(period, "en");
    return label ? { label } : undefined;
  }
  if (period && typeof period === "object") {
    const start = typeof period.start === "string" && !isSentinel(period.start) ? period.start : null;
    const end = typeof period.end === "string" && !isSentinel(period.end) ? period.end : null;
    const text = [start, end].filter(Boolean).join(" – ");
    const label = text ? wrapAsMultilingual(text, "en") : undefined;
    return label ? { label } : undefined;
  }
  return undefined;
}

// Fields kept as internal (unvalidated, non-public) extension data because
// they either have no current schema equivalent, or represent an embedded
// association that the architecture requires to be a relationship instead
// (see V2-ARCHITECTURE.md "Local editorial entity + relationship data
// infrastructure" for the "no embedded associations" rule). Preserved
// losslessly so a future editorial pass can convert them rather than
// re-researching from scratch; never exposed publicly because the
// allowlist-based serializer excludes anything not explicitly listed.
function withResearchExtensions(target, record, fields) {
  const extensions = {};
  for (const field of fields) {
    const value = record[field];
    if (value == null) continue;
    if (Array.isArray(value)) {
      const cleaned = value.filter((item) => !(typeof item === "string" && isSentinel(item)));
      if (cleaned.length) extensions[field] = cleaned;
    } else if (typeof value === "string") {
      if (!isSentinel(value)) extensions[field] = value;
    } else {
      extensions[field] = value;
    }
  }
  if (Object.keys(extensions).length) target.researchExtensions = extensions;
  return target;
}

function baseFields(record) {
  const out = { id: record.id, slug: record.slug, entityType: record.entityType };
  const title = cleanMultilingual(record.title);
  if (title) out.title = title;
  const summary = cleanMultilingual(record.summary);
  if (summary) out.summary = summary;
  const tags = cleanStringArray(record.tags);
  if (tags) out.tags = tags;
  const evidenceType = primaryEvidenceType(record.evidenceType);
  if (evidenceType) out.evidenceType = evidenceType;
  if (Array.isArray(record.evidenceType) && record.evidenceType.length > 1) {
    out.researchEvidenceTypes = record.evidenceType.filter((v) => typeof v === "string" && !isSentinel(v));
  }
  return out;
}

export function normalizeHistoricalContext(record) {
  const entity = baseFields(record);
  const period = normalizePeriod(record.period);
  if (period) entity.period = period;
  return withResearchExtensions(entity, record, [
    "confidence", "dates", "languages", "dialects", "urbanChanges", "populationCommunityChanges",
    "religiousCulturalChanges", "importantStructures", "sourceIds", "mediaIds", "editorialNotes",
    "unresolvedQuestions",
  ]);
}

export function normalizeCommunity(record) {
  const entity = baseFields(record);
  const period = normalizePeriod(record.period);
  if (period) entity.period = period;
  return withResearchExtensions(entity, record, [
    "confidence", "dates", "languages", "dialects", "settlementAreas", "beliefConnections",
    "culturalPractices", "sourceIds", "mediaIds", "editorialNotes", "unresolvedQuestions",
  ]);
}

export function normalizeBelief(record) {
  const entity = baseFields(record);
  const period = normalizePeriod(record.period);
  if (period) entity.period = period;
  return withResearchExtensions(entity, record, [
    "confidence", "dates", "languages", "dialects", "associatedCommunities", "rituals", "festivals",
    "sacredFigures", "associatedStructures", "musicTraditions", "sourceIds", "mediaIds",
    "editorialNotes", "unresolvedQuestions",
  ]);
}

export function normalizePlace(record) {
  const entity = baseFields(record);
  const officialName = wrapAsMultilingual(record.officialName, "tr");
  if (officialName) entity.officialName = officialName;
  const historicalNames = cleanStringArray(record.historicalNames);
  if (historicalNames) entity.historicalNames = historicalNames.map((name) => ({ name }));
  const localNames = cleanStringArray(record.localNames);
  if (localNames) entity.localNames = localNames.map((name) => ({ name }));
  const etymology = wrapAsMultilingual(record.etymology, "en");
  if (etymology) entity.etymology = etymology;
  // coordinates: schema requires {latitude:number, longitude:number}; every
  // research record carries a sentinel string here (see anomaly scan) — no
  // record has real numeric coordinates, so the field is always omitted
  // rather than passing the sentinel through (would fail schema validation
  // even if we tried).
  return withResearchExtensions(entity, record, [
    "confidence", "period", "associatedCommunities", "associatedBeliefs", "structures", "stories",
    "music", "sourceIds", "mediaIds", "editorialNotes", "unresolvedQuestions",
  ]);
}

export function normalizeStructure(record) {
  const entity = baseFields(record);
  if (typeof record.structureType === "string" && !isSentinel(record.structureType)) {
    entity.structureType = record.structureType;
  }
  return withResearchExtensions(entity, record, [
    "confidence", "period", "constructionAndPhases", "locatedIn", "associatedCommunities",
    "associatedBeliefs", "conservationStatus", "sourceIds", "mediaIds", "editorialNotes",
    "unresolvedQuestions",
  ]);
}

const STORY_CATEGORY_TYPES = new Set([
  "mythological", "religious", "familyMemory", "neighborhoodMemory", "historicalMemory", "localLegend",
  "migration", "dailyLife",
]);

export function normalizeStory(record) {
  const entity = baseFields(record);
  if (typeof record.category === "string" && STORY_CATEGORY_TYPES.has(record.category)) {
    entity.storyCategory = record.category;
  }
  const placeIds = cleanStringArray(record.placeIds);
  if (placeIds?.length) entity.storyPlaceId = placeIds[0];

  // storyRecordType is not a current schema field. It is kept verbatim
  // (normalized casing) as an internal-only marker — not on the public
  // `story` allowlist, so it can never leak — and is also the input to the
  // hard status-forcing rule in applyPublicationStatusPolicy() below, so an
  // oral-history lead's non-public status does not depend on the allowlist
  // alone.
  if (record.storyRecordType === "ORAL_HISTORY_LEAD") entity.storyRecordType = "oralHistoryLead";
  else if (record.storyRecordType === "publishedOralHistorySource") entity.storyRecordType = "publishedOralHistorySource";

  return withResearchExtensions(entity, record, [
    "confidence", "placeIds", "communityIds", "sourceIds", "mediaIds", "consentRequired", "rightsNote",
    "unresolvedQuestions",
  ]);
}

export function normalizeMusic(record) {
  const entity = baseFields(record);
  if (typeof record.genre === "string" && !isSentinel(record.genre)) entity.genre = record.genre;
  // subgenre is the literal sentinel "UNKNOWN" on every research record —
  // never passed through even though the schema would technically accept
  // the string "UNKNOWN" as valid (isNonEmptyString has no enum check).
  if (typeof record.subgenre === "string" && !isSentinel(record.subgenre)) entity.subgenre = record.subgenre;
  const arabicSpelling = typeof record.ArabicSpelling === "string" && !isSentinel(record.ArabicSpelling)
    ? record.ArabicSpelling : null;
  if (arabicSpelling) entity.alternateNames = { ar: [arabicSpelling] };
  return withResearchExtensions(entity, record, [
    "confidence", "localName", "transliteration", "associatedCommunities", "associatedPlaces",
    "performanceContext", "instruments", "sourceIds", "recordingLeads", "rightsStatus", "mediaIds",
    "unresolvedQuestions",
  ]);
}

const NORMALIZERS = Object.freeze({
  historicalContext: normalizeHistoricalContext,
  community: normalizeCommunity,
  belief: normalizeBelief,
  place: normalizePlace,
  structure: normalizeStructure,
  story: normalizeStory,
  music: normalizeMusic,
});

export function normalizeEntity(record) {
  const normalizer = NORMALIZERS[record.entityType];
  if (!normalizer) throw new Error(`No normalizer for entityType '${record.entityType}'.`);
  return normalizer(record);
}

// Sources that have been restored to at least identity level (title/type/
// year known, even if incompletely) by registry_recovery.txt. Every other
// referenced sourceId remains bibliographically unresolved. This exact set
// drives the publication-status downgrade rule below.
export const IDENTITY_RESOLVED_SOURCE_IDS = Object.freeze(["source-0030", "source-0046", "source-0056"]);

/**
 * Research `status: published` is never copied blindly (see module
 * docstring policy #2/#3). Returns the normalized status plus a boolean
 * `downgraded` flag for reporting.
 */
export function applyPublicationStatusPolicy(record, resolvedSourceIds = new Set(IDENTITY_RESOLVED_SOURCE_IDS)) {
  if (record.entityType === "story" && record.storyRecordType === "ORAL_HISTORY_LEAD") {
    return { status: "draft", downgraded: record.status !== "draft", reason: "oralHistoryLead" };
  }

  const status = record.status;
  if (status !== "published") return { status, downgraded: false, reason: null };

  const sourceIds = Array.isArray(record.sourceIds) ? record.sourceIds : [];
  const allResolved = sourceIds.length === 0 || sourceIds.every((id) => resolvedSourceIds.has(id));
  if (allResolved) return { status: "published", downgraded: false, reason: null };

  return { status: "inReview", downgraded: true, reason: "unresolvedSourceCitation" };
}

// --- Sources -----------------------------------------------------------

const SOURCE_TYPE_MAP = Object.freeze({
  academicArticle: "article",
  mediaArchiveCollection: "archive",
});

const SOURCE_TYPES = new Set([
  "book", "article", "archive", "oralHistory", "photograph", "institutionalRecord", "website", "other",
]);

/**
 * Normalizes one K. SOURCES record (or a registry_recovery restored-source
 * record, same shape) into the v2 `source` entity shape. Fields whose
 * research value is a sentinel, or whose type doesn't map unambiguously to
 * the controlled SOURCE_TYPES vocabulary, are omitted rather than guessed.
 */
export function normalizeSource(record) {
  const entity = { id: record.sourceId, entityType: "source" };

  const mappedType = SOURCE_TYPE_MAP[record.type] ?? (SOURCE_TYPES.has(record.type) ? record.type : undefined);
  if (mappedType) entity.type = mappedType;

  for (const field of ["title", "author", "publisher", "url", "locator", "accessedAt", "language"]) {
    const value = record[field];
    if (typeof value === "string" && !isSentinel(value)) entity[field] = value;
  }
  // publisher fallback: research sometimes only fills `institution`, not `publisher`.
  if (!entity.publisher && typeof record.institution === "string" && !isSentinel(record.institution)) {
    entity.publisher = record.institution;
  }
  // schema requires `year` to be a string if present; research gives a number for some records.
  if (record.year != null && !isSentinel(String(record.year))) entity.year = String(record.year);
  if (typeof record.note === "string" && record.note.trim()) entity.note = record.note;

  return withResearchExtensions(entity, record, [
    "editor", "journal", "volume", "issue", "pages", "doi", "isbn", "archiveCollection",
    "usedInResearchSections", "supportsEntityIds", "restorationStatus", "notes", "recoveredContext",
  ]);
}

// --- Media ---------------------------------------------------------------

const MEDIA_TYPE_MAP = Object.freeze({ historicalPhoto: "image", photo: "image" });
const MEDIA_RIGHTS_STATUS_MAP = Object.freeze({
  NEEDS_VERIFICATION: "pendingReview",
  RESTRICTED_NONCOMMERCIAL_NO_DERIVATIVES: "restricted",
});

/**
 * Normalizes one J. MEDIA ASSETS record into the v2 `media` entity shape.
 * `safeToPublish: false` is universal in this dataset (0 rights-cleared
 * recovered media) and is honored by mapping to a non-"cleared"
 * rightsStatus — never "cleared" for any record in this import.
 */
export function normalizeMedia(record) {
  const entity = {
    id: record.mediaId,
    entityType: "media",
    mediaType: MEDIA_TYPE_MAP[record.mediaType] ?? "image",
    mediaRole: "realArchiveMedia",
    aiGenerated: record.aiGenerated === true,
  };

  const rightsStatus = MEDIA_RIGHTS_STATUS_MAP[record.rightsStatus];
  entity.rightsStatus = rightsStatus ?? "pendingReview";

  for (const field of ["source", "author", "license"]) {
    const value = record[field] ?? (field === "source" ? record.institution : undefined);
    if (typeof value === "string" && !isSentinel(value)) entity[field] = value;
  }
  if (typeof record.rightsNote === "string" && record.rightsNote.trim()) entity.rightsNote = record.rightsNote.trim();

  return withResearchExtensions(entity, record, [
    "subjectEntityIds", "title", "creator", "institution", "collection", "date", "sourcePage",
    "directFileUrl", "publicDomain", "attributionRequired", "commercialUseAllowed", "derivativesAllowed",
    "shareAlike", "jurisdictionNote", "safeToPublish", "alt", "caption", "proposedFilename",
  ]);
}

// --- Relationships ---------------------------------------------------------

const RELATIONSHIP_TYPES = new Set([
  "associatedWith", "locatedIn", "hasBelief", "practicedBy", "hasSite", "narratedBy", "originatesFrom",
  "performedBy", "spokenIn", "documents", "depicts", "relatedTo",
]);

/**
 * Normalizes one L. RELATIONSHIPS record. `status` has no research
 * equivalent — every normalized relationship gets "inReview" explicitly
 * (never "published"), matching the same never-blindly-publish policy
 * applied to entities.
 */
export function normalizeRelationship(record) {
  if (!RELATIONSHIP_TYPES.has(record.type)) {
    throw new Error(`relationship '${record.relationshipId}' has an uncontrolled type '${record.type}'.`);
  }
  const relationship = {
    id: record.relationshipId,
    type: record.type,
    sourceId: record.sourceEntityId,
    sourceType: record.sourceType,
    targetId: record.targetEntityId,
    targetType: record.targetType,
    status: "inReview",
  };
  const evidenceSourceIds = cleanStringArray(record.evidenceSourceIds);
  if (evidenceSourceIds) relationship.evidenceSourceIds = evidenceSourceIds;
  if (typeof record.note === "string" && record.note.trim()) relationship.note = record.note.trim();
  return withResearchExtensions(relationship, record, ["confidence"]);
}
