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
// V2_DATA_STORE=firestore themselves (and today reads real-but-currently-empty
// Firestore collections — no migration script populates them yet). `memory`
// is a local-only deterministic store, safe for demos/tests; it never
// contacts Firestore either. `local` maps the real data/archive.json plus
// data/v2/*.json through the validated v1 -> v2 mapper, the legacy
// replacement layer, and the real v2 schema validators into an in-process,
// read-only, in-memory store — it never writes anywhere and never contacts
// Firestore or Cloud Storage, regardless of where the JSON files it reads
// physically live. That last property is exactly what makes it safe to
// select in production too, as long as the JSON files it needs are actually
// present: locally that means the live repository-root data/ directory (dev
// server or docker-compose's bind mount); in the deployed backend container
// it means the committed, drift-checked bundle at backend/data/ (see
// backend/Dockerfile's `COPY data/ ./data/` and
// backend/test/v2/dataBundleDrift.test.js) with V2_ENTITIES_JSON_PATH/
// V2_RELATIONSHIPS_JSON_PATH/V2_LEGACY_REPLACEMENTS_JSON_PATH/
// ARCHIVE_JSON_PATH pointed at the in-image copies. See V2-ARCHITECTURE.md
// "Local real-data v2 runtime" and "Production v2 data path" for the full
// reasoning — `local` is not a "dev-only, never production" label, it is
// simply "reads these JSON files from disk, wherever they are, and never
// writes." Selecting it in production without also bundling those files
// (the state before this was addressed) would crash the backend at startup;
// see the Dockerfile comment for why that gap existed and how it's closed.
//
// `sqlite` is the odd one out: unlike every store above, it is genuinely
// WRITABLE (through backend/admin/contentService.js — never through this
// module or any V2Store method) — see sqliteV2Store.js's header for why
// that split exists. Selecting it requires backend/db/sqliteConnection.js's
// initializeSqlite() to have already run (see server.js); it never reads or
// writes data/v2/*.json.

import { emptyV2Store } from "./emptyV2Store.js";
import { memoryV2Store } from "./memoryV2Store.js";
import { firestoreV2Store } from "./firestoreV2Store.js";
import { localMappedV2Store } from "./localMappedV2Store.js";
import { sqliteV2Store } from "./sqliteV2Store.js";

const stores = Object.freeze({
  empty: emptyV2Store,
  memory: memoryV2Store,
  firestore: firestoreV2Store,
  local: localMappedV2Store,
  // The first genuinely writable store — see sqliteV2Store.js's header.
  // Selecting it requires the SQLite connection (backend/db/sqliteConnection.js)
  // to already be initialized, exactly like `local` requires the JSON files
  // it reads to already be present on disk.
  sqlite: sqliteV2Store,
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

/**
 * The ONE authoritative "is this deployment in the writable, no-code CMS
 * runtime?" check (Section 16 — "avoid two independent switches that can
 * contradict each other"). Every module that needs to know (admin content
 * routes, page routes, media routes, the runtime sitemap) calls this
 * instead of re-deriving its own `=== "sqlite"` string comparison, so
 * there is exactly one place this logic could ever be wrong. There is no
 * separate `DB_DRIVER` switch anywhere in this codebase — see
 * db/sqliteConnection.js's header for that clarification.
 */
export function isSqliteRuntimeActive() {
  return getSelectedV2StoreName() === "sqlite";
}
