import test from "node:test";
import assert from "node:assert/strict";

globalThis.AntiochiaArchiveStore = { DETAIL_TYPES: ["historicalContext", "community", "belief", "place", "structure", "story", "music"] };
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

test("buildSearchIndex only includes the 7 detail-eligible entity types — never media/source", () => {
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
