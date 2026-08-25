import test from "node:test";
import assert from "node:assert/strict";

globalThis.AntiochiaArchiveV2API = { fetchAllEntities: async () => [] };
await import("../public/js/archive-store.js");

const { DETAIL_TYPES, byType, byId, bySlug, detailEligible, pickRandomEntity, pickDailyEntity } = globalThis.AntiochiaArchiveStore;

function entity(id, entityType, slug) {
  return { id, entityType, slug, title: {} };
}

test("byType/byId/bySlug are simple, order-preserving lookups", () => {
  const entities = [entity("a", "place", "a-slug"), entity("b", "story", "b-slug"), entity("c", "place", "c-slug")];
  assert.deepEqual(byType(entities, "place").map((e) => e.id), ["a", "c"]);
  assert.equal(byId(entities, "b").slug, "b-slug");
  assert.equal(byId(entities, "missing"), null);
  assert.equal(bySlug(entities, "c-slug").id, "c");
  assert.equal(bySlug(entities, "missing"), null);
});

test("detailEligible keeps only the 8 types with a static detail page — never media/source", () => {
  const entities = [
    entity("h1", "historicalContext"), entity("m1", "media"), entity("s1", "source"),
    entity("p1", "proverb"), entity("pl1", "place"),
  ];
  assert.deepEqual(detailEligible(entities).map((e) => e.id), ["h1", "p1", "pl1"]);
  assert.deepEqual(DETAIL_TYPES, ["historicalContext", "community", "belief", "place", "structure", "story", "music", "proverb"]);
});

test("pickRandomEntity never returns the excluded (currently-viewed) entity", () => {
  const entities = [entity("a", "place"), entity("b", "place")];
  // randomFn always returns 0 -> would normally pick index 0 ("a"), but "a" is excluded.
  const picked = pickRandomEntity(entities, { excludeId: "a", randomFn: () => 0 });
  assert.equal(picked.id, "b");
});

test("pickRandomEntity returns null when the pool is empty (never fabricates a result)", () => {
  assert.equal(pickRandomEntity([], {}), null);
  assert.equal(pickRandomEntity([entity("only", "place")], { excludeId: "only" }), null);
});

test("pickRandomEntity draws only from detail-eligible entities, excluding media/source even without excludeId", () => {
  const entities = [entity("m1", "media"), entity("pl1", "place")];
  const picked = pickRandomEntity(entities, { randomFn: () => 0.99 });
  assert.equal(picked.id, "pl1");
});

test("pickDailyEntity is deterministic: the same date and entity pool always picks the same record", () => {
  const entities = [entity("a", "place"), entity("b", "story"), entity("c", "belief"), entity("d", "music")];
  const first = pickDailyEntity(entities, { dateStr: "2026-08-25" });
  const second = pickDailyEntity(entities, { dateStr: "2026-08-25" });
  assert.equal(first.id, second.id);
});

test("pickDailyEntity's pick does not depend on the input array's order — only on the entity set itself", () => {
  const entities = [entity("a", "place"), entity("b", "story"), entity("c", "belief"), entity("d", "music")];
  const reversed = [...entities].reverse();
  const picked = pickDailyEntity(entities, { dateStr: "2026-08-25" });
  const pickedReversed = pickDailyEntity(reversed, { dateStr: "2026-08-25" });
  assert.equal(picked.id, pickedReversed.id);
});

test("pickDailyEntity draws only from detail-eligible entities, never media/source, and never fabricates a result for an empty pool", () => {
  const entities = [entity("m1", "media"), entity("s1", "source"), entity("pl1", "place")];
  const picked = pickDailyEntity(entities, { dateStr: "2026-08-25" });
  assert.equal(picked.id, "pl1");
  assert.equal(pickDailyEntity([], { dateStr: "2026-08-25" }), null);
  assert.equal(pickDailyEntity([entity("m1", "media")], { dateStr: "2026-08-25" }), null);
});

test("pickDailyEntity varies across different dates (not pinned to a single always-picked record)", () => {
  const entities = Array.from({ length: 12 }, (_, i) => entity(`e${i}`, "place"));
  const picks = new Set();
  for (let day = 1; day <= 28; day += 1) {
    picks.add(pickDailyEntity(entities, { dateStr: `2026-01-${String(day).padStart(2, "0")}` }).id);
  }
  assert.ok(picks.size > 1, "28 different days should not all resolve to the exact same record");
});

test("pickDailyEntity defaults to today's real UTC date when no dateStr is supplied", () => {
  const entities = [entity("a", "place"), entity("b", "story")];
  const todayStr = new Date().toISOString().slice(0, 10);
  assert.deepEqual(pickDailyEntity(entities), pickDailyEntity(entities, { dateStr: todayStr }));
});

test("loadAllPublicEntities caches: a second call does not trigger a second fetch", async () => {
  let callCount = 0;
  globalThis.AntiochiaArchiveV2API = {
    fetchAllEntities: async () => { callCount += 1; return [entity("x", "place")]; },
  };
  // Re-import isn't needed — loadAllPublicEntities reads root.AntiochiaArchiveV2API live each call.
  const first = await globalThis.AntiochiaArchiveStore.loadAllPublicEntities({ force: true });
  const second = await globalThis.AntiochiaArchiveStore.loadAllPublicEntities();
  assert.equal(callCount, 1);
  assert.deepEqual(first, second);
});
