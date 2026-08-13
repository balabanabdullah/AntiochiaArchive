// LOCAL DEVELOPMENT / EDITORIAL PREVIEW ONLY: loads hand-authored,
// source-reviewed v2-native entities and relationships from
// data/v2/entities.json and data/v2/relationships.json, validates them
// against the real v2 schemas, and checks referential integrity before
// anything is merged into a running store. Pure and read-only: this module
// never writes either file, and never contacts Firestore or Cloud Storage.
//
// Both files are committed to the repository and start empty
// ({ "entities": [] } / { "relationships": [] }) — see V2-ARCHITECTURE.md
// "Local editorial entity + relationship data infrastructure". A MISSING
// file is therefore treated as a configuration/repository problem, not an
// empty dataset: this module fails loudly (throws) rather than silently
// substituting an empty array.

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { validateEntity } from "../schemas/index.js";
import { validateRelationship } from "../schemas/relationship.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getNativeEntitiesFilePath() {
  return process.env.V2_ENTITIES_JSON_PATH
    ? path.resolve(process.env.V2_ENTITIES_JSON_PATH)
    : path.resolve(__dirname, "../../../data/v2/entities.json");
}

export function getNativeRelationshipsFilePath() {
  return process.env.V2_RELATIONSHIPS_JSON_PATH
    ? path.resolve(process.env.V2_RELATIONSHIPS_JSON_PATH)
    : path.resolve(__dirname, "../../../data/v2/relationships.json");
}

async function readJsonFile(filePath, label) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `${label} file is missing at '${filePath}'. A committed file (even if empty) is expected there — `
        + "this looks like a configuration or repository problem, not an empty dataset. See "
        + "V2-ARCHITECTURE.md \"Local editorial entity + relationship data infrastructure\".",
      );
    }
    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} file at '${filePath}' is not valid JSON: ${error.message}`);
  }
}

/**
 * Loads and validates native v2 entities from data/v2/entities.json (or an
 * injected filePath): every entity must pass the real v2 schema validators,
 * and its id/slug must not collide with an already-mapped v1 entity or with
 * another native entity. Throws on the first problem found, identifying the
 * offending array index and id — never silently drops or skips a record.
 */
export async function loadNativeEntities({
  filePath = getNativeEntitiesFilePath(),
  mappedEntities = [],
} = {}) {
  const parsed = await readJsonFile(filePath, "V2 native entities");
  if (!parsed || !Array.isArray(parsed.entities)) {
    throw new Error(`V2 native entities file at '${filePath}' must be a JSON object with an 'entities' array.`);
  }

  const mappedIds = new Set(mappedEntities.map((entity) => entity.id));
  const mappedSlugs = new Set(mappedEntities.filter((entity) => entity.slug).map((entity) => entity.slug));
  const seenIds = new Set();
  const seenSlugs = new Set();
  const entities = [];

  for (const [index, entity] of parsed.entities.entries()) {
    const result = validateEntity(entity);
    if (!result.valid) {
      throw new Error(
        `V2 native entities[${index}] (id '${entity?.id}') failed v2 schema validation: ${result.error}`,
      );
    }

    if (mappedIds.has(entity.id) || seenIds.has(entity.id)) {
      throw new Error(
        `V2 native entities[${index}]: id '${entity.id}' collides with an existing mapped v1 entity or another `
        + "native entity. Native entity ids must be unique across both sets.",
      );
    }
    seenIds.add(entity.id);

    if (entity.slug) {
      if (mappedSlugs.has(entity.slug) || seenSlugs.has(entity.slug)) {
        throw new Error(
          `V2 native entities[${index}]: slug '${entity.slug}' collides with an existing mapped v1 entity or `
          + "another native entity. Native entity slugs must be unique across both sets.",
        );
      }
      seenSlugs.add(entity.slug);
    }

    entities.push(entity);
  }

  return entities;
}

/**
 * Loads and validates native v2 relationships from
 * data/v2/relationships.json (or an injected filePath): shape validation via
 * validateRelationship(), plus referential integrity against the full merged
 * entity set (mapped + native) passed in as `entities` — sourceId/targetId
 * must reference a known entity, and sourceType/targetType must match that
 * entity's actual entityType. An orphan or type-mismatched relationship is
 * rejected outright, never silently dropped.
 *
 * Relationship edges are recorded exactly as authored: no inverse edge is
 * ever synthesized automatically. A `community --hasBelief--> belief` edge
 * does not imply or create a `belief --practicedBy--> community` edge —
 * both directions must be authored explicitly if both are intended. See
 * V2-ARCHITECTURE.md "Relationship direction".
 */
export async function loadNativeRelationships({
  filePath = getNativeRelationshipsFilePath(),
  entities = [],
} = {}) {
  const parsed = await readJsonFile(filePath, "V2 native relationships");
  if (!parsed || !Array.isArray(parsed.relationships)) {
    throw new Error(
      `V2 native relationships file at '${filePath}' must be a JSON object with a 'relationships' array.`,
    );
  }

  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const seenIds = new Set();
  const relationships = [];

  for (const [index, relationship] of parsed.relationships.entries()) {
    const result = validateRelationship(relationship);
    if (!result.valid) {
      throw new Error(
        `V2 native relationships[${index}] (id '${relationship?.id}') failed validation: ${result.error}`,
      );
    }

    if (seenIds.has(relationship.id)) {
      throw new Error(`V2 native relationships[${index}]: duplicate relationship id '${relationship.id}'.`);
    }
    seenIds.add(relationship.id);

    const source = entityById.get(relationship.sourceId);
    if (!source) {
      throw new Error(
        `V2 native relationships[${index}] (id '${relationship.id}'): sourceId '${relationship.sourceId}' does `
        + "not reference any known entity (mapped or native). Orphan relationships are rejected, not dropped.",
      );
    }
    if (source.entityType !== relationship.sourceType) {
      throw new Error(
        `V2 native relationships[${index}] (id '${relationship.id}'): sourceType '${relationship.sourceType}' `
        + `does not match the actual entityType '${source.entityType}' of entity '${relationship.sourceId}'.`,
      );
    }

    const target = entityById.get(relationship.targetId);
    if (!target) {
      throw new Error(
        `V2 native relationships[${index}] (id '${relationship.id}'): targetId '${relationship.targetId}' does `
        + "not reference any known entity (mapped or native). Orphan relationships are rejected, not dropped.",
      );
    }
    if (target.entityType !== relationship.targetType) {
      throw new Error(
        `V2 native relationships[${index}] (id '${relationship.id}'): targetType '${relationship.targetType}' `
        + `does not match the actual entityType '${target.entityType}' of entity '${relationship.targetId}'.`,
      );
    }

    relationships.push(relationship);
  }

  return relationships;
}
