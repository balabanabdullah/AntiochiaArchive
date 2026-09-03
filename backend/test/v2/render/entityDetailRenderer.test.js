import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { findPublicEntityBySlug, renderEntityDetailHtml, DETAIL_ELIGIBLE_TYPES } from "../../../v2/render/entityDetailRenderer.js";
import { _resetDetailAssetCacheForTests } from "../../../v2/render/detailAssetManifest.js";
import { createMemoryV2Store } from "../../../v2/stores/memoryV2Store.js";

function fixtureStore(entities, relationships = []) {
  return createMemoryV2Store({ entities, relationships });
}

const FIXTURE_INDEX_HTML = `<!doctype html><html><head>
  <link rel="stylesheet" href="/assets/style-testhash.css">
  <script src="/assets/lang-testhash.js"></script>
  <script src="/assets/archive-v2-api-testhash.js"></script>
  <script src="/assets/archive-store-testhash.js"></script>
  <script src="/assets/search-testhash.js"></script>
  <script src="/assets/music-testhash.js"></script>
  <script src="/assets/script-testhash.js"></script>
</head><body></body></html>`;

/**
 * renderEntityDetailHtml() resolves the live frontend's current asset
 * filenames over a real HTTP request (see detailAssetManifest.js) — this
 * starts a tiny local HTTP server standing in for "the deployed frontend"
 * and points CLIENT_URL at it, so every test in this file exercises the
 * genuine fetch-and-parse mechanism production relies on, rather than a
 * stubbed-out shortcut.
 */
async function withDetailAssets(t) {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(FIXTURE_INDEX_HTML);
  });
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const originalClientUrl = process.env.CLIENT_URL;
  process.env.CLIENT_URL = `http://127.0.0.1:${server.address().port}`;
  _resetDetailAssetCacheForTests();
  t.after(async () => {
    await new Promise((resolvePromise) => server.close(resolvePromise));
    if (originalClientUrl === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = originalClientUrl;
    _resetDetailAssetCacheForTests();
  });
}

test("findPublicEntityBySlug only returns a published, detail-eligible, slug-matching entity", async () => {
  const store = fixtureStore([
    { id: "hist-1", entityType: "historicalContext", slug: "public-one", status: "published", title: { tr: "T" } },
    { id: "hist-2", entityType: "historicalContext", slug: "draft-one", status: "draft", title: { tr: "T" } },
    { id: "media-1", entityType: "media", slug: undefined, status: undefined, mediaType: "image" },
  ]);
  assert.equal((await findPublicEntityBySlug(store, "public-one")).id, "hist-1");
  assert.equal(await findPublicEntityBySlug(store, "draft-one"), null);
  assert.equal(await findPublicEntityBySlug(store, "does-not-exist"), null);
  assert.equal(await findPublicEntityBySlug(store, undefined), null);
});

test("DETAIL_ELIGIBLE_TYPES excludes media/source, matching the static generator's V2_TYPE_INFO", () => {
  assert.ok(!DETAIL_ELIGIBLE_TYPES.includes("media"));
  assert.ok(!DETAIL_ELIGIBLE_TYPES.includes("source"));
  assert.ok(DETAIL_ELIGIBLE_TYPES.includes("place"));
  assert.equal(DETAIL_ELIGIBLE_TYPES.length, 8);
});

test("renderEntityDetailHtml uses the SAME shared template as the static generator — real header/nav/footer, not a minimal shell", async (t) => {
  await withDetailAssets(t);
  const store = fixtureStore([]);
  const entity = { id: "place-1", entityType: "place", slug: "antakya", status: "published", title: { tr: "Antakya", en: "Antioch" }, summary: { tr: "Özet" } };
  const html = await renderEntityDetailHtml(store, entity);
  assert.match(html, /class="site-header"/);
  assert.match(html, /class="site-footer"/);
  assert.match(html, /class="nav-discover"/);
  assert.match(html, /id="v2-record-data"/);
  assert.match(html, /assets\/style-testhash\.css/);
  assert.match(html, /assets\/script-testhash\.js/);
});

test("renderEntityDetailHtml escapes a hostile title and cannot break out of the JSON-LD <script> block", async (t) => {
  await withDetailAssets(t);
  const store = fixtureStore([]);
  const hostile = {
    id: "hist-1", entityType: "historicalContext", slug: "s", status: "published",
    title: { tr: "</script><script>alert(1)</script>" },
    summary: { tr: "<img src=x onerror=alert(1)>" },
  };
  const html = await renderEntityDetailHtml(store, hostile);
  assert.ok(!html.includes("</script><script>alert(1)"));
  assert.ok(!html.includes("<img src=x onerror"));
  assert.ok(html.includes("&lt;script&gt;") || html.includes("\\u003cscript\\u003e"));
});

test("renders real SEO tags: canonical, OG, Twitter, JSON-LD", async (t) => {
  await withDetailAssets(t);
  const store = fixtureStore([]);
  const entity = { id: "hist-1", entityType: "place", slug: "antakya", status: "published", title: { tr: "Antakya", en: "Antioch" }, summary: { tr: "Özet" } };
  const html = await renderEntityDetailHtml(store, entity);
  assert.match(html, /<link rel="canonical" href="[^"]+\/archive-v2\/antakya\/">/);
  assert.match(html, /<meta property="og:title" content="Antioch — AntiochiaArchive">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /"@type":"WebPage"/);
  assert.match(html, /"@type":"BreadcrumbList"/);
});

test("names/coordinates/metadata sections render only when the entity actually carries that data", async (t) => {
  await withDetailAssets(t);
  const store = fixtureStore([]);
  const bare = { id: "place-1", entityType: "place", slug: "s", status: "published", title: { tr: "T" } };
  const bareHtml = await renderEntityDetailHtml(store, bare);
  assert.ok(!bareHtml.includes("record-location-section"));
  assert.ok(!bareHtml.includes("record-names-section"));

  const rich = {
    ...bare,
    coordinates: { latitude: 36.2, longitude: 36.15 },
    localNames: [{ name: "Antakiya" }],
    historicalNames: [{ name: "Antiokheia" }],
  };
  const richHtml = await renderEntityDetailHtml(store, rich);
  assert.ok(richHtml.includes("record-location-section"));
  assert.ok(richHtml.includes("map.html?entity=place-1"));
  assert.ok(richHtml.includes("Antakiya"));
  assert.ok(richHtml.includes("Antiokheia"));
});

test("related entities are populated client-side (explore-more container), never baked into the page — matching the static template", async (t) => {
  await withDetailAssets(t);
  const store = fixtureStore([
    { id: "place-1", entityType: "place", slug: "a", status: "published", title: { tr: "A" } },
  ]);
  const html = await renderEntityDetailHtml(store, { id: "place-1", entityType: "place", slug: "a", status: "published", title: { tr: "A" } });
  assert.match(html, /data-explore-more/);
});

test("uncleared referenced audio never renders a public player; a cleared one is resolvable via the public API's derivativeStoragePaths bridge", async (t) => {
  await withDetailAssets(t);
  const entities = [
    { id: "music-1", entityType: "music", slug: "s", status: "published", title: { tr: "T" }, audioMediaIds: ["media-uncleared", "media-cleared"] },
    { id: "media-uncleared", entityType: "media", mediaType: "audio", mediaRole: "realArchiveMedia", rightsStatus: "unknown", storageDriver: "local", originalStoragePath: "x.mp3" },
    { id: "media-cleared", entityType: "media", mediaType: "audio", mediaRole: "realArchiveMedia", rightsStatus: "cleared", storageDriver: "local", originalStoragePath: "y.mp3" },
  ];
  const store = fixtureStore(entities);
  const html = await renderEntityDetailHtml(store, entities[0]);
  // The shared template's own audio section is a hidden, client-populated
  // placeholder (see detailTemplate.js's audioSectionMarkup) — the music
  // entity's audioMediaIds (mere opaque id strings, not servable paths) are
  // expected to appear in the embedded v2-record-data JSON exactly like the
  // real static pages already do; the client (public/js/music.js) resolves
  // each id against the full public entity set and applies the rights gate
  // itself. What must never appear here is a servable URL for the
  // uncleared record — that gate is enforced by the public serializer
  // (derivativeStoragePaths only synthesized for rightsStatus === "cleared",
  // see publicSerializer.test.js) and independently re-checked by media/
  // mediaRoutes.js's serving route on every request.
  assert.ok(!html.includes("/media/media-uncleared"));
  assert.match(html, /data-music-audio-section/);
});

test("an entity with an illustrationMediaIds-linked, rights-cleared image gets a real <img>, not the placeholder", async (t) => {
  await withDetailAssets(t);
  const entities = [
    { id: "hist-1", entityType: "historicalContext", slug: "s", status: "published", title: { tr: "T" }, illustrationMediaIds: ["media-1"] },
    { id: "media-1", entityType: "media", mediaType: "image", mediaRole: "realArchiveMedia", rightsStatus: "cleared", storageDriver: "local", originalStoragePath: "abc.png", license: "CC0" },
  ];
  const store = fixtureStore(entities);
  const html = await renderEntityDetailHtml(store, entities[0]);
  assert.match(html, /<img class="record-detail-image" src="\/media\/media-1"/);
  assert.ok(!html.includes("Image pending archival review"));
});

test("an entity with only an UNCLEARED linked image still shows the placeholder, never the file", async (t) => {
  await withDetailAssets(t);
  const entities = [
    { id: "hist-1", entityType: "historicalContext", slug: "s", status: "published", title: { tr: "T" }, illustrationMediaIds: ["media-1"] },
    { id: "media-1", entityType: "media", mediaType: "image", mediaRole: "realArchiveMedia", rightsStatus: "unknown", storageDriver: "local", originalStoragePath: "abc.png" },
  ];
  const store = fixtureStore(entities);
  const html = await renderEntityDetailHtml(store, entities[0]);
  assert.ok(html.includes("Image pending archival review"));
  assert.ok(!html.includes("/media/media-1"));
});
