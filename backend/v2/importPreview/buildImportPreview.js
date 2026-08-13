// Orchestrates the full v2 cultural-dataset import preview:
//   1. Maps the real data/archive.json (23 v1 records) — the collision
//      baseline. Never writes it.
//   2. Reads and parses the six research-input/*.txt files. Never writes
//      them; never invented if missing (see main() in the CLI script).
//   3. Normalizes every research record via normalizeResearch.js.
//   4. Validates every normalized entity/relationship with the REAL v2
//      schema validators (backend/v2/schemas) — the same ones the live
//      LocalMappedV2Store uses — and checks id/slug collisions against the
//      mapped v1 set and referential integrity for relationships.
//   5. Anything that fails validation, collides, or can't be safely
//      represented is EXCLUDED with a reported reason — never silently
//      dropped, never force-included as invalid data. The resulting
//      preview therefore always has zero invalid entities/relationships in
//      the "included" sets by construction.
//
// Pure and read-only: this module never writes data/v2/*.json,
// data/archive.json, Firestore, or Cloud Storage. The CLI wrapper
// (backend/scripts/build-v2-import-preview.js) is the only thing that
// writes files, and only under tmp/v2-import-preview/.

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { assertValidArchive } from "../../dataModel.js";
import { mapAndValidateArchive } from "../stores/localMappedV2Store.js";
import { validateEntity } from "../schemas/index.js";
import { validateRelationship } from "../schemas/relationship.js";
import { loadLegacyReplacements } from "../localData/legacyReplacements.js";
import {
  parsePart1, parsePart2, parsePart3, parsePart4, parsePart5, parseRegistryRecovery,
} from "./researchParser.js";
import {
  normalizeEntity, normalizeSource, normalizeMedia, normalizeRelationship,
  applyPublicationStatusPolicy, IDENTITY_RESOLVED_SOURCE_IDS,
} from "./normalizeResearch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RESEARCH_FILES = Object.freeze({
  part1: "antiochiaarchive_master_dataset_part1.txt",
  part2: "antiochiaarchive_master_dataset_part2.txt",
  part3: "antiochiaarchive_master_dataset_part3.txt",
  part4: "antiochiaarchive_master_dataset_part4_regenerated.txt",
  part5: "antiochiaarchive_master_dataset_part5_regenerated.txt",
  registryRecovery: "registry_recovery.txt",
});

async function readV1Archive() {
  const archivePath = path.resolve(__dirname, "../../../data/archive.json");
  const raw = await fs.readFile(archivePath, "utf-8");
  return assertValidArchive(JSON.parse(raw));
}

async function readResearchFiles(researchDir) {
  const entries = Object.entries(RESEARCH_FILES);
  const missing = [];
  const contents = {};
  for (const [key, filename] of entries) {
    const filePath = path.join(researchDir, filename);
    // eslint-disable-next-line no-await-in-loop
    contents[key] = await fs.readFile(filePath, "utf-8").catch((error) => {
      if (error.code === "ENOENT") { missing.push(filename); return null; }
      throw error;
    });
  }
  if (missing.length) {
    throw new Error(
      `Missing research input file(s) in '${researchDir}': ${missing.join(", ")}. `
      + "This preview requires all six canonical research files; refusing to fabricate missing input.",
    );
  }
  return contents;
}

/** Merges K. SOURCES with registry_recovery's identity-restored and context-only supplements, keyed by sourceId. */
function mergeSourceRecords(part4Sources, registryRecovery) {
  const byId = new Map();
  for (const source of part4Sources) byId.set(source.sourceId, { ...source });
  for (const restored of registryRecovery.restoredSources) {
    byId.set(restored.sourceId, { ...byId.get(restored.sourceId), ...restored });
  }
  for (const [sourceId, context] of Object.entries(registryRecovery.recoveredContextSources)) {
    if (!context || typeof context !== "object") continue;
    const existing = byId.get(sourceId) || { sourceId };
    byId.set(sourceId, {
      ...existing,
      recoveredContext: context.recoveredContext,
      supportsEntityIds: context.supportsEntityIds,
    });
  }
  return [...byId.values()];
}

/** Merges J. MEDIA ASSETS with registry_recovery's extra provenance for the subset it covers, keyed by mediaId. */
function mergeMediaRecords(part4Media, registryRecovery) {
  const byId = new Map();
  for (const media of part4Media) byId.set(media.mediaId, { ...media });
  for (const extra of registryRecovery.restoredMediaExtra) {
    byId.set(extra.mediaId, { ...byId.get(extra.mediaId), ...extra });
  }
  return [...byId.values()];
}

/** Applies the registry_recovery relationship-0049 evidenceSourceIds correction. */
function applyRelationshipCorrections(relationships, corrections) {
  if (!corrections.length) return relationships;
  const byId = new Map(corrections.map((correction) => [correction.relationshipId, correction]));
  return relationships.map((relationship) => {
    const correction = byId.get(relationship.relationshipId);
    return correction ? { ...relationship, evidenceSourceIds: correction.evidenceSourceIds } : relationship;
  });
}

function batchCollisionDetail(kind, value, batchSet) {
  if (batchSet.has(value)) return `${kind} '${value}' collides with another record already included from this research batch.`;
  return null;
}

export async function buildImportPreview({ researchDir, loadReplacements = loadLegacyReplacements }) {
  const archive = await readV1Archive();
  const mappedEntities = mapAndValidateArchive(archive);
  const mappedIds = new Set(mappedEntities.map((entity) => entity.id));
  const mappedSlugToId = new Map(mappedEntities.filter((entity) => entity.slug).map((entity) => [entity.slug, entity.id]));

  // Confirmed, human-reviewed legacy replacement mappings (see
  // ../localData/legacyReplacements.js and V2-ARCHITECTURE.md "Legacy
  // replacement layer"). A research candidate whose id/slug collides with a
  // mapped v1 entity is excluded UNLESS an explicit reviewed entry names
  // that exact mapped entity as superseded by this exact candidate —
  // semantic replacement is never inferred from title/name similarity, only
  // from this reviewed map. This preview never itself suppresses a mapped
  // v1 entity (it doesn't include the 23 mapped entities in its output at
  // all) — the map is used here only to decide whether a *research*
  // candidate's collision with the mapped baseline is expected, so the
  // preview accurately reflects what the real LocalMappedV2Store merge will
  // eventually produce once these candidates and this same map are promoted.
  const replacements = await loadReplacements({ mappedEntities });
  const replacementsByLegacyId = new Map(replacements.map((entry) => [entry.legacyMappedEntityId, entry.canonicalNativeEntityId]));
  const replacementsByCanonicalId = new Map();
  for (const entry of replacements) {
    const list = replacementsByCanonicalId.get(entry.canonicalNativeEntityId) || [];
    list.push(entry.legacyMappedEntityId);
    replacementsByCanonicalId.set(entry.canonicalNativeEntityId, list);
  }

  const files = await readResearchFiles(researchDir);
  const p1 = parsePart1(files.part1);
  const p2 = parsePart2(files.part2);
  const p3 = parsePart3(files.part3);
  const p4 = parsePart4(files.part4);
  const p5 = parsePart5(files.part5);
  const registryRecovery = parseRegistryRecovery(files.registryRecovery);

  const inputEntityRecords = [
    ...p1.historicalContext, ...p1.community, ...p1.belief,
    ...p2.place, ...p2.structure,
    ...p3.story, ...p3.music,
  ];
  const sourceRecords = mergeSourceRecords(p4.sources, registryRecovery);
  const mediaRecords = mergeMediaRecords(p4.media, registryRecovery);
  const relationshipRecords = applyRelationshipCorrections(p4.relationships, registryRecovery.relationshipCorrections);

  // --- Entities: normalize, apply publication-status policy, check
  // collisions, validate with the real schemas. Anything that fails any
  // step is excluded (never force-included, never silently dropped without
  // a reason recorded).
  const includedEntities = [];
  const excludedEntities = [];
  const schemaChangeRequired = [];
  const seenIds = new Set();
  const seenSlugs = new Set();
  const resolvedSourceIdSet = new Set(IDENTITY_RESOLVED_SOURCE_IDS);
  const legacyReplacementsApplied = [];

  for (const record of inputEntityRecords) {
    let normalized;
    try {
      normalized = normalizeEntity(record);
    } catch (error) {
      excludedEntities.push({
        id: record.id, entityType: record.entityType, reason: "normalizationError", detail: error.message,
      });
      continue;
    }

    const statusPolicy = applyPublicationStatusPolicy(record, resolvedSourceIdSet);
    normalized.status = statusPolicy.status;

    // Batch-internal collisions (two research candidates in the same batch
    // sharing an id/slug) always hard-fail — the legacy replacement map only
    // ever concerns the mapped v1 baseline, never candidates against each
    // other.
    const idBatchCollision = batchCollisionDetail("id", normalized.id, seenIds);
    if (idBatchCollision) {
      excludedEntities.push({ id: normalized.id, entityType: normalized.entityType, reason: "idCollision", detail: idBatchCollision });
      continue;
    }
    const slugBatchCollision = normalized.slug ? batchCollisionDetail("slug", normalized.slug, seenSlugs) : null;
    if (slugBatchCollision) {
      excludedEntities.push({ id: normalized.id, entityType: normalized.entityType, reason: "slugCollision", detail: slugBatchCollision });
      continue;
    }

    // Mapped-v1 collisions: excluded UNLESS a confirmed, reviewed
    // legacyReplacements entry names the exact colliding mapped entity as
    // superseded by this exact candidate.
    const collidingMappedIdByEntityId = mappedIds.has(normalized.id) ? normalized.id : null;
    const collidingMappedIdBySlug = normalized.slug ? mappedSlugToId.get(normalized.slug) : null;
    const collidingMappedId = collidingMappedIdByEntityId || collidingMappedIdBySlug;

    if (collidingMappedId) {
      const confirmedTarget = replacementsByLegacyId.get(collidingMappedId);
      if (confirmedTarget !== normalized.id) {
        const reason = collidingMappedIdByEntityId ? "idCollision" : "slugCollision";
        const matchedOn = collidingMappedIdByEntityId ? `id '${normalized.id}'` : `slug '${normalized.slug}'`;
        excludedEntities.push({
          id: normalized.id,
          entityType: normalized.entityType,
          reason,
          detail: `${matchedOn} collides with mapped v1 entity '${collidingMappedId}', and no confirmed `
            + "legacyReplacements.json entry names it as superseded by this candidate.",
        });
        continue;
      }
    }

    const validation = validateEntity(normalized);
    if (!validation.valid) {
      excludedEntities.push({ id: normalized.id, entityType: normalized.entityType, reason: "schemaInvalid", detail: validation.error });
      continue;
    }

    seenIds.add(normalized.id);
    if (normalized.slug) seenSlugs.add(normalized.slug);

    // Attach legacy-replacement provenance whenever this candidate is a
    // confirmed canonicalNativeEntityId target — whether or not a raw id/
    // slug collision was what surfaced it (structure-0020 vs legacy st4 has
    // no slug/id collision at all, yet is still a confirmed replacement).
    const supersedesLegacyIds = replacementsByCanonicalId.get(normalized.id) || null;
    if (supersedesLegacyIds) {
      legacyReplacementsApplied.push({ canonicalId: normalized.id, supersedesLegacyIds, resolvedViaCollision: Boolean(collidingMappedId) });
    }

    includedEntities.push({
      entity: normalized,
      sourceRecordId: record.id,
      statusDowngraded: statusPolicy.downgraded,
      downgradeReason: statusPolicy.reason,
      legacyReplacement: supersedesLegacyIds ? { supersedesLegacyIds } : undefined,
    });
  }

  // --- Sources -------------------------------------------------------------
  const includedSources = [];
  const excludedSources = [];
  const seenSourceIds = new Set();
  for (const record of sourceRecords) {
    let normalized;
    try {
      normalized = normalizeSource(record);
    } catch (error) {
      excludedSources.push({ id: record.sourceId, reason: "normalizationError", detail: error.message });
      continue;
    }
    if (seenSourceIds.has(normalized.id) || mappedIds.has(normalized.id)) {
      excludedSources.push({ id: normalized.id, reason: "idCollision", detail: `source id '${normalized.id}' is duplicated.` });
      continue;
    }
    const validation = validateEntity(normalized);
    if (!validation.valid) {
      excludedSources.push({ id: normalized.id, reason: "schemaInvalid", detail: validation.error });
      continue;
    }
    seenSourceIds.add(normalized.id);
    includedSources.push(normalized);
  }

  // --- Media -----------------------------------------------------------------
  const includedMedia = [];
  const excludedMedia = [];
  const seenMediaIds = new Set();
  for (const record of mediaRecords) {
    let normalized;
    try {
      normalized = normalizeMedia(record);
    } catch (error) {
      excludedMedia.push({ id: record.mediaId, reason: "normalizationError", detail: error.message });
      continue;
    }
    if (seenMediaIds.has(normalized.id) || mappedIds.has(normalized.id)) {
      excludedMedia.push({ id: normalized.id, reason: "idCollision", detail: `media id '${normalized.id}' is duplicated.` });
      continue;
    }
    const validation = validateEntity(normalized);
    if (!validation.valid) {
      excludedMedia.push({ id: normalized.id, reason: "schemaInvalid", detail: validation.error });
      continue;
    }
    seenMediaIds.add(normalized.id);
    includedMedia.push(normalized);
  }

  // --- Relationships: shape validation + referential integrity against the
  // full resolvable pool (mapped v1 entities + every included native
  // entity/media/source from this batch). A relationship whose source or
  // target was itself excluded is excluded too, with that cascade recorded.
  const resolvablePool = new Map();
  for (const entity of mappedEntities) resolvablePool.set(entity.id, entity.entityType);
  for (const { entity } of includedEntities) resolvablePool.set(entity.id, entity.entityType);
  for (const media of includedMedia) resolvablePool.set(media.id, media.entityType);
  for (const source of includedSources) resolvablePool.set(source.id, source.entityType);

  const includedRelationships = [];
  const excludedRelationships = [];
  const seenRelationshipIds = new Set();

  for (const record of relationshipRecords) {
    let normalized;
    try {
      normalized = normalizeRelationship(record);
    } catch (error) {
      excludedRelationships.push({ id: record.relationshipId, reason: "normalizationError", detail: error.message });
      continue;
    }

    if (seenRelationshipIds.has(normalized.id)) {
      excludedRelationships.push({ id: normalized.id, reason: "idCollision", detail: `relationship id '${normalized.id}' is duplicated.` });
      continue;
    }

    const shapeResult = validateRelationship(normalized);
    if (!shapeResult.valid) {
      excludedRelationships.push({ id: normalized.id, reason: "schemaInvalid", detail: shapeResult.error });
      continue;
    }

    const sourceActualType = resolvablePool.get(normalized.sourceId);
    if (!sourceActualType) {
      excludedRelationships.push({
        id: normalized.id,
        reason: "orphanSource",
        detail: `sourceId '${normalized.sourceId}' does not resolve to any mapped or included research entity (likely excluded upstream — e.g. a collision).`,
      });
      continue;
    }
    if (sourceActualType !== normalized.sourceType) {
      excludedRelationships.push({
        id: normalized.id,
        reason: "sourceTypeMismatch",
        detail: `declared sourceType '${normalized.sourceType}' does not match actual entityType '${sourceActualType}' of '${normalized.sourceId}'.`,
      });
      continue;
    }

    const targetActualType = resolvablePool.get(normalized.targetId);
    if (!targetActualType) {
      excludedRelationships.push({
        id: normalized.id,
        reason: "orphanTarget",
        detail: `targetId '${normalized.targetId}' does not resolve to any mapped or included research entity (likely excluded upstream — e.g. a collision).`,
      });
      continue;
    }
    if (targetActualType !== normalized.targetType) {
      excludedRelationships.push({
        id: normalized.id,
        reason: "targetTypeMismatch",
        detail: `declared targetType '${normalized.targetType}' does not match actual entityType '${targetActualType}' of '${normalized.targetId}'.`,
      });
      continue;
    }

    seenRelationshipIds.add(normalized.id);
    includedRelationships.push(normalized);
  }

  const report = buildReport({
    inputEntityRecords, sourceRecords, mediaRecords, relationshipRecords,
    includedEntities, excludedEntities, schemaChangeRequired,
    includedSources, excludedSources,
    includedMedia, excludedMedia,
    includedRelationships, excludedRelationships,
    p1, p2, p3, registryRecovery,
    replacements, legacyReplacementsApplied,
  });

  return {
    entities: includedEntities.map((item) => item.entity),
    relationships: includedRelationships,
    sources: includedSources,
    media: includedMedia,
    report,
  };
}

function countByEntityType(entities) {
  const counts = {};
  for (const entity of entities) counts[entity.entityType] = (counts[entity.entityType] || 0) + 1;
  return counts;
}

/**
 * Distinct sourceIds actually referenced by cultural entities' own
 * `sourceIds` arrays (PART 1/2/3), as opposed to the count of source
 * *records* recovered in the registry (PART 4 K. SOURCES + registry_recovery
 * supplements) — two different measurements that must never be conflated
 * (see V2-ARCHITECTURE.md "Cultural dataset import preview" /
 * "Source reference count audit").
 */
function computeDistinctReferencedSourceIds(entityRecords) {
  const ids = new Set();
  for (const record of entityRecords) {
    for (const sourceId of record.sourceIds || []) ids.add(sourceId);
  }
  return ids;
}

function buildReport(ctx) {
  const {
    inputEntityRecords, sourceRecords, mediaRecords, relationshipRecords,
    includedEntities, excludedEntities, schemaChangeRequired,
    includedSources, excludedSources,
    includedMedia, excludedMedia,
    includedRelationships, excludedRelationships,
    p1, p2, p3, registryRecovery,
    replacements, legacyReplacementsApplied,
  } = ctx;

  const includedByType = countByEntityType(includedEntities.map((item) => item.entity));
  const storyEntities = includedEntities.filter((item) => item.entity.entityType === "story");
  const publicStoryCandidates = storyEntities.filter((item) => item.entity.status === "published" || item.entity.status === "inReview")
    .filter((item) => item.entity.storyRecordType !== "oralHistoryLead");
  const oralHistoryLeads = storyEntities.filter((item) => item.entity.storyRecordType === "oralHistoryLead");

  const statusDowngrades = includedEntities.filter((item) => item.statusDowngraded);

  const byId = new Map(includedEntities.map((item) => [item.entity.id, item.entity]));
  const heritageEnsembles = includedEntities
    .filter((item) => item.entity.entityType === "structure" && item.entity.structureType === "heritageEnsemble")
    .map((item) => item.entity.id);
  const historicalPopulationGroups = includedEntities
    .filter((item) => item.entity.entityType === "community" && (item.entity.tags || []).includes("historicalPopulationGroup"))
    .map((item) => item.entity.id);

  const specialCases = {
    note: "Recommendations only — no broad schema change was made in this pass; see V2-ARCHITECTURE.md "
      + "'Import preview workflow' for the full rationale of each.",
    crossTraditionPractice: {
      ids: ["belief-0010"],
      included: byId.has("belief-0010"),
      observation: "belief-0010 (Local Sacred Visitation Traditions of Hatay) is modeled as entityType "
        + "'belief' but its own editorialNotes self-label it 'beliefType: crossTraditionPractice' — a "
        + "shared visitation practice across multiple communities, not a single organized religion. It "
        + "validates and is included as-is (status inReview, non-public); the distinction doesn't block "
        + "safe import today because no schema field claims otherwise.",
      recommendation: "Consider an optional `beliefType` classifier (e.g. 'organizedReligion' vs "
        + "'crossTraditionPractice') on the belief schema in a future task, if this distinction becomes "
        + "editorially load-bearing. Not implemented here.",
    },
    historicalPopulationGroups: {
      ids: ["comm-0016", "comm-0017"],
      includedIds: historicalPopulationGroups,
      observation: "comm-0016/comm-0017 represent Hellenistic and Roman/Byzantine-era population contexts, "
        + "not modern communities. The research itself already expresses this via the existing free-form "
        + "`tags` field ('historicalPopulationGroup') rather than a new field — no schema change needed; "
        + "tags already pass through as a supported base-entity field.",
      recommendation: "No schema change recommended. If a first-class distinction is wanted later, "
        + "consider a controlled `communityKind` enum (e.g. 'livingCommunity' vs 'historicalPopulationGroup') "
        + "rather than relying on a free-form tag.",
    },
    heritageEnsembles: {
      ids: heritageEnsembles,
      observation: `${heritageEnsembles.length} structure(s) already use structureType 'heritageEnsemble' `
        + "(a free-form string the schema already accepts without change).",
      recommendation: "No schema change needed — structureType is intentionally free-form.",
    },
    romanMosaicsArtifactType: {
      observation: "The research's own O. UNRESOLVED QUESTIONS (unresolved-group-0013) flags that "
        + "individual portable/mosaic-level cultural objects fit an artifact/culturalObject entity type "
        + "better than 'structure'. No dedicated mosaic artifact record exists in this research batch — "
        + "structure-0027 (Daphne/Harbiye archaeological ensemble) is the closest related record and is "
        + "included as a normal structure.",
      recommendation: "Introduce an `artifact`/`culturalObject` entity type in a future schema task if "
        + "individual portable cultural objects (e.g. specific mosaic panels) need their own entity "
        + "representation. Not implemented here — no broad schema change was made.",
    },
  };

  const distinctReferencedSourceIds = computeDistinctReferencedSourceIds(inputEntityRecords);
  const identityResolved = new Set(IDENTITY_RESOLVED_SOURCE_IDS);
  const contextOnlySourceCount = sourceRecords.filter(
    (record) => record.recoveredContext != null && !identityResolved.has(record.sourceId),
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    inputCounts: {
      historicalContext: p1.historicalContext.length,
      community: p1.community.length,
      belief: p1.belief.length,
      place: p2.place.length,
      structure: p2.structure.length,
      story: p3.story.length,
      music: p3.music.length,
      proverb: 0,
      totalCulturalEntities: inputEntityRecords.length,
      // Count of K. SOURCES + registry_recovery source *records*, NOT the
      // count of distinct sourceIds referenced by cultural entities — see
      // `sourceReferenceAudit` below, which must not be conflated with this.
      sourceRegistryRecords: sourceRecords.length,
      media: mediaRecords.length,
      relationships: relationshipRecords.length,
    },
    normalizedCounts: {
      byEntityType: includedByType,
      totalEntities: includedEntities.length,
      sourceRegistryRecords: includedSources.length,
      media: includedMedia.length,
      relationships: includedRelationships.length,
    },
    excludedCounts: {
      entities: excludedEntities.length,
      sourceRegistryRecords: excludedSources.length,
      media: excludedMedia.length,
      relationships: excludedRelationships.length,
    },
    // A precise breakdown so "distinct sourceIds referenced by cultural
    // entities" (A) is never conflated with "source records represented in
    // the recovered registry" (B) — a real terminology bug in an earlier
    // report of this pipeline's output conflated the two.
    sourceReferenceAudit: {
      distinctSourceIdsReferencedByCulturalEntities: distinctReferencedSourceIds.size,
      sourceRegistryRecordsRepresented: sourceRecords.length,
      identityLevelRestoredSources: IDENTITY_RESOLVED_SOURCE_IDS.length,
      contextOnlySources: contextOnlySourceCount,
      bibliographicallyUnresolvedReferencedSourceIds: registryRecovery.unresolvedSourceIds.length,
      unrecoverableLegacySourceRecords: registryRecovery.unrecoverableRegistryRecordCount,
      note: "'distinctSourceIdsReferencedByCulturalEntities' (A) is computed by scanning every PART 1/2/3 "
        + "cultural entity's own sourceIds array and counting distinct values — it is NOT the same "
        + "measurement as 'sourceRegistryRecordsRepresented' (B), the count of source records recovered in "
        + "K. SOURCES + registry_recovery.txt. A and B must never be conflated or used interchangeably.",
    },
    excludedEntities,
    excludedSources,
    excludedMedia,
    excludedRelationships,
    schemaChangeRequired,
    publicationStatus: {
      policy: "Research status:published is never copied blindly. It is kept only when every "
        + "sourceId cited by the entity is one of the identity-level-restored sources "
        + `(${IDENTITY_RESOLVED_SOURCE_IDS.join(", ")}); otherwise it is downgraded to inReview. `
        + "draft/inReview/archived from the research are never upgraded. storyRecordType "
        + "'ORAL_HISTORY_LEAD' always forces status 'draft', independent of the research's own status.",
      downgradedCount: statusDowngrades.length,
      downgraded: statusDowngrades.map((item) => ({
        id: item.entity.id, entityType: item.entity.entityType, reason: item.downgradeReason,
      })),
    },
    storyClassification: {
      publicStoryCandidateCount: publicStoryCandidates.length,
      publicStoryCandidateIds: publicStoryCandidates.map((item) => item.entity.id),
      oralHistoryLeadCount: oralHistoryLeads.length,
      oralHistoryLeadIds: oralHistoryLeads.map((item) => item.entity.id),
      note: "publicStoryCandidate means status is not 'draft' and storyRecordType is not "
        + "'oralHistoryLead' — it does not mean already public: nothing in this preview has "
        + "status 'published' unless its full source citation was identity-resolved.",
    },
    // Confirmed legacyReplacements.json entries this preview resolved a
    // mapped-v1 collision through (or, for entries with no raw id/slug
    // collision at all — e.g. structure-0020 vs legacy st4 — simply
    // annotated). This preview never itself suppresses the mapped v1
    // entity: it doesn't include the 23 mapped v1 records in its output to
    // begin with. Suppression only happens for real, at LocalMappedV2Store
    // startup, once the named canonicalNativeEntityId is actually promoted
    // into data/v2/entities.json — see V2-ARCHITECTURE.md "Legacy
    // replacement layer".
    legacyReplacementAudit: {
      confirmedReplacementsInMap: replacements.length,
      appliedInThisBatch: legacyReplacementsApplied,
      notPresentInThisBatch: replacements
        .filter((entry) => !legacyReplacementsApplied.some((applied) => applied.canonicalId === entry.canonicalNativeEntityId))
        .map((entry) => ({ legacyMappedEntityId: entry.legacyMappedEntityId, canonicalNativeEntityId: entry.canonicalNativeEntityId })),
      note: "'appliedInThisBatch' entries are candidates from this research batch that a confirmed "
        + "legacyReplacements.json entry named as the canonical replacement for a mapped v1 entity — "
        + "'resolvedViaCollision: true' means the candidate's id/slug actually collided with the mapped "
        + "entity and the replacement map is what let it be included instead of excluded; "
        + "'resolvedViaCollision: false' means there was no raw collision at all (e.g. structure-0020 vs "
        + "legacy st4, whose slugs differ entirely) and the entry is purely informational here.",
    },
    specialCases,
  };
}
