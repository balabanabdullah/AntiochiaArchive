import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { initializeSqlite, closeSqlite, resolveSqliteDbPath } from "../../db/sqliteConnection.js";

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
}

test("resolveSqliteDbPath resolves a relative path against backend/, never a hardcoded OS path", () => {
  const resolved = resolveSqliteDbPath("./var/database/antiochia.db");
  assert.ok(path.isAbsolute(resolved));
  assert.ok(resolved.endsWith(path.join("var", "database", "antiochia.db")));
});

test("Section 14: refuses to initialize when K_SERVICE (Cloud Run) is set and SQLITE_ON_CLOUD_RUN_ACK is not", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-sqlite-guard-"));
  const originalKService = process.env.K_SERVICE;
  const originalAck = process.env.SQLITE_ON_CLOUD_RUN_ACK;
  process.env.K_SERVICE = "antiochia-archive-backend";
  delete process.env.SQLITE_ON_CLOUD_RUN_ACK;
  t.after(async () => {
    restoreEnv("K_SERVICE", originalKService);
    restoreEnv("SQLITE_ON_CLOUD_RUN_ACK", originalAck);
    await fs.rm(dir, { recursive: true, force: true });
  });

  assert.throws(() => initializeSqlite({ path: path.join(dir, "test.db") }), /Cloud Run/);
});

test("the guard is lifted by an explicit SQLITE_ON_CLOUD_RUN_ACK=true", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-sqlite-guard-ack-"));
  const originalKService = process.env.K_SERVICE;
  const originalAck = process.env.SQLITE_ON_CLOUD_RUN_ACK;
  process.env.K_SERVICE = "antiochia-archive-backend";
  process.env.SQLITE_ON_CLOUD_RUN_ACK = "true";
  t.after(async () => {
    closeSqlite();
    restoreEnv("K_SERVICE", originalKService);
    restoreEnv("SQLITE_ON_CLOUD_RUN_ACK", originalAck);
    await fs.rm(dir, { recursive: true, force: true });
  });

  const db = initializeSqlite({ path: path.join(dir, "test.db") });
  assert.ok(db);
});

test("without K_SERVICE set (normal local/non-Cloud-Run environment), initialization proceeds with no acknowledgment needed", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-sqlite-guard-local-"));
  const originalKService = process.env.K_SERVICE;
  delete process.env.K_SERVICE;
  t.after(async () => {
    closeSqlite();
    restoreEnv("K_SERVICE", originalKService);
    await fs.rm(dir, { recursive: true, force: true });
  });

  const db = initializeSqlite({ path: path.join(dir, "test.db") });
  assert.ok(db);
});
