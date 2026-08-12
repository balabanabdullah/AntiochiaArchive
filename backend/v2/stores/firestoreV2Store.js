// Read-only Firestore-backed V2Store implementation. This module contains
// NO mutation calls (set/add/update/delete/create/batch/runTransaction) —
// see backend/test/v2/stores/firestoreV2Store.test.js for a static scan that
// enforces this.
//
// It reads exclusively from the `v2Entities` and `v2Relationships`
// collections — never the v1 `archive/{category}` documents — so v1 and v2
// production data can never collide.
//
// The store is never contacted unless V2_DATA_STORE=firestore is explicitly
// set (see ../stores/v2Store.js); the default `empty` store never imports
// Firestore credentials at all.

import { FieldPath } from "@google-cloud/firestore";
import { getFirestore, initializeFirestore } from "../../firestore.js";
import { ENTITY_TYPES, RELATIONSHIP_TYPES } from "../constants/vocabularies.js";
import { V2QueryError } from "./errors.js";

export const V2_ENTITIES_COLLECTION = "v2Entities";
export const V2_RELATIONSHIPS_COLLECTION = "v2Relationships";

// Entity fields a filter can translate directly into a Firestore equality
// clause today (see ../../../V2-ARCHITECTURE.md "Filter implementation").
const DIRECT_ENTITY_FILTER_FIELDS = Object.freeze(["status", "storyCategory", "originalLanguage", "dialect"]);

// Deliberately NOT denormalized onto the entity document (see the v2
// blueprint's "do not denormalize full related records"). Honoring these
// requires a relationship-driven query this store does not implement yet,
// so a request for them is rejected rather than silently ignored.
const DEFERRED_ENTITY_FILTER_FIELDS = Object.freeze(["communityId", "beliefId", "placeId"]);

function emptyPage() {
  return { items: [], nextCursor: null, count: 0 };
}

// Cursors are opaque to API clients: an API caller only ever receives and
// replays this token, never a raw Firestore document ID directly.
function encodeCursor(id) {
  return Buffer.from(JSON.stringify({ id }), "utf8").toString("base64url");
}

function decodeCursor(cursor) {
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new V2QueryError("cursor is not a valid opaque pagination token.");
  }
  if (!decoded || typeof decoded.id !== "string" || !decoded.id) {
    throw new V2QueryError("cursor is not a valid opaque pagination token.");
  }
  return decoded.id;
}

async function runQuery(query) {
  try {
    return await query.get();
  } catch (error) {
    // Firestore reports a missing composite index as FAILED_PRECONDITION
    // (gRPC code 9). Surface a safe, actionable error instead of ever
    // falling back to an unindexed full-collection scan.
    if (error?.code === 9 || /FAILED_PRECONDITION/i.test(error?.message || "")) {
      throw new V2QueryError(
        "This query requires a Firestore index that has not been created yet. "
        + "Narrow the filters, or create the required composite index, before retrying.",
      );
    }
    throw error;
  }
}

function applyEntityFilters(query, filters = {}, { entityTypeApplied = false } = {}) {
  for (const field of DEFERRED_ENTITY_FILTER_FIELDS) {
    if (filters[field] != null) {
      throw new V2QueryError(
        `Filtering by '${field}' is not supported yet: it is not denormalized onto the v2 entity document `
        + "and must be resolved through a relationship-driven query in a future step.",
      );
    }
  }

  let next = query;
  if (!entityTypeApplied && filters.entityType) {
    next = next.where("entityType", "==", filters.entityType);
  }
  for (const field of DIRECT_ENTITY_FILTER_FIELDS) {
    if (filters[field]) next = next.where(field, "==", filters[field]);
  }
  if (filters.musicGenre) next = next.where("genre", "==", filters.musicGenre);
  if (filters.tag) next = next.where("tags", "array-contains", filters.tag);

  return next;
}

async function fetchPage(database, collectionName, query, { limit, cursor }) {
  let boundedQuery = query;

  if (cursor) {
    const cursorId = decodeCursor(cursor);
    const cursorSnapshot = await database.collection(collectionName).doc(cursorId).get();
    if (!cursorSnapshot.exists) {
      throw new V2QueryError("cursor does not reference an existing page boundary.");
    }
    boundedQuery = boundedQuery.startAfter(cursorSnapshot);
  }

  // Fetch one extra document to learn whether another page exists, without
  // ever scanning the whole collection.
  const snapshot = await runQuery(boundedQuery.limit(limit + 1));
  const docs = snapshot.docs.slice(0, limit);
  const hasMore = snapshot.docs.length > limit;

  return {
    items: docs.map((doc) => doc.data()),
    nextCursor: hasMore ? encodeCursor(docs[docs.length - 1].id) : null,
    count: docs.length,
  };
}

/**
 * Factory so tests can inject a fake Firestore-like database instead of the
 * real `@google-cloud/firestore` client. `firestoreV2Store` (below) is the
 * production instance, lazily bound to the shared Firestore client in
 * ../../firestore.js.
 */
export function createFirestoreV2Store({ getDatabase = getFirestore } = {}) {
  return {
    async initialize() {
      // Constructs the Firestore client if needed; performs no network I/O
      // by itself (matches the existing v1 firestoreStore.initialize()).
      initializeFirestore();
    },

    async listEntities({ limit = 20, cursor = null, filters = {} } = {}) {
      const database = getDatabase();
      let query = applyEntityFilters(database.collection(V2_ENTITIES_COLLECTION), filters);
      query = query.orderBy(FieldPath.documentId());
      return fetchPage(database, V2_ENTITIES_COLLECTION, query, { limit, cursor });
    },

    async getEntityById(id) {
      if (typeof id !== "string" || !id.trim()) return null;
      const database = getDatabase();
      const snapshot = await database.collection(V2_ENTITIES_COLLECTION).doc(id).get();
      return snapshot.exists ? snapshot.data() : null;
    },

    async listByType(type, { limit = 20, cursor = null, filters = {} } = {}) {
      if (!ENTITY_TYPES.includes(type)) return emptyPage();
      const database = getDatabase();
      let query = database.collection(V2_ENTITIES_COLLECTION).where("entityType", "==", type);
      query = applyEntityFilters(query, filters, { entityTypeApplied: true });
      query = query.orderBy(FieldPath.documentId());
      return fetchPage(database, V2_ENTITIES_COLLECTION, query, { limit, cursor });
    },

    async listRelationships({ limit = 20, cursor = null, filters = {} } = {}) {
      const database = getDatabase();
      let query = database.collection(V2_RELATIONSHIPS_COLLECTION);
      if (filters.type) {
        if (!RELATIONSHIP_TYPES.includes(filters.type)) return emptyPage();
        query = query.where("type", "==", filters.type);
      }
      query = query.orderBy(FieldPath.documentId());
      return fetchPage(database, V2_RELATIONSHIPS_COLLECTION, query, { limit, cursor });
    },

    // Tradeoff: Firestore cannot OR across two different fields (sourceId /
    // targetId) in a single query, so this issues two equality queries and
    // merges them client-side rather than one combined query. This avoids
    // an N+1 per-relationship read, at the cost of always reading both
    // directions even when only one has matches. See V2-ARCHITECTURE.md
    // "Relationship reads" for the documented tradeoff.
    async getRelatedEntities(id, { limit = 20 } = {}) {
      if (typeof id !== "string" || !id.trim()) return emptyPage();
      const database = getDatabase();

      const [asSource, asTarget] = await Promise.all([
        runQuery(database.collection(V2_RELATIONSHIPS_COLLECTION).where("sourceId", "==", id).limit(limit)),
        runQuery(database.collection(V2_RELATIONSHIPS_COLLECTION).where("targetId", "==", id).limit(limit)),
      ]);

      const relationships = [...asSource.docs, ...asTarget.docs].map((doc) => doc.data());
      const relatedIds = [...new Set(relationships.map((relationship) => (
        relationship.sourceId === id ? relationship.targetId : relationship.sourceId
      )))].slice(0, limit);

      if (!relatedIds.length) return emptyPage();

      const references = relatedIds.map((relatedId) => database.collection(V2_ENTITIES_COLLECTION).doc(relatedId));
      const snapshots = await database.getAll(...references);
      const items = snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => snapshot.data());
      return { items, nextCursor: null, count: items.length };
    },
  };
}

export const firestoreV2Store = createFirestoreV2Store();
