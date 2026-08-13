// Shared publication-visibility rules for the v2 domain. Extracted out of
// v2Routes.js so both the live Express route layer and the static-site
// release generator (scripts/v2-archive-release.js, which never runs the
// Express app) apply the exact same fail-closed gating — a status change
// here is the only place that logic can drift.

// The only entity/relationship `status` value ever returned by a public
// endpoint. draft/inReview/archived (and a missing status) are treated as
// not-yet-public — fail-closed by default, so a newly authored native
// editorial record must be explicitly marked "published" before it can ever
// reach a public response. See V2-ARCHITECTURE.md "Publication visibility".
const PUBLIC_STATUS = "published";

// `media` and `source` entities do not carry a PUBLICATION_STATUS `status`
// field at all — their schemas (media.js, source.js) deliberately do not
// reuse validateBaseEntity, matching how v1 gallery/source content was
// already always public. The fail-closed "status must equal published" rule
// below only applies to entity types that actually have a status concept.
const STATUS_LESS_ENTITY_TYPES = Object.freeze(["media", "source"]);

export function isPublic(record) {
  if (!record) return false;
  if (STATUS_LESS_ENTITY_TYPES.includes(record.entityType)) return true;
  return record.status === PUBLIC_STATUS;
}

/**
 * A relationship is public only when its OWN status is published AND both
 * the entities it connects are independently public. Checking the
 * relationship's own status alone is not enough: a relationship's sourceId/
 * targetId/sourceType/targetType reveal the existence and type of the
 * entity on the other end, even with no other field exposed. Without this
 * check, a relationship marked "published" while pointing at a draft/
 * inReview entity (an oralHistoryLead story, for instance) would leak that
 * entity's existence through GET /api/v2/relationships even though the
 * entity itself correctly 404s at GET /api/v2/entities/:id. See
 * V2-ARCHITECTURE.md "Public relationship gating".
 *
 * Takes a `getEntityById` lookup function rather than a full store, so any
 * caller with just an in-memory entity map (the static release generator,
 * a test fixture) can reuse the exact same rule without depending on the
 * store abstraction.
 */
export async function isPublicRelationship(relationship, getEntityById) {
  if (!isPublic(relationship)) return false;
  const [source, target] = await Promise.all([
    getEntityById(relationship.sourceId),
    getEntityById(relationship.targetId),
  ]);
  return isPublic(source) && isPublic(target);
}

export async function filterPublicRelationships(relationships, getEntityById) {
  const flags = await Promise.all(
    relationships.map((relationship) => isPublicRelationship(relationship, getEntityById)),
  );
  return relationships.filter((_relationship, index) => flags[index]);
}
