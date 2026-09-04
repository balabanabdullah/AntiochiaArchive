// Public (unauthenticated) routes for admin-created CMS pages — Section
// 17-18. Two small routers, each mounted separately in server.js:
//   publicPageJsonRouter  -> GET /api/pages/:slug        (JSON, for a future
//                            client-rendered shell or mobile app — Section 32)
//   publicPageHtmlRouter  -> GET /sayfa/:slug            (full server-rendered
//                            HTML with real SEO tags — see pageRenderer.js)
//
// Sitemap coverage for pages now lives in v2/render/runtimeSitemap.js
// (a single, unified dynamic sitemap covering both pages and cultural
// entities — see that module's header for why the two were merged).
//
// Every route here applies the exact same fail-closed rule as
// backend/v2/serializers/publicVisibility.js: draft/readyForReview/archived
// (or a missing page) all produce the same 404 — a visitor can never tell
// "doesn't exist" from "exists but isn't published yet".

import { Router } from "express";
import { isSqliteRuntimeActive } from "../v2/stores/v2Store.js";
import { getPublishedPageBySlug, getPageByIdRow } from "../admin/pageService.js";
import { findPageIdByHistoricalSlug } from "../db/repositories/slugHistoryRepository.js";
import { renderPageHtml } from "./pageRenderer.js";

const PAGE_PUBLIC_FIELDS = Object.freeze([
  "id", "slug", "title", "summary", "content", "seoTitle", "seoDescription",
  "navigationLabel", "showInNavigation", "navigationGroup", "navigationOrder",
  "publishedAt", "updatedAt",
]);

function serializePublicPage(page) {
  const out = {};
  for (const field of PAGE_PUBLIC_FIELDS) if (page[field] !== undefined) out[field] = page[field];
  return out;
}

export const publicPageJsonRouter = Router();

publicPageJsonRouter.get("/:slug", (req, res) => {
  if (!isSqliteRuntimeActive()) return res.status(404).json({ success: false, error: "Page not found." });
  const page = getPublishedPageBySlug(req.params.slug);
  if (!page) return res.status(404).json({ success: false, error: "Page not found." });
  return res.status(200).json({ success: true, data: serializePublicPage(page) });
});

/**
 * "COMMIT ÖNCESİ" round, Section 3: a page slug an admin changed away from
 * (on a previously-published page — see pageService.js's changePageSlug())
 * 301-redirects here to the page's CURRENT slug, rather than 404ing, so an
 * already-shared/indexed old /sayfa/ URL keeps working. Resolves to the
 * CURRENT slug column directly (never the recorded `new_slug`) so this is
 * always exactly one hop, never a chain — the same guarantee
 * v2/routes/v2DetailRoutes.js's resolveHistoricalSlugRedirect() gives
 * cultural entities, reusing the same shared slug_history table (page
 * domain).
 */
function resolveHistoricalPageSlugRedirect(slug) {
  if (!isSqliteRuntimeActive()) return null;
  const pageId = findPageIdByHistoricalSlug(slug);
  if (!pageId) return null;
  const current = getPageByIdRow(pageId);
  // Section 5: "archived page old aliases do not expose content" — an old
  // slug for a page that is not (or no longer) published must never
  // redirect anywhere; it 404s exactly like an unknown slug would.
  if (!current || !current.slug || current.slug === slug || current.status !== "published") return null;
  return current.slug;
}

export const publicPageHtmlRouter = Router();

publicPageHtmlRouter.get("/:slug", (req, res) => {
  if (!isSqliteRuntimeActive()) return res.status(404).type("text/plain").send("404 — Sayfa bulunamadı / Page not found.");
  const page = getPublishedPageBySlug(req.params.slug);
  if (!page) {
    let redirectSlug;
    try {
      redirectSlug = resolveHistoricalPageSlugRedirect(req.params.slug);
    } catch (error) {
      console.error("[PageRoutes] slug history lookup failed:", error.message);
    }
    if (redirectSlug) {
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(301, `/sayfa/${encodeURIComponent(redirectSlug)}/`);
    }
    return res.status(404).type("text/plain").send("404 — Sayfa bulunamadı / Page not found.");
  }
  const html = renderPageHtml(page, { language: req.query.lang });
  res.setHeader("Cache-Control", "no-store"); // rendered fresh per request from live SQLite data — never stale (Section 5/9)
  return res.status(200).type("text/html; charset=utf-8").send(html);
});
