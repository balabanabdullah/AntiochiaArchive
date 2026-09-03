import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import Database from "better-sqlite3";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(__dirname, "../..");
const scriptPath = path.join(backendDirectory, "scripts", "migrate-json-to-sqlite.js");

function runCli(args, env = {}) {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], {
      cwd: backendDirectory,
      encoding: "utf-8",
      env: { ...process.env, ...env },
    });
    return { status: 0, stdout };
  } catch (error) {
    return { status: error.status, stdout: error.stdout, stderr: error.stderr };
  }
}

test("--dry-run reports real source counts and writes no database file", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-migrate-sqlite-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, "should-not-exist.db");

  const result = runCli(["--dry-run"], { SQLITE_DB_PATH: dbPath });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /284 entities, 81 relationships/);
  assert.match(result.stdout, /"place":128/);
  assert.match(result.stdout, /Dry run complete/);
  await assert.rejects(fs.access(dbPath), "dry-run must not create the database file");
});

test("passing neither or both of --dry-run/--apply is rejected", () => {
  const neither = runCli([]);
  assert.notEqual(neither.status, 0);
  const both = runCli(["--dry-run", "--apply"]);
  assert.notEqual(both.status, 0);
});

test("--apply imports the real canonical dataset with correct counts, and a second run is idempotent (no duplication)", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-migrate-sqlite-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, "antiochia.db");

  const first = runCli(["--apply"], { SQLITE_DB_PATH: dbPath });
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Inserted 284 entities \(skipped 0 already present\)/);
  assert.match(first.stdout, /Inserted 81 relationships \(skipped 0 already present\)/);
  assert.match(first.stdout, /Count verification PASSED/);

  const db = new Database(dbPath, { readonly: true });
  assert.equal(db.prepare("SELECT COUNT(*) c FROM entities").get().c, 284);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM relationships").get().c, 81);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM entities WHERE status='published'").get().c, 199);
  const orphanRelationships = db.prepare(`
    SELECT COUNT(*) c FROM relationships r
    WHERE NOT EXISTS (SELECT 1 FROM entities e WHERE e.id = r.source_id)
       OR NOT EXISTS (SELECT 1 FROM entities e WHERE e.id = r.target_id)
  `).get().c;
  assert.equal(orphanRelationships, 0, "every migrated relationship must reference an entity that was also migrated");
  db.close();

  const second = runCli(["--apply"], { SQLITE_DB_PATH: dbPath });
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Inserted 0 entities \(skipped 284 already present\)/);
  assert.match(second.stdout, /Inserted 0 relationships \(skipped 81 already present\)/);

  const dbAfterSecondRun = new Database(dbPath, { readonly: true });
  assert.equal(dbAfterSecondRun.prepare("SELECT COUNT(*) c FROM entities").get().c, 284, "a second --apply must never duplicate rows");
  dbAfterSecondRun.close();
});
