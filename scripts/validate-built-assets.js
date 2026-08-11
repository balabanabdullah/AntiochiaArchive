import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DIST_DIR = resolve("dist");
const HTML_ENTRIES = Object.freeze([
  "index.html",
  "pages/history.html",
  "pages/stories.html",
  "pages/structures.html",
  "pages/beliefs.html",
  "pages/music.html",
  "pages/gallery.html",
  "pages/contributions.html",
  "pages/submissions.html",
  "pages/admin.html",
]);
const STABLE_RUNTIME_REFERENCES = /(?:src|href)=["']\/(?:(?:script|lang|archive-api|admin-api|admin-archive)\.js|style\.css)["']/g;

async function assertBuiltAssetExists(assetPath, htmlEntry) {
  if (!assetPath.startsWith("/assets/")) {
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
