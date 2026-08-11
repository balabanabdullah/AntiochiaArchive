import test from "node:test";
import assert from "node:assert/strict";

await import("../public/archive-api.js");

const { ARCHIVE_CATEGORIES, fetchArchive, normalizeArchiveResponse } = globalThis.AntiochiaArchiveAPI;

function emptyArchive() {
  return Object.fromEntries(ARCHIVE_CATEGORIES.map((category) => [category, []]));
}

test("archive API response normalization requires the documented wrapper", () => {
  const archive = emptyArchive();
  assert.equal(normalizeArchiveResponse({ success: true, data: archive }), archive);
  assert.throws(() => normalizeArchiveResponse(archive), /invalid response/);
  assert.throws(
    () => normalizeArchiveResponse({ success: true, data: { history: [] } }),
    /stories/,
  );
});

test("archive client requests only the same-origin API endpoint", async () => {
  const archive = emptyArchive();
  let request;
  const result = await fetchArchive(async (...args) => {
    request = args;
    return { ok: true, status: 200, json: async () => ({ success: true, data: archive }) };
  });

  assert.equal(result, archive);
  assert.equal(request[0], "/api/archive");
  assert.equal(request[1].cache, "no-store");
  assert.equal(request[1].headers.Accept, "application/json");
});

test("archive client rejects API failures instead of returning fallback data", async () => {
  await assert.rejects(
    fetchArchive(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    /503/,
  );
});
