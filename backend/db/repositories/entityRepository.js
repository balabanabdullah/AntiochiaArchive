// Repository for the `entities` table — the SQLite-backed home for every
// cultural entity type (community/belief/place/structure/story/music/
// proverb/historicalContext/media/source). Mirrors the read contract
// backend/v2/stores/memoryV2Store.js already established (same
// limit/cursor/filters shape, same id-sorted cursor pagination, same
// V2QueryError for the deferred communityId/beliefId/placeId filters) so
// backend/v2/stores/sqliteV2Store.js can implement V2Store by delegating
// here with no behavioral surprises relative to the stores that already
// exist.
//
// Every row's `data` column is the FULL validated entity object (validated
// by backend/v2/schemas/index.js's validateEntity before it ever reaches
// this file — this repository does not re-validate). id/entity_type/slug/
// status/timestamps are duplicated into real columns for indexed querying;
// callers must keep them in sync with `data` (insert()/update() below do
// this automatically from the entity object itself, so there is exactly one
// place this can drift, not two).

import { getSqlite } from "../sqliteConnection.js";
import { V2QueryError } from "../../v2/stores/errors.js";

const DEFERRED_ENTITY_FILTER_FIELDS = Object.freeze(["communityId", "beliefId", "placeId"]);

function nowIso() {
  return new Date().toISOString();
}

function rowToEntity(row) {
  if (!row) return null;
  return JSON.parse(row.data);
}

function normalizeLimit(limit) {
  return Number.isInteger(limit) && limit > 0 ? limit : 20;
}

/** Matches memoryV2Store's matchesFilters semantics, executed in JS against the deserialized entity (SQL only narrows by entityType/status for speed). */
function matchesFilters(entity, filters = {}) {
  return Object.entries(filters).every(([key, value]) => {
    if (value == null) return true;
    if (key === "tag") return Array.isArray(entity.tags) && entity.tags.includes(value);
    if (key === "musicGenre") return entity.genre === value;
    if (key === "entityType") return entity.entityType === value;
    return entity[key] === value;
  });
}

function assertNoDeferredFilters(filters = {}) {
  for (const field of DEFERRED_ENTITY_FILTER_FIELDS) {
    if (filters[field] != null) {
      throw new V2QueryError(
        `Filtering by '${field}' is not supported yet: it is not denormalized onto the v2 entity document `
        + "and must be resolved through a relationship-driven query in a future step.",
      );
    }
  }
}

function paginate(items, { limit, cursor }) {
  let startIndex = 0;
  if (cursor) {
    const index = items.findIndex((item) => item.id === cursor);
    startIndex = index === -1 ? items.length : index + 1;
  }
  const page = items.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < items.length;
  return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null, count: page.length };
}

export function insertEntity(entity) {
  const db = getSqlite();
  const now = nowIso();
  const createdAt = entity.createdAt || now;
  const updatedAt = entity.updatedAt || now;
  const stored = { ...entity, createdAt, updatedAt };
  db.prepare(`
    INSERT INTO entities (id, entity_type, slug, status, data, created_at, updated_at, published_at)
    VALUES (@id, @entityType, @slug, @status, @data, @createdAt, @updatedAt, @publishedAt)
  `).run({
    id: stored.id,
    entityType: stored.entityType,
    slug: stored.slug ?? null,
    status: stored.status ?? null,
    data: JSON.stringify(stored),
    createdAt,
    updatedAt,
    publishedAt: stored.status === "published" ? now : null,
  });
  return stored;
}

export function updateEntityRow(id, entity, { publishedAt } = {}) {
  const db = getSqlite();
  const updatedAt = nowIso();
  const stored = { ...entity, id, updatedAt };
  const existing = db.prepare("SELECT published_at FROM entities WHERE id = ?").get(id);
  const nextPublishedAt = publishedAt !== undefined ? publishedAt : existing?.published_at ?? null;
  db.prepare(`
    UPDATE entities
    SET entity_type = @entityType, slug = @slug, status = @status, data = @data,
        updated_at = @updatedAt, published_at = @publishedAt
    WHERE id = @id
  `).run({
    id,
    entityType: stored.entityType,
    slug: stored.slug ?? null,
    status: stored.status ?? null,
    data: JSON.stringify(stored),
    updatedAt,
    publishedAt: nextPublishedAt,
  });
  return stored;
}

export function deleteEntityRow(id) {
  const db = getSqlite();
  const result = db.prepare("DELETE FROM entities WHERE id = ?").run(id);
  return result.changes > 0;
}

export function getEntityByIdRow(id) {
  const db = getSqlite();
  return rowToEntity(db.prepare("SELECT data FROM entities WHERE id = ?").get(id));
}

export function getEntityBySlugRow(slug) {
  const db = getSqlite();
  return rowToEntity(db.prepare("SELECT data FROM entities WHERE slug = ?").get(slug));
}

export function idExists(id) {
  const db = getSqlite();
  return Boolean(db.prepare("SELECT 1 FROM entities WHERE id = ?").get(id));
}

export function slugExists(slug) {
  const db = getSqlite();
  return Boolean(db.prepare("SELECT 1 FROM entities WHERE slug = ?").get(slug));
}

export function listEntitiesRows({ limit = 20, cursor = null, filters = {} } = {}) {
  assertNoDeferredFilters(filters);
  const db = getSqlite();
  const clauses = [];
  const params = {};
  if (filters.entityType) { clauses.push("entity_type = @entityType"); params.entityType = filters.entityType; }
  if (filters.status) { clauses.push("status = @status"); params.status = filters.status; }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT data FROM entities ${where} ORDER BY id ASC`).all(params);
  const all = rows.map((r) => JSON.parse(r.data)).filter((entity) => matchesFilters(entity, filters));
  return paginate(all, { limit: normalizeLimit(limit), cursor });
}

export function listByTypeRows(type, { limit = 20, cursor = null, filters = {} } = {}) {
  return listEntitiesRows({ limit, cursor, filters: { ...filters, entityType: type } });
}

export function countByType() {
  const db = getSqlite();
  const rows = db.prepare("SELECT entity_type, COUNT(*) as count FROM entities GROUP BY entity_type").all();
  const out = {};
  for (const row of rows) out[row.entity_type] = row.count;
  return out;
}

export function countByStatus() {
  const db = getSqlite();
  const rows = db.prepare("SELECT status, COUNT(*) as count FROM entities WHERE status IS NOT NULL GROUP BY status").all();
  const out = {};
  for (const row of rows) out[row.status] = row.count;
  return out;
}

export function allEntitiesRaw() {
  const db = getSqlite();
  return db.prepare("SELECT data FROM entities ORDER BY id ASC").all().map((r) => JSON.parse(r.data));
}
