// Explicit allowlist serialization: only fields listed here can ever reach a
// public v2 API response. Anything not listed — private consent data,
// editorial notes, contributor reference ids (narratorRef/speakerRef/
// performerRef/consentRef), moderation-only fields, admin metadata,
// credentials, or storage internals (originalStoragePath, checksum) — is
// silently dropped rather than needing to be individually denylisted.

const BASE_PUBLIC_FIELDS = Object.freeze([
  "id",
  "slug",
  "entityType",
  "status",
  "title",
  "summary",
  "alternateNames",
  "languages",
  "tags",
  "createdAt",
  "updatedAt",
]);

const PUBLIC_FIELDS_BY_TYPE = Object.freeze({
  community: [...BASE_PUBLIC_FIELDS, "evidenceType"],
  belief: [...BASE_PUBLIC_FIELDS, "evidenceType"],
  place: [
    ...BASE_PUBLIC_FIELDS,
    "officialName",
    "localNames",
    "historicalNames",
    "etymology",
    "coordinates",
  ],
  structure: [...BASE_PUBLIC_FIELDS, "structureType", "mediaIds", "sourceIds"],
  story: [
    ...BASE_PUBLIC_FIELDS,
    "storyCategory",
    "themes",
    "originalLanguage",
    "dialect",
    "storyPlaceId",
    "period",
    "recordingDate",
    "transcript",
    "translations",
    "audioMediaIds",
    "illustrationMediaIds",
    "evidenceType",
  ],
  music: [
    ...BASE_PUBLIC_FIELDS,
    "genre",
    "subgenre",
    "originalLanguage",
    "dialect",
    "lyrics",
    "transcript",
    "translations",
    "audioMediaIds",
    "sourceIds",
  ],
  proverb: [
    ...BASE_PUBLIC_FIELDS,
    "originalText",
    "language",
    "dialect",
    "transliteration",
    "literalMeaning",
    "culturalMeaning",
    "translations",
    "usageContext",
    "example",
    "audioMediaIds",
    "sourceIds",
  ],
  historicalContext: [...BASE_PUBLIC_FIELDS, "period", "evidenceType"],
  media: [
    "id",
    "entityType",
    "mediaType",
    "mediaRole",
    "derivativeStoragePaths",
    "mimeType",
    "size",
    "duration",
    "width",
    "height",
    "source",
    "author",
    "license",
    "rightsStatus",
    "rightsNote",
    "aiGenerated",
    "createdAt",
  ],
  source: [
    "id",
    "entityType",
    "type",
    "title",
    "author",
    "publisher",
    "year",
    "url",
    "locator",
    "accessedAt",
    "language",
    "rights",
    "note",
  ],
});

const PUBLIC_RELATIONSHIP_FIELDS = Object.freeze([
  "id",
  "type",
  "sourceId",
  "sourceType",
  "targetId",
  "targetType",
  "evidenceSourceIds",
  "note",
  "status",
]);

function pickAllowlisted(entity, allowlist) {
  const output = {};
  for (const field of allowlist) {
    if (Object.hasOwn(entity, field)) output[field] = entity[field];
  }
  return output;
}

// Entity types that may carry a single associated image via the migration
// mapper's internal `media` preview array (see
// ../migration/v1ToV2Mapping.js#migrationProvenance). That raw preview array
// itself is migration-internal (it also carries an `isPlaceholder` flag and
// v1 field names) and is never on any type's public allowlist above — this
// derives a safe, public-shaped summary from it instead of exposing it
// as-is. A placeholder (no real image) yields no `media` field at all,
// rather than a fabricated one.
const MEDIA_PREVIEW_HOST_TYPES = Object.freeze(["historicalContext", "story", "structure", "music"]);

function publicMediaSummary(entity) {
  const preview = Array.isArray(entity.media) ? entity.media[0] : null;
  if (!preview || preview.isPlaceholder || !preview.path) return null;
  const summary = {
    path: preview.path,
    aiGenerated: preview.aiGenerated ?? false,
  };
  for (const field of ["alt", "caption", "source", "author", "license", "rightsNote"]) {
    if (preview[field] !== undefined) summary[field] = preview[field];
  }
  return summary;
}

/** Strips any field not on the public allowlist for entity.entityType. */
export function serializePublicEntity(entity) {
  if (!entity || typeof entity !== "object") return null;
  const allowlist = PUBLIC_FIELDS_BY_TYPE[entity.entityType] || BASE_PUBLIC_FIELDS;
  const output = pickAllowlisted(entity, allowlist);

  if (entity.entityType === "media") {
    // A media entity already carries its own top-level public fields
    // (derivativeStoragePaths, source, author, license, ...) — only alt/
    // caption text is missing from that allowlist, sourced the same way as
    // the other host types below.
    const preview = Array.isArray(entity.media) ? entity.media[0] : null;
    if (preview?.alt !== undefined) output.alt = preview.alt;
    if (preview?.caption !== undefined) output.caption = preview.caption;
  } else if (MEDIA_PREVIEW_HOST_TYPES.includes(entity.entityType)) {
    const media = publicMediaSummary(entity);
    if (media) output.media = media;
  }

  return output;
}

export function serializePublicEntities(entities) {
  return (entities || []).map(serializePublicEntity);
}

export function serializePublicRelationship(relationship) {
  if (!relationship || typeof relationship !== "object") return null;
  return pickAllowlisted(relationship, PUBLIC_RELATIONSHIP_FIELDS);
}

export function serializePublicRelationships(relationships) {
  return (relationships || []).map(serializePublicRelationship);
}
