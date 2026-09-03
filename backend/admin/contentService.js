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
} from "../db/repositories/entityRepository.js";
import {
  insertRelationship, deleteRelationshipRow, getRelationshipByIdRow, relationshipIdExists,
  countRelationshipsForEntity, listRelationshipsRows,
} from "../db/repositories/relationshipRepository.js";
import { recordAuditEntry, listAuditEntriesForTarget } from "../db/repositories/auditRepository.js";

export class ContentValidationError extends Error {}
export class ContentConflictError extends Error {}
export class ContentNotFoundError extends Error {}

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

  if (!candidate.id || typeof candidate.id !== "string") {
    throw new ContentValidationError("id is required.");
  }
  if (idExists(candidate.id)) {
    throw new ContentConflictError(`id '${candidate.id}' already exists.`);
  }
  if (!isStatusLess) {
    if (!candidate.slug || !SLUG_PATTERN.test(candidate.slug)) {
      throw new ContentValidationError("slug is missing or invalid (lowercase letters/digits, single-hyphen groups).");
    }
    if (slugExists(candidate.slug)) {
      throw new ContentConflictError(`slug '${candidate.slug}' already exists.`);
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
