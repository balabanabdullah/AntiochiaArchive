import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DIST_DIR = resolve("dist");
const HTML_ENTRIES = Object.freeze([
  "index.html",
  "pages/history.html",
  "pages/stories.html",
  "pages/structures.html",
  "pages/beliefs.html",
  "pages/communities.html",
  "pages/places.html",
  "pages/music.html",
  "pages/proverbs.html",
  "pages/gallery.html",
  "pages/contributions.html",
  "pages/submissions.html",
  "pages/admin.html",
  "pages/methodology.html",
  "pages/map.html",
  "pages/collections.html",
  "pages/search.html",
  "404.html",
]);
const STABLE_RUNTIME_REFERENCES = /(?:src|href)=["']\/(?:(?:script|lang|archive-api|archive-v2-api|admin-api|admin-archive)\.js|style\.css)["']/g;

// /vendor/ is the one deliberate exception to "every reference must be a
// hashed /assets/ path": third-party libraries (currently just Leaflet,
// public/vendor/leaflet/) are vendored as pinned, unmodified upstream dist
// files rather than run through Rollup — there is nothing app-specific in
// them to content-hash, and vendoring keeps them out of the CDN/CSP/API-key
// tradeoffs a hosted map-tile SDK would introduce. Still asserts the file
// actually exists in dist/, same as every other reference here.
function isAllowedUnversionedAsset(assetPath) {
  return assetPath.startsWith("/vendor/");
}

async function assertBuiltAssetExists(assetPath, htmlEntry) {
  if (!assetPath.startsWith("/assets/") && !isAllowedUnversionedAsset(assetPath)) {
    throw new Error(`${htmlEntry} contains an unversioned build asset: ${assetPath}`);
  }
  await access(resolve(DIST_DIR, assetPath.slice(1)));
}

for (const htmlEntry of HTML_ENTRIES) {
  const html = await readFile(resolve(DIST_DIR, htmlEntry), "utf8");
  const stableReferences = html.match(STABLE_RUNTIME_REFERENCES) || [];
  if (stableReferences.length) {
    throw new Error(`${htmlEntry} still references stable runtime assets: ${stableReferences.join(", ")}`);
  }

  const stylesheets = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/g)]
    .map((match) => match[1]);
  const scripts = [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/g)]
    .map((match) => match[1]);

  if (stylesheets.length === 0 || scripts.length === 0) {
    throw new Error(`${htmlEntry} must reference at least one built stylesheet and script.`);
  }

  await Promise.all([...stylesheets, ...scripts].map((assetPath) => (
    assertBuiltAssetExists(assetPath, htmlEntry)
  )));
}

console.log(`Validated versioned JS/CSS references in ${HTML_ENTRIES.length} built HTML entries.`);
