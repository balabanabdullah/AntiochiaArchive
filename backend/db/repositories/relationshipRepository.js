// Repository for the `relationships` table. Mirrors memoryV2Store's
// listRelationships/getRelatedEntities pagination contract.

import { getSqlite } from "../sqliteConnection.js";

function nowIso() {
  return new Date().toISOString();
}

function rowToRelationship(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    sourceId: row.source_id,
    sourceType: row.source_type,
    targetId: row.target_id,
    targetType: row.target_type,
    status: row.status ?? undefined,
    note: row.note ?? undefined,
    evidenceSourceIds: row.evidence_source_ids ? JSON.parse(row.evidence_source_ids) : undefined,
  };
}

function normalizeLimit(limit) {
  return Number.isInteger(limit) && limit > 0 ? limit : 20;
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

export function insertRelationship(relationship) {
  const db = getSqlite();
  const now = nowIso();
  db.prepare(`
    INSERT INTO relationships (id, type, source_id, source_type, target_id, target_type, status, note, evidence_source_ids, created_at, updated_at)
    VALUES (@id, @type, @sourceId, @sourceType, @targetId, @targetType, @status, @note, @evidenceSourceIds, @createdAt, @updatedAt)
  `).run({
    id: relationship.id,
    type: relationship.type,
    sourceId: relationship.sourceId,
    sourceType: relationship.sourceType,
    targetId: relationship.targetId,
    targetType: relationship.targetType,
    status: relationship.status ?? null,
    note: relationship.note ?? null,
    evidenceSourceIds: relationship.evidenceSourceIds ? JSON.stringify(relationship.evidenceSourceIds) : null,
    createdAt: now,
    updatedAt: now,
  });
  return rowToRelationship(db.prepare("SELECT * FROM relationships WHERE id = ?").get(relationship.id));
}

export function deleteRelationshipRow(id) {
  const db = getSqlite();
  return db.prepare("DELETE FROM relationships WHERE id = ?").run(id).changes > 0;
}

export function getRelationshipByIdRow(id) {
  const db = getSqlite();
  return rowToRelationship(db.prepare("SELECT * FROM relationships WHERE id = ?").get(id));
}

export function relationshipIdExists(id) {
  const db = getSqlite();
  return Boolean(db.prepare("SELECT 1 FROM relationships WHERE id = ?").get(id));
}

export function countRelationshipsForEntity(entityId) {
  const db = getSqlite();
  const row = db.prepare("SELECT COUNT(*) as count FROM relationships WHERE source_id = ? OR target_id = ?").get(entityId, entityId);
  return row.count;
}

export function listRelationshipsRows({ limit = 20, cursor = null, filters = {} } = {}) {
  const db = getSqlite();
  const clauses = [];
  const params = {};
  if (filters.type) { clauses.push("type = @type"); params.type = filters.type; }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM relationships ${where} ORDER BY id ASC`).all(params);
  return paginate(rows.map(rowToRelationship), { limit: normalizeLimit(limit), cursor });
}

export function getRelatedEntityIds(entityId) {
  const db = getSqlite();
  const rows = db.prepare("SELECT source_id, target_id FROM relationships WHERE source_id = ? OR target_id = ?").all(entityId, entityId);
  const ids = new Set();
  for (const row of rows) {
    ids.add(row.source_id === entityId ? row.target_id : row.source_id);
  }
  return [...ids];
}
