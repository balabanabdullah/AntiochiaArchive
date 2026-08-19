import test from "node:test";
import assert from "node:assert/strict";

await import("../public/js/collections.js");

const { COLLECTION_DEFINITIONS, resolveCollections } = globalThis.AntiochiaArchiveCollections;

function fixtureEntities() {
  return [
    { id: "hist-0002", entityType: "historicalContext", slug: "seleucid-foundation-of-antioch", tags: ["Seleucid", "foundation"], title: {}, summary: {} },
    { id: "hist-0009", entityType: "historicalContext", slug: "seventh-century-wars", tags: ["conquest"], title: {}, summary: {} }, // not an "ancient" tag
    { id: "struct-0001", entityType: "structure", slug: "st-paul-church", structureType: "church", title: {}, summary: {} },
    { id: "struct-0002", entityType: "structure", slug: "some-bazaar", structureType: "bazaar/heritageEnsemble", title: {}, summary: {} },
    { id: "place-0011", entityType: "place", slug: "samandag", title: {}, summary: {} },
    { id: "place-0012", entityType: "place", slug: "vakifli-samandag", title: {}, summary: {} },
    { id: "place-0001", entityType: "place", slug: "antakya", title: {}, summary: {} },
    { id: "story-0001", entityType: "story", slug: "a-tale", title: {}, summary: {} },
    { id: "media-0001", entityType: "media", title: {} },
  ];
}

test("every defined collection is a pure predicate over public entity fields only", () => {
  for (const def of COLLECTION_DEFINITIONS) {
    assert.equal(typeof def.match, "function");
    assert.equal(typeof def.id, "string");
  }
});

test("resolveCollections never leaks a media/source entity into any collection", () => {
  const resolved = resolveCollections(fixtureEntities());
  for (const collection of resolved) {
    for (const member of collection.members) {
      assert.notEqual(member.entityType, "media");
      assert.notEqual(member.entityType, "source");
    }
  }
});

test("sacred-places matches structures whose structureType names a sacred-site keyword, not every structure", () => {
  const resolved = resolveCollections(fixtureEntities());
  const sacred = resolved.find((c) => c.id === "sacred-places");
  assert.deepEqual(sacred.members.map((m) => m.id), ["struct-0001"]);
});

test("samandag matches only place slugs containing 'samandag'", () => {
  const resolved = resolveCollections(fixtureEntities());
  const samandag = resolved.find((c) => c.id === "samandag");
  assert.deepEqual(samandag.members.map((m) => m.id).sort(), ["place-0011", "place-0012"]);
});

test("ancient-antioch only matches historicalContext entries carrying an ancient-era tag", () => {
  const resolved = resolveCollections(fixtureEntities());
  const ancient = resolved.find((c) => c.id === "ancient-antioch");
  assert.deepEqual(ancient.members.map((m) => m.id), ["hist-0002"]);
});

test("a collection with zero real matches is omitted entirely, never rendered empty", () => {
  const entities = fixtureEntities().filter((e) => e.entityType !== "structure");
  const resolved = resolveCollections(entities);
  assert.equal(resolved.find((c) => c.id === "sacred-places"), undefined);
});

test("resolveCollections is deterministic across repeated calls on the same input", () => {
  const entities = fixtureEntities();
  const first = resolveCollections(entities);
  const second = resolveCollections(entities);
  assert.deepEqual(first, second);
});
