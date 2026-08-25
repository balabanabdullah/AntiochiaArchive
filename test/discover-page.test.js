import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

/**
 * A minimal, per-selector DOM stub: enough for script.js's discover-page
 * renderers (which only ever call querySelector + read/write
 * innerHTML/textContent) to run for real, without a real browser. Each
 * `[data-x]`-style selector used by the renderers under test gets one fake
 * element; anything else resolves to null, matching the "safe no-op on a
 * page without this container" contract every renderer already promises.
 */
function fakeElement() {
  return { innerHTML: "", textContent: "", hidden: false };
}

function createRendererContext() {
  const elements = {
    "[data-discover-total]": fakeElement(),
    "[data-category-distribution]": fakeElement(),
    "[data-map-coverage-text]": fakeElement(),
    "[data-todays-discovery]": fakeElement(),
    "[data-category-explore]": fakeElement(),
  };

  const context = vm.createContext({
    URL,
    clearTimeout,
    console,
    document: {
      addEventListener() {},
      querySelector: (selector) => elements[selector] || null,
      getElementById: () => null,
    },
    setTimeout,
    window: {
      location: { origin: "http://localhost:5173" },
    },
  });

  vm.runInContext(fs.readFileSync(new URL("../public/lang.js", import.meta.url), "utf8"), context);
  vm.runInContext(fs.readFileSync(new URL("../public/js/archive-store.js", import.meta.url), "utf8"), context);
  vm.runInContext(fs.readFileSync(new URL("../public/js/map.js", import.meta.url), "utf8"), context);
  vm.runInContext(fs.readFileSync(new URL("../public/script.js", import.meta.url), "utf8"), context);
  return { context, elements };
}

const FIXTURE_ENTITIES = [
  { id: "h1", entityType: "historicalContext", slug: "h1", title: { en: "History One" }, summary: { en: "A summary." } },
  { id: "h2", entityType: "historicalContext", slug: "h2", title: { en: "History Two" }, summary: { en: "A summary." } },
  { id: "pl1", entityType: "place", slug: "pl1", title: { en: "Place One" }, summary: { en: "A summary." }, coordinates: { latitude: 36.2, longitude: 36.1 } },
  { id: "pl2", entityType: "place", slug: "pl2", title: { en: "Place Two" }, summary: { en: "A summary." } }, // no coordinates -> not mappable
  { id: "b1", entityType: "belief", slug: "b1", title: { en: "Belief One" }, summary: { en: "A summary." } },
  // proverb: deliberately zero fixtures, matching the real 0-count baseline this round must not fabricate around.
];

function run(context, expr) {
  return vm.runInContext(expr, context);
}

/**
 * script.js's `discoveryEntities` is a top-level `let` — once script.js has
 * been evaluated via vm.runInContext, that binding lives in the context's
 * internal lexical environment, not as a plain own-property of the context
 * object. Direct `context.discoveryEntities = x` from the host realm is
 * therefore silently invisible to code running inside the vm; it must be
 * set via a further runInContext call instead, which shares that same
 * lexical scope.
 */
function setDiscoveryEntities(context, entities) {
  context.__fixture = entities;
  run(context, "discoveryEntities = __fixture;");
}

test("renderDiscoverTotal sums every DETAIL_TYPES count, including a genuine 0 for proverb — never a separately-maintained number", () => {
  const { context, elements } = createRendererContext();
  setDiscoveryEntities(context, FIXTURE_ENTITIES);
  run(context, "renderDiscoverTotal()");
  assert.equal(elements["[data-discover-total]"].textContent, String(FIXTURE_ENTITIES.length));
});

test("renderCategoryDistribution renders one row per DETAIL_TYPES type, including proverb at 0 — with an accessible label carrying the exact count and percentage", () => {
  const { context, elements } = createRendererContext();
  setDiscoveryEntities(context, FIXTURE_ENTITIES);
  run(context, "renderCategoryDistribution()");
  const html = elements["[data-category-distribution]"].innerHTML;
  const rowCount = (html.match(/class="distribution-row"/g) || []).length;
  assert.equal(rowCount, 8, "one row per DETAIL_TYPES entry, zero-count types included");
  // proverb: 0 of 5 total -> 0%, but the row (and its accessible label) must still be present.
  assert.match(html, /aria-label="Proverbs &amp; Expressions: 0 records, 0% of the archive"/);
  // historicalContext: 2 of 5 -> 40%.
  assert.match(html, /aria-label="History: 2 records, 40% of the archive"/);
  assert.match(html, /width:0%/, "a zero-count bar must still render its track, at 0% width, not be omitted");
});

test("renderMapCoverage counts only place entities with valid coordinates, scoped to place (never inflated by structure or other mappable types)", () => {
  const { context, elements } = createRendererContext();
  setDiscoveryEntities(context, FIXTURE_ENTITIES);
  run(context, "renderMapCoverage()");
  // 2 total places (pl1, pl2), 1 with valid coordinates (pl1).
  assert.equal(elements["[data-map-coverage-text]"].textContent, "1 of 2 public places can be shown on the map.");
});

test("renderTodaysDiscovery renders exactly one card, deterministically, from the detail-eligible pool", () => {
  const { context, elements } = createRendererContext();
  setDiscoveryEntities(context, FIXTURE_ENTITIES);
  run(context, "renderTodaysDiscovery()");
  const html = elements["[data-todays-discovery]"].innerHTML;
  assert.match(html, /class="generic-entity-card"/);
  const cardCount = (html.match(/class="generic-entity-card"/g) || []).length;
  assert.equal(cardCount, 1);
});

test("renderTodaysDiscovery renders nothing (not a broken card) when the public pool is empty", () => {
  const { context, elements } = createRendererContext();
  setDiscoveryEntities(context, []);
  run(context, "renderTodaysDiscovery()");
  assert.equal(elements["[data-todays-discovery]"].innerHTML, "");
});

test("renderCategoryExploreCards renders a real, clickable card per DETAIL_TYPES type — including proverb at 0 records, linking to its own (correctly empty-stated) page, never a fake sample", () => {
  const { context, elements } = createRendererContext();
  setDiscoveryEntities(context, FIXTURE_ENTITIES);
  run(context, "renderCategoryExploreCards()");
  const html = elements["[data-category-explore]"].innerHTML;
  const cardCount = (html.match(/class="category-explore-card"/g) || []).length;
  assert.equal(cardCount, 8);
  assert.match(html, /href="\/pages\/proverbs\.html"/);
  assert.match(html, />0<\/span>/, "proverb's real 0 count must render, not be hidden or replaced");
  assert.match(html, /href="\/pages\/history\.html"/);
  assert.match(html, />2<\/span>/, "historicalContext's real count of 2 must render");
});

test("a hostile entity title cannot break out of the discover-page markup (XSS escaping)", () => {
  const { context, elements } = createRendererContext();
  setDiscoveryEntities(context, [
    { id: "hostile", entityType: "place", slug: "hostile", title: { en: '"><img src=x onerror=alert(1)>' }, summary: { en: "d" }, coordinates: { latitude: 1, longitude: 1 } },
  ]);
  run(context, "renderTodaysDiscovery()");
  const html = elements["[data-todays-discovery]"].innerHTML;
  assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
