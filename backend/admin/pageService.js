// Write path for CMS pages (Section 15-19) — the Page-table equivalent of
// contentService.js. Same transactional-write-plus-audit-row pattern, same
// "only reachable when V2_DATA_STORE=sqlite" assumption enforced by the
// route layer, not this module.

import { validatePage } from "../v2/schemas/page.js";
import { PUBLICATION_STATUS } from "../v2/constants/vocabularies.js";
import { runInTransaction } from "../db/sqliteConnection.js";
import {
  insertPage, updatePageRow, deletePageRow, getPageByIdRow, getPageBySlugRow, pageSlugExists,
  listPagesRows, listNavigationPagesRows,
} from "../db/repositories/pageRepository.js";
import { recordAuditEntry, listAuditEntriesForTarget } from "../db/repositories/auditRepository.js";
import { getEntityByIdRow } from "../db/repositories/entityRepository.js";
import { ContentValidationError, ContentConflictError, ContentNotFoundError } from "./contentService.js";

/** Referential integrity for page.mediaIds (Section 10) — shape is checked by the schema; this confirms each id actually names a real media entity. */
function assertMediaIdsExist(mediaIds) {
  if (!Array.isArray(mediaIds)) return;
  for (const id of mediaIds) {
    const media = getEntityByIdRow(id);
    if (!media || media.entityType !== "media") {
      throw new ContentValidationError(`mediaIds references '${id}', which is not a real media record.`);
    }
  }
}

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

let pageIdCounter = 0;
function newPageId() {
  pageIdCounter += 1;
  return `page-${Date.now().toString(36)}-${pageIdCounter}`;
}

export function createPage({ fields, actor }) {
  const candidate = {
    ...fields,
    id: fields.id || newPageId(),
    status: "draft",
    showInNavigation: fields.showInNavigation ?? false,
  };
  if (pageSlugExists(candidate.slug)) throw new ContentConflictError(`slug '${candidate.slug}' already exists.`);
  assertMediaIdsExist(candidate.mediaIds);

  const result = validatePage(candidate);
  if (!result.valid) throw new ContentValidationError(result.error);

  return runInTransaction(() => {
    const stored = insertPage(candidate);
    recordAuditEntry({ targetType: "page", targetId: stored.id, action: "create", actor, before: null, after: stored });
    return stored;
  });
}

export function editPage({ id, fields, actor, note }) {
  const existing = getPageByIdRow(id);
  if (!existing) throw new ContentNotFoundError(`Page '${id}' was not found.`);
  if (Object.hasOwn(fields, "status")) {
    throw new ContentValidationError("Use the publish/unpublish/archive/restore action to change status, not an edit.");
  }
  if (Object.hasOwn(fields, "slug") && fields.slug !== existing.slug) {
    if (pageSlugExists(fields.slug)) throw new ContentConflictError(`slug '${fields.slug}' already exists.`);
  }

  const merged = { ...existing, ...fields };
  assertMediaIdsExist(merged.mediaIds);
  const result = validatePage(merged);
  if (!result.valid) throw new ContentValidationError(result.error);

  return runInTransaction(() => {
    const stored = updatePageRow(id, merged);
    recordAuditEntry({ targetType: "page", targetId: id, action: "edit", actor, before: existing, after: stored, note });
    return stored;
  });
}

function transitionPageStatus({ id, toStatus, action, actor, note }) {
  const existing = getPageByIdRow(id);
  if (!existing) throw new ContentNotFoundError(`Page '${id}' was not found.`);
  const fromStatus = existing.status || "draft";
  if (!isAllowedTransition(fromStatus, toStatus)) {
    throw new ContentConflictError(`Cannot move a '${fromStatus}' page to '${toStatus}'.`);
  }
  const merged = { ...existing, status: toStatus };
  const result = validatePage(merged);
  if (!result.valid) throw new ContentValidationError(result.error);

  return runInTransaction(() => {
    const stored = updatePageRow(id, merged);
    recordAuditEntry({ targetType: "page", targetId: id, action, actor, before: existing, after: stored, note });
    return stored;
  });
}

export function publishPage({ id, actor, note }) {
  return transitionPageStatus({ id, toStatus: "published", action: "publish", actor, note });
}
export function sendPageToReview({ id, actor, note }) {
  return transitionPageStatus({ id, toStatus: "inReview", action: "submitForReview", actor, note });
}
export function unpublishPage({ id, actor, note }) {
  return transitionPageStatus({ id, toStatus: "draft", action: "unpublish", actor, note });
}
export function archivePage({ id, actor, note }) {
  return transitionPageStatus({ id, toStatus: "archived", action: "archive", actor, note });
}
export function restorePage({ id, toStatus, actor, note }) {
  if (toStatus !== "draft" && toStatus !== "published") {
    throw new ContentValidationError("toStatus must be 'draft' or 'published' when restoring from archive.");
  }
  return transitionPageStatus({ id, toStatus, action: "restore", actor, note });
}

export function deletePagePermanently({ id, actor, note }) {
  const existing = getPageByIdRow(id);
  if (!existing) throw new ContentNotFoundError(`Page '${id}' was not found.`);
  return runInTransaction(() => {
    deletePageRow(id);
    recordAuditEntry({ targetType: "page", targetId: id, action: "delete", actor, before: existing, after: null, note });
    return { deleted: true, id };
  });
}

export function getPageRevisionHistory(id) {
  return listAuditEntriesForTarget("page", id);
}

/** Public read: only a genuinely published page is ever returned — draft/inReview/archived all resolve as "not found", same fail-closed rule as backend/v2/serializers/publicVisibility.js. */
export function getPublishedPageBySlug(slug) {
  const page = getPageBySlugRow(slug);
  return page && page.status === "published" ? page : null;
}

export { listPagesRows, listNavigationPagesRows, getPageByIdRow };
