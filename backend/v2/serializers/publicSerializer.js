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

// Research placeholder markers (e.g. "NEEDS LOCAL VERIFICATION" literally
// embedded in a title.ar or historicalNames[].name value) must never reach
// a public response as if they were real content — they are internal
// editorial flags meaning "not yet confirmed," not facts. Stripping happens
// here, at serialization, rather than by ever editing the source record:
// the raw research value (sentinel included) stays intact in
// data/v2/entities.json for editorial tracking, and only the public
// projection omits it. An entity is never held back from publication
// solely because one optional name/etymology field carries a sentinel —
// that field is just omitted from the public response instead.
// Anchored to the END of the string (trailing whitespace/punctuation
// allowed): every real sentinel in this dataset is a trailing marker on an
// otherwise-short name/label value ("Bitias? — UNRESOLVED", "Historical
// street names: NEEDS VERIFICATION", or the bare marker alone) — never a
// marker word used mid-sentence inside genuine hedged prose ("...remains a
// subject some historians consider unresolved, though..."). Anchoring to
// the end (rather than a bare \b...\b word match anywhere) is what tells
// these apart; a whole-string match here previously stripped legitimate
// summary sentences that merely used a sentinel word in passing.
const SENTINEL_PATTERN = /(UNKNOWN|NEEDS(?: LOCAL)? VERIFICATION|NEEDS PRECISE[A-Z \-]*|NEEDS SOURCE-EXACT[A-Z \-]*|NO RELIABLE SOURCE FOUND|NOT YET RESEARCHED|UNRESOLVED)[\s.?!—-]*$/i;

function isSentinelString(value) {
  return typeof value === "string" && SENTINEL_PATTERN.test(value);
}

/** Multilingual text ({ tr, en, ar, ... }): drops any language whose value is a sentinel. */
function stripSentinelText(value) {
  if (!value || typeof value !== "object") return value;
  const cleaned = {};
  for (const [lang, text] of Object.entries(value)) {
    if (!isSentinelString(text)) cleaned[lang] = text;
  }
  return Object.keys(cleaned).length ? cleaned : undefined;
}

/** Multilingual string arrays ({ tr: [...], en: [...] }): drops sentinel entries per language. */
function stripSentinelTextArrayMap(value) {
  if (!value || typeof value !== "object") return value;
  const cleaned = {};
  for (const [lang, list] of Object.entries(value)) {
    if (!Array.isArray(list)) continue;
    const filtered = list.filter((item) => !isSentinelString(item));
    if (filtered.length) cleaned[lang] = filtered;
  }
  return Object.keys(cleaned).length ? cleaned : undefined;
}

/** Name-object arrays (place.localNames/historicalNames: [{ name, ... }]): drops sentinel-named entries. */
function stripSentinelNameArray(value) {
  if (!Array.isArray(value)) return value;
  const filtered = value.filter((item) => !isSentinelString(item?.name));
  return filtered.length ? filtered : undefined;
}

// Declares, per public field, how to strip sentinel placeholder values.
// Fields not listed here pass through unchanged (they are either never
// sentinel-prone — ids, enums, booleans — or already excluded from the
// allowlist entirely).
const SENTINEL_STRIPPERS = Object.freeze({
  title: stripSentinelText,
  summary: stripSentinelText,
  officialName: stripSentinelText,
  etymology: stripSentinelText,
  alternateNames: stripSentinelTextArrayMap,
  localNames: stripSentinelNameArray,
  historicalNames: stripSentinelNameArray,
});

function stripSentinels(output) {
  for (const [field, strip] of Object.entries(SENTINEL_STRIPPERS)) {
    if (!Object.hasOwn(output, field)) continue;
    const cleaned = strip(output[field]);
    if (cleaned === undefined) delete output[field];
    else output[field] = cleaned;
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
  const output = stripSentinels(pickAllowlisted(entity, allowlist));

  if (entity.entityType === "media") {
    // A media entity already carries its own top-level public fields
    // (derivativeStoragePaths, source, author, license, ...) — only alt/
    // caption text is missing from that allowlist, sourced the same way as
    // the other host types below.
    const preview = Array.isArray(entity.media) ? entity.media[0] : null;
    if (preview?.alt !== undefined) output.alt = preview.alt;
    if (preview?.caption !== undefined) output.caption = preview.caption;
    // A media entity created through the Admin upload flow (see
    // backend/admin/mediaUploadService.js) has no `derivativeStoragePaths`
    // of its own — that field was only ever populated by the legacy v1
    // migration importer. Without this, an uploaded, rights-cleared file
    // would be fully invisible to the public API (no servable URL at all),
    // which silently broke the client-side audio pipeline (public/js/
    // music.js's resolvePlayableAudio) and any other consumer expecting
    // this field. Synthesized ONLY for rights-cleared, locally-stored
    // media, pointing at the controlled serving route (media/mediaRoutes.js,
    // which independently re-checks the rights gate on every request) —
    // never for an uncleared file, so an unresolved-rights record's public
    // shape carries no hint that a servable path exists at all, matching
    // the same "no public player for uncleared audio" principle applied at
    // every other layer.
    if (!Array.isArray(output.derivativeStoragePaths) && entity.storageDriver === "local" && entity.originalStoragePath && entity.rightsStatus === "cleared") {
      output.derivativeStoragePaths = [`/media/${encodeURIComponent(entity.id)}`];
    }
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
