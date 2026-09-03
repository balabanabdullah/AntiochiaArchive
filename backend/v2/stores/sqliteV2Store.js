// SQLite-backed V2Store — the first genuinely WRITABLE runtime content
// authority (Section 5 of the round brief). Implements the exact same
// read-only V2Store contract every other store (empty/memory/firestore/
// local) already implements, so v2Routes.js, adminRoutes.js, and every
// existing test written against that contract work against this store
// unmodified the moment an operator sets V2_DATA_STORE=sqlite.
//
// This module is intentionally READ-ONLY, matching every store that came
// before it — see V2-ARCHITECTURE.md's existing "stores are read-only"
// invariant. Writes go through backend/admin/contentService.js instead,
// which is the ONLY code path allowed to call the mutating functions in
// backend/db/repositories/entityRepository.js directly (mirroring exactly
// how backend/admin/editorialStore.js is the only writer of editorial
// drafts, and backend/scripts/apply-editorial-changes.js is the only writer
// of data/v2/entities.json). A store that can be *read* through V2Store but
// is *written* through a separate, explicit service is a deliberate
// separation of concerns, not an oversight.

import { initializeSqlite } from "../../db/sqliteConnection.js";
import { applyPendingMigrations } from "../../db/migrate.js";
import { initializeMediaStorage, getMediaStorage } from "../../media/mediaStorage.js";
import {
  listEntitiesRows, listByTypeRows, getEntityByIdRow,
} from "../../db/repositories/entityRepository.js";
import { listRelationshipsRows, getRelatedEntityIds } from "../../db/repositories/relationshipRepository.js";

function paginateEntityList(entityIds, { limit, cursor }) {
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 20;
  let startIndex = 0;
  if (cursor) {
    const index = entityIds.findIndex((id) => id === cursor);
    startIndex = index === -1 ? entityIds.length : index + 1;
  }
  const page = entityIds.slice(startIndex, startIndex + normalizedLimit);
  return { page, nextCursor: startIndex + normalizedLimit < entityIds.length ? page[page.length - 1] : null };
}

export function createSqliteV2Store() {
  return {
    async initialize() {
      // Self-contained, exactly like every other store's initialize():
      // opens (or creates) the database file, applies any pending schema
      // migrations, and prepares local media storage — an operator who sets
      // V2_DATA_STORE=sqlite needs no separate manual setup step beyond
      // (optionally) running scripts/migrate-json-to-sqlite.js to seed it.
      initializeSqlite();
      applyPendingMigrations({ verbose: false });
      initializeMediaStorage();
      // Defense-in-depth cleanup (Section 1/2 of the "correctness pass"
      // round): removes any upload temp file orphaned by a client
      // disconnecting mid-stream in a previous process lifetime — "no
      // leaked temp files" holds even across a crash/restart, not only
      // within one successful request.
      getMediaStorage().sweepStaleTempFiles();
    },

    async listEntities({ limit = 20, cursor = null, filters = {} } = {}) {
      return listEntitiesRows({ limit, cursor, filters });
    },

    async getEntityById(id) {
      return getEntityByIdRow(id);
    },

    async listByType(type, { limit = 20, cursor = null, filters = {} } = {}) {
      return listByTypeRows(type, { limit, cursor, filters });
    },

    async listRelationships({ limit = 20, cursor = null, filters = {} } = {}) {
      return listRelationshipsRows({ limit, cursor, filters });
    },

    async getRelatedEntities(id, { limit = 20, cursor = null } = {}) {
      const relatedIds = getRelatedEntityIds(id).sort((a, b) => String(a).localeCompare(String(b)));
      const { page, nextCursor } = paginateEntityList(relatedIds, { limit, cursor });
      const items = page.map((relatedId) => getEntityByIdRow(relatedId)).filter(Boolean);
      return { items, nextCursor, count: items.length };
    },
  };
}

export const sqliteV2Store = createSqliteV2Store();
