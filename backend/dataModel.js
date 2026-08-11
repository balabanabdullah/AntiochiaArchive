export const ARCHIVE_CATEGORIES = Object.freeze([
  "history",
  "stories",
  "structures",
  "beliefs",
  "music",
  "gallery",
]);

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
