// Direct-publish admin content API (Section 5, 8-14, 20, 22 of the
// "no-code CMS" round brief) — mounted at /api/admin/content, deliberately
// separate from /api/admin/editorial (the existing draft/approve/export/
// apply workflow, which remains completely untouched and keeps working
// exactly as before for any deployment NOT running V2_DATA_STORE=sqlite).
//
// Every route here requires BOTH a valid admin session (reused from
// adminSession.js — no new auth mechanism) AND V2_DATA_STORE=sqlite to
// actually be selected; the second check exists so this router can be
// mounted unconditionally in server.js without ever doing something
// undefined against a read-only JSON store. A non-sqlite deployment gets a
// clear 409 explaining why, never a crash.

import path from "path";
import { Router } from "express";
import multer from "multer";
import { isSqliteRuntimeActive } from "../v2/stores/v2Store.js";
import { ENTITY_TYPES, PUBLICATION_STATUS, RELATIONSHIP_TYPES } from "../v2/constants/vocabularies.js";
import { requireAdminSession } from "./adminSession.js";
import {
  createEntity, editEntity, publishEntity, sendToReview, unpublishEntity, archiveEntity, restoreEntity,
  deleteEntityPermanently, bulkTransition, getRevisionHistory, createRelationship, removeRelationship,
  listRelationshipsRows, listEntitiesRows,
  ContentValidationError, ContentConflictError, ContentNotFoundError,
} from "./contentService.js";
import {
  createPage, editPage, publishPage, sendPageToReview, unpublishPage, archivePage, restorePage,
  deletePagePermanently, getPageRevisionHistory, listPagesRows, getPageByIdRow,
} from "./pageService.js";
import { getEntityByIdRow } from "../db/repositories/entityRepository.js";
import { createBackup, listBackups, restoreBackup } from "./backupService.js";
import { uploadMedia, editMediaMetadata } from "./mediaUploadService.js";
import { getMediaStorage } from "../media/mediaStorage.js";

const router = Router();

// Section 1 of the "correctness pass" round: true streaming, not a
// memory-buffered upload. multer.diskStorage writes the incoming multipart
// stream directly onto a temp/ file (see mediaStorage.js's
// generateTempFilePath) as it arrives — at no point does this process hold
// the whole upload in one JS Buffer, unlike the previous round's
// multer.memoryStorage(). `limits.fileSize` still aborts an oversized
// upload mid-stream (Section 1: "enforce size limit during upload");
// mediaUploadService.uploadMedia() re-checks the finalized size regardless,
// as defense in depth.
const upload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      try {
        const storage = getMediaStorage();
        storage.ensureDirectories();
        cb(null, storage.tempDir());
      } catch (error) {
        cb(error);
      }
    },
    filename(req, _file, cb) {
      // Server-generated, opaque, never derived from the client-supplied
      // filename (Section 1: "use generated temp filenames", "no
      // user-controlled filesystem paths") — the real originalFilename is
      // preserved separately as request metadata (req.file.originalname),
      // read by mediaUploadService.uploadMedia() only for its extension.
      // Stashed on `req` so the error handler below can always find and
      // remove this exact file, even on a multer-level failure (e.g. a
      // size-limit rejection) where req.file is never populated.
      const tempPath = getMediaStorage().generateTempFilePath();
      req._antiochiaTempPath = tempPath;
      cb(null, path.basename(tempPath));
    },
  }),
  limits: { fileSize: Number(process.env.MEDIA_UPLOAD_MAX_BYTES) || 25 * 1024 * 1024, files: 1 },
});

function requireSqliteRuntime(req, res, next) {
  if (!isSqliteRuntimeActive()) {
    return res.status(409).json({
      success: false,
      error: "Bu özellik yalnızca SQLite çalışma zamanı etkinken kullanılabilir (V2_DATA_STORE=sqlite). "
        + "Bu dağıtım hâlâ mevcut taslak/onay/uygulama iş akışını kullanıyor.",
    });
  }
  return next();
}

router.use(requireAdminSession, requireSqliteRuntime);

function handleServiceError(res, error) {
  if (error instanceof ContentValidationError) return res.status(400).json({ success: false, error: error.message });
  if (error instanceof ContentConflictError) return res.status(409).json({ success: false, error: error.message });
  if (error instanceof ContentNotFoundError) return res.status(404).json({ success: false, error: error.message });
  console.error("[AdminContentRoutes]", error);
  return res.status(500).json({ success: false, error: "İstek işlenirken beklenmeyen bir hata oluştu." });
}

const actor = () => "admin-session";

/* ---------------------------------------------------------------------- */
/* Entities — direct publish/edit/archive/restore/delete (Section 8-13)    */
/* ---------------------------------------------------------------------- */

router.get("/entities", (req, res) => {
  try {
    const { type, status } = req.query;
    if (type && !ENTITY_TYPES.includes(type)) return res.status(400).json({ success: false, error: `type must be one of: ${ENTITY_TYPES.join(", ")}.` });
    if (status && !PUBLICATION_STATUS.includes(status)) return res.status(400).json({ success: false, error: `status must be one of: ${PUBLICATION_STATUS.join(", ")}.` });
    const page = listEntitiesRows({ limit: 5000, filters: { entityType: type, status } });
    return res.status(200).json({ success: true, data: page.items, meta: { count: page.items.length } });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

router.post("/entities", (req, res) => {
  try {
    const { entityType, fields } = req.body || {};
    const stored = createEntity({ entityType, proposedFields: fields || {}, actor: actor() });
    return res.status(201).json({ success: true, data: stored });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

router.patch("/entities/:id", (req, res) => {
  try {
    const { fields, note } = req.body || {};
    const stored = editEntity({ id: req.params.id, proposedFields: fields || {}, actor: actor(), note });
    return res.status(200).json({ success: true, data: stored });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

/**
 * POST /entities/:id/transition { toStatus, note } — the single endpoint
 * behind every Turkish-labeled admin action (Taslak Kaydet is just
 * createEntity/editEntity with no transition; İncelemeye Gönder ->
 * toStatus=inReview; Yayınla -> toStatus=published; Yayından Kaldır ->
 * toStatus=draft; Arşivle -> toStatus=archived). contentService.js's own
 * STATUS_TRANSITIONS table is the actual source of truth for what is
 * allowed from what — this route never duplicates that logic, it only maps
 * a requested toStatus to the right service call.
 */
router.post("/entities/:id/transition", (req, res) => {
  try {
    const { toStatus, note } = req.body || {};
    const { id } = req.params;
    let stored;
    if (toStatus === "inReview") stored = sendToReview({ id, actor: actor(), note });
    else if (toStatus === "published") stored = publishEntity({ id, actor: actor(), note });
    else if (toStatus === "draft") stored = unpublishEntity({ id, actor: actor(), note });
    else if (toStatus === "archived") stored = archiveEntity({ id, actor: actor(), note });
    else return res.status(400).json({ success: false, error: "toStatus must be one of: inReview, published, draft, archived." });
    return res.status(200).json({ success: true, data: stored });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

/** POST /entities/:id/restore { toStatus: 'draft'|'published' } — Section 12: explicit admin choice, never automatic. */
router.post("/entities/:id/restore", (req, res) => {
  try {
    const { toStatus, note } = req.body || {};
    const stored = restoreEntity({ id: req.params.id, toStatus, actor: actor(), note });
    return res.status(200).json({ success: true, data: stored });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

/** DELETE /entities/:id { confirm: true } — Section 13: permanent delete requires an explicit confirm flag from the caller, checked here (not just in the UI) so a stray DELETE can never silently succeed. */
router.delete("/entities/:id", (req, res) => {
  try {
    if (req.body?.confirm !== true) {
      return res.status(400).json({ success: false, error: "Kalıcı silme için confirm:true gönderilmelidir." });
    }
    const result = deleteEntityPermanently({ id: req.params.id, actor: actor(), note: req.body?.note });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

router.get("/entities/:id/history", (req, res) => {
  try {
    return res.status(200).json({ success: true, data: getRevisionHistory(req.params.id) });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

/** POST /bulk { ids: [...], action: 'archive'|'draft' } — Section 14. Per-item result; one failure never aborts the rest. */
router.post("/entities/bulk", (req, res) => {
  try {
    const { ids, action, note } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ success: false, error: "ids must be a non-empty array." });
    const results = bulkTransition({ ids, action, actor: actor(), note });
    return res.status(200).json({ success: true, data: results });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

/* ---------------------------------------------------------------------- */
/* Media upload (Section 8-10)                                             */
/* ---------------------------------------------------------------------- */

function multerErrorMessage(error) {
  if (error.code === "LIMIT_FILE_SIZE") return "Dosya boyutu izin verilen sınırı aşıyor.";
  if (error.code === "LIMIT_UNEXPECTED_FILE") return "Yalnızca tek bir dosya yüklenebilir (alan adı: file).";
  return error.message || "Dosya yüklenemedi.";
}

router.post("/media/upload", (req, res) => {
  upload.single("file")(req, res, async (multerError) => {
    // Section 1: "cleanup temp file on EVERY failure path" — multer does
    // not reliably remove a partial temp file of its own accord on a
    // limits rejection (e.g. LIMIT_FILE_SIZE), so this is checked
    // unconditionally on every error, independent of what multer itself
    // did or didn't clean up. Safe even if the file was never created or
    // was already removed (deleteTempFile swallows ENOENT).
    if (multerError) {
      if (req._antiochiaTempPath) getMediaStorage().deleteTempFile(req._antiochiaTempPath);
      return res.status(400).json({ success: false, error: multerErrorMessage(multerError) });
    }
    if (!req.file) return res.status(400).json({ success: false, error: "Dosya bulunamadı (alan adı: file)." });
    try {
      let fields = {};
      if (req.body?.fields) {
        try { fields = JSON.parse(req.body.fields); } catch { /* fall through with empty fields */ }
      }
      const { entity, duplicate } = await uploadMedia({
        tempFilePath: req.file.path,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        fields,
        actor: actor(),
      });
      return res.status(duplicate ? 200 : 201).json({ success: true, data: entity, duplicate });
    } catch (error) {
      return handleServiceError(res, error);
    }
  });
});

router.patch("/media/:id", (req, res) => {
  try {
    const stored = editMediaMetadata({ id: req.params.id, fields: req.body?.fields || {}, actor: actor() });
    return res.status(200).json({ success: true, data: stored });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

/* ---------------------------------------------------------------------- */
/* Relationships (Section 22)                                              */
/* ---------------------------------------------------------------------- */

router.get("/relationships", (req, res) => {
  try {
    const page = listRelationshipsRows({ limit: 2000 });
    return res.status(200).json({ success: true, data: page.items, meta: { count: page.items.length } });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

router.post("/relationships", (req, res) => {
  try {
    const { type, sourceId, targetId, note, evidenceSourceIds } = req.body || {};
    if (!RELATIONSHIP_TYPES.includes(type)) return res.status(400).json({ success: false, error: `type must be one of: ${RELATIONSHIP_TYPES.join(", ")}.` });
    const stored = createRelationship({ type, sourceId, targetId, note, evidenceSourceIds, actor: actor() });
    return res.status(201).json({ success: true, data: stored });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

/** Human-readable preview of a relationship before it's saved (Section 22: "Review clear human-readable summary before saving"). */
router.get("/relationships/preview", (req, res) => {
  try {
    const { type, sourceId, targetId } = req.query;
    const source = getEntityByIdRow(sourceId);
    const target = getEntityByIdRow(targetId);
    if (!source) return res.status(404).json({ success: false, error: `Source entity '${sourceId}' was not found.` });
    if (!target) return res.status(404).json({ success: false, error: `Target entity '${targetId}' was not found.` });
    const label = (entity) => entity.title?.tr || entity.title?.en || entity.title?.ar || entity.id;
    return res.status(200).json({
      success: true,
      data: { summary: `${label(source)} — ${type} → ${label(target)}`, sourceTitle: label(source), targetTitle: label(target) },
    });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

router.delete("/relationships/:id", (req, res) => {
  try {
    const result = removeRelationship({ id: req.params.id, actor: actor(), note: req.body?.note });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

/* ---------------------------------------------------------------------- */
/* Pages (Section 15-19)                                                   */
/* ---------------------------------------------------------------------- */

router.get("/pages", (req, res) => {
  try {
    const { status } = req.query;
    if (status && !PUBLICATION_STATUS.includes(status)) return res.status(400).json({ success: false, error: `status must be one of: ${PUBLICATION_STATUS.join(", ")}.` });
    return res.status(200).json({ success: true, data: listPagesRows({ status }) });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

router.get("/pages/:id", (req, res) => {
  try {
    const page = getPageByIdRow(req.params.id);
    if (!page) return res.status(404).json({ success: false, error: "Page not found." });
    return res.status(200).json({ success: true, data: page });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

router.post("/pages", (req, res) => {
  try {
    const stored = createPage({ fields: req.body || {}, actor: actor() });
    return res.status(201).json({ success: true, data: stored });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

router.patch("/pages/:id", (req, res) => {
  try {
    const { fields, note } = req.body || {};
    const stored = editPage({ id: req.params.id, fields: fields || {}, actor: actor(), note });
    return res.status(200).json({ success: true, data: stored });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

router.post("/pages/:id/transition", (req, res) => {
  try {
    const { toStatus, note } = req.body || {};
    const { id } = req.params;
    let stored;
    if (toStatus === "inReview") stored = sendPageToReview({ id, actor: actor(), note });
    else if (toStatus === "published") stored = publishPage({ id, actor: actor(), note });
    else if (toStatus === "draft") stored = unpublishPage({ id, actor: actor(), note });
    else if (toStatus === "archived") stored = archivePage({ id, actor: actor(), note });
    else return res.status(400).json({ success: false, error: "toStatus must be one of: inReview, published, draft, archived." });
    return res.status(200).json({ success: true, data: stored });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

router.post("/pages/:id/restore", (req, res) => {
  try {
    const { toStatus, note } = req.body || {};
    const stored = restorePage({ id: req.params.id, toStatus, actor: actor(), note });
    return res.status(200).json({ success: true, data: stored });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

router.delete("/pages/:id", (req, res) => {
  try {
    if (req.body?.confirm !== true) return res.status(400).json({ success: false, error: "Kalıcı silme için confirm:true gönderilmelidir." });
    const result = deletePagePermanently({ id: req.params.id, actor: actor(), note: req.body?.note });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

router.get("/pages/:id/history", (req, res) => {
  try {
    return res.status(200).json({ success: true, data: getPageRevisionHistory(req.params.id) });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

/* ---------------------------------------------------------------------- */
/* Backup / restore (Section 29-31)                                        */
/* ---------------------------------------------------------------------- */

router.post("/backups", async (req, res) => {
  try {
    const backup = await createBackup({ reason: req.body?.reason || "manual" });
    return res.status(201).json({ success: true, data: backup });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

router.get("/backups", (_req, res) => {
  try {
    return res.status(200).json({ success: true, data: listBackups() });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

router.post("/backups/:id/restore", async (req, res) => {
  try {
    if (req.body?.confirm !== true) return res.status(400).json({ success: false, error: "Geri yükleme için confirm:true gönderilmelidir." });
    const result = await restoreBackup({ id: req.params.id });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return handleServiceError(res, error);
  }
});

export default router;
