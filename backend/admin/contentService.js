// The SQLite content-authority write path (Section 5, 8, 9, 10, 11, 12, 13
// of the "no-code CMS" round brief). This is the ONLY module that ever
// calls a mutating function in backend/db/repositories/entityRepository.js
// or relationshipRepository.js — mirroring exactly how
// backend/admin/editorialStore.js is the sole writer of editorial drafts.
//
// The critical behavior change from the existing editorial-draft
// architecture: pressing "Yayınla" here calls publishEntity() below, which
// commits `status = "published"` straight into the SQLite `entities` table
// inside one transaction (entity row + audit_log row). The very next
// GET /api/v2/... request (served by sqliteV2Store.js) sees it. No draft
// export, no scripts/apply-editorial-changes.js, no git, no deploy — see
// this module's tests (backend/test/admin/contentService.test.js) for the
// literal "publish then immediately re-read through the public store"
// assertion that proves this.
//
// This is ONLY reachable when V2_DATA_STORE=sqlite — every exported
// function here assumes the caller (adminContentRoutes.js) already checked
// that. It is never invoked when the backend is running in `local`/
// `firestore`/`memory`/`empty` mode: those installations keep using the
// existing draft/approve/export/apply flow untouched.

import { validateEntity } from "../v2/schemas/index.js";
import { validateRelationship } from "../v2/schemas/relationship.js";
import { ENTITY_TYPES, PUBLICATION_STATUS } from "../v2/constants/vocabularies.js";
import { runInTransaction } from "../db/sqliteConnection.js";
import {
  insertEntity, updateEntityRow, deleteEntityRow, getEntityByIdRow, idExists, slugExists, listEntitiesRows,
  allEntitiesRaw,
} from "../db/repositories/entityRepository.js";
import {
  insertRelationship, deleteRelationshipRow, getRelationshipByIdRow, relationshipIdExists,
  countRelationshipsForEntity, listRelationshipsRows,
} from "../db/repositories/relationshipRepository.js";
import { recordAuditEntry, listAuditEntriesForTarget, listAuditTargetIds } from "../db/repositories/auditRepository.js";
import { recordSlugChange, isHistoricalSlug, listSlugHistoryForEntity } from "../db/repositories/slugHistoryRepository.js";
import { computeNextEntityId, hasIdConvention } from "./idRecommendationService.js";

export class ContentValidationError extends Error {}
/**
 * `suggestedId`/`suggestedSlug` are set only for the matching kind of
 * collision (see createEntity()/changeEntitySlug()) — a fresh, currently-
 * unused value the caller can immediately retry with, never requiring a
 * second network round trip. `requiresConfirmation` is set only by
 * changeEntitySlug() when the entity has ever been published and the
 * caller has not yet sent `confirmed: true` — Section 11: "do not allow
 * accidental Enter/save to bypass this warning."
 */
export class ContentConflictError extends Error {
  constructor(message, { suggestedId, suggestedSlug, requiresConfirmation } = {}) {
    super(message);
    this.suggestedId = suggestedId;
    this.suggestedSlug = suggestedSlug;
    this.requiresConfirmation = requiresConfirmation;
  }
}
export class ContentNotFoundError extends Error {}

/**
 * "UX refinement" round, Section 9/14: a slug is reserved the moment it is
 * live OR was ever historically used by ANY entity — never just checked
 * against the current `entities.slug` column alone, or a formerly-used
 * slug (Section 14: "reuse of a historical slug by another record") could
 * be handed straight back out.
 */
function slugIsAvailable(slug) {
  return !slugExists(slug) && !isHistoricalSlug(slug);
}

/** Section 9: "prefer a deterministic safe suggestion" on collision — besikli-magara, then besikli-magara-2, -3, ... until one is free. */
function computeAvailableSlug(baseSlug) {
  if (slugIsAvailable(baseSlug)) return baseSlug;
  let suffix = 2;
  while (!slugIsAvailable(`${baseSlug}-${suffix}`)) suffix += 1;
  return `${baseSlug}-${suffix}`;
}

/**
 * Section 10/11/16: "published" for slug-lock purposes means "has this
 * exact entity EVER been live, at any point" — not merely "is its status
 * currently 'published'" (an entity that was published, then unpublished
 * back to draft, could still have real external links to its old URL).
 * entities.published_at is unsuitable for this: transitionStatus() below
 * explicitly NULLs it on a transition to draft/inReview, by design, for a
 * different purpose (it also drives no "history" concept elsewhere). The
 * audit_log is the one record that is never cleared or rewritten, so this
 * checks it directly, mirroring exactly how idRecommendationService.js
 * already relies on audit_log surviving a row's own later mutation.
 */
export function hasEverBeenPublished(entityId) {
  return listAuditEntriesForTarget("entity", entityId, { limit: 1000 }).some((entry) => entry.action === "publish");
}

/** Shared by createEntity() and the standalone /next-id endpoint — the one place either ever touches the repository layer. */
function suggestNextId(entityType) {
  return computeNextEntityId(entityType, { allEntitiesRaw, listAuditTargetIds });
}

/** GET /api/admin/content/next-id — the standalone suggestion the create-record form pre-fills before the admin has typed anything. Throws ContentValidationError for a type with no configured id convention (media/page: already auto-generated elsewhere; see idRecommendationService.js's header). */
export function getSuggestedNextId(entityType) {
  if (!hasIdConvention(entityType)) {
    throw new ContentValidationError(`entityType '${entityType}' does not use a suggested id (it is generated automatically elsewhere).`);
  }
  return suggestNextId(entityType);
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATUS_LESS_TYPES = new Set(["media", "source"]);

// Mirrors backend/admin/editorialValidation.js's DRAFT_STATUS_TRANSITIONS,
// but for the real `status` field on a live entity instead of a draft's
// workflow status. draft -> inReview -> published is the reviewed
// path; published -> archived is "Yayından Kaldır / Arşivle"; archived ->
// draft or -> published is "Geri Yükle" (Section 12: restore may return to
// either, at the admin's explicit choice, never automatically republished).
const STATUS_TRANSITIONS = Object.freeze({
  draft: ["inReview", "published", "archived"],
  inReview: ["draft", "published", "archived"],
  published: ["archived", "draft"],
  archived: ["draft", "published"],
});

function isAllowedTransition(from, to) {
  if (from === to) return true;
  if (!PUBLICATION_STATUS.includes(from) || !PUBLICATION_STATUS.includes(to)) return false;
  return (STATUS_TRANSITIONS[from] || []).includes(to);
}

function assertKnownEntityType(entityType) {
  if (!ENTITY_TYPES.includes(entityType)) {
    throw new ContentValidationError(`entityType must be one of: ${ENTITY_TYPES.join(", ")}.`);
  }
}

/** Creates a new record. Status-bearing types always start at 'draft' regardless of what the caller passed — no code path may create a record that is born published (matches editorialValidation.js's existing rule, kept true here too). */
export function createEntity({ entityType, proposedFields, actor }) {
  assertKnownEntityType(entityType);
  const isStatusLess = STATUS_LESS_TYPES.has(entityType);
  const candidate = { ...proposedFields, entityType };
  if (isStatusLess) delete candidate.status;
  else candidate.status = "draft";

  // Section 2/3 of the "no-code CMS UX" round: a nontechnical Admin never
  // invents an id. The frontend already shows a suggested id from GET
  // /next-id, but the backend never trusts that suggestion blindly — it is
  // re-derived here regardless, and is the ONLY id ever used when the
  // caller omits one entirely (e.g. a client that skipped the suggestion
  // call, or a future non-browser caller).
  if (!candidate.id || typeof candidate.id !== "string") {
    if (!hasIdConvention(entityType)) {
      throw new ContentValidationError("id is required.");
    }
    candidate.id = suggestNextId(entityType);
  }
  if (idExists(candidate.id)) {
    // A real collision (a stale suggestion reused after another record
    // took it, or two admins racing on the same suggested id): never a
    // dead end — a fresh, currently-unused id is computed and attached so
    // the caller can retry immediately, satisfying "automatically obtain/
    // recommend the next valid id or return a clear retry response"
    // without a second network round trip.
    const suggestedId = hasIdConvention(entityType) ? suggestNextId(entityType) : undefined;
    throw new ContentConflictError(`id '${candidate.id}' already exists.`, { suggestedId });
  }
  if (!isStatusLess) {
    if (!candidate.slug || !SLUG_PATTERN.test(candidate.slug)) {
      throw new ContentValidationError("slug is missing or invalid (lowercase letters/digits, single-hyphen groups).");
    }
    if (!slugIsAvailable(candidate.slug)) {
      throw new ContentConflictError(`slug '${candidate.slug}' already exists.`, { suggestedSlug: computeAvailableSlug(candidate.slug) });
    }
  }

  const result = validateEntity(candidate);
  if (!result.valid) throw new ContentValidationError(result.error);

  return runInTransaction(() => {
    const stored = insertEntity(candidate);
    recordAuditEntry({ targetType: "entity", targetId: stored.id, action: "create", actor, before: null, after: stored });
    return stored;
  });
}

/** Applies a partial content edit without changing status — id/entityType/slug are locked, exactly like an editorial edit proposal. */
export function editEntity({ id, proposedFields, actor, note }) {
  const existing = getEntityByIdRow(id);
  if (!existing) throw new ContentNotFoundError(`Entity '${id}' was not found.`);

  for (const locked of ["id", "entityType", "slug"]) {
    if (Object.hasOwn(proposedFields, locked) && proposedFields[locked] !== existing[locked]) {
      throw new ContentValidationError(`'${locked}' cannot be changed by an edit.`);
    }
  }
  if (Object.hasOwn(proposedFields, "status")) {
    throw new ContentValidationError("Use the publish/unpublish/archive/restore action to change status, not an edit.");
  }

  const merged = { ...existing, ...proposedFields };
  const result = validateEntity(merged);
  if (!result.valid) throw new ContentValidationError(result.error);

  return runInTransaction(() => {
    const stored = updateEntityRow(id, merged);
    recordAuditEntry({ targetType: "entity", targetId: id, action: "edit", actor, before: existing, after: stored, note });
    return stored;
  });
}

/**
 * "UX refinement" round, Sections 9-16: the ONLY way an existing entity's
 * slug may change — editEntity() above still locks it completely,
 * unchanged. A draft/inReview entity that has never been published
 * changes freely (still collision-checked). An entity that HAS ever been
 * published (hasEverBeenPublished() — see that function's own header for
 * why this is audit-log-based, not the `published` current-status check)
 * requires the caller to have already shown the admin the explicit "this
 * may break old links" warning and pass `confirmed: true` — mirroring the
 * exact same confirm-flag pattern deleteEntityPermanently() already uses
 * elsewhere in this file, so a stray request can never silently bypass it.
 * The OLD slug is preserved in entity_slug_history so the runtime detail
 * route can redirect it, permanently reserving it against reuse by any
 * other record (see slugHistoryRepository.js).
 */
export function changeEntitySlug({ id, newSlug, confirmed, actor }) {
  const existing = getEntityByIdRow(id);
  if (!existing) throw new ContentNotFoundError(`Entity '${id}' was not found.`);
  if (STATUS_LESS_TYPES.has(existing.entityType)) {
    throw new ContentValidationError(`'${existing.entityType}' entities do not have a slug.`);
  }
  if (!newSlug || !SLUG_PATTERN.test(newSlug)) {
    throw new ContentValidationError("slug is missing or invalid (lowercase letters/digits, single-hyphen groups).");
  }
  if (newSlug === existing.slug) {
    throw new ContentValidationError("The new slug is the same as the current slug.");
  }
  if (!slugIsAvailable(newSlug)) {
    throw new ContentConflictError(`slug '${newSlug}' already exists.`, { suggestedSlug: computeAvailableSlug(newSlug) });
  }

  const everPublished = hasEverBeenPublished(id);
  if (everPublished && confirmed !== true) {
    throw new ContentConflictError(
      "Bu kayıt daha önce yayınlandı. URL değişikliğini onaylamak için confirm:true gönderilmelidir.",
      { requiresConfirmation: true },
    );
  }

  return runInTransaction(() => {
    const oldSlug = existing.slug;
    const stored = updateEntityRow(id, { ...existing, slug: newSlug });
    if (everPublished) {
      recordSlugChange({ entityId: id, oldSlug, newSlug });
    }
    recordAuditEntry({ targetType: "entity", targetId: id, action: "slugChange", actor, before: existing, after: stored, note: `${oldSlug} -> ${newSlug}` });
    return stored;
  });
}

/** For the editor's "Gelişmiş: URL'yi değiştir" flow — whether to even show the "already published, this is protected" framing at all, and the redirect history to display if any. */
export function getSlugChangeInfo(id) {
  const existing = getEntityByIdRow(id);
  if (!existing) throw new ContentNotFoundError(`Entity '${id}' was not found.`);
  return {
    currentSlug: existing.slug ?? null,
    everPublished: STATUS_LESS_TYPES.has(existing.entityType) ? false : hasEverBeenPublished(id),
    history: listSlugHistoryForEntity(id),
  };
}

/** Shared implementation for every status transition (publish/unpublish/archive/restore) — Section 8/9/11/12. */
function transitionStatus({ id, toStatus, action, actor, note }) {
  const existing = getEntityByIdRow(id);
  if (!existing) throw new ContentNotFoundError(`Entity '${id}' was not found.`);
  if (STATUS_LESS_TYPES.has(existing.entityType)) {
    throw new ContentValidationError(`'${existing.entityType}' entities do not have a publication status.`);
  }
  const fromStatus = existing.status || "draft";
  if (!isAllowedTransition(fromStatus, toStatus)) {
    throw new ContentConflictError(`Cannot move a '${fromStatus}' record to '${toStatus}'.`);
  }

  const merged = { ...existing, status: toStatus };
  const result = validateEntity(merged);
  if (!result.valid) throw new ContentValidationError(result.error);

  return runInTransaction(() => {
    const publishedAt = toStatus === "published" ? new Date().toISOString() : (toStatus === "archived" ? undefined : null);
    const stored = updateEntityRow(id, merged, { publishedAt });
    recordAuditEntry({ targetType: "entity", targetId: id, action, actor, before: existing, after: stored, note });
    return stored;
  });
}

export function publishEntity({ id, actor, note }) {
  return transitionStatus({ id, toStatus: "published", action: "publish", actor, note });
}

export function sendToReview({ id, actor, note }) {
  return transitionStatus({ id, toStatus: "inReview", action: "submitForReview", actor, note });
}

export function unpublishEntity({ id, actor, note }) {
  return transitionStatus({ id, toStatus: "draft", action: "unpublish", actor, note });
}

export function archiveEntity({ id, actor, note }) {
  return transitionStatus({ id, toStatus: "archived", action: "archive", actor, note });
}

/** Section 12: restore may go to draft or published, at the admin's explicit choice — never automatic. */
export function restoreEntity({ id, toStatus, actor, note }) {
  if (toStatus !== "draft" && toStatus !== "published") {
    throw new ContentValidationError("toStatus must be 'draft' or 'published' when restoring from archive.");
  }
  return transitionStatus({ id, toStatus, action: "restore", actor, note });
}

/**
 * Permanent delete (Section 13). Requires an explicit confirm flag from the
 * route layer (checked there, not here, so this function's own safety
 * checks are never bypassable by a caller forgetting a UI confirmation) and
 * always checks relationship dependencies first — deleting an entity that
 * still has relationship edges is refused (the foreign keys would refuse it
 * anyway; this check exists to give a clear, actionable error instead of a
 * raw SQLite constraint failure).
 */
export function deleteEntityPermanently({ id, actor, note }) {
  const existing = getEntityByIdRow(id);
  if (!existing) throw new ContentNotFoundError(`Entity '${id}' was not found.`);
  const relationshipCount = countRelationshipsForEntity(id);
  if (relationshipCount > 0) {
    throw new ContentConflictError(
      `Cannot permanently delete '${id}': it is referenced by ${relationshipCount} relationship(s). Remove those relationships first.`,
    );
  }
  return runInTransaction(() => {
    deleteEntityRow(id);
    recordAuditEntry({ targetType: "entity", targetId: id, action: "delete", actor, before: existing, after: null, note });
    return { deleted: true, id };
  });
}

/** Section 14: safe bulk actions only — archive and move-to-draft. Per-item result, one failure never aborts the rest. */
export function bulkTransition({ ids, action, actor, note }) {
  if (!["archive", "draft"].includes(action)) {
    throw new ContentValidationError("Bulk action must be 'archive' or 'draft'.");
  }
  const results = [];
  for (const id of ids) {
    try {
      const stored = action === "archive"
        ? archiveEntity({ id, actor, note })
        : transitionStatus({ id, toStatus: "draft", action: "unpublish", actor, note });
      results.push({ id, success: true, status: stored.status });
    } catch (error) {
      results.push({ id, success: false, error: error.message });
    }
  }
  return results;
}

export function getRevisionHistory(id) {
  return listAuditEntriesForTarget("entity", id);
}

/* ------------------------------------------------------------------------ */
/* Relationships (Section 22)                                                */
/* ------------------------------------------------------------------------ */

let relationshipIdCounter = 0;
function newRelationshipId() {
  relationshipIdCounter += 1;
  return `rel-${Date.now().toString(36)}-${relationshipIdCounter}`;
}

export function createRelationship({ type, sourceId, targetId, note, evidenceSourceIds, actor }) {
  const source = getEntityByIdRow(sourceId);
  const target = getEntityByIdRow(targetId);
  if (!source) throw new ContentNotFoundError(`Source entity '${sourceId}' was not found.`);
  if (!target) throw new ContentNotFoundError(`Target entity '${targetId}' was not found.`);

  const candidate = {
    id: newRelationshipId(),
    type,
    sourceId,
    sourceType: source.entityType,
    targetId,
    targetType: target.entityType,
    note,
    evidenceSourceIds,
    status: "published",
  };

  const result = validateRelationship(candidate);
  if (!result.valid) throw new ContentValidationError(result.error);

  return runInTransaction(() => {
    const stored = insertRelationship(candidate);
    recordAuditEntry({ targetType: "relationship", targetId: stored.id, action: "create", actor, before: null, after: stored });
    return stored;
  });
}

export function removeRelationship({ id, actor, note }) {
  const existing = getRelationshipByIdRow(id);
  if (!existing) throw new ContentNotFoundError(`Relationship '${id}' was not found.`);
  return runInTransaction(() => {
    deleteRelationshipRow(id);
    recordAuditEntry({ targetType: "relationship", targetId: id, action: "delete", actor, before: existing, after: null, note });
    return { deleted: true, id };
  });
}

export { relationshipIdExists, listRelationshipsRows, listEntitiesRows };
