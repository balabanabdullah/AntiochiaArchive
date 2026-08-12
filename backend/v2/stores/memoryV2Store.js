// Deterministic in-memory V2Store, primarily for tests. It mirrors
// FirestoreV2Store's contract (including rejecting the same deferred
// communityId/beliefId/placeId filters with the same V2QueryError) so tests
// written against MemoryV2Store exercise real store-selection behavior, not
// a permissive stand-in. It never contacts Firestore or Cloud Storage.

import { V2QueryError } from "./errors.js";

const DEFERRED_ENTITY_FILTER_FIELDS = Object.freeze(["communityId", "beliefId", "placeId"]);

function normalizeLimit(limit) {
  return Number.isInteger(limit) && limit > 0 ? limit : 20;
}

function assertNoDeferredFilters(filters = {}) {
  for (const field of DEFERRED_ENTITY_FILTER_FIELDS) {
    if (filters[field] != null) {
      throw new V2QueryError(
        `Filtering by '${field}' is not supported yet: it is not denormalized onto the v2 entity document `
        + "and must be resolved through a relationship-driven query in a future step.",
      );
    }
  }
}

function matchesFilters(item, filters = {}) {
  return Object.entries(filters).every(([key, value]) => {
    if (value == null) return true;
    if (key === "tag") return Array.isArray(item.tags) && item.tags.includes(value);
    if (key === "musicGenre") return item.genre === value;
    if (key === "entityType") return item.entityType === value;
    return item[key] === value;
  });
}

function sortById(items) {
  return [...items].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function paginate(items, { limit, cursor }) {
  const sorted = sortById(items);
  let startIndex = 0;

  if (cursor) {
    const index = sorted.findIndex((item) => item.id === cursor);
    startIndex = index === -1 ? sorted.length : index + 1;
  }

  const page = sorted.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < sorted.length;

  return {
    items: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
    count: page.length,
  };
}

/** Factory: pass fixture entities/relationships for deterministic tests. */
export function createMemoryV2Store({ entities = [], relationships = [] } = {}) {
  return {
    async initialize() {
      return undefined;
    },

    async listEntities({ limit = 20, cursor = null, filters = {} } = {}) {
      assertNoDeferredFilters(filters);
      const normalizedLimit = normalizeLimit(limit);
      const filtered = entities.filter((entity) => matchesFilters(entity, filters));
      return paginate(filtered, { limit: normalizedLimit, cursor });
    },

    async getEntityById(id) {
      return entities.find((entity) => entity.id === id) || null;
    },

    async listByType(type, { limit = 20, cursor = null, filters = {} } = {}) {
      assertNoDeferredFilters(filters);
      const normalizedLimit = normalizeLimit(limit);
      const filtered = entities.filter((entity) => entity.entityType === type && matchesFilters(entity, filters));
      return paginate(filtered, { limit: normalizedLimit, cursor });
    },

    async listRelationships({ limit = 20, cursor = null, filters = {} } = {}) {
      const normalizedLimit = normalizeLimit(limit);
      const filtered = relationships.filter((relationship) => (
        Object.entries(filters).every(([key, value]) => value == null || relationship[key] === value)
      ));
      return paginate(filtered, { limit: normalizedLimit, cursor });
    },

    async getRelatedEntities(id, { limit = 20, cursor = null } = {}) {
      const normalizedLimit = normalizeLimit(limit);
      const relatedIds = new Set(relationships
        .filter((relationship) => relationship.sourceId === id || relationship.targetId === id)
        .map((relationship) => (relationship.sourceId === id ? relationship.targetId : relationship.sourceId)));
      const related = entities.filter((entity) => relatedIds.has(entity.id));
      return paginate(related, { limit: normalizedLimit, cursor });
    },
  };
}

export const memoryV2Store = createMemoryV2Store();
