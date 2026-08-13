// v2 store selection wrapper, mirroring the pluggable-store pattern already
// used by ../../dataStore.js for v1.
//
// V2Store interface (implementations must provide all of):
//   initialize(): Promise<void>
//   listEntities(options: { limit, cursor, filters }): Promise<{ items, nextCursor, count }>
//   getEntityById(id: string): Promise<object | null>
//   listByType(type: string, options: { limit, cursor, filters }): Promise<{ items, nextCursor, count }>
//   listRelationships(options: { limit, cursor, filters }): Promise<{ items, nextCursor, count }>
//   getRelatedEntities(id: string, options: { limit, cursor, filters }): Promise<{ items, nextCursor, count }>
//
// V2_DATA_STORE selects the implementation and defaults to `empty` unless
// explicitly overridden — this is what prevents an accidental production v2
// Firestore read: `firestore` is only ever selected when an operator sets
// V2_DATA_STORE=firestore themselves. `memory` is a local-only deterministic
// store, safe for demos/tests; it never contacts Firestore either. `local`
// maps the real data/archive.json through the validated v1 -> v2 mapper into
// an in-process store — also local-only, also never contacts Firestore.

import { emptyV2Store } from "./emptyV2Store.js";
import { memoryV2Store } from "./memoryV2Store.js";
import { firestoreV2Store } from "./firestoreV2Store.js";
import { localMappedV2Store } from "./localMappedV2Store.js";

const stores = Object.freeze({
  empty: emptyV2Store,
  memory: memoryV2Store,
  firestore: firestoreV2Store,
  local: localMappedV2Store,
});

let selectedStore = emptyV2Store;
let selectedStoreName = "empty";

export function normalizeV2StoreName(value = process.env.V2_DATA_STORE) {
  const name = String(value || "empty").trim().toLowerCase();
  if (!Object.hasOwn(stores, name)) {
    throw new Error(`V2_DATA_STORE must be one of: ${Object.keys(stores).join(", ")}.`);
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
