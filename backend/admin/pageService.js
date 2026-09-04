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
import { recordPageSlugChange, isHistoricalPageSlug, listSlugHistoryForPage } from "../db/repositories/slugHistoryRepository.js";
import { ContentValidationError, ContentConflictError, ContentNotFoundError } from "./contentService.js";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * "COMMIT ÖNCESİ" round, Section 2/3: a page's slug is reserved the moment
 * it is live OR was ever historically used by ANY page — mirrors
 * contentService.js's slugIsAvailable() exactly, but scoped to the `page`
 * slug-history domain so a page and a cultural entity may freely share
 * slug text (they live in disjoint public namespaces, /sayfa/ vs
 * /archive-v2/ — see slugHistoryRepository.js's header).
 */
function pageSlugIsAvailable(slug) {
  return !pageSlugExists(slug) && !isHistoricalPageSlug(slug);
}

/** Section 3: "prefer a deterministic safe suggestion" on collision — antakya-hakkinda, then antakya-hakkinda-2, -3, ... until one is free. */
function computeAvailablePageSlug(baseSlug) {
  if (pageSlugIsAvailable(baseSlug)) return baseSlug;
  let suffix = 2;
  while (!pageSlugIsAvailable(`${baseSlug}-${suffix}`)) suffix += 1;
  return `${baseSlug}-${suffix}`;
}

/**
 * "published" for slug-lock purposes means "has this exact page EVER been
 * live, at any point" — not merely "is its status currently 'published'"
 * — mirrors contentService.js's hasEverBeenPublished() exactly, and for
 * the identical reason: a page's own published_at column is NULLed on any
 * transition back to draft/inReview, so only the audit log (never
 * rewritten) can answer this honestly.
 */
export function hasPageEverBeenPublished(pageId) {
  return listAuditEntriesForTarget("page", pageId, { limit: 1000 }).some((entry) => entry.action === "publish");
}

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
  if (!pageSlugIsAvailable(candidate.slug)) {
    throw new ContentConflictError(`slug '${candidate.slug}' already exists.`, { suggestedSlug: computeAvailablePageSlug(candidate.slug) });
  }
  assertMediaIdsExist(candidate.mediaIds);

  const result = validatePage(candidate);
  if (!result.valid) throw new ContentValidationError(result.error);

  return runInTransaction(() => {
    const stored = insertPage(candidate);
    recordAuditEntry({ targetType: "page", targetId: stored.id, action: "create", actor, before: null, after: stored });
    return stored;
  });
}

/**
 * Applies a partial content edit without changing status OR slug —
 * "COMMIT ÖNCESİ" round, Section 2: a page's slug now locks exactly like a
 * cultural entity's (mirrors contentService.js's editEntity()). The ONLY
 * way an existing page's slug may change is changePageSlug() below.
 */
export function editPage({ id, fields, actor, note }) {
  const existing = getPageByIdRow(id);
  if (!existing) throw new ContentNotFoundError(`Page '${id}' was not found.`);
  if (Object.hasOwn(fields, "status")) {
    throw new ContentValidationError("Use the publish/unpublish/archive/restore action to change status, not an edit.");
  }
  if (Object.hasOwn(fields, "slug") && fields.slug !== existing.slug) {
    throw new ContentValidationError("'slug' cannot be changed by an edit.");
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

/**
 * "COMMIT ÖNCESİ" round, Section 2/3: the ONLY way an existing page's slug
 * may change — editPage() above still locks it completely. A draft/
 * inReview page that has never been published changes freely (still
 * collision-checked). A page that HAS ever been published
 * (hasPageEverBeenPublished()) requires the caller to have already shown
 * the admin the explicit "this may break old links" warning and pass
 * `confirmed: true` — the exact same confirm-flag pattern
 * changeEntitySlug() uses. The OLD slug is preserved in slug_history (page
 * domain) so the public page route can redirect it, permanently reserving
 * it against reuse by any other page.
 */
export function changePageSlug({ id, newSlug, confirmed, actor }) {
  const existing = getPageByIdRow(id);
  if (!existing) throw new ContentNotFoundError(`Page '${id}' was not found.`);
  if (!newSlug || !SLUG_PATTERN.test(newSlug)) {
    throw new ContentValidationError("slug is missing or invalid (lowercase letters/digits, single-hyphen groups).");
  }
  if (newSlug === existing.slug) {
    throw new ContentValidationError("The new slug is the same as the current slug.");
  }
  if (!pageSlugIsAvailable(newSlug)) {
    throw new ContentConflictError(`slug '${newSlug}' already exists.`, { suggestedSlug: computeAvailablePageSlug(newSlug) });
  }

  const everPublished = hasPageEverBeenPublished(id);
  if (everPublished && confirmed !== true) {
    throw new ContentConflictError(
      "Bu sayfa daha önce yayınlandı. URL değişikliğini onaylamak için confirm:true gönderilmelidir.",
      { requiresConfirmation: true },
    );
  }

  return runInTransaction(() => {
    const oldSlug = existing.slug;
    const stored = updatePageRow(id, { ...existing, slug: newSlug });
    if (everPublished) {
      recordPageSlugChange({ pageId: id, oldSlug, newSlug });
    }
    recordAuditEntry({ targetType: "page", targetId: id, action: "slugChange", actor, before: existing, after: stored, note: `${oldSlug} -> ${newSlug}` });
    return stored;
  });
}

/** For the page editor's "Gelişmiş: URL'yi değiştir" flow — whether to even show the "already published, this is protected" framing at all, and the redirect history to display if any. */
export function getPageSlugChangeInfo(id) {
  const existing = getPageByIdRow(id);
  if (!existing) throw new ContentNotFoundError(`Page '${id}' was not found.`);
  return {
    currentSlug: existing.slug ?? null,
    everPublished: hasPageEverBeenPublished(id),
    history: listSlugHistoryForPage(id),
  };
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
