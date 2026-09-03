// The actual browser-upload write path (Section 8-10 of the "no-code CMS"
// round, hardened for true streaming in the "correctness pass" round) —
// completes the media storage layer.
// createEntity() from contentService.js is deliberately NOT reused as-is:
// media is a status-less entity type (see contentService.js's
// STATUS_LESS_TYPES) with its own required fields (mediaType/mediaRole),
// so this module builds the candidate object itself and calls the same
// underlying validated-insert-plus-audit-row transaction pattern.
//
// Streaming flow (Section 1 of the correctness-pass brief — the previous
// round's multer.memoryStorage() buffered an entire upload in RAM, which is
// unacceptable for large audio files and concurrent uploads):
//   multipart request (handled by adminContentRoutes.js's multer.diskStorage)
//   -> already streamed onto a temp/ file by the time this module runs
//   -> read only the first few bytes for magic-byte validation (readFileHead)
//   -> stream the whole file through SHA-256 in chunks (hashFileStreaming)
//   -> duplicate check by checksum
//   -> atomic rename + one OS-level copy into permanent storage (finalizeFromTemp)
//   -> DB metadata transaction
// Every exit before DB commit calls deleteTempFile/storage.delete() so no
// path leaves an orphaned file (Section 1: "cleanup temp file on EVERY
// failure path").

import { validateEntity } from "../v2/schemas/index.js";
import { RIGHTS_STATUS } from "../v2/constants/vocabularies.js";
import { runInTransaction } from "../db/sqliteConnection.js";
import { insertEntity, allEntitiesRaw, updateEntityRow } from "../db/repositories/entityRepository.js";
import { recordAuditEntry } from "../db/repositories/auditRepository.js";
import { getMediaStorage } from "../media/mediaStorage.js";
import { validateUploadedFile } from "../media/fileSignature.js";
import { ContentValidationError, ContentNotFoundError } from "./contentService.js";

let mediaIdCounter = 0;
function newMediaId() {
  mediaIdCounter += 1;
  return `media-${Date.now().toString(36)}-${mediaIdCounter}`;
}

/** Same checksum + same mediaType already stored -> treat as a duplicate rather than writing a second copy (Section 8: "duplicate detection"). */
function findDuplicateByChecksum(checksum, mediaType) {
  return allEntitiesRaw().find((e) => e.entityType === "media" && e.checksum === checksum && e.mediaType === mediaType) || null;
}

/**
 * `tempFilePath` is a file multer's diskStorage has already streamed the
 * upload onto (see adminContentRoutes.js) — this function never receives,
 * and never constructs, a Buffer holding the whole file. `fields` carries
 * everything the upload form collects: mediaRole, rightsStatus, source/
 * author/license/rightsNote (Section 9's rights metadata). rightsStatus is
 * never defaulted to "cleared" — an admin must explicitly set it (defaults
 * to "unknown", the safest value, if omitted), so a fresh upload can never
 * automatically become a public player (see
 * v2/render/entityDetailRenderer.js and media/mediaRoutes.js's serving
 * gate, both of which refuse anything that is not exactly "cleared").
 */
export async function uploadMedia({ tempFilePath, originalFilename, mimeType, fields = {}, actor }) {
  const storage = getMediaStorage();

  const headBytes = storage.readFileHead(tempFilePath, 64);
  const signatureCheck = validateUploadedFile({ originalFilename, mimeType, buffer: headBytes });
  if (!signatureCheck.valid) {
    storage.deleteTempFile(tempFilePath);
    throw new ContentValidationError(signatureCheck.error);
  }

  const maxBytes = Number(process.env.MEDIA_UPLOAD_MAX_BYTES) || 25 * 1024 * 1024;
  const { checksum, size } = await storage.hashFileStreaming(tempFilePath);
  if (size > maxBytes) {
    // Defense in depth: multer's own limits.fileSize should already have
    // aborted a too-large upload before this point, but a temp file that
    // somehow exceeds the configured limit is never finalized regardless.
    storage.deleteTempFile(tempFilePath);
    throw new ContentValidationError(`Dosya boyutu izin verilen sınırı aşıyor (${maxBytes} bayt).`);
  }

  // Everything from here on (the duplicate-check DB read, the filesystem
  // finalize, schema validation, and the insert transaction) is wrapped in
  // ONE try/catch that tracks exactly what has been created so far —
  // "release-blocker" round, Section 9: a narrower per-step try/catch (the
  // previous shape of this function) left a real gap where a failure
  // during the duplicate-check read itself (e.g. a transient DB error —
  // reproduced in backend/test/media/mediaFailureCleanup.test.js by
  // closing the connection at exactly that point) was never caught by
  // anything, so the temp file was never deleted. `saved` being set is
  // exactly the signal for "the file has already been moved out of temp/
  // and into permanent storage" — before that point, only the temp file
  // needs removing; after it, only the finalized (+ originals/) copy does,
  // since finalizeFromTemp() has already consumed the temp file via an
  // atomic rename.
  let saved = null;
  try {
    const duplicate = findDuplicateByChecksum(checksum, signatureCheck.mediaType);
    if (duplicate) {
      storage.deleteTempFile(tempFilePath);
      return { entity: duplicate, duplicate: true };
    }

    saved = storage.finalizeFromTemp({ tempPath: tempFilePath, mediaType: signatureCheck.mediaType, originalFilename, checksum, size });

    const candidate = {
      id: newMediaId(),
      entityType: "media",
      mediaType: signatureCheck.mediaType,
      mediaRole: fields.mediaRole || "realArchiveMedia",
      storageDriver: saved.storageDriver,
      originalStoragePath: saved.storageKey,
      originalFilename: originalFilename || undefined,
      mimeType: mimeType || undefined,
      size: saved.size,
      checksum: saved.checksum,
      rightsStatus: RIGHTS_STATUS.includes(fields.rightsStatus) ? fields.rightsStatus : "unknown",
      source: fields.source || undefined,
      author: fields.author || undefined,
      license: fields.license || undefined,
      rightsNote: fields.rightsNote || undefined,
      aiGenerated: fields.aiGenerated === true,
    };

    const result = validateEntity(candidate);
    if (!result.valid) throw new ContentValidationError(result.error);

    return runInTransaction(() => {
      const stored = insertEntity(candidate);
      recordAuditEntry({ targetType: "entity", targetId: stored.id, action: "create", actor, before: null, after: stored, note: `upload:${originalFilename}` });
      return { entity: stored, duplicate: false };
    });
  } catch (error) {
    if (saved) {
      // Already renamed out of temp/ — the finalized copy (+ its
      // originals/ twin) is what needs cleaning up, not a temp file that
      // no longer exists at this path.
      storage.delete({ storageKey: saved.storageKey, mediaType: signatureCheck.mediaType });
    } else {
      // Never reached finalize — the file is still sitting in temp/.
      storage.deleteTempFile(tempFilePath);
    }
    throw error;
  }
}

/** Edits rights/credit metadata on an existing media record — never the file itself. */
export function editMediaMetadata({ id, fields, actor }) {
  const existing = allEntitiesRaw().find((e) => e.id === id && e.entityType === "media");
  if (!existing) throw new ContentNotFoundError(`Media '${id}' was not found.`);
  const merged = { ...existing };
  for (const field of ["mediaRole", "rightsStatus", "source", "author", "license", "rightsNote"]) {
    if (Object.hasOwn(fields, field)) merged[field] = fields[field];
  }
  if (Object.hasOwn(fields, "aiGenerated")) merged.aiGenerated = Boolean(fields.aiGenerated);

  const result = validateEntity(merged);
  if (!result.valid) throw new ContentValidationError(result.error);

  return runInTransaction(() => {
    const stored = updateEntityRow(id, merged);
    recordAuditEntry({ targetType: "entity", targetId: id, action: "edit", actor, before: existing, after: stored });
    return stored;
  });
}
