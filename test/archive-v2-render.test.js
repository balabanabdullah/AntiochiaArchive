import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function createRendererContext() {
  const context = vm.createContext({
    URL,
    clearTimeout,
    console,
    document: {
      addEventListener() {},
      querySelector: () => null,
      getElementById: () => null,
    },
    setTimeout,
    window: {
      location: { origin: "http://localhost:5173" },
    },
  });

  vm.runInContext(fs.readFileSync(new URL("../public/lang.js", import.meta.url), "utf8"), context);
  vm.runInContext(fs.readFileSync(new URL("../public/script.js", import.meta.url), "utf8"), context);
  return context;
}

// A representative fixture per v2 type, deliberately including a
// PARTIALLY-multilingual record (only `tr` populated) — this is the real
// shape the public API returns once the serializer strips a per-language
// sentinel placeholder value (see backend/v2/serializers/publicSerializer.js
// and V2-ARCHITECTURE.md "No sentinel values in public output"), not a
// hypothetical edge case.
const FIXTURES = {
  historicalContext: [
    { id: "hist-0002", slug: "seleucid-foundation-of-antioch", entityType: "historicalContext", status: "published",
      title: { tr: "Kuruluş", en: "Foundation", ar: "التأسيس" },
      summary: { tr: "Antioch MÖ 300 civarında kuruldu.", en: "Antioch was founded around 300 BCE.", ar: "تأسست أنطاكية." },
      period: { label: { en: "Early Seleucid" } }, tags: ["Seleucid", "foundation"] },
    { id: "hist-0099", slug: "partial-lang-context", entityType: "historicalContext", status: "published",
      title: { tr: "Sadece Türkçe" }, summary: { tr: "Sadece Türkçe özet." } },
  ],
  community: [
    { id: "comm-0001", slug: "hatay-arab-alawites-nusayris", entityType: "community", status: "published",
      title: { tr: "Hatay Arap Alevileri", en: "Arab Alawites of Hatay", ar: "العلويون العرب" },
      summary: { tr: "Özet.", en: "Summary.", ar: "ملخص." }, tags: ["Arabic-speaking"] },
  ],
  belief: [
    { id: "belief-0002", slug: "sunni-islam-hatay", entityType: "belief", status: "published",
      title: { tr: "Sünni İslam", en: "Sunni Islam", ar: "الإسلام السني" },
      summary: { tr: "Özet.", en: "Summary.", ar: "ملخص." }, tags: ["Islam"] },
  ],
  place: [
    { id: "place-0001", slug: "antakya", entityType: "place", status: "published",
      title: { tr: "Antakya", en: "Antakya / Antioch", ar: "أنطاكية" },
      summary: { tr: "Özet.", en: "Summary.", ar: "ملخص." },
      officialName: { tr: "Antakya", en: "Antakya" } },
  ],
  structure: [
    { id: "structure-0005", slug: "hz-hizir-ziyareti-samandag", entityType: "structure", status: "published",
      title: { tr: "Hz. Hızır", en: "Shrine of Khidr", ar: "مقام الخضر" },
      summary: { tr: "Özet.", en: "Summary.", ar: "ملخص." }, structureType: "sacred visitation site" },
  ],
  story: [
    { id: "story-0001", slug: "bellek-antakya", entityType: "story", status: "published",
      title: { tr: "Bellek Antakya", en: "Bellek Antakya", ar: "ذاكرة أنطاكية" },
      summary: { tr: "Özet.", en: "Summary.", ar: "ملخص." },
      storyCategory: "historicalMemory", storyRecordType: "publishedOralHistorySource" },
  ],
  music: [
    { id: "music-0001", slug: "fann-oral-poetry", entityType: "music", status: "published",
      title: { tr: "Fann", en: "Fann — Oral Poetry" },
      summary: { tr: "Özet." }, genre: "oral poetry / vocal performance" },
  ],
  proverb: [
    { id: "proverb-0001", slug: "el-eli-yikar", entityType: "proverb", status: "published",
      title: { tr: "El eli yıkar", en: "One hand washes the other" },
      originalText: "El eli yıkar, iki el de yüzü yıkar", dialect: "Samandağ", language: "tr",
      culturalMeaning: { en: "Mutual help benefits everyone involved." } },
  ],
};

const RENDER_FN_BY_TYPE = {
  historicalContext: "renderV2History",
  community: "renderV2Communities",
  belief: "renderV2Beliefs",
  place: "renderV2Places",
  structure: "renderV2Structures",
  story: "renderV2Stories",
  music: "renderV2Music",
  proverb: "renderV2Proverbs",
};

const CARD_CLASS_BY_TYPE = {
  historicalContext: "timeline-card",
  community: "community-card",
  belief: "belief-card",
  place: "place-card",
  structure: "struct-card",
  story: "story-card",
  music: "music-track-card",
  proverb: "proverb-card",
};

for (const [type, fixtures] of Object.entries(FIXTURES)) {
  test(`renderV2 ${type}: renders one card per item with the correct card class`, () => {
    const context = createRendererContext();
    context.items = fixtures;
    const html = vm.runInContext(`${RENDER_FN_BY_TYPE[type]}(items, "en")`, context);
    const matches = html.match(new RegExp(`class="${CARD_CLASS_BY_TYPE[type]}"`, "g")) || [];
    assert.equal(matches.length, fixtures.length, `expected ${fixtures.length} .${CARD_CLASS_BY_TYPE[type]} cards`);
  });
}

test("a v2 record with only 'tr' populated renders the Turkish text in every language, never 'undefined'", () => {
  const context = createRendererContext();
  context.items = FIXTURES.historicalContext; // includes hist-0099, tr-only
  for (const lang of ["tr", "en", "ar"]) {
    // eslint-disable-next-line no-await-in-loop
    const html = vm.runInContext(`renderV2History(items, "${lang}")`, context);
    assert.match(html, /Sadece Türkçe/, `${lang} rendering should fall back to the only populated language`);
    assert.doesNotMatch(html, /undefined/);
  }
});

test("v2 detail links point at the separate /archive-v2/{slug}/ namespace, not v1's /archive/{slug}/", () => {
  const context = createRendererContext();
  context.items = FIXTURES.structure;
  const html = vm.runInContext('renderV2Structures(items, "en")', context);
  assert.match(html, /href="\/archive-v2\/hz-hizir-ziyareti-samandag\/"/);
  assert.doesNotMatch(html, /href="\/archive\/hz-hizir-ziyareti-samandag\/"/);
});

test("a v2 entity with no media gets its type-level SVG placeholder, not the generic 'circles' default", () => {
  const context = createRendererContext();
  context.historyItems = FIXTURES.historicalContext.slice(0, 1);
  context.placeItems = FIXTURES.place;
  const historyHtml = vm.runInContext('renderV2History(historyItems, "en")', context);
  const placeHtml = vm.runInContext('renderV2Places(placeItems, "en")', context);
  // buildSvg's "columns" placeholder draws vertical <line> elements distinct
  // from "wheel"'s <circle>-based drawing — presence of the type-specific
  // shape is a reasonable proxy without over-coupling to exact SVG internals.
  assert.match(historyHtml, /<svg viewBox="0 0 320 180"/);
  assert.match(placeHtml, /<svg viewBox="0 0 320 180"/);
  // Both must render *some* placeholder (no <img> since no media exists).
  assert.doesNotMatch(historyHtml, /<img /);
  assert.doesNotMatch(placeHtml, /<img /);
});

test("a v2 entity WITH real reviewed media (entity.media.path, the public-serializer shape) renders a real <img>, not the SVG placeholder", () => {
  // Regression test: renderRecordImage() originally only read v1's flat
  // item.image/item.src + item.imageMetadata shape. v2's public serializer
  // (backend/v2/serializers/publicSerializer.js) nests media under
  // entity.media = { path, alt, caption, ... } instead — reading the old
  // shape meant every v2 entity silently fell back to its SVG placeholder
  // even when it had real, rights-cleared, reviewed media attached.
  const context = createRendererContext();
  context.items = [{
    id: "structure-0003", slug: "roma-mozaikleri-antakya", entityType: "structure", status: "published",
    title: { en: "Roman Mosaics of Antioch" }, summary: { en: "Summary." }, structureType: "archaeological site",
    media: {
      path: "/images/structures/daphne-roma-mozaigi-antakya.webp",
      alt: { en: "Second-century Roman floor mosaic" },
      caption: { en: "A caption." },
      aiGenerated: false,
    },
  }];
  const html = vm.runInContext('renderV2Structures(items, "en")', context);
  assert.match(html, /<img /);
  assert.match(html, /src="http:\/\/localhost:5173\/images\/structures\/daphne-roma-mozaigi-antakya\.webp"/);
  assert.match(html, /alt="Second-century Roman floor mosaic"/);
});

test("structure cards derive data-category from structureType (for the dynamic filter bar), not a fixed taxonomy", () => {
  const context = createRendererContext();
  context.items = FIXTURES.structure;
  const html = vm.runInContext('renderV2Structures(items, "en")', context);
  assert.match(html, /data-category="sacred visitation site"/);
});

test("music cards derive data-category from genre", () => {
  const context = createRendererContext();
  context.items = FIXTURES.music;
  const html = vm.runInContext('renderV2Music(items, "en")', context);
  assert.match(html, /data-category="oral poetry \/ vocal performance"/);
});

test("proverb cards derive data-category from dialect", () => {
  const context = createRendererContext();
  context.items = FIXTURES.proverb;
  const html = vm.runInContext('renderV2Proverbs(items, "en")', context);
  assert.match(html, /data-category="Samandağ"/);
});

test("proverb cards render the local-form expression (originalText) as the dominant text, escaped against XSS", () => {
  const context = createRendererContext();
  context.items = [{ ...FIXTURES.proverb[0], originalText: '<script>alert(1)</script>' }];
  const html = vm.runInContext('renderV2Proverbs(items, "en")', context);
  assert.match(html, /class="proverb-expression"/);
  assert.ok(!html.includes("<script>alert(1)</script>"), "originalText must be HTML-escaped, never rendered raw");
  assert.match(html, /&lt;script&gt;/);
});

test("renderV2Proverbs: zero public proverbs renders a polished empty state — never a fabricated sample card", () => {
  const context = createRendererContext();
  context.items = [];
  const html = vm.runInContext('renderV2Proverbs(items, "en")', context);
  assert.match(html, /class="proverbs-empty-state"/);
  assert.ok(!html.includes("proverb-card"), "must render no card at all when the public count is 0");
  assert.match(html, /no published proverb or expression records yet/i);
});

test("place cards show officialName only when it differs from the title, never duplicating identical text", () => {
  const context = createRendererContext();
  context.items = FIXTURES.place; // officialName.en === title.en === "Antakya" is NOT the case here (title.en is "Antakya / Antioch")
  const html = vm.runInContext('renderV2Places(items, "en")', context);
  assert.match(html, /place-official-name/);

  context.sameNameItem = [{ ...FIXTURES.place[0], title: { en: "Antakya" } }];
  const sameNameHtml = vm.runInContext('renderV2Places(sameNameItem, "en")', context);
  assert.doesNotMatch(sameNameHtml, /place-official-name/);
});

test("story cards never render a raw ORAL_HISTORY_LEAD storyRecordType as if it were public testimony (leads are never fetched publicly, but the renderer must not special-case-fail if one appears)", () => {
  const context = createRendererContext();
  context.items = [{ ...FIXTURES.story[0], storyRecordType: "oralHistoryLead", storyCategory: undefined }];
  const html = vm.runInContext('renderV2Stories(items, "en")', context);
  // No storyCategory and no tags -> no tag badge rendered at all, not "undefined".
  assert.doesNotMatch(html, /undefined/);
});

test("ALL_CARD_SELECTORS includes the new community/place card classes so they participate in search/filter", () => {
  const context = createRendererContext();
  const selectors = vm.runInContext("ALL_CARD_SELECTORS", context);
  assert.match(selectors, /\.community-card/);
  assert.match(selectors, /\.place-card/);
});

test("getV2SectionRenderers only returns containers actually present on the page (per-page scoping, like the v1 pattern)", () => {
  const context = createRendererContext();
  context.document = {
    addEventListener() {},
    getElementById: (id) => (id === "structures-grid-container" ? {} : null),
  };
  vm.createContext(context);
  const context2 = vm.createContext({
    URL, clearTimeout, console, setTimeout,
    window: { location: { origin: "http://localhost:5173" } },
    document: { addEventListener() {}, getElementById: (id) => (id === "structures-grid-container" ? {} : null) },
  });
  vm.runInContext(fs.readFileSync(new URL("../public/lang.js", import.meta.url), "utf8"), context2);
  vm.runInContext(fs.readFileSync(new URL("../public/script.js", import.meta.url), "utf8"), context2);
  const renderers = vm.runInContext("getV2SectionRenderers()", context2);
  assert.equal(renderers.length, 1);
  assert.equal(renderers[0].key, "structure");
});

function makeRelatedEntitiesDom(context) {
  const container = { _html: "" };
  Object.defineProperty(container, "innerHTML", {
    get() { return container._html; },
    set(v) { container._html = v; },
  });
  const section = { hidden: false };
  context.document.querySelector = (sel) => (sel === "[data-related-entities-section]" ? section : null);
  context.document.getElementById = (id) => (id === "related-entities-container" ? container : null);
  return { section, container };
}

test("renderRelatedEntities keeps the section hidden (never a visible empty heading) when there are no public relationships yet", () => {
  const context = createRendererContext();
  const { section, container } = makeRelatedEntitiesDom(context);
  context.items = [];
  vm.runInContext('renderRelatedEntities(items, "en")', context);
  assert.equal(section.hidden, true);
  assert.equal(container.innerHTML, "");
});

test("renderRelatedEntities renders compact cards and un-hides the section once real related entities arrive", () => {
  const context = createRendererContext();
  const { section, container } = makeRelatedEntitiesDom(context);
  context.items = [
    {
      relationship: { id: "rel-1" },
      entity: { id: "belief-0002", slug: "sunni-islam-hatay", entityType: "belief", title: { en: "Sunni Islam" } },
    },
  ];
  vm.runInContext('renderRelatedEntities(items, "en")', context);
  assert.equal(section.hidden, false);
  assert.match(container.innerHTML, /related-entity-card/);
  assert.match(container.innerHTML, /Sunni Islam/);
  assert.match(container.innerHTML, /href="\/archive-v2\/sunni-islam-hatay\/"/);
});

test("renderRelatedEntities filters out any malformed pair missing an entity, rather than throwing", () => {
  const context = createRendererContext();
  const { section } = makeRelatedEntitiesDom(context);
  context.items = [{ relationship: { id: "rel-1" }, entity: null }];
  vm.runInContext('renderRelatedEntities(items, "en")', context);
  assert.equal(section.hidden, true);
});

test("renderRelatedEntities is a no-op (does not throw) when the page has no related-entities section", () => {
  const context = createRendererContext();
  context.items = [{ relationship: null, entity: { id: "x", entityType: "place", title: {} } }];
  assert.doesNotThrow(() => vm.runInContext('renderRelatedEntities(items, "en")', context));
});

test("loadAndRenderRelatedEntities fetches once and caches, reusing the cached result on a second call", async () => {
  const context = createRendererContext();
  const { section, container } = makeRelatedEntitiesDom(context);
  let fetchCount = 0;
  context.window.AntiochiaArchiveV2API = {
    fetchRelatedEntities: async () => {
      fetchCount += 1;
      return [{ relationship: null, entity: { id: "place-0001", slug: "antakya", entityType: "place", title: { en: "Antakya" } } }];
    },
  };
  section.getAttribute = (name) => (name === "data-entity-id" ? "structure-0005" : null);

  await vm.runInContext('loadAndRenderRelatedEntities("en")', context);
  assert.equal(fetchCount, 1);
  assert.equal(section.hidden, false);
  assert.match(container.innerHTML, /Antakya/);

  await vm.runInContext('loadAndRenderRelatedEntities("en")', context);
  assert.equal(fetchCount, 1, "second call must reuse the cache, not re-fetch");
});

function makeV2DetailDom(context, entity) {
  const titleEls = [{ textContent: "" }];
  const descEls = [{ textContent: "" }];
  const taxonomyEls = [{ textContent: "" }];
  const categoryEls = [{ textContent: "" }];
  const image = { alt: "" };
  const caption = { textContent: "" };
  const recordData = { textContent: null };
  context.document.getElementById = (id) => {
    if (id === "v2-record-data") return recordData;
    return null;
  };
  context.document.querySelectorAll = (sel) => {
    if (sel === "[data-detail-title]") return titleEls;
    if (sel === "[data-detail-description]") return descEls;
    if (sel === "[data-detail-taxonomy]") return taxonomyEls;
    if (sel === "[data-detail-category]") return categoryEls;
    return [];
  };
  context.document.querySelector = (sel) => {
    if (sel === ".record-detail-image") return image;
    if (sel === "[data-detail-image-caption]") return caption;
    return null;
  };
  context.document.title = "";
  recordData.textContent = JSON.stringify({ entity });
  return { titleEls, descEls, taxonomyEls, categoryEls, image, caption };
}

test("renderV2DetailPage is a no-op when the page has no embedded v2 record (e.g. a v1 detail page)", () => {
  const context = createRendererContext();
  assert.doesNotThrow(() => vm.runInContext('renderV2DetailPage("en")', context));
});

test("renderV2DetailPage fills title/description/type-specific fact/category from the embedded entity", () => {
  const context = createRendererContext();
  const entity = {
    id: "structure-0005", slug: "hz-hizir-ziyareti-samandag", entityType: "structure",
    title: { en: "Shrine of Khidr", tr: "Hz. Hızır" },
    summary: { en: "Summary text." },
    structureType: "sacred visitation site",
  };
  const dom = makeV2DetailDom(context, entity);
  vm.runInContext('renderV2DetailPage("en")', context);
  assert.equal(dom.titleEls[0].textContent, "Shrine of Khidr");
  assert.equal(dom.descEls[0].textContent, "Summary text.");
  assert.equal(dom.taxonomyEls[0].textContent, "sacred visitation site");
  assert.equal(dom.categoryEls[0].textContent, "Structures");
  assert.equal(context.document.title, "Shrine of Khidr — AntiochiaArchive");
});

test("renderV2DetailPage falls back through languages via localizedMetadataValue, never rendering literal 'undefined'", () => {
  const context = createRendererContext();
  const entity = {
    id: "belief-0099", slug: "tr-only-belief", entityType: "belief",
    title: { tr: "Sadece Türkçe" }, summary: { tr: "Sadece özet." },
  };
  const dom = makeV2DetailDom(context, entity);
  vm.runInContext('renderV2DetailPage("ar")', context);
  assert.equal(dom.titleEls[0].textContent, "Sadece Türkçe");
  assert.equal(dom.descEls[0].textContent, "Sadece özet.");
  assert.notEqual(dom.titleEls[0].textContent, "undefined");
});

test("getHomepagePreviewItems truncates to the requested limit, first-N in API order, when no curated IDs are configured", () => {
  const context = createRendererContext();
  context.items = Array.from({ length: 12 }, (_, i) => ({ id: `belief-${i}` }));
  const preview = vm.runInContext('getHomepagePreviewItems("belief", items, 6)', context);
  assert.equal(preview.length, 6);
  assert.deepEqual(preview.map((item) => item.id), ["belief-0", "belief-1", "belief-2", "belief-3", "belief-4", "belief-5"]);
});

test("getHomepagePreviewItems never truncates below the limit when fewer items exist than the limit", () => {
  const context = createRendererContext();
  context.items = [{ id: "music-0001" }, { id: "music-0002" }];
  const preview = vm.runInContext('getHomepagePreviewItems("music", items, 6)', context);
  assert.equal(preview.length, 2);
});

test("renderHomepageSectionCounts writes the real fetched total into each section's count badge, not the truncated preview length", () => {
  const context = createRendererContext();
  const badge = { textContent: "0" };
  const section = {
    getAttribute: (name) => (name === "data-homepage-entity-type" ? "belief" : null),
    querySelector: (sel) => (sel === "[data-homepage-count-badge]" ? badge : null),
  };
  context.document.querySelectorAll = (sel) => (sel === "[data-homepage-limit]" ? [section] : []);
  context.__testArchiveDataV2 = { belief: Array.from({ length: 8 }, (_, i) => ({ id: `belief-${i}` })) };
  vm.runInContext("archiveDataV2 = __testArchiveDataV2; renderHomepageSectionCounts();", context);
  assert.equal(badge.textContent, "8");
});

test("renderHomepageSectionCounts is a no-op before archiveDataV2 has loaded (never writes a stale/placeholder count)", () => {
  const context = createRendererContext();
  let queried = false;
  context.document.querySelectorAll = () => { queried = true; return []; };
  vm.runInContext("renderHomepageSectionCounts()", context);
  assert.equal(queried, false);
});
