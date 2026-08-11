export const ARCHIVE_CATEGORIES = Object.freeze([
  "history",
  "stories",
  "structures",
  "beliefs",
  "music",
  "gallery",
]);

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

const LANGUAGES = Object.freeze(["tr", "en", "ar"]);
const SOURCE_TEXT_FIELDS = Object.freeze([
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
const IMAGE_METADATA_TEXT_FIELDS = Object.freeze([
  "source",
  "author",
  "license",
  "date",
  "originalUrl",
  "accessedAt",
  "rightsNote",
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isHttpUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(String(value)).protocol);
  } catch {
    return false;
  }
}

export function isAllowedArchiveMediaPath(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const candidate = value.trim();
  return isHttpUrl(candidate) || (/^\/(?!\/)[^\s\\]*$/.test(candidate));
}

function validateMultilingualText(value, fieldPath) {
  if (!isObject(value)) return `${fieldPath} must be an object.`;
  for (const [language, text] of Object.entries(value)) {
    if (!LANGUAGES.includes(language)) return `${fieldPath}.${language} is not a supported language.`;
    if (typeof text !== "string") return `${fieldPath}.${language} must be a string.`;
  }
  return null;
}

function validateSource(source, fieldPath) {
  if (!isObject(source)) return `${fieldPath} must be an object.`;

  for (const field of SOURCE_TEXT_FIELDS) {
    if (source[field] != null && typeof source[field] !== "string") {
      return `${fieldPath}.${field} must be a string.`;
    }
  }

  if (source.type != null) {
    if (typeof source.type !== "string" || !SOURCE_TYPES.includes(source.type)) {
      return `${fieldPath}.type must be one of: ${SOURCE_TYPES.join(", ")}.`;
    }
  }

  if (source.url && !isHttpUrl(source.url)) {
    return `${fieldPath}.url must use http or https.`;
  }

  return null;
}

function validateImageMetadata(metadata, fieldPath) {
  if (!isObject(metadata)) return `${fieldPath} must be an object.`;

  for (const field of ["alt", "caption"]) {
    if (metadata[field] != null) {
      const error = validateMultilingualText(metadata[field], `${fieldPath}.${field}`);
      if (error) return error;
    }
  }

  for (const field of IMAGE_METADATA_TEXT_FIELDS) {
    if (metadata[field] != null && typeof metadata[field] !== "string") {
      return `${fieldPath}.${field} must be a string.`;
    }
  }

  if (metadata.originalUrl && !isHttpUrl(metadata.originalUrl)) {
    return `${fieldPath}.originalUrl must use http or https.`;
  }

  if (metadata.aiGenerated != null && typeof metadata.aiGenerated !== "boolean") {
    return `${fieldPath}.aiGenerated must be a boolean.`;
  }

  return null;
}

function validateArchiveItem(item, fieldPath) {
  if (!isObject(item)) return `${fieldPath} must be an object.`;

  for (const mediaField of ["image", "src"]) {
    if (item[mediaField] != null && item[mediaField] !== "" && !isAllowedArchiveMediaPath(item[mediaField])) {
      return `${fieldPath}.${mediaField} must be an http(s) URL or a root-relative local path.`;
    }
  }

  if (item.sources != null) {
    if (!Array.isArray(item.sources)) return `${fieldPath}.sources must be an array.`;
    for (const [index, source] of item.sources.entries()) {
      const error = validateSource(source, `${fieldPath}.sources[${index}]`);
      if (error) return error;
    }
  }

  if (item.imageMetadata != null) {
    const error = validateImageMetadata(item.imageMetadata, `${fieldPath}.imageMetadata`);
    if (error) return error;
  }

  return null;
}

export function validateArchive(archive) {
  if (!archive || typeof archive !== "object" || Array.isArray(archive)) {
    return { valid: false, error: "Invalid payload provided. Body must be a JSON object." };
  }

  for (const category of ARCHIVE_CATEGORIES) {
    if (!Array.isArray(archive[category])) {
      return {
        valid: false,
        error: `Invalid archive structure: '${category}' must be an array.`,
      };
    }

    for (const [index, item] of archive[category].entries()) {
      const error = validateArchiveItem(item, `${category}[${index}]`);
      if (error) return { valid: false, error };
    }
  }

  return { valid: true };
}

export function assertValidArchive(archive) {
  const result = validateArchive(archive);
  if (!result.valid) throw new TypeError(result.error);
  return archive;
}

export function normalizeArchiveDocuments(documentsByCategory) {
  return Object.fromEntries(ARCHIVE_CATEGORIES.map((category) => {
    const document = documentsByCategory[category];
    return [category, Array.isArray(document?.items) ? document.items : []];
  }));
}

export function createSubmissionId(now = Date.now, random = Math.random) {
  return `sub-${now()}-${random().toString(36).slice(2, 8)}`;
}

export function normalizeCreatedAt(value) {
  let date;

  if (value && typeof value.toDate === "function") {
    date = value.toDate();
  } else if (value instanceof Date) {
    date = value;
  } else if (value && Number.isFinite(value.seconds)) {
    const milliseconds = (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1e6);
    date = new Date(milliseconds);
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Submission createdAt must be a valid timestamp.");
  }

  return date.toISOString();
}

export function validateSubmissionRecord(submission) {
  if (!submission || typeof submission !== "object" || Array.isArray(submission)) {
    return { valid: false, error: "Submission must be an object." };
  }

  if (!submission.id || typeof submission.id !== "string" || submission.id.includes("/")) {
    return { valid: false, error: "Submission ID must be a non-empty string." };
  }

  if (!submission.name || typeof submission.name !== "string" || submission.name.length > 120) {
    return { valid: false, error: "Submission name is invalid." };
  }

  if (!submission.email || typeof submission.email !== "string" || submission.email.length > 254) {
    return { valid: false, error: "Submission email is invalid." };
  }

  if (!submission.message || typeof submission.message !== "string" || submission.message.length > 5000) {
    return { valid: false, error: "Submission message is invalid." };
  }

  try {
    normalizeCreatedAt(submission.createdAt);
  } catch {
    return { valid: false, error: "Submission createdAt is invalid." };
  }

  return { valid: true };
}

export function serializeSubmission(id, submission) {
  return {
    id: String(id),
    name: String(submission.name ?? ""),
    email: String(submission.email ?? ""),
    message: String(submission.message ?? ""),
    createdAt: normalizeCreatedAt(submission.createdAt),
  };
}
