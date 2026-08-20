import test from "node:test";
import assert from "node:assert/strict";

await import("../public/js/map.js");

const { hasValidCoordinates, getMappableEntities, filterByType, computeBounds, findDeepLinkEntity } = globalThis.AntiochiaArchiveMapCore;

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
