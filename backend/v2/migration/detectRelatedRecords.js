// Heuristic-only "same physical site / same subject, different category"
// detector for the dry-run report. This never merges or drops records — it
// only adds a POTENTIAL_DUPLICATE_OR_RELATED_ENTITY warning for a human to
// review. See V2-ARCHITECTURE.md "No automatic deduplication" for the
// documented tradeoff: this is a slug-token overlap heuristic, not an
// exhaustive semantic match, and is expected to miss thematically related
// records that don't share a distinctive slug token.

const STOPWORDS = new Set([
  "ve", "ile", "antakya", "antik", "tarihi", "eski", "kadim", "el", "in", "of", "the", "and", "a", "an",
]);

function significantSlugTokens(slug) {
  if (typeof slug !== "string") return [];
  return slug
    .toLowerCase()
    .split("-")
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

/**
 * @param {Array<{ entity: object }>} mappedRecords - objects carrying a
 *   mapped v2 `entity` (as produced by v1ToV2Mapping.js), each with
 *   `slug`, `sourceCategory`, `sourceRecordId`, and `entityType`.
 */
export function detectPotentialDuplicates(mappedRecords) {
  const warnings = [];

  for (let i = 0; i < mappedRecords.length; i += 1) {
    for (let j = i + 1; j < mappedRecords.length; j += 1) {
      const a = mappedRecords[i].entity;
      const b = mappedRecords[j].entity;

      // Only cross-category overlaps are interesting here: the same site or
      // subject appearing under two different v1 categories (e.g. structures
      // vs. beliefs vs. gallery), which is the scenario this migration must
      // not silently merge.
      if (a.sourceCategory === b.sourceCategory) continue;

      const tokensA = new Set(significantSlugTokens(a.slug));
      const tokensB = significantSlugTokens(b.slug);
      const sharedTokens = [...new Set(tokensB.filter((token) => tokensA.has(token)))];
      if (!sharedTokens.length) continue;

      const involvesMedia = a.entityType === "media" || b.entityType === "media";
      warnings.push({
        type: "POTENTIAL_DUPLICATE_OR_RELATED_ENTITY",
        // A suggestion only, for future editorial relationship authoring —
        // no relationship record is created here.
        suggestedRelationshipType: involvesMedia ? "depicts" : "associatedWith",
        recordA: {
          id: a.sourceRecordId, slug: a.slug, sourceCategory: a.sourceCategory, entityType: a.entityType,
        },
        recordB: {
          id: b.sourceRecordId, slug: b.slug, sourceCategory: b.sourceCategory, entityType: b.entityType,
        },
        sharedTokens,
      });
    }
  }

  return warnings;
}
