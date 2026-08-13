import { Router } from "express";
import { ENTITY_TYPES, RELATIONSHIP_TYPES } from "../constants/vocabularies.js";
import { validatePagination, MAX_PAGE_LIMIT } from "../validators/pagination.js";
import { validateFilters } from "../validators/filters.js";
import {
  serializePublicEntities,
  serializePublicEntity,
  serializePublicRelationship,
} from "../serializers/publicSerializer.js";
import { getV2Store } from "../stores/v2Store.js";
import { V2QueryError } from "../stores/errors.js";

const V2_VERSION = "v2";

// The only entity/relationship `status` value ever returned by a public
// endpoint. draft/inReview/archived (and a missing status) are treated as
// not-yet-public — fail-closed by default, so a newly authored native
// editorial record must be explicitly marked "published" before it can ever
// reach a public response. This is enforced here, at the route/API
// boundary, not inside the store — store-level code and tests may still
// read every record regardless of status (see V2-ARCHITECTURE.md
// "Publication visibility").
const PUBLIC_STATUS = "published";

// `media` and `source` entities do not carry a PUBLICATION_STATUS `status`
// field at all — their schemas (media.js, source.js) deliberately do not
// reuse validateBaseEntity, matching how v1 gallery/source content was
// already always public. The fail-closed "status must equal published" rule
// below only applies to entity types that actually have a status concept.
const STATUS_LESS_ENTITY_TYPES = Object.freeze(["media", "source"]);

function isPublic(record) {
  if (!record) return false;
  if (STATUS_LESS_ENTITY_TYPES.includes(record.entityType)) return true;
  return record.status === PUBLIC_STATUS;
}

// Path segment -> domain entityType, for the per-category list endpoints.
const TYPE_ROUTES = Object.freeze({
  communities: "community",
  beliefs: "belief",
  places: "place",
  structures: "structure",
  stories: "story",
  music: "music",
  proverbs: "proverb",
  "historical-contexts": "historicalContext",
  media: "media",
});

function parseListRequest(req) {
  const pagination = validatePagination(req.query);
  if (!pagination.valid) return { error: pagination.error };

  const filters = validateFilters(req.query);
  if (!filters.valid) return { error: filters.error };

  return { pagination, filters: filters.filters };
}

// Relationships have their own (much smaller) filter surface — only a
// controlled `type` — so this intentionally does not reuse
// validators/filters.js, which validates entity-oriented fields.
function parseRelationshipListRequest(req) {
  const pagination = validatePagination(req.query);
  if (!pagination.valid) return { error: pagination.error };

  const { type } = req.query;
  const unsupported = Object.keys(req.query).filter((key) => !["limit", "cursor", "type"].includes(key));
  if (unsupported.length) return { error: `Unsupported filter field: ${unsupported[0]}.` };

  if (type != null) {
    if (typeof type !== "string" || !RELATIONSHIP_TYPES.includes(type)) {
      return { error: `type must be one of: ${RELATIONSHIP_TYPES.join(", ")}.` };
    }
  }

  return { pagination, filters: type ? { type } : {} };
}

function buildMeta({ count, limit, cursor, nextCursor }) {
  return {
    version: V2_VERSION,
    count,
    limit,
    cursor: cursor || null,
    nextCursor: nextCursor || null,
  };
}

function sendListError(res, error) {
  return res.status(400).json({ success: false, error });
}

function sendReadFailure(res, label, error) {
  // A store can decide a request cannot be honored yet (e.g. an unsupported
  // filter, or a Firestore composite index that doesn't exist) — that is a
  // client-correctable 400, not a 500 server failure.
  if (error instanceof V2QueryError) {
    return res.status(400).json({ success: false, error: error.message });
  }
  console.error(`[V2Routes] ${label}:`, error.message);
  return res.status(500).json({ success: false, error: "Could not read v2 archive data." });
}

async function respondWithPage(res, { pagination, filters }, fetchPage, label) {
  try {
    const store = getV2Store();
    const page = await fetchPage(store, { limit: pagination.limit, cursor: pagination.cursor, filters });
    const publicItems = page.items.filter(isPublic);
    return res.status(200).json({
      success: true,
      data: serializePublicEntities(publicItems),
      meta: buildMeta({
        count: publicItems.length,
        limit: pagination.limit,
        cursor: pagination.cursor,
        nextCursor: page.nextCursor ?? null,
      }),
    });
  } catch (error) {
    return sendReadFailure(res, label, error);
  }
}

function listByTypeHandler(entityType) {
  return async (req, res) => {
    const parsed = parseListRequest(req);
    if (parsed.error) return sendListError(res, parsed.error);
    return respondWithPage(
      res,
      parsed,
      (store, options) => store.listByType(entityType, options),
      `listByType(${entityType})`,
    );
  };
}

const router = Router();

/** GET /api/v2 - safe, non-sensitive service metadata only. */
router.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      version: V2_VERSION,
      status: "foundation",
      supportedEntityTypes: ENTITY_TYPES,
    },
  });
});

/** GET /api/v2/entities - all entity types, paginated. */
router.get("/entities", async (req, res) => {
  const parsed = parseListRequest(req);
  if (parsed.error) return sendListError(res, parsed.error);
  return respondWithPage(res, parsed, (store, options) => store.listEntities(options), "listEntities");
});

/** GET /api/v2/entities/:id - single entity by id. */
router.get("/entities/:id", async (req, res) => {
  try {
    const store = getV2Store();
    const entity = await store.getEntityById(req.params.id);
    // A non-public entity (draft/inReview/archived/missing status) gets the
    // same 404 as a truly missing id — never a different response code that
    // would let a client distinguish "doesn't exist" from "exists but isn't
    // published yet".
    if (!entity || !isPublic(entity)) {
      return res.status(404).json({ success: false, error: "Entity not found." });
    }
    return res.status(200).json({ success: true, data: serializePublicEntity(entity) });
  } catch (error) {
    return sendReadFailure(res, "getEntityById", error);
  }
});

for (const [path, entityType] of Object.entries(TYPE_ROUTES)) {
  router.get(`/${path}`, listByTypeHandler(entityType));
}

/** GET /api/v2/relationships - all relationship edges, paginated. */
router.get("/relationships", async (req, res) => {
  const parsed = parseRelationshipListRequest(req);
  if (parsed.error) return sendListError(res, parsed.error);

  try {
    const store = getV2Store();
    const page = await store.listRelationships({
      limit: parsed.pagination.limit,
      cursor: parsed.pagination.cursor,
      filters: parsed.filters,
    });
    const publicItems = page.items.filter(isPublic);
    return res.status(200).json({
      success: true,
      data: publicItems.map(serializePublicRelationship),
      meta: buildMeta({
        count: publicItems.length,
        limit: parsed.pagination.limit,
        cursor: parsed.pagination.cursor,
        nextCursor: page.nextCursor ?? null,
      }),
    });
  } catch (error) {
    return sendReadFailure(res, "listRelationships", error);
  }
});

/**
 * GET /api/v2/entities/:id/related - entities related to :id, each paired
 * with the relationship edge that connects them where one can be identified
 * (never the raw internal entity/relationship record).
 *
 * Entity pagination reuses the store's own getRelatedEntities cursor
 * contract unchanged. Relationship pairing is a best-effort enrichment: it
 * fetches at most one bounded page (MAX_PAGE_LIMIT) of relationship edges
 * touching :id and matches them client-side. In a deployment with more than
 * MAX_PAGE_LIMIT relationship edges on a single entity, a small number of
 * pairs could show `relationship: null` while the related entity itself is
 * still returned correctly — acceptable for this local/dev step; see
 * V2-ARCHITECTURE.md "Related entity API".
 */
router.get("/entities/:id/related", async (req, res) => {
  const pagination = validatePagination(req.query);
  if (!pagination.valid) return sendListError(res, pagination.error);

  try {
    const store = getV2Store();
    const sourceEntity = await store.getEntityById(req.params.id);
    if (!sourceEntity || !isPublic(sourceEntity)) {
      return res.status(404).json({ success: false, error: "Entity not found." });
    }

    const relatedPage = await store.getRelatedEntities(req.params.id, {
      limit: pagination.limit,
      cursor: pagination.cursor,
    });
    const publicRelated = relatedPage.items.filter(isPublic);

    const relationshipsPage = await store.listRelationships({ limit: MAX_PAGE_LIMIT });
    const publicRelationships = relationshipsPage.items.filter(isPublic);
    const findEdge = (otherId) => publicRelationships.find((relationship) => (
      (relationship.sourceId === req.params.id && relationship.targetId === otherId)
      || (relationship.targetId === req.params.id && relationship.sourceId === otherId)
    )) || null;

    const data = publicRelated.map((entity) => ({
      relationship: serializePublicRelationship(findEdge(entity.id)),
      entity: serializePublicEntity(entity),
    }));

    return res.status(200).json({
      success: true,
      data,
      meta: buildMeta({
        count: data.length,
        limit: pagination.limit,
        cursor: pagination.cursor,
        nextCursor: relatedPage.nextCursor ?? null,
      }),
    });
  } catch (error) {
    return sendReadFailure(res, "getRelatedEntities", error);
  }
});

export default router;
