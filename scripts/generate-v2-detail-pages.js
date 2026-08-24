import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  collectPublicV2Entities,
  generateV2DetailDocument,
  v2DetailPath,
  validatePublicV2Entities,
} from "./v2-archive-release.js";

const repositoryRoot = resolve(import.meta.dirname, "..");
const distRoot = resolve(repositoryRoot, "dist");

const entities = await collectPublicV2Entities();
const validation = validatePublicV2Entities(entities);

const builtIndex = await readFile(resolve(distRoot, "index.html"), "utf8");
const stylesheet = [...builtIndex.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)]
  .map((match) => match[1])
  .find((href) => /\/assets\/style-[^/]+\.css$/.test(href));
const scripts = [...builtIndex.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi)].map((match) => match[1]);
const langScript = scripts.find((source) => /\/assets\/lang-[^/]+\.js$/.test(source));
const v2ApiScript = scripts.find((source) => /\/assets\/archive-v2-api-[^/]+\.js$/.test(source));
const appScript = scripts.find((source) => /\/assets\/script-[^/]+\.js$/.test(source));
// The discovery-feature modules (see public/js/): a detail page's header
// search box and its "explore more" section both need AntiochiaArchiveStore
// and AntiochiaArchiveSearch — the same versioned-asset resolution used for
// lang/v2-api/script above.
const archiveStoreScript = scripts.find((source) => /\/assets\/archive-store-[^/]+\.js$/.test(source));
const searchScript = scripts.find((source) => /\/assets\/search-[^/]+\.js$/.test(source));
// Only music detail pages actually load this (see generateV2DetailDocument) —
// resolved here regardless so every page type shares the same lookup.
const musicScript = scripts.find((source) => /\/assets\/music-[^/]+\.js$/.test(source));

if (!stylesheet || !langScript || !v2ApiScript || !appScript || !archiveStoreScript || !searchScript || !musicScript) {
  throw new Error("Could not resolve versioned stylesheet, language script, v2 API script, discovery-feature scripts, and application script from dist/index.html.");
}

for (const entity of entities) {
  const relative = `${v2DetailPath(entity).slice(1)}index.html`;
  const destination = resolve(distRoot, relative);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, generateV2DetailDocument({
    entity,
    stylesheet,
    langScript,
    v2ApiScript,
    archiveStoreScript,
    searchScript,
    musicScript,
    appScript,
    entities,
  }), "utf8");
}

await Promise.all(entities.map((entity) => (
  access(resolve(distRoot, `archive-v2/${entity.slug}/index.html`))
)));

console.log(`Generated ${validation.count} static v2 archive detail pages with versioned assets.`);
