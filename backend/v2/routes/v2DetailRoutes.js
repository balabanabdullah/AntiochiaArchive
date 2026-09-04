// GET /archive-v2/:slug/ — the runtime fallback that closes this round's
// critical gap. Mounted directly at the exact same URL prefix the static
// generator (scripts/generate-v2-detail-pages.js) writes files under, so
// nginx can proxy here ONLY when a static file for that slug doesn't
// already exist (see nginx/default.conf's error_page-based fallback) —
// no second canonical URL is ever introduced.
//
// Store-agnostic: uses whichever V2Store is active (getV2Store()), so this
// works identically whether the deployment is running sqlite (freshest —
// never stale, by construction, since every request re-reads the live
// table), local, memory, or firestore.

import { Router } from "express";
import { getV2Store, isSqliteRuntimeActive } from "../stores/v2Store.js";
import { findPublicEntityBySlug, renderEntityDetailHtml } from "../render/entityDetailRenderer.js";
import { findEntityIdByHistoricalSlug } from "../../db/repositories/slugHistoryRepository.js";
import { isPublic } from "../serializers/publicVisibility.js";

const router = Router();

/**
 * "UX refinement" round, Sections 12/14/15: a slug an admin changed away
 * from (on a previously-published entity — see contentService.js's
 * changeEntitySlug()) 301-redirects here to the entity's CURRENT slug,
 * rather than 404ing, so an already-shared/indexed old URL keeps working.
 * Resolves to the CURRENT slug column directly (never the `new_slug`
 * recorded at that specific history row) so this is always exactly one
 * hop, never a chain, even if the entity has changed slugs more than once.
 * Only meaningful when SQLite is the runtime authority — the table
 * (and changeEntitySlug() itself) only exists in that mode.
 */
async function resolveHistoricalSlugRedirect(store, slug) {
  if (!isSqliteRuntimeActive()) return null;
  const entityId = findEntityIdByHistoricalSlug(slug);
  if (!entityId) return null;
  const current = await store.getEntityById(entityId);
  // Section 14: "archived entity aliases do not expose content" — an old
  // slug for an entity that is not (or no longer) publicly visible must
  // never redirect anywhere; it 404s exactly like an unknown slug would.
  if (!current || !current.slug || current.slug === slug || !isPublic(current)) return null;
  return current.slug;
}

router.get("/:slug", async (req, res) => {
  const store = getV2Store();
  let entity;
  try {
    entity = await findPublicEntityBySlug(store, req.params.slug);
  } catch (error) {
    console.error("[V2DetailRoutes]", error.message);
    return res.status(500).type("text/plain").send("500 — Kayıt işlenemedi.");
  }
  if (!entity) {
    let redirectSlug;
    try {
      redirectSlug = await resolveHistoricalSlugRedirect(store, req.params.slug);
    } catch (error) {
      console.error("[V2DetailRoutes] slug history lookup failed:", error.message);
    }
    if (redirectSlug) {
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(301, `/archive-v2/${encodeURIComponent(redirectSlug)}/`);
    }
    return res.status(404).type("text/plain").send("404 — Kayıt bulunamadı / Record not found.");
  }

  try {
    const html = await renderEntityDetailHtml(store, entity);
    // Rendered fresh from the live store on every request — this is the
    // whole point (Section 3: never shadow a SQLite edit with stale
    // content) — so it must never be cached as if it were a static asset.
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).type("text/html; charset=utf-8").send(html);
  } catch (error) {
    // Deliberately 503, not 404/500: the entity itself is known-good at
    // this point (see the lookup above) — a failure here means the shared
    // template's asset-manifest resolution (detailAssetManifest.js) could
    // not reach the live frontend and has no cached fallback yet. A 404
    // would wrongly trigger nginx's static-file fallback (@archive_v2_static
    // in nginx/default.conf), which could serve a stale page for an entity
    // edited since the last build — so this fails loudly and asks for a
    // retry instead.
    console.error("[V2DetailRoutes] render failed:", error.message);
    return res.status(503).type("text/plain").send("503 — Görüntüleme geçici olarak kullanılamıyor, lütfen tekrar deneyin.");
  }
});

export default router;
