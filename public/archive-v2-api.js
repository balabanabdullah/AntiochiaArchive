/**
 * Strict browser client for the public v2 archive API.
 * Parallel to archive-api.js, but v2's shape differs deliberately: one
 * paginated endpoint per entity type (plus a cross-type /entities endpoint)
 * instead of one combined object, since the merged v2 archive is much
 * larger than v1's 23 records and the server caps any single page at 100
 * items. The backend datastore remains intentionally opaque to the frontend.
 */
(function exposeArchiveV2Api(root) {
  "use strict";

  // Must match backend/v2/routes/v2Routes.js's TYPE_ROUTES keys exactly.
  const V2_TYPE_ROUTES = Object.freeze([
    "communities",
    "beliefs",
    "places",
    "structures",
    "stories",
    "music",
    "historical-contexts",
    "media",
    "proverbs",
  ]);

  const MAX_PAGE_LIMIT = 100;
  // Bounds runaway pagination (a malformed/malicious cursor loop), not a
  // realistic expected page count — 105 public entities today needs at
  // most 2 pages at limit=100.
  const MAX_PAGES = 20;

  function normalizeListResponse(payload) {
    if (!payload || typeof payload !== "object" || payload.success !== true) {
      throw new TypeError("V2 API returned an invalid response.");
    }
    if (!Array.isArray(payload.data)) {
      throw new TypeError("V2 API response data must be an array.");
    }
    if (!payload.meta || typeof payload.meta !== "object") {
      throw new TypeError("V2 API response is missing pagination meta.");
    }
    return payload;
  }

  function normalizeEntityResponse(payload) {
    if (!payload || typeof payload !== "object" || payload.success !== true) {
      throw new TypeError("V2 API returned an invalid response.");
    }
    if (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) {
      throw new TypeError("V2 API response data must be an object.");
    }
    return payload.data;
  }

  function buildPagedUrl(path, { limit, cursor }) {
    const query = new URLSearchParams();
    query.set("limit", String(limit));
    if (cursor) query.set("cursor", cursor);
    return `${path}?${query.toString()}`;
  }

  async function requestJson(path, fetchImplementation) {
    if (typeof fetchImplementation !== "function") {
      throw new TypeError("V2 API fetch is unavailable.");
    }
    const response = await fetchImplementation(path, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response?.ok) {
      throw new Error(`V2 API request failed (${response?.status || "network error"}).`);
    }
    return response.json();
  }

  /**
   * Fetches every page of a paginated v2 list endpoint and returns the
   * concatenated `data` array. Never returns a partial result silently: a
   * failure on any page rejects the whole call, exactly like a single-page
   * fetch would.
   */
  async function fetchAllPages(path, { fetchImplementation = root.fetch, limit = MAX_PAGE_LIMIT } = {}) {
    const items = [];
    let cursor = null;
    let pageCount = 0;

    do {
      const payload = normalizeListResponse(
        await requestJson(buildPagedUrl(path, { limit, cursor }), fetchImplementation),
      );
      items.push(...payload.data);
      cursor = payload.meta.nextCursor || null;
      pageCount += 1;
      if (pageCount > MAX_PAGES) {
        throw new Error(`V2 API pagination did not terminate after ${MAX_PAGES} pages for '${path}'.`);
      }
    } while (cursor);

    return items;
  }

  function assertKnownType(typeRoute) {
    if (!V2_TYPE_ROUTES.includes(typeRoute)) {
      throw new TypeError(`Unknown v2 entity type route '${typeRoute}'. Expected one of: ${V2_TYPE_ROUTES.join(", ")}.`);
    }
  }

  /** Fetches every public entity of one type (e.g. "communities", "places"). */
  async function fetchEntitiesByType(typeRoute, options = {}) {
    assertKnownType(typeRoute);
    return fetchAllPages(`/api/v2/${typeRoute}`, options);
  }

  /** Fetches every public entity across all types, paginated. */
  async function fetchAllEntities(options = {}) {
    return fetchAllPages("/api/v2/entities", options);
  }

  /**
   * Fetches one public entity by id. A 404 is an expected outcome (a stale
   * link, or an entity that is no longer public) — this resolves to `null`
   * rather than throwing. Any other failure (network error, 5xx, malformed
   * response) still throws.
   */
  async function fetchEntityById(id, { fetchImplementation = root.fetch } = {}) {
    if (typeof fetchImplementation !== "function") {
      throw new TypeError("V2 API fetch is unavailable.");
    }
    const response = await fetchImplementation(`/api/v2/entities/${encodeURIComponent(id)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (response?.status === 404) return null;
    if (!response?.ok) {
      throw new Error(`V2 API request failed (${response?.status || "network error"}).`);
    }
    return normalizeEntityResponse(await response.json());
  }

  /**
   * Fetches entities related to `id`, each paired with the relationship
   * edge that connects them where one can be identified. Returns `[]` when
   * there are no public relationships for this entity yet (the common case
   * today — see V2-ARCHITECTURE.md "Public relationship gating") — this is
   * a normal, valid outcome, not an error.
   */
  async function fetchRelatedEntities(id, options = {}) {
    return fetchAllPages(`/api/v2/entities/${encodeURIComponent(id)}/related`, options);
  }

  root.AntiochiaArchiveV2API = Object.freeze({
    V2_TYPE_ROUTES,
    normalizeListResponse,
    normalizeEntityResponse,
    fetchAllPages,
    fetchEntitiesByType,
    fetchAllEntities,
    fetchEntityById,
    fetchRelatedEntities,
  });
})(typeof window !== "undefined" ? window : globalThis);
