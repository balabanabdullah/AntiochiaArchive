import { getDataStore } from "./dataStore.js";
import { serializeSubmission, validateArchive } from "./dataModel.js";

function formatBackupTimestamp(date) {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)}-${iso.slice(11, 19).replaceAll(":", "")}`;
}

export function createBackupFilename(kind, date = new Date()) {
  return `antiochia-${kind}-backup-${formatBackupTimestamp(date)}.json`;
}

export function normalizeArchiveExport(archive) {
  const validation = validateArchive(archive);
  if (!validation.valid) throw new TypeError(validation.error);
  return archive;
}

export function normalizeSubmissionsExport(submissions) {
  if (!Array.isArray(submissions)) {
    throw new TypeError("Submission export data must be an array.");
  }

  return submissions.map((submission) => {
    if (!submission || submission.id === undefined || submission.id === null) {
      throw new TypeError("Every exported submission must have an ID.");
    }
    return serializeSubmission(submission.id, submission);
  });
}

export function preventBackupCaching(_req, res, next) {
  res.set({
    "Cache-Control": "private, no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  next();
}

function sendJsonDownload(res, filename, data) {
  res.set({
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
  return res.status(200).send(JSON.stringify(data, null, 2));
}

function sendControlledError(res, label, error) {
  console.error(`[BackupController] ${label}:`, error.message);
  return res.status(500).json({
    success: false,
    error: "The requested backup could not be generated.",
  });
}

export function createBackupHandlers({ storeProvider = getDataStore, now = () => new Date() } = {}) {
  return {
    archive: async (_req, res) => {
      try {
        const archive = normalizeArchiveExport(await storeProvider().getArchive());
        return sendJsonDownload(res, createBackupFilename("archive", now()), archive);
      } catch (error) {
        return sendControlledError(res, "Archive export failed", error);
      }
    },

    submissions: async (_req, res) => {
      try {
        const submissions = normalizeSubmissionsExport(await storeProvider().getSubmissions());
        return sendJsonDownload(res, createBackupFilename("submissions", now()), submissions);
      } catch (error) {
        return sendControlledError(res, "Submissions export failed", error);
      }
    },

    full: async (_req, res) => {
      try {
        const exportedAt = now();
        const [archiveData, submissionData] = await Promise.all([
          storeProvider().getArchive(),
          storeProvider().getSubmissions(),
        ]);
        const backup = {
          version: 1,
          exportedAt: exportedAt.toISOString(),
          archive: normalizeArchiveExport(archiveData),
          submissions: normalizeSubmissionsExport(submissionData),
        };
        return sendJsonDownload(res, createBackupFilename("full", exportedAt), backup);
      } catch (error) {
        return sendControlledError(res, "Full export failed", error);
      }
    },
  };
}

export const backupHandlers = createBackupHandlers();
