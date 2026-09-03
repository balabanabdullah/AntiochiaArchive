// Controlled vocabularies for the AntiochiaArchive v2 domain model.
// These are additive and independent from the v1 archive vocabularies in
// ../../dataModel.js. Extend these lists deliberately; do not repurpose an
// existing value for a new meaning.

export const LANGUAGES = Object.freeze(["tr", "en", "ar"]);

export const ENTITY_TYPES = Object.freeze([
  "community",
  "belief",
  "place",
  "structure",
  "story",
  "music",
  "proverb",
  "historicalContext",
  "media",
  "source",
]);

export const RELATIONSHIP_TYPES = Object.freeze([
  "associatedWith",
  "locatedIn",
  "hasBelief",
  "practicedBy",
  "hasSite",
  "narratedBy",
  "originatesFrom",
  "performedBy",
  "spokenIn",
  "documents",
  "depicts",
  "relatedTo",
]);

export const PUBLICATION_STATUS = Object.freeze([
  "draft",
  "inReview",
  "published",
  "archived",
]);

export const RIGHTS_STATUS = Object.freeze([
  "unknown",
  "pendingReview",
  "cleared",
  "restricted",
  "doNotPublish",
]);

// Distinguishes how a claim is known, separate from RIGHTS_STATUS (media
// rights) and PUBLICATION_STATUS (editorial workflow state).
export const EVIDENCE_TYPES = Object.freeze([
  "verifiedHistorical",
  "scholarlyInterpretation",
  "oralHistory",
  "localTradition",
  "religiousTradition",
  "legend",
  "mythologicalNarrative",
]);

// Controlled but extensible: add new categories here as verified oral
// histories require them, rather than accepting arbitrary free text.
export const STORY_CATEGORY_TYPES = Object.freeze([
  "mythological",
  "religious",
  "familyMemory",
  "neighborhoodMemory",
  "historicalMemory",
  "localLegend",
  "migration",
  "dailyLife",
]);

export const MEDIA_TYPES = Object.freeze([
  "image",
  "audio",
  "video",
  "document",
]);

export const MEDIA_ROLES = Object.freeze([
  "realArchiveMedia",
  "aiGeneratedIllustration",
]);

// Which storage backend actually holds the bytes at media.originalStoragePath
// (Section 35 — "DB stores storageDriver, storageKey, never an absolute local
// path as portable canonical metadata"). originalStoragePath already plays
// the "storageKey" role described there — an opaque, driver-relative key,
// never an OS absolute path — this field just records which driver resolves
// it. Optional and defaults to "local" at the repository layer (see
// backend/media/mediaStorage.js) so existing records need no backfill.
export const MEDIA_STORAGE_DRIVERS = Object.freeze(["local", "gcs", "s3"]);

// Mirrors the v1 SOURCE_TYPES list (dataModel.js) as an independent v2 copy
// so the two domains can evolve separately.
export const SOURCE_TYPES = Object.freeze([
  "book",
  "article",
  "archive",
  "oralHistory",
  "photograph",
  "institutionalRecord",
  "website",
  "other",
]);

// Editorial classification of a source's evidentiary weight — NOT a claim
// about the truth of the source's content (see source.js's
// qualityClassification field docs). Separate from SOURCE_TYPES (what kind
// of document it is) and from RIGHTS_STATUS (media reuse permission).
export const SOURCE_QUALITY_CLASSIFICATIONS = Object.freeze([
  "primary",
  "academic",
  "institutional",
  "localHistory",
  "oralHistory",
  "popular",
  "unverified",
]);
