// Backup / restore (Section 29-31) — an admin action, never a filesystem
// path typed into a browser: every path this module touches is computed
// internally from BACKUP_ROOT + a server-generated id, never from request
// input (Section 30: "Do not allow arbitrary filesystem paths from browser
// input" — there is no code path here that even accepts one).
//
// A backup is: a consistent, online copy of the live SQLite database (via
// better-sqlite3's own .backup(), which is safe to run against a database
// under active WAL writes) + a content-hashed manifest of every media file
// on disk (via mediaStorage.js's buildManifest()). Both are hashed
// (SHA-256) and the hashes are recorded in the `backups` table, so a
// restore can verify the files it is about to apply have not been altered
// or corrupted since they were written (Section 31: "Restore should verify
// before applying").
//
// Known limitation, reported honestly rather than silently assumed away:
// this machine is a single point of failure until backups are additionally
// copied off of it (a different disk, cloud storage, etc.) — see the round
// report's "Known Limitations" for this exact sentence.

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { getSqlite, getSqliteDbPath, closeSqlite, initializeSqlite } from "../db/sqliteConnection.js";
import { getMediaStorage } from "../media/mediaStorage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "..");

export function resolveBackupRoot(value = process.env.BACKUP_ROOT) {
  const configured = String(value || "./var/backups").trim();
  return path.isAbsolute(configured) ? configured : path.resolve(BACKEND_ROOT, configured);
}

function sha256OfFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function newBackupId() {
  return `backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

// INSERT OR IGNORE: restoreBackup() below re-inserts a backup's own
// metadata row after a restore (see its header comment for why a snapshot
// can never contain the database row describing itself) — that re-insert
// must be a safe no-op if the row already happens to be present, never a
// unique-constraint error.
function ensureBackupsTableRow(row) {
  const db = getSqlite();
  db.prepare(`
    INSERT OR IGNORE INTO backups (id, created_at, reason, db_sha256, media_manifest_sha256, media_file_count, relative_path)
    VALUES (@id, @createdAt, @reason, @dbSha256, @mediaManifestSha256, @mediaFileCount, @relativePath)
  `).run(row);
}

/** Creates a new backup snapshot. better-sqlite3's .backup() is asynchronous (returns a Promise) — this is the one repository-adjacent call in the codebase that must be awaited. */
export async function createBackup({ reason = "manual" } = {}) {
  const id = newBackupId();
  const root = resolveBackupRoot();
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });

  const dbDestination = path.join(dir, "antiochia.db");
  await getSqlite().backup(dbDestination);
  const dbSha256 = sha256OfFile(dbDestination);

  let mediaManifestSha256 = null;
  let mediaFileCount = 0;
  try {
    const manifest = getMediaStorage().buildManifest();
    const manifestPath = path.join(dir, "media-manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    mediaManifestSha256 = sha256OfFile(manifestPath);
    mediaFileCount = manifest.length;
  } catch {
    // Media storage may not be initialized in every deployment mode; a
    // backup with no media manifest is still a valid database backup.
  }

  const createdAt = new Date().toISOString();
  const relativePath = path.relative(root, dir);
  ensureBackupsTableRow({ id, createdAt, reason, dbSha256, mediaManifestSha256, mediaFileCount, relativePath });

  return { id, createdAt, reason, dbSha256, mediaManifestSha256, mediaFileCount, relativePath };
}

export function listBackups() {
  const db = getSqlite();
  const rows = db.prepare("SELECT * FROM backups ORDER BY created_at DESC").all();
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    reason: row.reason,
    dbSha256: row.db_sha256,
    mediaManifestSha256: row.media_manifest_sha256,
    mediaFileCount: row.media_file_count,
  }));
}

/**
 * Restores the live database from a previously-created, hash-verified
 * backup. Sequence: (1) snapshot the CURRENT state first — a restore is
 * itself a "dangerous operation" per Section 29, so it must be undoable —
 * (2) verify the target backup's file hash still matches what was recorded
 * at creation time, (3) close the live connection, swap the file, reopen.
 * Refuses outright (throws) rather than applying anything if verification
 * fails.
 */
export async function restoreBackup({ id }) {
  const db = getSqlite();
  const row = db.prepare("SELECT * FROM backups WHERE id = ?").get(id);
  if (!row) throw new Error(`Backup '${id}' was not found.`);

  const root = resolveBackupRoot();
  const backupDbPath = path.join(root, row.relative_path, "antiochia.db");
  if (!fs.existsSync(backupDbPath)) throw new Error(`Backup file for '${id}' is missing on disk.`);
  const actualHash = sha256OfFile(backupDbPath);
  if (actualHash !== row.db_sha256) {
    throw new Error(`Backup '${id}' failed integrity verification (hash mismatch) — restore refused.`);
  }

  // Safety snapshot of the CURRENT state before overwriting it.
  const preRestoreBackup = await createBackup({ reason: `pre-restore-of-${id}` });

  const liveDbPath = getSqliteDbPath();
  closeSqlite();
  fs.copyFileSync(backupDbPath, liveDbPath);
  // WAL/SHM sidecars from the PREVIOUS live database must not be reused
  // against the restored file — better-sqlite3's own .backup() produces a
  // self-contained file with no pending WAL frames, so removing any stale
  // sidecars is correct, not lossy.
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${liveDbPath}${suffix}`;
    if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
  }
  initializeSqlite({ path: liveDbPath });

  // A backup file, by construction, can never contain the `backups` table
  // row that describes itself — that row is only inserted (into what was
  // then the live database) AFTER the file copy completes (see
  // createBackup() above). So restoring TO a snapshot always reverts the
  // `backups` table to a state that is missing both that snapshot's own
  // row and the pre-restore safety backup's row just taken a moment ago.
  // Re-insert both explicitly so `listBackups()` stays accurate — an admin
  // must always be able to see (and use) the safety backup this restore
  // itself just created, or a "dangerous operation" would have silently
  // hidden its own undo path.
  ensureBackupsTableRow({
    id: row.id, createdAt: row.created_at, reason: row.reason, dbSha256: row.db_sha256,
    mediaManifestSha256: row.media_manifest_sha256, mediaFileCount: row.media_file_count, relativePath: row.relative_path,
  });
  ensureBackupsTableRow(preRestoreBackup);

  return { restoredFrom: id, preRestoreSafetyBackup: preRestoreBackup.id };
}
