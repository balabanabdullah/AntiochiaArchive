import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  ARCHIVE_CATEGORIES,
  ENTITY_TYPES,
  escapeHtml,
  flattenArchive,
  generateDetailDocument,
  recordDetailPath,
  sitemapUrls,
  validateReleaseArchive,
} from "../scripts/archive-release.js";

const archive = JSON.parse(fs.readFileSync(new URL("../data/archive.json", import.meta.url), "utf8"));

test("v1.0 archive contains approved b4 and 23 stable public identities", () => {
  const validation = validateReleaseArchive(archive);
  assert.equal(validation.count, 23);
  assert.deepEqual(Object.fromEntries(ARCHIVE_CATEGORIES.map((category) => [category, archive[category].length])), {
    history: 3,
    stories: 3,
    structures: 4,
    beliefs: 4,
    music: 3,
    gallery: 6,
  });
  const records = flattenArchive(archive).map(({ record }) => record);
  assert.equal(new Set(records.map((record) => record.slug)).size, 23);
  assert.ok(records.every((record) => ENTITY_TYPES.includes(record.entityType)));
  const b4 = archive.beliefs.find((record) => record.id === "b4");
  assert.equal(b4.categoryKey, "shrine");
  assert.equal(b4.imageMetadata.source, "Wikimedia Commons");
  assert.equal(b4.imageMetadata.author, "TheJoyfulTentmaker");
  assert.equal(b4.imageMetadata.license, "CC BY 4.0");
  assert.equal(b4.imageMetadata.aiGenerated, false);
});

test("every static detail document contains default content, stable metadata, and navigation", () => {
  for (const { category, record } of flattenArchive(archive)) {
    const html = generateDetailDocument({
      category,
      record,
      stylesheet: "/assets/style-test.css",
      langScript: "/assets/lang-test.js",
      appScript: "/assets/script-test.js",
    });
    assert.ok(html.includes(`<h1 data-detail-title>${escapeHtml(record.title.en)}</h1>`));
    assert.match(html, new RegExp(`<link rel="canonical" href="https://[^\"]+${recordDetailPath(record)}">`));
    assert.match(html, /"@type":"WebPage"/);
    assert.match(html, new RegExp(`href="/pages/${category}\.html"`));
    assert.match(html, /href="\/index\.html"/);
    if (!(record.image || record.src)) assert.match(html, /record-detail-placeholder/);
  }
});

test("sitemap covers the homepage, collections, methodology, and all detail routes", () => {
  const urls = sitemapUrls(archive);
  assert.equal(urls.length, 31);
  assert.equal(new Set(urls).size, urls.length);
  for (const { record } of flattenArchive(archive)) {
    assert.ok(urls.some((url) => url.endsWith(recordDetailPath(record))));
  }
  assert.ok(!urls.some((url) => /admin|submissions|\/api\//.test(url)));
});

test("public renderer links records and replaces failed images with archive placeholders", () => {
  const script = fs.readFileSync(new URL("../public/script.js", import.meta.url), "utf8");
  assert.match(script, /function renderArchiveDetailLink/);
  assert.match(script, /function initArchiveImageFallbacks/);
  assert.match(script, /image\.addEventListener\("error", replaceBrokenImage/);
  assert.match(script, /figure\.innerHTML = buildSvg/);
});
