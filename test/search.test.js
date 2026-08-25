import test from "node:test";
import assert from "node:assert/strict";

globalThis.AntiochiaArchiveStore = { DETAIL_TYPES: ["historicalContext", "community", "belief", "place", "structure", "story", "music", "proverb"] };
await import("../public/js/search.js");

const { normalizeSearchText, buildSearchIndex, searchEntities, displayTitle } = globalThis.AntiochiaArchiveSearch;

test("normalizeSearchText is case-insensitive and Turkish-diacritic tolerant", () => {
  assert.equal(normalizeSearchText("Hızır"), normalizeSearchText("Hizir"));
  assert.equal(normalizeSearchText("İSKENDERUN"), normalizeSearchText("iskenderun"));
  assert.equal(normalizeSearchText("Şeyh Antar"), "seyh antar");
  assert.equal(normalizeSearchText(null), "");
});

test("Antakya and Antioch both match the same bilingual title", () => {
  const entities = [{
    id: "h1", entityType: "historicalContext", slug: "antik-akdeniz-kavsagi-antakya",
    title: { tr: "Antakya Kavşağı", en: "Crossroads of Antioch" },
    summary: {}, tags: [],
  }];
  const index = buildSearchIndex(entities);
  assert.equal(searchEntities(index, "Antakya").length, 1);
  assert.equal(searchEntities(index, "antioch").length, 1);
  assert.equal(searchEntities(index, "Zenginler").length, 0); // no such token — sanity check it isn't matching everything
});

test("search matches title, alternateNames, historicalNames, tags, and period label", () => {
  const entities = [
    { id: "p1", entityType: "place", slug: "habib-i-neccar", title: { en: "Mount Habib-i Neccar" }, historicalNames: [{ name: "Mount Silpius" }], summary: {}, tags: [] },
    { id: "h2", entityType: "historicalContext", slug: "roman-era", title: { en: "Roman period" }, period: { label: { en: "Roman" } }, summary: {}, tags: ["Roman"] },
    { id: "s1", entityType: "story", slug: "some-story", title: { en: "A tale" }, summary: { en: "About mosaics and courtyards" }, tags: [] },
  ];
  const index = buildSearchIndex(entities);
  assert.equal(searchEntities(index, "Silpius")[0]?.id, "p1");
  assert.equal(searchEntities(index, "Roman")[0]?.id, "h2");
  assert.equal(searchEntities(index, "mosaics")[0]?.id, "s1");
});

test("typeFilter narrows results to one entityType", () => {
  const entities = [
    { id: "a", entityType: "place", slug: "a", title: { en: "Antioch Plaza" }, summary: {}, tags: [] },
    { id: "b", entityType: "story", slug: "b", title: { en: "Antioch Tale" }, summary: {}, tags: [] },
  ];
  const index = buildSearchIndex(entities);
  const results = searchEntities(index, "Antioch", { typeFilter: "place" });
  assert.deepEqual(results.map((e) => e.id), ["a"]);
});

test("relevance ranks a title starting with the query above a mid-string match", () => {
  const entities = [
    { id: "mid", entityType: "place", slug: "mid", title: { en: "Old Antioch Bazaar" }, summary: {}, tags: [] },
    { id: "start", entityType: "place", slug: "start", title: { en: "Antioch Gate" }, summary: {}, tags: [] },
  ];
  const index = buildSearchIndex(entities);
  const results = searchEntities(index, "Antioch");
  assert.equal(results[0].id, "start");
});

test("buildSearchIndex only includes the 8 detail-eligible entity types — never media/source", () => {
  const entities = [
    { id: "m1", entityType: "media", slug: undefined, title: {}, summary: {} },
    { id: "src1", entityType: "source", title: { en: "Some Antioch source" } },
    { id: "pl1", entityType: "place", slug: "antioch-plaza", title: { en: "Antioch Plaza" }, summary: {}, tags: [] },
  ];
  const index = buildSearchIndex(entities);
  assert.deepEqual(index.map((entry) => entry.entity.id), ["pl1"]);
});

test("an empty query returns no results (never the whole archive)", () => {
  const entities = [{ id: "a", entityType: "place", slug: "a", title: { en: "Antioch" }, summary: {}, tags: [] }];
  const index = buildSearchIndex(entities);
  assert.deepEqual(searchEntities(index, ""), []);
  assert.deepEqual(searchEntities(index, "   "), []);
});

test("limit caps the number of returned results", () => {
  const entities = Array.from({ length: 10 }, (_, i) => ({
    id: `p${i}`, entityType: "place", slug: `p${i}`, title: { en: `Antioch Place ${i}` }, summary: {}, tags: [],
  }));
  const index = buildSearchIndex(entities);
  assert.equal(searchEntities(index, "Antioch", { limit: 3 }).length, 3);
});

test("displayTitle falls back through en -> tr -> ar -> slug, never 'undefined'", () => {
  assert.equal(displayTitle({ title: { tr: "Türkçe" }, slug: "x" }, "en"), "Türkçe");
  assert.equal(displayTitle({ title: {}, slug: "fallback-slug" }, "en"), "fallback-slug");
});

test("a proverb is searchable by its local-form expression (originalText) and transliteration, preserved exactly (never auto-transliterated)", () => {
  const entities = [
    {
      id: "prov1", entityType: "proverb", slug: "il-kseyr-saying", title: { en: "A local saying" }, summary: {},
      originalText: "Il_Kseyr 7ala tayybe", transliteration: "il-kseyr hala tayibe",
    },
  ];
  const index = buildSearchIndex(entities);
  assert.deepEqual(searchEntities(index, "Il_Kseyr").map((e) => e.id), ["prov1"]);
  assert.deepEqual(searchEntities(index, "tayybe").map((e) => e.id), ["prov1"]);
  assert.deepEqual(searchEntities(index, "hala").map((e) => e.id), ["prov1"], "transliteration must also be searchable");
});

test("a proverb is searchable by dialect, language, and multilingual meaning/translation fields", () => {
  const entities = [
    {
      id: "prov2", entityType: "proverb", slug: "meaning-search", title: { en: "T" }, summary: {},
      dialect: "Samandağ", language: "ar",
      literalMeaning: { en: "washes the hand" }, culturalMeaning: { tr: "karşılıklı yardımlaşma" },
      translations: { en: "mutual benefit proverb" }, usageContext: { en: "used at communal gatherings" },
      example: { en: "spoken during a barn raising" },
    },
  ];
  const index = buildSearchIndex(entities);
  assert.deepEqual(searchEntities(index, "Samandağ").map((e) => e.id), ["prov2"]);
  assert.deepEqual(searchEntities(index, "karşılıklı").map((e) => e.id), ["prov2"]);
  assert.deepEqual(searchEntities(index, "mutual benefit").map((e) => e.id), ["prov2"]);
  assert.deepEqual(searchEntities(index, "communal gatherings").map((e) => e.id), ["prov2"]);
  assert.deepEqual(searchEntities(index, "barn raising").map((e) => e.id), ["prov2"]);
});

test("draft/inReview proverb entities are never in the search index (index is built only from the already-public entity set passed in)", () => {
  // buildSearchIndex has no publication-status awareness of its own — it only
  // ever sees whatever entities the caller already fetched from the public
  // /api/v2 endpoints, which never include a draft/inReview record. This
  // documents that contract rather than re-testing the backend gate.
  const entities = [
    { id: "prov3", entityType: "proverb", slug: "public-proverb", title: { en: "Public" }, summary: {}, originalText: "Public expr" },
  ];
  const index = buildSearchIndex(entities);
  assert.equal(index.length, 1);
  assert.equal(searchEntities(index, "public").length, 1);
});
