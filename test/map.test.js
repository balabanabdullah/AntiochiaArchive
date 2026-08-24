import test from "node:test";
import assert from "node:assert/strict";

// map.js's searchMappableEntities() delegates to AntiochiaArchiveSearch
// (public/js/search.js) rather than reimplementing normalization — it must
// be loaded first so that delegation resolves at call time. search.js's
// buildSearchIndex() in turn only indexes AntiochiaArchiveStore.DETAIL_TYPES
// entities (archive-store.js), so that must be loaded too.
await import("../public/js/archive-store.js");
await import("../public/js/search.js");
await import("../public/js/map.js");

const {
  hasValidCoordinates, getMappableEntities, filterByType, computeBounds, findDeepLinkEntity, searchMappableEntities,
} = globalThis.AntiochiaArchiveMapCore;

function place(id, lat, lng) {
  return { id, entityType: "place", slug: id, title: {}, coordinates: lat == null ? undefined : { latitude: lat, longitude: lng } };
}

test("hasValidCoordinates requires both numeric fields within range", () => {
  assert.equal(hasValidCoordinates({ coordinates: { latitude: 36.2, longitude: 36.1 } }), true);
  assert.equal(hasValidCoordinates({ coordinates: null }), false);
  assert.equal(hasValidCoordinates({}), false);
  assert.equal(hasValidCoordinates({ coordinates: { latitude: 999, longitude: 36.1 } }), false);
  assert.equal(hasValidCoordinates({ coordinates: { latitude: "36.2", longitude: 36.1 } }), false);
  assert.equal(hasValidCoordinates({ coordinates: { latitude: NaN, longitude: 36.1 } }), false);
});

test("getMappableEntities never invents a marker for an entity with no coordinates — today's real dataset has zero", () => {
  const entities = [place("place-0001", null), place("place-0002", null), { id: "s1", entityType: "structure", slug: "s1", title: {} }];
  assert.deepEqual(getMappableEntities(entities), []);
});

test("getMappableEntities plots only place/structure entities that carry a real coordinate", () => {
  const entities = [
    place("place-0001", 36.2, 36.1),
    place("place-0002", null),
    { id: "story-0001", entityType: "story", slug: "s", title: {}, coordinates: { latitude: 36.2, longitude: 36.1 } }, // wrong type, even with coords
  ];
  const mappable = getMappableEntities(entities);
  assert.deepEqual(mappable.map((e) => e.id), ["place-0001"]);
});

test("filterByType narrows to place or structure, 'all' returns everything unchanged", () => {
  const entities = [place("p1", 1, 1), { id: "s1", entityType: "structure", coordinates: { latitude: 2, longitude: 2 } }];
  assert.equal(filterByType(entities, "place").length, 1);
  assert.equal(filterByType(entities, "structure").length, 1);
  assert.equal(filterByType(entities, "all").length, 2);
  assert.equal(filterByType(entities).length, 2);
});

test("computeBounds returns null for an empty marker set (never a fabricated default view)", () => {
  assert.equal(computeBounds([]), null);
  assert.equal(computeBounds(null), null);
});

test("computeBounds wraps every marker's coordinate", () => {
  const entities = [place("a", 36.0, 36.0), place("b", 36.5, 36.3)];
  const bounds = computeBounds(entities);
  assert.deepEqual(bounds, [[36.0, 36.0], [36.5, 36.3]]);
});

test("findDeepLinkEntity resolves a valid ?entity=<id> to its mappable entity", () => {
  const entities = [place("place-0001", 36.2, 36.16), place("place-0002", 36.1, 36.1)];
  const found = findDeepLinkEntity(entities, { id: "place-0001" });
  assert.equal(found?.id, "place-0001");
});

test("findDeepLinkEntity falls back to legacy ?focus=<slug> when no id is given", () => {
  const entities = [place("place-0001", 36.2, 36.16)];
  const found = findDeepLinkEntity(entities, { slug: "place-0001" });
  assert.equal(found?.id, "place-0001");
});

test("findDeepLinkEntity prefers id over slug when both are given", () => {
  const entities = [place("place-0001", 36.2, 36.16), place("place-0002", 36.1, 36.1)];
  const found = findDeepLinkEntity(entities, { id: "place-0001", slug: "place-0002" });
  assert.equal(found?.id, "place-0001");
});

test("findDeepLinkEntity returns null (never throws, never fabricates a fallback) for every unsafe deep-link target", () => {
  const entities = [
    place("place-0001", 36.2, 36.16), // valid, public, has coordinates
    place("place-0002", null), // public but coordinate-less
  ];
  assert.equal(findDeepLinkEntity(entities, { id: "nonexistent-id" }), null);
  assert.equal(findDeepLinkEntity(entities, { id: "source-0001" }), null);
  assert.equal(findDeepLinkEntity(entities, { id: "place-0002" }), null, "coordinate-less entity must not resolve");
  assert.equal(findDeepLinkEntity(entities, {}), null);
  assert.equal(findDeepLinkEntity([], { id: "place-0001" }), null);
  // An inReview/draft entity never even reaches this function in practice (the
  // public API never serves one), but if it somehow did, it is not "public" by
  // any signal this pure function checks — it only ever sees whatever array
  // the caller passes, which is always the already-public-filtered set.
});

/* --------------------------------------------------------------------------
   searchMappableEntities — map search (map.html's "Haritadaki Yerler" panel)
   -------------------------------------------------------------------------- */

function richPlace(id, { lat = 36.2, lng = 36.1, title = {}, localNames, structureType } = {}) {
  return {
    id,
    entityType: structureType ? "structure" : "place",
    slug: id,
    title,
    localNames,
    coordinates: { latitude: lat, longitude: lng },
  };
}

test("searchMappableEntities: only indexes/returns entities already in the mappable (public + coordinated place/structure) set", () => {
  const entities = [
    richPlace("place-0001", { title: { en: "Antioch" } }),
    { id: "place-0002", entityType: "place", slug: "place-0002", title: { en: "Antioch Two" } }, // no coordinates — not mappable
    { id: "story-0001", entityType: "story", slug: "s", title: { en: "Antioch Story" }, coordinates: { latitude: 36.2, longitude: 36.1 } }, // wrong type
  ];
  const results = searchMappableEntities(entities, "antioch");
  assert.deepEqual(results.map((e) => e.id), ["place-0001"]);
});

test("searchMappableEntities: matches on title text", () => {
  const entities = [
    richPlace("place-0001", { title: { en: "Antakya" } }),
    richPlace("place-0002", { lat: 36.3, title: { en: "Samandağ" } }),
  ];
  assert.deepEqual(searchMappableEntities(entities, "samandag").map((e) => e.id), ["place-0002"]);
});

test("searchMappableEntities: matches on localNames (e.g. Arabizi local toponyms)", () => {
  const entities = [
    richPlace("place-0029", { title: { tr: "Altınözü" }, localNames: [{ language: "ar", script: "Latin", name: "Il_Kseyr" }] }),
    richPlace("place-0030", { lat: 36.3, title: { tr: "Başka Yer" } }),
  ];
  assert.deepEqual(searchMappableEntities(entities, "Il_Kseyr").map((e) => e.id), ["place-0029"]);
});

test("searchMappableEntities: case-insensitive and Turkish-diacritic-aware, like the header search", () => {
  const entities = [richPlace("place-0001", { title: { tr: "Samandağ" } })];
  assert.deepEqual(searchMappableEntities(entities, "SAMANDAG").map((e) => e.id), ["place-0001"]);
  assert.deepEqual(searchMappableEntities(entities, "samandağ").map((e) => e.id), ["place-0001"]);
});

test("searchMappableEntities: respects the current map type filter together with the query", () => {
  const entities = [
    richPlace("place-0001", { title: { en: "Samandağ" } }),
    richPlace("structure-0001", { lat: 36.25, title: { en: "Samandağ Fort" }, structureType: "fortress" }),
  ];
  assert.deepEqual(searchMappableEntities(entities, "samandag", { typeFilter: "place" }).map((e) => e.id), ["place-0001"]);
  assert.deepEqual(searchMappableEntities(entities, "samandag", { typeFilter: "structure" }).map((e) => e.id), ["structure-0001"]);
  assert.equal(searchMappableEntities(entities, "samandag", { typeFilter: "all" }).length, 2);
});

test("searchMappableEntities: an empty/whitespace query clears the search and returns the full (type-filtered) mappable set", () => {
  const entities = [richPlace("place-0001", { title: { en: "A" } }), richPlace("place-0002", { lat: 36.3, title: { en: "B" } })];
  assert.equal(searchMappableEntities(entities, "").length, 2);
  assert.equal(searchMappableEntities(entities, "   ").length, 2);
  assert.equal(searchMappableEntities(entities, undefined).length, 2);
});

test("searchMappableEntities: an unusual/invalid query never throws and degrades to zero or unaffected results", () => {
  const entities = [richPlace("place-0001", { title: { en: "Antakya" } })];
  assert.doesNotThrow(() => searchMappableEntities(entities, "((("));
  assert.doesNotThrow(() => searchMappableEntities(entities, "🎵🎵🎵"));
  assert.doesNotThrow(() => searchMappableEntities(null, "antakya"));
  assert.doesNotThrow(() => searchMappableEntities(entities, 12345));
  assert.deepEqual(searchMappableEntities(entities, "zzzznomatch"), []);
});

test("searchMappableEntities: clicking a search result resolves to the exact same entity findDeepLinkEntity would resolve for a deep link — one shared lookup, not two implementations", () => {
  const entities = [richPlace("place-0029", { title: { tr: "Altınözü" }, localNames: [{ language: "ar", script: "Latin", name: "Il_Kseyr" }] })];
  const [result] = searchMappableEntities(entities, "Il_Kseyr");
  assert.ok(result);
  const viaDeepLink = findDeepLinkEntity(entities, { id: result.id });
  assert.equal(viaDeepLink, result);
});
