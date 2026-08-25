import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PRODUCTION_ORIGIN } from "./archive-release.js";
import {
  V2_TYPE_INFO,
  collectPublicV2Entities,
  v2DetailPath,
  v2SitemapUrls,
  validatePublicV2Entities,
} from "./v2-archive-release.js";

const repositoryRoot = resolve(import.meta.dirname, "..");
const distRoot = resolve(repositoryRoot, "dist");

// The live-computed public count, never a hardcoded number — v2's public
// count grows over time as more reviewed entities are published, unlike
// v1's frozen 23.
const entities = await collectPublicV2Entities();
const validation = validatePublicV2Entities(entities);

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function builtPathFor(href) {
  const path = href.split("#", 1)[0].split("?", 1)[0];
  if (!path || path === "/") return resolve(distRoot, "index.html");
  if (path.endsWith("/")) return resolve(distRoot, path.slice(1), "index.html");
  return resolve(distRoot, path.slice(1));
}

const sitemap = await readFile(resolve(distRoot, "sitemap.xml"), "utf8");
const sitemapEntries = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const expectedV2Urls = v2SitemapUrls(entities);
for (const url of expectedV2Urls) {
  check(sitemapEntries.includes(url), `Sitemap is missing v2 URL: ${url}`);
}

for (const entity of entities) {
  const route = v2DetailPath(entity);
  const file = resolve(distRoot, route.slice(1), "index.html");
  const html = await readFile(file, "utf8");
  const typeInfo = V2_TYPE_INFO[entity.entityType];
  const canonical = `${PRODUCTION_ORIGIN}${route}`;

  check(html.includes(`<link rel="canonical" href="${canonical}">`), `${entity.id} has an invalid canonical URL.`);
  check((html.match(/<h1\b/g) || []).length === 1, `${entity.id} must have exactly one H1.`);
  check(/<meta name="description" content="[^"]+">/.test(html), `${entity.id} is missing a description.`);
  check(html.includes('"@type":"WebPage"'), `${entity.id} is missing WebPage JSON-LD.`);
  check(html.includes('"@type":"BreadcrumbList"'), `${entity.id} is missing BreadcrumbList JSON-LD.`);
  check(/<meta property="og:site_name" content="AntiochiaArchive">/.test(html), `${entity.id} is missing og:site_name.`);
  check(/<meta property="og:image" content="https:\/\/[^"]+">/.test(html), `${entity.id} has a missing or non-absolute og:image.`);
  check(/<meta name="twitter:card" content="summary_large_image">/.test(html), `${entity.id} is missing twitter:card.`);
  check(/<meta name="twitter:image" content="https:\/\/[^"]+">/.test(html), `${entity.id} has a missing or non-absolute twitter:image.`);
  check(html.includes(`data-entity-id="${entity.id}"`), `${entity.id} detail page identity is missing.`);
  check(html.includes(`href="${route}"`) === false, `${entity.id} contains a self-referential card link.`);
  check(html.includes(`href="${typeInfo.href}"`), `${entity.id} is missing its parent collection link.`);

  // The hidden-by-default related-entities section from Phase 5 must exist
  // (client-populated) and must never ship pre-rendered with visible
  // content — relationships are not baked into the static build (see
  // V2-ARCHITECTURE.md "Public relationship gating").
  check(html.includes("data-related-entities-section") && html.includes(" hidden "), `${entity.id} is missing the hidden-by-default related-entities section.`);

  for (const href of [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1])) {
    if (/^(?:https?:|mailto:|tel:)/.test(href) || href.startsWith("#")) continue;
    await access(await builtPathFor(href));
  }

  if (entity.media?.path) await access(resolve(distRoot, entity.media.path.slice(1)));
  else check(html.includes("record-detail-placeholder"), `${entity.id} is missing its intentional placeholder.`);

  // Sentinel leak guard: a static page is generated once at build time from
  // serializePublicEntity() output, which already strips sentinels — but a
  // regression there would otherwise ship silently to production HTML.
  check(!/NEEDS VERIFICATION|NEEDS SOURCE-EXACT|UNRESOLVED|NOT YET RESEARCHED|NO RELIABLE SOURCE FOUND/i.test(html), `${entity.id} leaked a raw sentinel placeholder into its static page.`);
}

const detailRoot = resolve(distRoot, "archive-v2");
const generatedDirectories = (await readdir(detailRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
check(generatedDirectories.length === validation.count, `Expected ${validation.count} v2 detail directories, found ${generatedDirectories.length}.`);

console.log(`Validated ${validation.count} v2 detail pages against the live-computed public count, sitemap coverage, canonicals, and sentinel-leak safety.`);
