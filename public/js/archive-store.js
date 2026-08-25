/**
 * Shared, cached, cross-type public v2 archive store.
 *
 * The per-page pipeline in script.js (fetchV2ArchiveData/archiveDataV2) only
 * fetches the entity types whose grid container is present on the current
 * page — correct for the existing category pages, but the discovery features
 * (search, timeline, map, collections, "random record") all need the WHOLE
 * public archive regardless of which page they run on. This module wraps
 * AntiochiaArchiveV2API.fetchAllEntities() (already paginated + same-origin +
 * public-serializer-shaped) behind a single in-memory cache so those features
 * never trigger their own repeated network fetches — one request per page
 * load, shared by every consumer that asks for it.
 *
 * Only ever touches /api/v2/entities, which already applies the backend's
 * publish-gate + field allowlist (see backend/v2/serializers/publicSerializer.js
 * and publicVisibility.js) — this module has no private/raw data access of
 * any kind and cannot leak draft/inReview/archived records.
 */
(function exposeArchiveStore(root) {
  "use strict";

  /** The 7 entity types that ever get a static detail page (see V2-ARCHITECTURE.md). */
  const DETAIL_TYPES = Object.freeze([
    "historicalContext",
    "community",
    "belief",
    "place",
    "structure",
    "story",
    "music",
    "proverb",
  ]);

  let cachedPromise = null;

  /**
   * Resolves to the flat array of every public v2 entity (all types,
   * including media, which callers filter out as needed). Concurrent callers
   * during the same load share one in-flight request. A failed load clears
   * the cache so a later retry can fetch again instead of rejecting forever.
   */
  function loadAllPublicEntities({ force = false } = {}) {
    if (force) cachedPromise = null;
    if (cachedPromise) return cachedPromise;

    if (!root.AntiochiaArchiveV2API) {
      return Promise.reject(new Error("Archive v2 API client is unavailable."));
    }

    cachedPromise = root.AntiochiaArchiveV2API.fetchAllEntities().catch((err) => {
      cachedPromise = null;
      throw err;
    });
    return cachedPromise;
  }

  /** Synchronous filter helpers over an already-loaded entity array. */
  function byType(entities, entityType) {
    return (entities || []).filter((entity) => entity.entityType === entityType);
  }

  function byId(entities, id) {
    return (entities || []).find((entity) => entity.id === id) || null;
  }

  function bySlug(entities, slug) {
    return (entities || []).find((entity) => entity.slug === slug) || null;
  }

  /** Only the 7 types a detail page (and therefore search/collections/discover) can ever link to. */
  function detailEligible(entities) {
    return (entities || []).filter((entity) => DETAIL_TYPES.includes(entity.entityType));
  }

  /**
   * Picks one random detail-eligible entity, never the one currently on
   * screen (`excludeId`, so the "Another record" button on a detail page
   * never re-offers the record you're already reading). `randomFn` is
   * injectable so tests can assert deterministically instead of stubbing
   * Math.random.
   */
  function pickRandomEntity(entities, { excludeId = null, randomFn = Math.random } = {}) {
    const pool = detailEligible(entities).filter((entity) => entity.id !== excludeId);
    if (!pool.length) return null;
    return pool[Math.floor(randomFn() * pool.length)];
  }

  root.AntiochiaArchiveStore = Object.freeze({
    DETAIL_TYPES,
    loadAllPublicEntities,
    byType,
    byId,
    bySlug,
    pickRandomEntity,
    detailEligible,
  });
})(typeof window !== "undefined" ? window : globalThis);
