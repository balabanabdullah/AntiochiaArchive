// Repository for the `slug_history` table (migration 0002, generalized by
// migration 0003 — "UX refinement" round then the "COMMIT ÖNCESİ" round).
// One shared, domain-partitioned table backs the redirect/reservation
// history for BOTH cultural entities (/archive-v2/:slug/) and CMS pages
// (/sayfa/:slug/) — a single generic alias/history service, not two
// unrelated ones. `domain` scopes every uniqueness/lookup so identical slug
// text is free to exist independently in each namespace (they are
// genuinely different public URLs), while staying collision-safe WITHIN a
// namespace via a UNIQUE(domain, old_slug) index.
//
// The functions below are exported as domain-specific, purpose-named pairs
// (entity vs. page) rather than a raw domain-string parameter — every
// caller (contentService.js / pageService.js / the two public detail
// routes) reads exactly as if each domain still had its own dedicated
// table, with zero call-site awareness of the shared implementation.

import { getSqlite } from "../sqliteConnection.js";

function domainRepository(domain) {
  return {
    /** Records an old->new slug change as permanently reserved (old_slug is globally unique WITHIN this domain — see the migration). */
    recordSlugChange({ recordId, oldSlug, newSlug }) {
      getSqlite().prepare(`
        INSERT INTO slug_history (domain, record_id, old_slug, new_slug, changed_at)
        VALUES (@domain, @recordId, @oldSlug, @newSlug, @changedAt)
      `).run({ domain, recordId, oldSlug, newSlug, changedAt: new Date().toISOString() });
    },
    /** True if `slug` was ever any record's OLD slug in this domain — reserved forever, regardless of whether that record is even the one being checked. */
    isHistoricalSlug(slug) {
      return Boolean(getSqlite().prepare("SELECT 1 FROM slug_history WHERE domain = ? AND old_slug = ?").get(domain, slug));
    },
    /**
     * Resolves a historical slug straight to the record id that once used
     * it — the caller then reads that record's CURRENT slug from its own
     * live table, rather than the `new_slug` recorded at this specific
     * history row (which could itself be stale after more than one
     * change) — this is what keeps a redirect a single hop, never a chain.
     */
    findRecordIdByHistoricalSlug(slug) {
      const row = getSqlite().prepare("SELECT record_id FROM slug_history WHERE domain = ? AND old_slug = ?").get(domain, slug);
      return row ? row.record_id : null;
    },
    listSlugHistoryForRecord(recordId) {
      return getSqlite().prepare("SELECT * FROM slug_history WHERE domain = ? AND record_id = ? ORDER BY changed_at ASC").all(domain, recordId)
        .map((row) => ({ id: row.id, recordId: row.record_id, oldSlug: row.old_slug, newSlug: row.new_slug, changedAt: row.changed_at }));
    },
  };
}

const entityDomain = domainRepository("entity");
const pageDomain = domainRepository("page");

// -- Cultural entities (/archive-v2/:slug/) — names unchanged from before
// the generalization, so contentService.js and v2DetailRoutes.js needed no
// changes at their call sites. --
export function recordSlugChange({ entityId, oldSlug, newSlug }) { return entityDomain.recordSlugChange({ recordId: entityId, oldSlug, newSlug }); }
export function isHistoricalSlug(slug) { return entityDomain.isHistoricalSlug(slug); }
export function findEntityIdByHistoricalSlug(slug) { return entityDomain.findRecordIdByHistoricalSlug(slug); }
export function listSlugHistoryForEntity(entityId) { return entityDomain.listSlugHistoryForRecord(entityId); }

// -- CMS pages (/sayfa/:slug/) — "COMMIT ÖNCESİ" round: the same
// principles, extended to pages, sharing the table above but never its
// collision domain (a page and an entity may freely share slug text). --
export function recordPageSlugChange({ pageId, oldSlug, newSlug }) { return pageDomain.recordSlugChange({ recordId: pageId, oldSlug, newSlug }); }
export function isHistoricalPageSlug(slug) { return pageDomain.isHistoricalSlug(slug); }
export function findPageIdByHistoricalSlug(slug) { return pageDomain.findRecordIdByHistoricalSlug(slug); }
export function listSlugHistoryForPage(pageId) { return pageDomain.listSlugHistoryForRecord(pageId); }
