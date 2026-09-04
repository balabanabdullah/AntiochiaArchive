// Repository for the unified `audit_log` table (Section 10, 27, 28).
// This is the ONLY place any admin content mutation is recorded — every
// contentService.js action inserts exactly one row here, in the SAME
// transaction as the mutation itself (see sqliteConnection.js's
// runInTransaction), so an audit entry can never exist without its
// corresponding change, or vice versa.

import { getSqlite } from "../sqliteConnection.js";

function nowIso() {
  return new Date().toISOString();
}

function rowToEntry(row) {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    action: row.action,
    actor: row.actor,
    before: row.before_json ? JSON.parse(row.before_json) : null,
    after: row.after_json ? JSON.parse(row.after_json) : null,
    note: row.note ?? null,
    createdAt: row.created_at,
  };
}

/**
 * `actor` is deliberately a fixed, non-personal string identifying the
 * *system* that made the change (e.g. "admin-session"), never an invented
 * per-person identity — Section 27 explicitly forbids fabricating PII in a
 * currently-single-admin system. When real multi-user accounts exist, this
 * is the only function that would need a real actor identifier passed in.
 */
export function recordAuditEntry({ targetType, targetId, action, actor = "admin-session", before = null, after = null, note = null }) {
  const db = getSqlite();
  const result = db.prepare(`
    INSERT INTO audit_log (target_type, target_id, action, actor, before_json, after_json, note, created_at)
    VALUES (@targetType, @targetId, @action, @actor, @beforeJson, @afterJson, @note, @createdAt)
  `).run({
    targetType,
    targetId,
    action,
    actor,
    beforeJson: before ? JSON.stringify(before) : null,
    afterJson: after ? JSON.stringify(after) : null,
    note,
    createdAt: nowIso(),
  });
  return rowToEntry(db.prepare("SELECT * FROM audit_log WHERE id = ?").get(result.lastInsertRowid));
}

export function listAuditEntriesForTarget(targetType, targetId, { limit = 100 } = {}) {
  const db = getSqlite();
  const rows = db.prepare(`
    SELECT * FROM audit_log WHERE target_type = ? AND target_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
  `).all(targetType, targetId, limit);
  return rows.map(rowToEntry);
}

export function listRecentAuditEntries({ limit = 50 } = {}) {
  const db = getSqlite();
  const rows = db.prepare("SELECT * FROM audit_log ORDER BY created_at DESC, id DESC LIMIT ?").all(limit);
  return rows.map(rowToEntry);
}

/**
 * Every id ever used for a given action (e.g. "delete"), across every
 * target this table has ever recorded — used by admin/idRecommendationService.js
 * so a permanently-deleted entity's id is never recommended again (Section
 * 2 of the "no-code CMS UX" round: "IDs once used should preferably not be
 * recycled"). The entities table alone can't answer this once a row is
 * gone; this survives permanent deletion because audit_log rows are never
 * deleted. No type filter is applied here — each entity type's id prefix
 * is already unique and unambiguous, so the caller's own prefix regex does
 * the filtering.
 */
export function listAuditTargetIds({ targetType, action }) {
  const db = getSqlite();
  const rows = db.prepare("SELECT DISTINCT target_id FROM audit_log WHERE target_type = ? AND action = ?").all(targetType, action);
  return rows.map((row) => row.target_id);
}
