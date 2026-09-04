// Safe automatic ID recommendation ("no-code CMS UX" round, Part A). A
// non-technical Admin must never need to invent or understand a canonical
// entity ID — this service is the single source of truth for "what is the
// next safe id for this entity type", used both by the standalone
// suggestion endpoint (GET /api/admin/content/next-id) and, authoritatively,
// by contentService.js's createEntity() itself (which never trusts a
// client-supplied suggestion — see that module's own id-collision handling).
//
// ENTITY_ID_PREFIXES below was derived by inspecting the REAL committed
// canonical dataset (data/v2/entities.json), not assumed:
//   historicalContext -> "hist-0001".."hist-0021"   (abbreviated prefix)
//   community         -> "comm-0001".."comm-0017"   (abbreviated prefix)
//   belief            -> "belief-0001".."belief-0012"
//   place             -> "place-0001".."place-0128"
//   structure         -> "structure-0001".."structure-0028"
//   story             -> "story-0001".."story-0047"
//   music             -> "music-0001".."music-0015"
// proverb/source have zero real records yet (see V2-ARCHITECTURE.md "no
// production migration yet" / this round's own audit) — their prefix
// follows the same "full type name" convention as belief/place/structure/
// story/music (the majority pattern), which also already matches the
// existing (pre-this-round) admin-panel.js placeholder text
// ("ör. source-XXXX"). media and page are deliberately NOT here: media ids
// are already generated automatically at upload time
// (media/mediaUploadService.js's newMediaId(), timestamp-based — no admin
// ever types one), and page ids are already generated automatically by
// admin/pageService.js's newPageId() — both problems this round is meant
// to solve are already solved for those two types.
export const ENTITY_ID_PREFIXES = Object.freeze({
  historicalContext: "hist",
  community: "comm",
  belief: "belief",
  place: "place",
  structure: "structure",
  story: "story",
  music: "music",
  proverb: "proverb",
  source: "source",
});

const SUFFIX_WIDTH = 4;

export function hasIdConvention(entityType) {
  return Object.hasOwn(ENTITY_ID_PREFIXES, entityType);
}

function extractSuffix(id, prefix) {
  if (typeof id !== "string") return null;
  // Anchored both ends and requires digits-only, so "structure-0001-old",
  // "structure-abc", or a completely unrelated id (malformed/foreign data)
  // is safely ignored rather than corrupting the max-suffix computation —
  // Section 21's "malformed IDs ignored safely".
  const match = new RegExp(`^${prefix}-(\\d+)$`).exec(id);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * The actual recommendation algorithm (Section 2): union of every id this
 * entityType has EVER carried — current rows (any status: published,
 * draft, inReview, archived all count, since allEntitiesRaw() returns every
 * row unfiltered) plus every id a permanent delete audit entry recorded for
 * (surviving the row's own deletion) — extract valid numeric suffixes,
 * take the max, recommend max + 1. A gap (e.g. ...0002, 0004) is never
 * backfilled with 0003; once max has advanced, it never goes back down.
 */
export function computeNextEntityId(entityType, { allEntitiesRaw, listAuditTargetIds }) {
  const prefix = ENTITY_ID_PREFIXES[entityType];
  if (!prefix) {
    throw new Error(`No id convention is configured for entityType '${entityType}'.`);
  }

  const currentIds = allEntitiesRaw().filter((e) => e.entityType === entityType).map((e) => e.id);
  const everDeletedIds = listAuditTargetIds({ targetType: "entity", action: "delete" });

  let max = 0;
  for (const id of [...currentIds, ...everDeletedIds]) {
    const suffix = extractSuffix(id, prefix);
    if (suffix !== null && suffix > max) max = suffix;
  }

  return `${prefix}-${String(max + 1).padStart(SUFFIX_WIDTH, "0")}`;
}
