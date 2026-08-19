import test from "node:test";
import assert from "node:assert/strict";

await import("../public/js/timeline.js");

const { getTimelineEntries, timelineSortRank } = globalThis.AntiochiaArchiveTimeline;

function hist(id, slug) {
  return { id, entityType: "historicalContext", slug, title: {}, summary: {}, period: {} };
}

test("getTimelineEntries includes only historicalContext entities", () => {
  const entities = [
    hist("hist-0002", "seleucid"),
    { id: "place-0001", entityType: "place", slug: "x", title: {}, summary: {} },
  ];
  const entries = getTimelineEntries(entities);
  assert.deepEqual(entries.map((e) => e.id), ["hist-0002"]);
});

test("hist-00NN ids sort in strict numeric order regardless of input order", () => {
  const entities = [hist("hist-0021", "z"), hist("hist-0002", "a"), hist("hist-0010", "m")];
  const entries = getTimelineEntries(entities);
  assert.deepEqual(entries.map((e) => e.id), ["hist-0002", "hist-0010", "hist-0021"]);
});

test("the 3 legacy (h1/h2/h3) records interleave near their own published era, never all first or all last", () => {
  const entities = [
    hist("h1", "legacy-roman-overview"),   // "300 BCE — Roman Capital"
    hist("hist-0002", "seleucid"),
    hist("hist-0004", "roman"),
    hist("hist-0012", "byzantine-reconquest"),
    hist("h2", "legacy-medieval-overview"), // "Medieval & Ottoman Eras"
    hist("hist-0016", "late-ottoman"),
    hist("hist-0021", "2023-earthquake"),
    hist("h3", "legacy-modern-overview"),   // "Modern Memory"
  ];
  const order = getTimelineEntries(entities).map((e) => e.id);
  assert.deepEqual(order, [
    "hist-0002", "h1", "hist-0004", "hist-0012", "h2", "hist-0016", "hist-0021", "h3",
  ]);
});

test("an id in neither shape sorts to the end, stably, rather than crashing or jumping to the front", () => {
  const entities = [hist("hist-0002", "a"), hist("future-0001", "b"), hist("hist-0003", "c")];
  const order = getTimelineEntries(entities).map((e) => e.id);
  assert.deepEqual(order, ["hist-0002", "hist-0003", "future-0001"]);
});

test("timelineSortRank is a pure function of id alone", () => {
  assert.equal(timelineSortRank({ id: "hist-0007" }, 0), 7);
  assert.equal(timelineSortRank({ id: "h2" }, 0), 13.5);
});

test("getTimelineEntries never mutates its input array", () => {
  const entities = [hist("hist-0009", "b"), hist("hist-0002", "a")];
  const copy = entities.slice();
  getTimelineEntries(entities);
  assert.deepEqual(entities, copy);
});
