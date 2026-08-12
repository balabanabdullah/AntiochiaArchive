// Builds the full dry-run report: maps every v1 record, validates every
// mapped entity against the real v2 schemas, and flags potential
// duplicate/related records for editorial review. Pure and read-only — it
// never writes anywhere and never contacts Firestore or Cloud Storage.

import { ARCHIVE_CATEGORIES } from "../../dataModel.js";
import { mapV1ArchiveToV2Entities } from "./v1ToV2Mapping.js";
import { detectPotentialDuplicates } from "./detectRelatedRecords.js";
import { validateEntity } from "../schemas/index.js";

function countInputRecords(archive) {
  return ARCHIVE_CATEGORIES.reduce(
    (total, category) => total + (Array.isArray(archive[category]) ? archive[category].length : 0),
    0,
  );
}

export function buildMigrationReport(archive) {
  const inputCount = countInputRecords(archive);
  const mapped = mapV1ArchiveToV2Entities(archive);

  const validations = mapped.map(({ record, entity, targetType }) => {
    const result = validateEntity(entity);
    return {
      record, entity, targetType, valid: result.valid, error: result.valid ? null : result.error,
    };
  });

  const invalid = validations.filter((item) => !item.valid);

  const mappedByEntityType = {};
  const categoryToTargetType = {};
  for (const item of validations) {
    mappedByEntityType[item.entity.entityType] = (mappedByEntityType[item.entity.entityType] || 0) + 1;
    categoryToTargetType[item.entity.sourceCategory] = item.entity.entityType;
  }

  const ids = validations.map((item) => item.entity.id);
  const slugs = validations.map((item) => item.entity.slug);
  const uniqueIds = new Set(ids);
  const uniqueSlugs = new Set(slugs);

  const isRealMediaRecord = (entity) => (
    entity.entityType === "media"
      ? entity.derivativeStoragePaths?.length > 0
      : entity.media?.[0]?.isPlaceholder === false
  );
  const isPlaceholderRecord = (entity) => !isRealMediaRecord(entity);
  const hasImageMetadata = (entity) => (
    entity.entityType === "media"
      ? Boolean(entity.source || entity.author || entity.license)
      : Boolean(entity.media?.[0]?.source || entity.media?.[0]?.author || entity.media?.[0]?.license)
  );

  const withRealMedia = validations.filter((item) => isRealMediaRecord(item.entity));
  const withPlaceholders = validations.filter((item) => isPlaceholderRecord(item.entity));
  const withImageMetadata = validations.filter((item) => hasImageMetadata(item.entity));
  const withSources = validations.filter((item) => Array.isArray(item.entity.sources) && item.entity.sources.length);

  const potentialDuplicates = detectPotentialDuplicates(validations.map((item) => ({ entity: item.entity })));

  return {
    inputCount,
    mappedCount: validations.length,
    mappedByEntityType,
    categoryToTargetType,
    validation: {
      allValid: invalid.length === 0,
      invalidCount: invalid.length,
      invalidRecords: invalid.map((item) => ({
        id: item.record.id,
        sourceCategory: item.entity.sourceCategory,
        error: item.error,
      })),
    },
    idIntegrity: {
      uniqueIdCount: uniqueIds.size,
      duplicateIds: ids.length - uniqueIds.size,
      uniqueSlugCount: uniqueSlugs.size,
      duplicateSlugs: slugs.length - uniqueSlugs.size,
    },
    mediaPreservation: {
      recordsWithRealMedia: withRealMedia.length,
      recordsWithPlaceholders: withPlaceholders.length,
      recordsWithImageMetadata: withImageMetadata.length,
    },
    sourcesPreservation: {
      recordsWithSources: withSources.length,
    },
    potentialDuplicates,
    entities: validations.map((item) => item.entity),
  };
}
