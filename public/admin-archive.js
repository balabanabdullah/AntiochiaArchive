/** Small, testable helpers used by the archive editor. */
(function exposeAdminArchiveHelpers(root) {
  "use strict";

  const SOURCE_TYPES = Object.freeze([
    "book",
    "article",
    "archive",
    "oralHistory",
    "photograph",
    "institutionalRecord",
    "website",
    "other",
  ]);
  const SOURCE_FIELDS = Object.freeze([
    "id",
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
  ]);
  const IMAGE_FIELDS = Object.freeze([
    "source",
    "author",
    "license",
    "date",
    "originalUrl",
    "accessedAt",
    "rightsNote",
  ]);
  const ENTITY_TYPES = Object.freeze([
    "historicalContext",
    "story",
    "structure",
    "beliefSite",
    "musicTradition",
    "media",
  ]);
  const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  function isHttpUrl(value) {
    try {
      return ["http:", "https:"].includes(new URL(String(value)).protocol);
    } catch (_) {
      return false;
    }
  }

  function isAllowedMediaPath(value) {
    const candidate = String(value || "").trim();
    return !candidate || isHttpUrl(candidate) || (/^\/(?!\/)[^\s\\]*$/.test(candidate));
  }

  function isValidSlug(value) {
    return SLUG_PATTERN.test(String(value || ""));
  }

  function createSourceId(cryptoApi = root.crypto) {
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
      return `source-${cryptoApi.randomUUID()}`;
    }
    const random = Math.random().toString(36).slice(2, 10);
    return `source-${Date.now().toString(36)}-${random}`;
  }

  function compactSource(values, original = {}) {
    const source = { ...original };
    const id = String(values.id || original.id || createSourceId()).trim();
    const type = SOURCE_TYPES.includes(values.type) ? values.type : "other";
    source.id = id;
    source.type = type;

    for (const field of SOURCE_FIELDS.filter((name) => name !== "id")) {
      const value = String(values[field] ?? "").trim();
      if (value) source[field] = value;
      else delete source[field];
    }
    return source;
  }

  function compactLocalized(values) {
    const localized = {};
    for (const language of ["tr", "en", "ar"]) {
      const value = String(values?.[language] ?? "").trim();
      if (value) localized[language] = value;
    }
    return localized;
  }

  function compactImageMetadata(values, original = {}) {
    const metadata = { ...original };
    const alt = compactLocalized(values.alt);
    const caption = compactLocalized(values.caption);

    if (Object.keys(alt).length) metadata.alt = alt;
    else delete metadata.alt;
    if (Object.keys(caption).length) metadata.caption = caption;
    else delete metadata.caption;

    for (const field of IMAGE_FIELDS) {
      const value = String(values[field] ?? "").trim();
      if (value) metadata[field] = value;
      else delete metadata[field];
    }

    metadata.aiGenerated = values.aiGenerated === true;
    const meaningfulKeys = Object.keys(metadata).filter((key) => key !== "aiGenerated");
    return meaningfulKeys.length || metadata.aiGenerated ? metadata : undefined;
  }

  function mergeArchiveRecord(existing = {}, updates = {}, options = {}) {
    const record = { ...existing, ...updates };

    if (Object.hasOwn(options, "sources")) {
      const originalsById = new Map(
        (existing.sources || [])
          .filter((source) => source && typeof source === "object" && source.id)
          .map((source) => [source.id, source]),
      );
      const sources = options.sources.map((source) => (
        compactSource(source, originalsById.get(source.id) || {})
      ));
      if (sources.length || Object.hasOwn(existing, "sources")) record.sources = sources;
      else delete record.sources;
    }

    if (Object.hasOwn(options, "imageMetadata")) {
      if (options.imageMetadata) record.imageMetadata = options.imageMetadata;
      else delete record.imageMetadata;
    }

    if (options.mediaKey) {
      const value = String(options.mediaValue ?? "").trim();
      if (value || Object.hasOwn(existing, options.mediaKey)) record[options.mediaKey] = value || null;
    }

    return record;
  }

  root.AntiochiaAdminArchive = Object.freeze({
    SOURCE_TYPES,
    ENTITY_TYPES,
    compactImageMetadata,
    compactSource,
    createSourceId,
    isAllowedMediaPath,
    isHttpUrl,
    isValidSlug,
    mergeArchiveRecord,
  });
})(typeof window !== "undefined" ? window : globalThis);
