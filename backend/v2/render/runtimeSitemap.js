// Single, coherent runtime sitemap strategy (Section 6/7 of the
// "correctness pass" round — the earlier "no-code CMS" round's separate,
// disconnected `/sitemap-pages.xml` was explicitly called out as
// insufficient, and this round found and fixed a real staleness bug in
// that first fix attempt — see below).
//
// Design: `/sitemap-index.xml` references exactly two sitemaps —
//   /sitemap.xml           (scripts/generate-sitemap.js, build-time,
//                            TRULY STATIC system routes only: v1 detail/
//                            category pages, v2/discovery category HTML
//                            pages — nothing whose visibility a publish/
//                            archive action can ever change)
//   /sitemap-runtime.xml   (this module, live-queried from whichever
//                            V2Store is currently authoritative, on every
//                            request — every published cultural entity +
//                            every published CMS page)
// An operator submits the INDEX to Search Console (and robots.txt's
// `Sitemap:` line points at it — see public/robots.txt) exactly once; it
// never needs to change again no matter how many entities/pages are
// published or archived afterward.
//
// BUG FOUND AND FIXED THIS ROUND: the previous version of this file was
// correct in isolation, but scripts/generate-sitemap.js ALSO baked every
// public v2 entity's URL into the static sitemap.xml at build time (via
// v2SitemapUrls). Archiving a runtime entity that existed at the last
// build removed it from this file's dynamic sitemap (correct) while it
// remained listed in sitemap.xml until the next deploy (stale) — so
// /sitemap-index.xml's UNION still served that URL. The fix was in
// generate-sitemap.js (entity URLs removed from the static file entirely,
// not here) — see backend/test/v2/render/runtimeSitemap.test.js's
// "Section 6" test and scripts/generate-sitemap.js's header comment for
// the full account. Querying the live store here is also correct in
// non-sqlite modes (local/firestore/memory) — those stores' data is fixed
// per-deploy too, so this simply reflects it directly instead of via a
// second, potentially-drifting static snapshot.

import { getV2Store, isSqliteRuntimeActive } from "../stores/v2Store.js";
import { isPublic } from "../serializers/publicVisibility.js";
import { DETAIL_ELIGIBLE_TYPES } from "./entityDetailRenderer.js";
import { listPagesRows } from "../../admin/pageService.js";

const SITE_ORIGIN = (process.env.CLIENT_URL || "https://antiochia-app-6939593871.europe-west1.run.app").replace(/\/$/, "");

async function publishedEntityUrls() {
  const store = getV2Store();
  const page = await store.listEntities({ limit: 100000 });
  return page.items
    .filter((entity) => isPublic(entity) && DETAIL_ELIGIBLE_TYPES.includes(entity.entityType) && entity.slug)
    .map((entity) => `${SITE_ORIGIN}/archive-v2/${encodeURIComponent(entity.slug)}/`);
}

function publishedPageUrls() {
  if (!isSqliteRuntimeActive()) return []; // pages only exist in this runtime — see pageRoutes.js's identical guard
  return listPagesRows({ status: "published" }).map((page) => `${SITE_ORIGIN}/sayfa/${encodeURIComponent(page.slug)}/`);
}

function urlsetXml(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${url}</loc></url>`).join("\n")}\n</urlset>\n`;
}

/** GET /sitemap-runtime.xml — every published entity + published page, live. */
export async function runtimeSitemapHandler(_req, res) {
  try {
    const entityUrls = await publishedEntityUrls();
    const pageUrls = publishedPageUrls();
    const urls = [...entityUrls, ...pageUrls];
    if (new Set(urls).size !== urls.length) {
      // Should be structurally impossible (entity slugs and page slugs live
      // in disjoint URL namespaces, /archive-v2/ vs /sayfa/), but a
      // duplicate URL in a submitted sitemap is a real Search Console
      // warning — fail loudly rather than silently ship one.
      throw new Error("runtimeSitemapHandler produced a duplicate URL.");
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).type("application/xml").send(urlsetXml(urls));
  } catch (error) {
    console.error("[RuntimeSitemap] runtime sitemap failed:", error.message);
    return res.status(500).type("application/xml").send(urlsetXml([]));
  }
}

/** GET /sitemap-index.xml — references the static sitemap.xml (system routes only) plus the live runtime sitemap above. Submit this ONE url to Search Console. */
export function sitemapIndexHandler(_req, res) {
  const sitemaps = [`${SITE_ORIGIN}/sitemap.xml`, `${SITE_ORIGIN}/sitemap-runtime.xml`];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps.map((url) => `  <sitemap><loc>${url}</loc></sitemap>`).join("\n")}\n</sitemapindex>\n`;
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).type("application/xml").send(xml);
}
