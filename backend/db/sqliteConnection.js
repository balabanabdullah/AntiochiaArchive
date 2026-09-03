// Runtime content database connection. This module owns the ONE thing
// every repository in db/repositories/ depends on: a single, process-wide,
// correctly-configured better-sqlite3 handle.
//
// Config clarity (Section 16): the ONE actual, live env var that selects
// this runtime is V2_DATA_STORE=sqlite (see v2/stores/v2Store.js and its
// isSqliteRuntimeActive() helper — every route/service checks that, not a
// second, independent switch). There is NO "DB_DRIVER" env var read
// anywhere in this codebase today — earlier drafts of this comment implied
// one existed; it does not. "DB_DRIVER" below is purely a NAMING
// CONVENTION for a *future*, not-yet-built repository swap (Postgres), not
// a config flag a deployment can set now. When that work actually happens,
// it must reuse the same V2_DATA_STORE switch (e.g. V2_DATA_STORE=postgres)
// rather than introducing a second, independently-settable variable that
// could contradict it.
//
// Portability contract: nothing outside this file (and db/migrate.js, which
// only needs the same handle) ever imports "better-sqlite3" directly. A
// future backend/db/postgresConnection.js + backend/db/repositories/*Pg.js
// pair can be added, and V2_DATA_STORE=postgres wired in beside
// V2_DATA_STORE=sqlite in v2Store.js's store map, without any repository
// caller changing.
//
// Safety properties (Section 3 of the round brief):
//   - PRAGMA foreign_keys = ON        — referential integrity is enforced,
//     not just documented.
//   - PRAGMA journal_mode = WAL       — readers never block writers and vice
//     versa; the correct mode for "high read, low/moderate write" (Section 33).
//   - PRAGMA busy_timeout = 5000      — a request that loses a brief write
//     race waits up to 5s for the lock rather than throwing SQLITE_BUSY
//     immediately.
// better-sqlite3 is synchronous by design (no callback/promise overhead per
// query) — every repository method below is a plain synchronous function
// wrapped in an `async` Express handler only where the route layer expects
// a promise, exactly like the existing file-based v1 stores already do.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "..");

/**
 * Resolves the database file path. Never a hardcoded Windows/Linux absolute
 * path (Section 2) — relative to backend/ by default, or wherever
 * SQLITE_DB_PATH points (absolute or relative; relative is resolved against
 * backend/, matching how ARCHIVE_JSON_PATH etc. already resolve in
 * dataStore.js/localMappedV2Store.js).
 */
export function resolveSqliteDbPath(value = process.env.SQLITE_DB_PATH) {
  const configured = String(value || "./var/database/antiochia.db").trim();
  return path.isAbsolute(configured) ? configured : path.resolve(BACKEND_ROOT, configured);
}

let db = null;
let dbPath = null;

/**
 * Cloud Run guard (Section 14 — "do not allow accidental production Cloud
 * Run activation without explicit acknowledgment"). Cloud Run always sets
 * K_SERVICE (and K_REVISION/K_CONFIGURATION) on every revision — this is
 * the standard, documented way to detect "this process is running on
 * Cloud Run" from inside the container, with no guessing involved. Cloud
 * Run's container filesystem is ephemeral: it does not survive a revision
 * restart, a scale-to-zero, or a redeploy, so a SQLite file written there
 * is silently lost — the opposite of what a database is for. This throws
 * (crashing the process at startup, the loudest possible signal) rather
 * than merely logging, unless the operator has explicitly set
 * SQLITE_ON_CLOUD_RUN_ACK=true, a deliberate, separate opt-in that makes
 * the risk a conscious choice rather than a silent config accident (e.g. a
 * copy-pasted local .env making it into a deploy command).
 */
function assertSafeToActivateSqlite() {
  const onCloudRun = Boolean(process.env.K_SERVICE);
  const acknowledged = process.env.SQLITE_ON_CLOUD_RUN_ACK === "true";
  if (onCloudRun && !acknowledged) {
    throw new Error(
      "V2_DATA_STORE=sqlite was requested while running on Cloud Run (K_SERVICE is set), but Cloud Run's "
      + "container filesystem is EPHEMERAL — a SQLite database written there is silently lost on the next "
      + "restart, scale-to-zero, or redeploy. This is refused by default. If you have a specific, deliberate "
      + "reason to run SQLite on Cloud Run anyway (e.g. a short-lived demo you accept losing), set "
      + "SQLITE_ON_CLOUD_RUN_ACK=true explicitly. For real production use, SQLite is intended for a "
      + "single, persistent, local/on-prem machine — see backend/PERSISTENCE.md \"Runtime content database (SQLite)\".",
    );
  }
}

/**
 * Opens (creating if needed) the SQLite file at the resolved path, applies
 * the mandatory safety PRAGMAs, and returns the shared handle. Idempotent:
 * calling this more than once with the same resolved path returns the same
 * open handle rather than reopening the file.
 */
export function initializeSqlite({ path: overridePath } = {}) {
  assertSafeToActivateSqlite();
  const resolved = overridePath ? (path.isAbsolute(overridePath) ? overridePath : path.resolve(BACKEND_ROOT, overridePath)) : resolveSqliteDbPath();

  if (db && dbPath === resolved) return db;
  if (db && dbPath !== resolved) {
    throw new Error(`SQLite has already been initialized at '${dbPath}' — cannot reinitialize at '${resolved}' in the same process.`);
  }

  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  db = new Database(resolved);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  dbPath = resolved;
  return db;
}

export function getSqlite() {
  if (!db) throw new Error("SQLite has not been initialized. Call initializeSqlite() first.");
  return db;
}

export function getSqliteDbPath() {
  if (!dbPath) throw new Error("SQLite has not been initialized. Call initializeSqlite() first.");
  return dbPath;
}

/**
 * Closes the handle so the process can reinitialize against a fresh path —
 * used by tests to isolate fixtures, and by admin/backupService.js's
 * restoreBackup() to safely swap the live database file for a verified
 * backup copy before reopening it (see that module for the full sequence).
 */
export function closeSqlite() {
  if (db) db.close();
  db = null;
  dbPath = null;
}

// Kept as an alias so existing test files reading intent from the name
// ("this is test cleanup") stay clear — same function either way.
export const _closeSqliteForTests = closeSqlite;

/**
 * Runs `fn` inside a single SQLite transaction (better-sqlite3's
 * synchronous transaction wrapper — commits on normal return, rolls back on
 * any thrown error). Every multi-statement content mutation in
 * admin/contentService.js goes through this so a partial write (e.g. entity
 * updated but its audit row failed) can never happen — "short transactions"
 * per Section 3.
 */
export function runInTransaction(fn) {
  return getSqlite().transaction(fn)();
}
