import test from "node:test";
import assert from "node:assert/strict";

await import("../public/archive-v2-api.js");

const {
  V2_TYPE_ROUTES,
  normalizeListResponse,
  normalizeEntityResponse,
  fetchAllPages,
  fetchEntitiesByType,
  fetchAllEntities,
  fetchEntityById,
  fetchRelatedEntities,
} = globalThis.AntiochiaArchiveV2API;

function listPayload(data, meta = {}) {
  return { success: true, data, meta: { version: "v2", count: data.length, limit: 100, cursor: null, nextCursor: null, ...meta } };
}

test("normalizeListResponse requires the documented envelope", () => {
  const payload = listPayload([{ id: "a" }]);
  assert.equal(normalizeListResponse(payload), payload);
  assert.throws(() => normalizeListResponse({ data: [] }), /invalid response/);
  assert.throws(() => normalizeListResponse({ success: true, data: {} }), /must be an array/);
  assert.throws(() => normalizeListResponse({ success: true, data: [] }), /pagination meta/);
});

test("normalizeEntityResponse requires an object payload", () => {
  const payload = { success: true, data: { id: "structure-0005" } };
  assert.deepEqual(normalizeEntityResponse(payload), payload.data);
  assert.throws(() => normalizeEntityResponse({ success: false }), /invalid response/);
  assert.throws(() => normalizeEntityResponse({ success: true, data: [1, 2] }), /must be an object/);
});

test("fetchAllPages requests only the same-origin endpoint with cache/Accept conventions", async () => {
  const requests = [];
  const items = await fetchAllPages("/api/v2/communities", {
    fetchImplementation: async (...args) => {
      requests.push(args);
      return { ok: true, status: 200, json: async () => listPayload([{ id: "comm-0001" }]) };
    },
  });

  assert.deepEqual(items, [{ id: "comm-0001" }]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], "/api/v2/communities?limit=100");
  assert.equal(requests[0][1].cache, "no-store");
  assert.equal(requests[0][1].headers.Accept, "application/json");
});

test("fetchAllPages follows nextCursor across pages and concatenates results, without duplicating or dropping any", async () => {
  let call = 0;
  const requests = [];
  const items = await fetchAllPages("/api/v2/entities", {
    fetchImplementation: async (path) => {
      requests.push(path);
      call += 1;
      if (call === 1) {
        return { ok: true, status: 200, json: async () => listPayload([{ id: "a" }, { id: "b" }], { nextCursor: "b" }) };
      }
      return { ok: true, status: 200, json: async () => listPayload([{ id: "c" }], { nextCursor: null }) };
    },
  });

  assert.deepEqual(items.map((item) => item.id), ["a", "b", "c"]);
  assert.equal(requests.length, 2);
  assert.equal(requests[0], "/api/v2/entities?limit=100");
  assert.equal(requests[1], "/api/v2/entities?limit=100&cursor=b");
});

test("fetchAllPages rejects the whole call if any page fails, never returning a partial result", async () => {
  let call = 0;
  await assert.rejects(
    fetchAllPages("/api/v2/places", {
      fetchImplementation: async () => {
        call += 1;
        if (call === 1) return { ok: true, status: 200, json: async () => listPayload([{ id: "place-0001" }], { nextCursor: "x" }) };
        return { ok: false, status: 500, json: async () => ({}) };
      },
    }),
    /500/,
  );
});

test("fetchAllPages guards against a non-terminating cursor loop", async () => {
  await assert.rejects(
    fetchAllPages("/api/v2/entities", {
      fetchImplementation: async () => ({ ok: true, status: 200, json: async () => listPayload([], { nextCursor: "always" }) }),
    }),
    /did not terminate/,
  );
});

test("fetchEntitiesByType rejects an unknown type route before making any request", async () => {
  await assert.rejects(
    fetchEntitiesByType("not-a-real-type", { fetchImplementation: async () => { throw new Error("should not be called"); } }),
    /Unknown v2 entity type route/,
  );
});

test("fetchEntitiesByType accepts every documented type route", async () => {
  for (const typeRoute of V2_TYPE_ROUTES) {
    // eslint-disable-next-line no-await-in-loop
    const items = await fetchEntitiesByType(typeRoute, {
      fetchImplementation: async (path) => {
        assert.equal(path, `/api/v2/${typeRoute}?limit=100`);
        return { ok: true, status: 200, json: async () => listPayload([]) };
      },
    });
    assert.deepEqual(items, []);
  }
});

test("fetchAllEntities requests the cross-type endpoint", async () => {
  const items = await fetchAllEntities({
    fetchImplementation: async (path) => {
      assert.equal(path, "/api/v2/entities?limit=100");
      return { ok: true, status: 200, json: async () => listPayload([{ id: "st3" }]) };
    },
  });
  assert.deepEqual(items, [{ id: "st3" }]);
});

test("fetchEntityById resolves to null on 404 (a stale link is an expected outcome, not an error)", async () => {
  const result = await fetchEntityById("structure-0001", {
    fetchImplementation: async () => ({ ok: false, status: 404, json: async () => ({ success: false, error: "Entity not found." }) }),
  });
  assert.equal(result, null);
});

test("fetchEntityById returns the entity data on success", async () => {
  const result = await fetchEntityById("structure-0005", {
    fetchImplementation: async (path) => {
      assert.equal(path, "/api/v2/entities/structure-0005");
      return { ok: true, status: 200, json: async () => ({ success: true, data: { id: "structure-0005", entityType: "structure" } }) };
    },
  });
  assert.deepEqual(result, { id: "structure-0005", entityType: "structure" });
});

test("fetchEntityById still rejects non-404 failures", async () => {
  await assert.rejects(
    fetchEntityById("structure-0005", { fetchImplementation: async () => ({ ok: false, status: 500, json: async () => ({}) }) }),
    /500/,
  );
});

test("fetchRelatedEntities returns [] when an entity has no public relationships yet, without throwing", async () => {
  const items = await fetchRelatedEntities("structure-0005", {
    fetchImplementation: async (path) => {
      assert.equal(path, "/api/v2/entities/structure-0005/related?limit=100");
      return { ok: true, status: 200, json: async () => listPayload([]) };
    },
  });
  assert.deepEqual(items, []);
});

test("fetchRelatedEntities encodes the entity id in the URL", async () => {
  await fetchRelatedEntities("id with spaces", {
    fetchImplementation: async (path) => {
      assert.equal(path, "/api/v2/entities/id%20with%20spaces/related?limit=100");
      return { ok: true, status: 200, json: async () => listPayload([]) };
    },
  });
});
