// v2 store selection wrapper, mirroring the pluggable-store pattern already
// used by ../../dataStore.js for v1. Today the only implementation is
// EmptyV2Store; this indirection exists so a future Firestore-backed v2
// store can be introduced later without changing route/controller code.
//
// V2Store interface (implementations must provide all of):
//   initialize(): Promise<void>
//   listEntities(options: { limit, cursor, filters }): Promise<{ items, nextCursor, count }>
//   getEntityById(id: string): Promise<object | null>
//   listByType(type: string, options: { limit, cursor, filters }): Promise<{ items, nextCursor, count }>
//   listRelationships(options: { limit, cursor, filters }): Promise<{ items, nextCursor, count }>
//   getRelatedEntities(id: string, options: { limit, cursor, filters }): Promise<{ items, nextCursor, count }>

import { emptyV2Store } from "./emptyV2Store.js";

const stores = Object.freeze({
  empty: emptyV2Store,
});

let selectedStore = emptyV2Store;
let selectedStoreName = "empty";

export function normalizeV2StoreName(value = process.env.V2_DATA_STORE) {
  const name = String(value || "empty").trim().toLowerCase();
  if (!Object.hasOwn(stores, name)) {
    throw new Error("V2_DATA_STORE must be 'empty'.");
  }
  return name;
}

export async function initializeV2Store() {
  const name = normalizeV2StoreName();
  selectedStoreName = name;
  selectedStore = stores[name];
  await selectedStore.initialize();
  return selectedStore;
}

export function getV2Store() {
  return selectedStore;
}

export function getSelectedV2StoreName() {
  return selectedStoreName;
}
