// Pure, in-memory v1 -> v2 mapping. This module never reads or writes any
// file, Firestore document, or Cloud Storage object — it only transforms an
// already-loaded v1 archive object (see ../../scripts/migrate-v1-to-v2.js
// for the CLI that loads data/archive.json and drives this).
//
// Category mapping is deliberately conservative (see V2-ARCHITECTURE.md
// "V1 category mapping" for the full rationale):
//   history    -> historicalContext
//   stories    -> story
//   structures -> structure
//   beliefs    -> structure   (NOT belief — see mapBeliefSiteRecord below)
//   music      -> music
//   gallery    -> media

import { LANGUAGES } from "../constants/vocabularies.js";

export const CATEGORY_TARGET_TYPE = Object.freeze({
  history: "historicalContext",
  stories: "story",
  structures: "structure",
  beliefs: "structure",
  music: "music",
  gallery: "media",
});

function populatedLanguages(multilingualText) {
  if (!multilingualText || typeof multilingualText !== "object") return undefined;
  const languages = LANGUAGES.filter((language) => {
    const value = multilingualText[language];
    return typeof value === "string" && value.trim().length > 0;
  });
  return languages.length ? languages : undefined;
}

// A single preservation-focused preview of the record's existing image/src
// and imageMetadata. This travels on the mapped entity as a migration
// preview field (see "media" below) — it is not itself validated by any v2
// entity schema, and it is never written anywhere.
function mapMediaPreview(record) {
  const path = record.image ?? record.src ?? null;
  const metadata = record.imageMetadata || null;
  return [{
    path: path || null,
    isPlaceholder: !path,
    alt: metadata?.alt,
    caption: metadata?.caption,
    source: metadata?.source,
    author: metadata?.author,
    license: metadata?.license,
    date: metadata?.date,
    originalUrl: metadata?.originalUrl,
    accessedAt: metadata?.accessedAt,
    rightsNote: metadata?.rightsNote,
    aiGenerated: metadata?.aiGenerated ?? false,
  }];
}

// Migration provenance + preserved-but-not-yet-schema-validated preview
// data, attached to every mapped entity. `validateEntity` (schemas/index.js)
// only checks fields it knows about, so these extra keys never affect
// validation — they exist purely for the dry-run report and future editorial
// review, and must never be exposed by a public API serializer (see
// ../serializers/publicSerializer.js, which is allowlist-based and already
// excludes them by omission).
function migrationProvenance(record, sourceCategory) {
  return {
    sourceVersion: "v1.0",
    sourceCategory,
    sourceRecordId: record.id,
    slug: record.slug,
    media: mapMediaPreview(record),
    sources: Array.isArray(record.sources) ? record.sources : [],
  };
}

function mapHistoryRecord(record) {
  return {
    id: record.id,
    slug: record.slug,
    entityType: "historicalContext",
    status: "published",
    title: record.title,
    summary: record.body,
    languages: populatedLanguages(record.title),
    tags: record.categoryKey ? [record.categoryKey] : undefined,
    period: record.era ? { label: record.era } : undefined,
    ...migrationProvenance(record, "history"),
  };
}

function mapStoryRecord(record) {
  return {
    id: record.id,
    slug: record.slug,
    entityType: "story",
    status: "published",
    title: record.title,
    summary: record.body,
    languages: populatedLanguages(record.title),
    tags: record.categoryKey ? [record.categoryKey] : undefined,
    // storyCategory is intentionally left unset: v1 stories carry no
    // sub-classification field, and guessing one would be inventing
    // editorial data rather than migrating it. A future editorial pass, not
    // this dry run, should assign a controlled storyCategory value.
    ...migrationProvenance(record, "stories"),
  };
}

function mapStructureRecord(record) {
  return {
    id: record.id,
    slug: record.slug,
    entityType: "structure",
    status: "published",
    title: record.title,
    summary: record.desc,
    languages: populatedLanguages(record.title),
    tags: record.categoryKey ? [record.categoryKey] : undefined,
    structureType: record.categoryKey || undefined,
    ...migrationProvenance(record, "structures"),
  };
}

// v1's "beliefs" category holds individual sites (a shrine, a specific
// church, a specific synagogue) — not broad belief traditions. Mapping these
// to entityType "structure" (never "belief") is a deliberate correctness
// rule, not an oversight: see V2-ARCHITECTURE.md "Belief-site handling".
function mapBeliefSiteRecord(record) {
  const tags = [record.categoryKey, "beliefSite", "migratedFromV1Beliefs"].filter(Boolean);
  return {
    id: record.id,
    slug: record.slug,
    entityType: "structure",
    status: "published",
    title: record.title,
    summary: record.desc,
    languages: populatedLanguages(record.title),
    tags,
    structureType: record.categoryKey || undefined,
    migrationNote:
      "Originally a v1 'beliefs' category record representing an individual site (shrine, church, or "
      + "synagogue), not a broad belief tradition. Mapped to entityType 'structure' per the v2 "
      + "community/belief separation rule — it must not become entityType 'belief'. A future, separately "
      + "reviewed belief-tradition entity (e.g. a specific faith or living tradition) should relate to this "
      + "structure via a 'hasSite' relationship record once authored, never by re-typing this record.",
    ...migrationProvenance(record, "beliefs"),
  };
}

function mapMusicRecord(record) {
  return {
    id: record.id,
    slug: record.slug,
    entityType: "music",
    status: "published",
    title: record.title,
    summary: record.desc,
    languages: populatedLanguages(record.title),
    tags: record.categoryKey ? [record.categoryKey] : undefined,
    genre: record.categoryKey || undefined,
    ...migrationProvenance(record, "music"),
  };
}

// Gallery entries are media/presentation records, not a new cultural entity.
// The mapped entity intentionally does not synthesize a structure/story from
// what the image depicts — that would be inventing an entity from a photo,
// not migrating one. Any apparent depiction of an existing record is left to
// ../migration/detectRelatedRecords.js to flag for editorial review only.
function mapGalleryRecord(record) {
  const metadata = record.imageMetadata || null;
  return {
    id: record.id,
    entityType: "media",
    mediaType: "image",
    mediaRole: metadata?.aiGenerated ? "aiGeneratedIllustration" : "realArchiveMedia",
    derivativeStoragePaths: record.src ? [record.src] : [],
    source: metadata?.source,
    author: metadata?.author,
    license: metadata?.license,
    // "cleared" reflects that this record already carries reviewed license
    // metadata in v1 (see MEDIA-PROVENANCE.md's existing review workflow),
    // not a new rights determination made by this migration tool.
    rightsStatus: metadata?.license ? "cleared" : "unknown",
    rightsNote: metadata?.rightsNote,
    aiGenerated: metadata?.aiGenerated ?? false,
    // Preserved v1 cultural content. These are not yet part of the core
    // media schema's public allowlist (see V2-ARCHITECTURE.md "Gallery/media
    // mapping") — they exist here as migration-preview fields only.
    title: record.title,
    caption: record.caption,
    category: record.category,
    ...migrationProvenance(record, "gallery"),
  };
}

const CATEGORY_MAPPERS = Object.freeze({
  history: mapHistoryRecord,
  stories: mapStoryRecord,
  structures: mapStructureRecord,
  beliefs: mapBeliefSiteRecord,
  music: mapMusicRecord,
  gallery: mapGalleryRecord,
});

export function mapV1RecordToV2Entity(record, sourceCategory) {
  const mapper = CATEGORY_MAPPERS[sourceCategory];
  if (!mapper) throw new Error(`No v1 -> v2 mapping is defined for category '${sourceCategory}'.`);
  return mapper(record);
}

/**
 * Maps every record in a v1 archive object into a proposed v2 entity, in
 * memory only. Never mutates `archive`. Returns one entry per v1 record —
 * this dry run produces exactly one v2 entity per v1 record, never more,
 * never fewer, and never a fabricated additional entity.
 */
export function mapV1ArchiveToV2Entities(archive) {
  const mapped = [];
  for (const [category, targetType] of Object.entries(CATEGORY_TARGET_TYPE)) {
    const records = Array.isArray(archive[category]) ? archive[category] : [];
    for (const record of records) {
      mapped.push({ record, entity: mapV1RecordToV2Entity(record, category), targetType });
    }
  }
  return mapped;
}
