// LOCAL DEVELOPMENT ONLY: builds the local v2 dataset at startup and serves
// it from an in-process MemoryV2Store. Three sources are merged:
//
//   A. data/archive.json, mapped through the existing validated v1 -> v2
//      mapper (23 records today).
//   B. data/v2/entities.json + data/v2/relationships.json, hand-authored
//      v2-native records validated against the same v2 schemas and checked
//      for id/slug collisions and relationship referential integrity
//      against the merged entity set. See ../localData/nativeV2DataSource.js.
//   C. data/v2/legacyReplacements.json, the reviewed record of which mapped
//      v1 entities (A) a native entity (B) is confirmed to supersede. A
//      mapped entity is suppressed from the merged set ONLY when its
//      replacement is "active" — i.e. the native/canonical entity it names
//      actually exists in (B) today. Until the canonical entity is promoted,
//      the mapping is "pending" and the legacy mapped record stays fully
//      visible — see ../localData/legacyReplacements.js and
//      V2-ARCHITECTURE.md "Legacy replacement layer".
//
// Safety properties:
//   - reads data/archive.json, data/v2/entities.json,
//     data/v2/relationships.json, and data/v2/legacyReplacements.json only;
//     never writes any of them.
//   - never contacts Firestore or Cloud Storage.
//   - authors zero cultural content itself — the mapper, the native data
//     source, and the legacy replacement layer only validate/merge/suppress
//     what is already committed to those files; this step's committed
//     data/v2/*.json start empty (legacyReplacements.json starts populated
//     only with already human-reviewed supersession decisions, all pending
//     until their canonical target is promoted).
//   - fails loudly at startup on any invalid mapped/native/replacement
//     record, any id/slug collision, any orphan/type-mismatched
//     relationship, or any malformed replacement entry; it never silently
//     drops a record or a relationship, and a pending replacement never
//     hides the legacy record it will eventually supersede.
//
// Selected via V2_DATA_STORE=local (see ./v2Store.js). The production-safe
// default remains V2_DATA_STORE=empty; this store is never constructed or
// read unless an operator explicitly opts in.

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { assertValidArchive } from "../../dataModel.js";
import { mapV1ArchiveToV2Entities } from "../migration/v1ToV2Mapping.js";
import { validateEntity } from "../schemas/index.js";
import { loadNativeEntities, loadNativeRelationships } from "../localData/nativeV2DataSource.js";
import { loadLegacyReplacements, classifyLegacyReplacements } from "../localData/legacyReplacements.js";
import { createMemoryV2Store } from "./memoryV2Store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getArchiveFilePath() {
  // Mirrors ../../stores/fileStore.js's own path resolution (including the
  // ARCHIVE_JSON_PATH override) so local/Docker v1 and v2 read the same
  // underlying file, without importing v1's fileStore module itself — v2
  // store selection is deliberately independent of v1's DATA_STORE.
  return process.env.ARCHIVE_JSON_PATH
    ? path.resolve(process.env.ARCHIVE_JSON_PATH)
    : path.resolve(__dirname, "../../../data/archive.json");
}

async function readV1Archive() {
  const raw = await fs.readFile(getArchiveFilePath(), "utf-8");
  return assertValidArchive(JSON.parse(raw));
}

/**
 * Maps every record of an already-validated v1 archive to a v2 entity,
 * validating each mapped entity against the real v2 schemas. Throws with a
 * clear, actionable message identifying the offending v1 record on the
 * first invalid entity, rather than silently dropping it — a broken local
 * mapped runtime must fail at startup, not serve a partial entity set.
 */
export function mapAndValidateArchive(archive) {
  const mapped = mapV1ArchiveToV2Entities(archive);
  const entities = [];

  for (const { record, entity, targetType } of mapped) {
    const result = validateEntity(entity);
    if (!result.valid) {
      throw new Error(
        `LocalMappedV2Store: v1 record '${record.id}' (source category '${entity.sourceCategory}' `
        + `-> entityType '${targetType}') failed v2 schema validation: ${result.error}`,
      );
    }
    entities.push(entity);
  }

  return entities;
}

/**
 * Factory so tests can inject fixture loaders instead of reading the real
 * data/archive.json / data/v2/entities.json / data/v2/relationships.json
 * from disk. Defaults are the real, disk-backed loaders.
 */
export function createLocalMappedV2Store({
  loadArchive = readV1Archive,
  loadEntities = loadNativeEntities,
  loadRelationships = loadNativeRelationships,
  loadReplacements = loadLegacyReplacements,
} = {}) {
  let delegate = null;
  let lastReplacementClassification = null;

  function requireDelegate() {
    if (!delegate) {
      throw new Error("LocalMappedV2Store has not been initialized. Call initialize() first.");
    }
    return delegate;
  }

  return {
    async initialize() {
      // 1-2. Read + validate the v1 archive, then map its 23 records.
      const archive = await loadArchive();
      const mappedEntities = mapAndValidateArchive(archive);

      // 2a. Read and validate the legacy replacement map FIRST — before
      // loading native entities — so loadEntities can accept a native
      // entity's collision against a mapped v1 entity when a confirmed,
      // reviewed entry names that exact pair. Without this ordering, a
      // canonical entity sharing its superseded legacy record's exact slug
      // (the normal case: e.g. structure-0001 vs v1 st1, same slug
      // 'habib-i-neccar-camii') would hard-fail here as an "unexpected"
      // collision before suppression ever gets a chance to apply.
      const replacements = await loadReplacements({ mappedEntities });

      // 3-6. Read native v2 entities, validate them, detect id/slug
      // collisions against the mapped set (and against each other) —
      // allowing only the collisions `replacements` explicitly confirms.
      const nativeEntities = await loadEntities({ mappedEntities, legacyReplacements: replacements });

      // 6a. Classify each replacement entry as active (canonical target
      // actually present in the now-validated nativeEntities -> the named
      // mapped entity must be suppressed) or pending (canonical target not
      // promoted yet -> the mapped entity stays fully visible). Applied
      // BEFORE merging so a suppressed mapped entity never reaches the
      // served entity set, the relationship pool, or MemoryV2Store at all.
      const classification = classifyLegacyReplacements(replacements, nativeEntities);
      lastReplacementClassification = classification;

      const survivingMappedEntities = mappedEntities.filter(
        (entity) => !classification.activeLegacyIdsToSuppress.has(entity.id),
      );
      const entities = [...survivingMappedEntities, ...nativeEntities];

      // 7-9. Read native relationships, validate shape, then validate
      // referential integrity (sourceId/targetId exist, sourceType/
      // targetType match) against the full merged entity set. A relationship
      // that targeted a now-suppressed legacy entity would correctly fail
      // here as an orphan — exactly as if that id had never existed.
      const relationships = await loadRelationships({ entities });

      // 10. Load everything into an in-process MemoryV2Store.
      delegate = createMemoryV2Store({ entities, relationships });
    },

    /**
     * Exposes the most recent legacy-replacement classification (active /
     * pending entries) for introspection and tests. Never suppresses
     * anything itself — initialize() already applied the suppression before
     * building the served entity set.
     */
    getLegacyReplacementClassification() {
      if (!lastReplacementClassification) {
        throw new Error("LocalMappedV2Store has not been initialized. Call initialize() first.");
      }
      return lastReplacementClassification;
    },

    async listEntities(options) {
      return requireDelegate().listEntities(options);
    },

    async getEntityById(id) {
      return requireDelegate().getEntityById(id);
    },

    async listByType(type, options) {
      return requireDelegate().listByType(type, options);
    },

    async listRelationships(options) {
      return requireDelegate().listRelationships(options);
    },

    async getRelatedEntities(id, options) {
      return requireDelegate().getRelatedEntities(id, options);
    },
  };
}

export const localMappedV2Store = createLocalMappedV2Store();
