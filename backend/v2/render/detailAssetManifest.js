// Resolves the CURRENTLY DEPLOYED, content-hashed frontend asset filenames
// (stylesheet + scripts) that generateV2DetailDocument() needs — the exact
// same information scripts/generate-v2-detail-pages.js scrapes out of
// dist/index.html at build time, via regex over the real <link>/<script>
// tags Vite emitted (see that script's header). At runtime this backend has
// no filesystem access to dist/ (it is built and deployed as a completely
// separate artifact/container/Cloud Run service — see backend/Dockerfile's
// header comment and docker-compose.yml's three-service topology), so this
// fetches the live frontend's own index.html over HTTP instead and applies
// the identical regexes.
//
// Cached in memory for CACHE_MS so a burst of detail-page requests doesn't
// each trigger a fresh HTTP round-trip — the asset manifest only changes
// when the frontend itself is redeployed, which is far rarer than a single
// cache window. A transient fetch failure serves the last-known-good
// manifest rather than failing the whole page (see v2DetailRoutes.js),
// since a network blip to the static origin should never turn into a 5xx
// for every cultural-entity detail page at once.

const DEFAULT_ORIGIN = "https://antiochia-app-6939593871.europe-west1.run.app";
const CACHE_MS = Number(process.env.DETAIL_ASSET_MANIFEST_CACHE_MS) || 5 * 60 * 1000;

let cache = null; // { assets, expiresAt }

function extractAssets(html) {
  const stylesheet = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .find((href) => /\/assets\/style-[^/]+\.css$/.test(href));
  const scripts = [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi)].map((match) => match[1]);
  const langScript = scripts.find((source) => /\/assets\/lang-[^/]+\.js$/.test(source));
  const v2ApiScript = scripts.find((source) => /\/assets\/archive-v2-api-[^/]+\.js$/.test(source));
  const appScript = scripts.find((source) => /\/assets\/script-[^/]+\.js$/.test(source));
  const archiveStoreScript = scripts.find((source) => /\/assets\/archive-store-[^/]+\.js$/.test(source));
  const searchScript = scripts.find((source) => /\/assets\/search-[^/]+\.js$/.test(source));
  const musicScript = scripts.find((source) => /\/assets\/music-[^/]+\.js$/.test(source));
  return { stylesheet, langScript, v2ApiScript, appScript, archiveStoreScript, searchScript, musicScript };
}

function isComplete(assets) {
  return Boolean(assets.stylesheet && assets.langScript && assets.v2ApiScript && assets.appScript && assets.archiveStoreScript && assets.searchScript && assets.musicScript);
}

/**
 * Resolves the current asset manifest, from cache when fresh. `fetchImpl`
 * and `origin` are injectable for tests (a real HTTP fetch against a small
 * local fixture server — never mocked-away entirely — proves this module
 * genuinely round-trips over HTTP and parses a real response, the same
 * mechanism production relies on).
 */
export async function resolveDetailAssets({ fetchImpl = fetch, origin = (process.env.CLIENT_URL || DEFAULT_ORIGIN).replace(/\/$/, ""), now = Date.now } = {}) {
  if (cache && cache.expiresAt > now()) return cache.assets;
  try {
    const response = await fetchImpl(`${origin}/index.html`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to fetch ${origin}/index.html (${response.status}).`);
    const html = await response.text();
    const assets = extractAssets(html);
    if (!isComplete(assets)) throw new Error("Could not resolve one or more versioned detail-page assets from the live frontend's index.html.");
    cache = { assets, expiresAt: now() + CACHE_MS };
    return assets;
  } catch (error) {
    if (cache) return cache.assets; // serve stale rather than fail a request over a transient blip
    throw error;
  }
}

/** Test-only: forces the next resolveDetailAssets() call to re-fetch rather than serve a cached manifest from an earlier test. */
export function _resetDetailAssetCacheForTests() {
  cache = null;
}
