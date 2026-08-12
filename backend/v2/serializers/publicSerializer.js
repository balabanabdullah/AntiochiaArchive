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

/** Strips any field not on the public allowlist for entity.entityType. */
export function serializePublicEntity(entity) {
  if (!entity || typeof entity !== "object") return null;
  const allowlist = PUBLIC_FIELDS_BY_TYPE[entity.entityType] || BASE_PUBLIC_FIELDS;
  return pickAllowlisted(entity, allowlist);
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
