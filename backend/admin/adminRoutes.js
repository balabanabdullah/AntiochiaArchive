// Admin/editorial API — mounted at /api/admin/editorial (kept distinct from
// the existing /api/admin/export/* backup routes and from /api/v2, per
// V2-ARCHITECTURE.md's "one namespace, one concern" pattern: this namespace
// is the only place a state-changing v2-editorial request can live).
//
// Every route here reads through the SAME live v2 store the public API
// uses (getV2Store()) — never a second copy of the data — but skips the
// isPublic() gate so an editor can see draft/inReview/archived records too.
// Nothing in this file ever calls a write method on that store: v2Store's
// only mutation surface is the editorial draft store below, which is a
// completely separate collection/table (see editorialStore.js's header).

import { Router } from "express";
import { getV2Store, isSqliteRuntimeActive, getSelectedV2StoreName } from "../v2/stores/v2Store.js";
import { ENTITY_TYPES, PUBLICATION_STATUS } from "../v2/constants/vocabularies.js";
import {
  requireAdminSession, loginRateLimit, createSession, destroySession, hasValidSession, verifyAdminToken,
} from "./adminSession.js";
import { getEditorialStore, getSelectedEditorialStoreName, DRAFT_STATUSES } from "./editorialStore.js";
import {
  isKnownEntityType, isValidSlug, isAllowedDraftStatusTransition, validateCreateProposal, validateEditProposal,
} from "./editorialValidation.js";
import { isRunningOnCloudRun } from "../db/sqliteConnection.js";
import { getSelectedMediaStorageDriverName } from "../media/mediaStorage.js";

const router = Router();

/**
 * Manual QA round, "environment safety badge": non-sensitive runtime
 * metadata only — never ADMIN_TOKEN, never a filesystem path, never a
 * credential. `environment` is derived from K_SERVICE (see
 * db/sqliteConnection.js's isRunningOnCloudRun — the same authoritative
 * signal the SQLite-on-Cloud-Run guard already uses), never from a
 * hostname or other frontend-guessable value. `runtimeContentStore` and
 * `mediaStorageDriver` are read the same way the dashboard already reports
 * `editorialStoreName`/`contentAuthority` below — real, live-selected
 * values, never hardcoded. Exposed on BOTH /session (reachable before
 * login, so the badge can render on the login screen itself) and
 * /dashboard (after login).
 */
function getEnvironmentInfo() {
  return {
    environment: isRunningOnCloudRun() ? "production" : "local",
    runtimeContentStore: getSelectedV2StoreName(),
    mediaStorageDriver: isSqliteRuntimeActive() ? getSelectedMediaStorageDriverName() : null,
  };
}

/* ---------------------------------------------------------------------- */
/* Auth: login / logout / session check — unauthenticated by design        */
/* ---------------------------------------------------------------------- */

router.post("/login", loginRateLimit, (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  if (!token || !verifyAdminToken(token)) {
    return res.status(401).json({ success: false, error: "Yönetici anahtarı geçersiz." });
  }
  const { expiresAt } = createSession(req, res);
  return res.status(200).json({ success: true, data: { expiresAt } });
});

router.post("/logout", (req, res) => {
  destroySession(req, res);
  return res.status(200).json({ success: true });
});

// Deliberately not gated by requireAdminSession: this is the one call the
// login shell makes to decide "show login form" vs "show panel" — it must
// work precisely when there is NO session yet, and it returns nothing
// sensitive either way (a boolean).
router.get("/session", (req, res) => {
  res.status(200).json({ success: true, data: { authenticated: hasValidSession(req), ...getEnvironmentInfo() } });
});

/* Every route below requires a valid admin session (+ CSRF header on writes). */
router.use(requireAdminSession);

/* ---------------------------------------------------------------------- */
/* Dashboard                                                               */
/* ---------------------------------------------------------------------- */

router.get("/dashboard", async (req, res) => {
  try {
    const store = getV2Store();
    const page = await store.listEntities({ limit: 5000 });
    const byType = {};
    const byStatus = {};
    for (const entity of page.items) {
      byType[entity.entityType] = (byType[entity.entityType] || 0) + 1;
      if (entity.status) byStatus[entity.status] = (byStatus[entity.status] || 0) + 1;
    }
    const publicCount = page.items.filter((e) => e.status === "published" || !e.status).length;

    const editorialStore = getEditorialStore();
    const drafts = await editorialStore.listDrafts({});
    const draftsByStatus = {};
    for (const draft of drafts) draftsByStatus[draft.status] = (draftsByStatus[draft.status] || 0) + 1;

    return res.status(200).json({
      success: true,
      data: {
        totalEntities: page.items.length,
        publicEntities: publicCount,
        byType,
        byStatus,
        editorialDrafts: { total: drafts.length, byStatus: draftsByStatus },
        // Never a secret — just which persistence mode is active, so the UI
        // can honestly show whether drafts survive a restart. See
        // backend/PERSISTENCE.md "Editorial draft persistence".
        editorialStoreName: getSelectedEditorialStoreName(),
        // Tells the admin panel whether "Yayınla" etc. call the new direct
        // /api/admin/content/* endpoints (immediate, no external apply step
        // — see admin/contentService.js) or must still go through this
        // namespace's draft/approve/export/apply workflow. Never a secret —
        // just which of the two content-authority models this deployment
        // is running. See the "no-code CMS" round's report.
        contentAuthority: isSqliteRuntimeActive() ? "direct" : "editorial",
        ...getEnvironmentInfo(),
      },
    });
  } catch (error) {
    console.error("[AdminRoutes] dashboard error:", error.message);
    return res.status(500).json({ success: false, error: "Could not compute dashboard counts." });
  }
});

/* ---------------------------------------------------------------------- */
/* Entities — admin-visible (every status), never the public-serializer    */
/* allowlisted shape: an editor needs every field, including ones the      */
/* public API deliberately strips.                                        */
/* ---------------------------------------------------------------------- */

router.get("/entities", async (req, res) => {
  try {
    const { type, status, q } = req.query;
    if (type && !ENTITY_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: `type must be one of: ${ENTITY_TYPES.join(", ")}.` });
    }
    if (status && !PUBLICATION_STATUS.includes(status)) {
      return res.status(400).json({ success: false, error: `status must be one of: ${PUBLICATION_STATUS.join(", ")}.` });
    }

    const store = getV2Store();
    const page = await store.listEntities({ limit: 5000, filters: { entityType: type, status } });
    let items = page.items;

    if (q && typeof q === "string" && q.trim()) {
      const needle = q.trim().toLowerCase();
      items = items.filter((entity) => {
        const haystack = [
          entity.id, entity.slug,
          ...Object.values(entity.title || {}),
          ...Object.values(entity.summary || {}),
        ].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(needle);
      });
    }

    return res.status(200).json({ success: true, data: items, meta: { count: items.length } });
  } catch (error) {
    console.error("[AdminRoutes] list entities error:", error.message);
    return res.status(500).json({ success: false, error: "Could not read entities." });
  }
});

router.get("/entities/:id", async (req, res) => {
  try {
    const entity = await getV2Store().getEntityById(req.params.id);
    if (!entity) return res.status(404).json({ success: false, error: "Entity not found." });
    return res.status(200).json({ success: true, data: entity });
  } catch (error) {
    console.error("[AdminRoutes] get entity error:", error.message);
    return res.status(500).json({ success: false, error: "Could not read entity." });
  }
});

/**
 * Read-only: every relationship edge regardless of status (the public route
 * only ever returns ones where the relationship AND both endpoint entities
 * are independently public — see publicVisibility.js). Editorial proposals
 * for NEW relationships are out of scope for this round (see the round
 * report's Known Limitations) — this is inspection only.
 */
router.get("/relationships", async (req, res) => {
  try {
    const page = await getV2Store().listRelationships({ limit: 500 });
    return res.status(200).json({ success: true, data: page.items, meta: { count: page.items.length } });
  } catch (error) {
    console.error("[AdminRoutes] list relationships error:", error.message);
    return res.status(500).json({ success: false, error: "Could not read relationships." });
  }
});

/* ---------------------------------------------------------------------- */
/* Editorial drafts                                                        */
/* ---------------------------------------------------------------------- */

router.get("/drafts", async (req, res) => {
  try {
    const { status, entityType } = req.query;
    if (status && !DRAFT_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: `status must be one of: ${DRAFT_STATUSES.join(", ")}.` });
    }
    const drafts = await getEditorialStore().listDrafts({ status, entityType });
    return res.status(200).json({ success: true, data: drafts, meta: { count: drafts.length } });
  } catch (error) {
    console.error("[AdminRoutes] list drafts error:", error.message);
    return res.status(500).json({ success: false, error: "Could not read editorial drafts." });
  }
});

router.get("/drafts/export", async (req, res) => {
  try {
    const status = req.query.status || "approved";
    const drafts = await getEditorialStore().listDrafts({ status });
    const changePackage = {
      version: 1,
      createdAt: new Date().toISOString(),
      changes: drafts.map((d) => ({
        changeId: d.changeId,
        kind: d.kind,
        entityType: d.entityType,
        entityId: d.entityId,
        proposedChanges: d.proposedChanges,
      })),
    };
    res.setHeader("Content-Disposition", `attachment; filename="editorial-change-package-${Date.now()}.json"`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(changePackage);
  } catch (error) {
    console.error("[AdminRoutes] export drafts error:", error.message);
    return res.status(500).json({ success: false, error: "Could not export the change package." });
  }
});

router.get("/drafts/:changeId", async (req, res) => {
  try {
    const draft = await getEditorialStore().getDraft(req.params.changeId);
    if (!draft) return res.status(404).json({ success: false, error: "Draft not found." });
    return res.status(200).json({ success: true, data: draft });
  } catch (error) {
    console.error("[AdminRoutes] get draft error:", error.message);
    return res.status(500).json({ success: false, error: "Could not read draft." });
  }
});

router.post("/drafts", async (req, res) => {
  try {
    const { kind, entityType, entityId, proposedChanges } = req.body || {};
    if (kind !== "create" && kind !== "edit") {
      return res.status(400).json({ success: false, error: "kind must be 'create' or 'edit'." });
    }
    if (!isKnownEntityType(entityType)) {
      return res.status(400).json({ success: false, error: `entityType must be one of: ${ENTITY_TYPES.join(", ")}.` });
    }

    const store = getV2Store();
    const page = await store.listEntities({ limit: 5000 });

    if (kind === "create") {
      const candidate = { status: "draft", ...proposedChanges, entityType };
      const result = validateCreateProposal(candidate, page.items);
      if (!result.valid) return res.status(400).json({ success: false, error: result.errors.join(" ") });
      const draft = await getEditorialStore().createDraft({ kind, entityType, entityId: null, proposedChanges: candidate });
      return res.status(201).json({ success: true, data: draft });
    }

    // kind === "edit"
    if (!entityId) return res.status(400).json({ success: false, error: "entityId is required for an edit proposal." });
    const baseEntity = page.items.find((e) => e.id === entityId);
    const result = validateEditProposal(baseEntity, proposedChanges || {}, page.items);
    if (!result.valid) return res.status(400).json({ success: false, error: result.errors.join(" ") });
    const draft = await getEditorialStore().createDraft({ kind, entityType, entityId, proposedChanges });
    return res.status(201).json({ success: true, data: draft });
  } catch (error) {
    console.error("[AdminRoutes] create draft error:", error.message);
    return res.status(500).json({ success: false, error: "Could not create draft." });
  }
});

router.patch("/drafts/:changeId", async (req, res) => {
  try {
    const editorialStore = getEditorialStore();
    const draft = await editorialStore.getDraft(req.params.changeId);
    if (!draft) return res.status(404).json({ success: false, error: "Draft not found." });

    const { proposedChanges, status, note } = req.body || {};

    if (proposedChanges !== undefined) {
      if (!["draft", "readyForReview"].includes(draft.status)) {
        return res.status(409).json({ success: false, error: "Only a draft/readyForReview change may have its content edited." });
      }
      const store = getV2Store();
      const page = await store.listEntities({ limit: 5000 });
      const candidate = draft.kind === "create"
        ? { ...draft.proposedChanges, ...proposedChanges }
        : proposedChanges;
      const result = draft.kind === "create"
        ? validateCreateProposal(candidate, page.items)
        : validateEditProposal(page.items.find((e) => e.id === draft.entityId), candidate, page.items);
      if (!result.valid) return res.status(400).json({ success: false, error: result.errors.join(" ") });
      const updated = await editorialStore.updateDraftContent(req.params.changeId, candidate, { note });
      return res.status(200).json({ success: true, data: updated });
    }

    if (status !== undefined) {
      if (!isAllowedDraftStatusTransition(draft.status, status)) {
        return res.status(409).json({
          success: false,
          error: `Cannot move a '${draft.status}' draft to '${status}'.`,
        });
      }
      const updated = await editorialStore.updateDraftStatus(req.params.changeId, status, { note });
      return res.status(200).json({ success: true, data: updated });
    }

    return res.status(400).json({ success: false, error: "Provide proposedChanges or status to update." });
  } catch (error) {
    console.error("[AdminRoutes] update draft error:", error.message);
    return res.status(500).json({ success: false, error: "Could not update draft." });
  }
});

router.delete("/drafts/:changeId", async (req, res) => {
  try {
    const deleted = await getEditorialStore().deleteDraft(req.params.changeId);
    if (!deleted) return res.status(404).json({ success: false, error: "Draft not found." });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[AdminRoutes] delete draft error:", error.message);
    return res.status(500).json({ success: false, error: "Could not delete draft." });
  }
});

export default router;
