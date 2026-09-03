#!/usr/bin/env node
// Tiny, dependency-free migration runner for the SQLite runtime database.
// Applies every *.sql file in db/migrations/ (sorted by filename, so
// "0001_init.sql" always runs before "0002_....sql") that is not already
// recorded in the schema_migrations table, each inside its own transaction.
// Re-running this script is always safe: an already-applied migration is
// skipped, never reapplied — Section 3 "migrations".
//
// Usage:
//   node db/migrate.js                 # applies pending migrations
//   node db/migrate.js --status        # lists applied/pending, writes nothing

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeSqlite, getSqlite } from "./sqliteConnection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "migrations");

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TEXT NOT NULL
    );
  `);
}

function listMigrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

/** Exported so scripts/migrate-json-to-sqlite.js and tests can guarantee an up-to-date schema before writing. */
export function applyPendingMigrations({ verbose = true } = {}) {
  const db = getSqlite();
  ensureMigrationsTable(db);
  const applied = new Set(db.prepare("SELECT filename FROM schema_migrations").all().map((r) => r.filename));
  const pending = listMigrationFiles().filter((name) => !applied.has(name));

  for (const filename of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf-8");
    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)").run(filename, new Date().toISOString());
    })();
    if (verbose) console.log(`Applied migration: ${filename}`);
  }

  if (verbose && !pending.length) console.log("No pending migrations.");
  return { applied: pending };
}

export function migrationStatus() {
  const db = getSqlite();
  ensureMigrationsTable(db);
  const appliedRows = db.prepare("SELECT filename, applied_at FROM schema_migrations ORDER BY filename").all();
  const appliedNames = new Set(appliedRows.map((r) => r.filename));
  const pending = listMigrationFiles().filter((name) => !appliedNames.has(name));
  return { applied: appliedRows, pending };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  initializeSqlite();
  if (process.argv.includes("--status")) {
    const { applied, pending } = migrationStatus();
    console.log("Applied:");
    for (const row of applied) console.log(`  ${row.filename} (${row.applied_at})`);
    console.log("Pending:");
    for (const name of pending) console.log(`  ${name}`);
  } else {
    applyPendingMigrations();
  }
}
