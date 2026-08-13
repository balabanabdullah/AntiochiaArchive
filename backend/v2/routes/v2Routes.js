import { Router } from "express";
import { ENTITY_TYPES } from "../constants/vocabularies.js";
import { validatePagination } from "../validators/pagination.js";
import { validateFilters } from "../validators/filters.js";
import { serializePublicEntities, serializePublicEntity } from "../serializers/publicSerializer.js";
import { getV2Store } from "../stores/v2Store.js";
import { V2QueryError } from "../stores/errors.js";

const V2_VERSION = "v2";

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
    return res.status(200).json({
      success: true,
      data: serializePublicEntities(page.items),
      meta: buildMeta({
        count: page.count ?? page.items.length,
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
    if (!entity) {
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

export default router;
