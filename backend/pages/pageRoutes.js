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
import { getPublishedPageBySlug } from "../admin/pageService.js";
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

export const publicPageHtmlRouter = Router();

publicPageHtmlRouter.get("/:slug", (req, res) => {
  if (!isSqliteRuntimeActive()) return res.status(404).type("text/plain").send("404 — Sayfa bulunamadı / Page not found.");
  const page = getPublishedPageBySlug(req.params.slug);
  if (!page) {
    return res.status(404).type("text/plain").send("404 — Sayfa bulunamadı / Page not found.");
  }
  const html = renderPageHtml(page, { language: req.query.lang });
  res.setHeader("Cache-Control", "no-store"); // rendered fresh per request from live SQLite data — never stale (Section 5/9)
  return res.status(200).type("text/html; charset=utf-8").send(html);
});
