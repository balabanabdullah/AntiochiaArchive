// LOCAL DEVELOPMENT ONLY: maps the current reviewed data/archive.json into
// the v2 shape at startup using the existing validated v1 -> v2 mapper, then
// serves the result from an in-process MemoryV2Store.
//
// Safety properties:
//   - reads data/archive.json only; never writes it.
//   - never contacts Firestore or Cloud Storage.
//   - creates zero community/belief/place/proverb/source entities — the
//     mapper (../migration/v1ToV2Mapping.js) already enforces this; this
//     store adds no invented data of its own.
//   - fails loudly at startup if any mapped record does not validate
//     against the real v2 schemas; it never silently drops a record.
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
 * Factory so tests can inject a fixture archive loader instead of reading
 * the real data/archive.json from disk.
 */
export function createLocalMappedV2Store({ loadArchive = readV1Archive } = {}) {
  let delegate = null;

  function requireDelegate() {
    if (!delegate) {
      throw new Error("LocalMappedV2Store has not been initialized. Call initialize() first.");
    }
    return delegate;
  }

  return {
    async initialize() {
      const archive = await loadArchive();
      const entities = mapAndValidateArchive(archive);
      delegate = createMemoryV2Store({ entities, relationships: [] });
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
