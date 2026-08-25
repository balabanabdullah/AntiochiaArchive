import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  ARCHIVE_CATEGORIES,
  DEFAULT_SOCIAL_IMAGE,
  ENTITY_TYPES,
  PRODUCTION_ORIGIN,
  SITE_NAME,
  escapeHtml,
  flattenArchive,
  generateDetailDocument,
  recordDetailPath,
  sitemapUrls,
  socialMetaTags,
  truncateDescription,
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

test("every static detail document carries a BreadcrumbList alongside its WebPage JSON-LD, and full Open Graph + Twitter Card metadata", () => {
  for (const { category, record } of flattenArchive(archive)) {
    const html = generateDetailDocument({
      category,
      record,
      stylesheet: "/assets/style-test.css",
      langScript: "/assets/lang-test.js",
      appScript: "/assets/script-test.js",
    });
    assert.match(html, /"@type":"BreadcrumbList"/, `${record.id}: missing BreadcrumbList`);
    assert.match(html, /<meta property="og:site_name" content="AntiochiaArchive">/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    assert.match(html, /<meta name="twitter:title" content="[^"]+">/);
    assert.match(html, /<meta name="twitter:description" content="[^"]+">/);
    // Image fallback: a record with a real image gets that image and no
    // invented width/height; one without gets the branded 1200x630 fallback
    // with its real, verified dimensions.
    const image = record.image || record.src;
    if (image) {
      assert.ok(html.includes(`<meta property="og:image" content="${PRODUCTION_ORIGIN}${image}">`), `${record.id}: expected its own image as og:image`);
      assert.doesNotMatch(html, /og:image:width/, `${record.id}: must not invent dimensions for a real record image`);
    } else {
      assert.ok(html.includes(`<meta property="og:image" content="${PRODUCTION_ORIGIN}${DEFAULT_SOCIAL_IMAGE}">`), `${record.id}: expected the branded fallback image`);
      assert.match(html, /<meta property="og:image:width" content="1200">/);
      assert.match(html, /<meta property="og:image:height" content="630">/);
    }
  }
});

test("generated social metadata never uses localhost, a relative URL, or a mismatched canonical", () => {
  for (const { category, record } of flattenArchive(archive)) {
    const html = generateDetailDocument({
      category,
      record,
      stylesheet: "/assets/style-test.css",
      langScript: "/assets/lang-test.js",
      appScript: "/assets/script-test.js",
    });
    const ogUrl = html.match(/<meta property="og:url" content="([^"]+)">/)[1];
    const canonical = html.match(/<link rel="canonical" href="([^"]+)">/)[1];
    assert.equal(ogUrl, canonical, `${record.id}: og:url must equal the canonical URL`);
    assert.doesNotMatch(html, /localhost|127\.0\.0\.1/, `${record.id}: leaked a dev URL into social metadata`);
    assert.doesNotMatch(html, /content="\/(?!\/)/, `${record.id}: og:/twitter: meta must never use a bare relative URL`);
  }
});

test("a title or summary containing HTML/script-like text is escaped in every meta tag, never breaking out of the attribute", () => {
  const hostileRecord = {
    id: "hostile-1", slug: "hostile-record", entityType: "historicalContext",
    title: { en: '"><script>alert(1)</script>' },
    body: { en: '<img src=x onerror=alert(1)> a description with "quotes" & an ampersand' },
  };
  const html = generateDetailDocument({
    category: "history", record: hostileRecord,
    stylesheet: "/s.css", langScript: "/l.js", appScript: "/a.js",
  });
  assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
  assert.doesNotMatch(html, /content="[^"]*"[^>]*>[^<]*<\/script>/); // no unescaped quote breaking a meta tag open
  // The JSON-LD blob legitimately contains the title as JSON *data* (safe:
  // application/ld+json is never executed as script) — but a literal
  // "</script>" byte sequence inside it would prematurely close the HTML
  // <script> element regardless of JSON escaping, injecting raw markup. The
  // generator must escape "<" to < specifically to prevent that.
  const ldJsonPayload = html.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)[1];
  assert.ok(!ldJsonPayload.includes("</script>"), "a literal </script> inside the JSON-LD payload would truncate the script element early");
  assert.match(ldJsonPayload, /\\u003cscript>alert\(1\)\\u003c\/script>/, "the hostile title must survive as data, with only '<' escaped to \\u003c");
});

test("truncateDescription strips HTML, collapses whitespace, and cuts on a whole word with an ellipsis — short text is untouched", () => {
  assert.equal(truncateDescription("A short summary."), "A short summary.");
  assert.equal(truncateDescription("  <p>Has   <b>html</b>\nand\textra   whitespace.</p>  "), "Has html and extra whitespace.");
  const long = "word ".repeat(60).trim();
  const truncated = truncateDescription(long, { max: 50 });
  assert.ok(truncated.length <= 51, "truncated text should respect the max bound (plus the ellipsis char)");
  assert.ok(truncated.endsWith("…"));
  assert.doesNotMatch(truncated, /\sword$/, "must not cut mid-word");
  assert.equal(truncateDescription(null), "");
});

test("socialMetaTags: absolute image URL is used as-is; a root-relative image path is resolved against PRODUCTION_ORIGIN; no image falls back to the branded 1200x630 card", () => {
  const withAbsolute = socialMetaTags({ title: "T", description: "D", url: `${PRODUCTION_ORIGIN}/x`, image: "https://cdn.example.com/pic.jpg" });
  assert.match(withAbsolute, /<meta property="og:image" content="https:\/\/cdn\.example\.com\/pic\.jpg">/);
  assert.doesNotMatch(withAbsolute, /og:image:width/);

  const withRelative = socialMetaTags({ title: "T", description: "D", url: `${PRODUCTION_ORIGIN}/x`, image: "/images/x.webp" });
  assert.match(withRelative, new RegExp(`og:image" content="${PRODUCTION_ORIGIN}/images/x\\.webp"`));

  const withoutImage = socialMetaTags({ title: "T", description: "D", url: `${PRODUCTION_ORIGIN}/x` });
  assert.match(withoutImage, new RegExp(`og:image" content="${PRODUCTION_ORIGIN}${DEFAULT_SOCIAL_IMAGE}"`));
  assert.match(withoutImage, /og:image:width" content="1200"/);
  assert.match(withoutImage, /og:image:height" content="630"/);
  assert.match(withoutImage, new RegExp(`og:site_name" content="${SITE_NAME}"`));
  assert.match(withoutImage, /twitter:card" content="summary_large_image"/);
});
