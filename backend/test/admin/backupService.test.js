import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { closeSqlite } from "../../db/sqliteConnection.js";
import { sqliteV2Store } from "../../v2/stores/sqliteV2Store.js";
import { createEntity, publishEntity } from "../../admin/contentService.js";
import { createBackup, listBackups, restoreBackup } from "../../admin/backupService.js";
import { getEntityByIdRow } from "../../db/repositories/entityRepository.js";

async function withInitializedRuntime(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-backup-service-"));
  const originalPath = process.env.SQLITE_DB_PATH;
  const originalStorageRoot = process.env.LOCAL_STORAGE_ROOT;
  const originalBackupRoot = process.env.BACKUP_ROOT;
  process.env.SQLITE_DB_PATH = path.join(dir, "antiochia.db");
  process.env.LOCAL_STORAGE_ROOT = path.join(dir, "storage");
  process.env.BACKUP_ROOT = path.join(dir, "backups");
  await sqliteV2Store.initialize();
  t.after(async () => {
    closeSqlite();
    if (originalPath === undefined) delete process.env.SQLITE_DB_PATH; else process.env.SQLITE_DB_PATH = originalPath;
    if (originalStorageRoot === undefined) delete process.env.LOCAL_STORAGE_ROOT; else process.env.LOCAL_STORAGE_ROOT = originalStorageRoot;
    if (originalBackupRoot === undefined) delete process.env.BACKUP_ROOT; else process.env.BACKUP_ROOT = originalBackupRoot;
    await fs.rm(dir, { recursive: true, force: true });
  });
}

test("createBackup records a verifiable hash and appears in listBackups", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "s", title: { tr: "T" } }, actor: "test" });

  const backup = await createBackup({ reason: "manual" });
  assert.ok(backup.id);
  assert.equal(backup.dbSha256.length, 64);

  const backups = listBackups();
  assert.equal(backups.length, 1);
  assert.equal(backups[0].id, backup.id);
});

test("restoreBackup reverts later writes, and itself takes a pre-restore safety snapshot", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "s", title: { tr: "T" } }, actor: "test" });
  const backup = await createBackup({ reason: "manual" });

  publishEntity({ id: "place-1", actor: "test" });
  assert.equal(getEntityByIdRow("place-1").status, "published");

  const result = await restoreBackup({ id: backup.id });
  assert.equal(result.restoredFrom, backup.id);
  assert.ok(result.preRestoreSafetyBackup, "a restore must snapshot the pre-restore state first");

  assert.equal(getEntityByIdRow("place-1").status, "draft", "the publish that happened after the backup must be undone");

  const backups = listBackups();
  assert.equal(backups.length, 2, "the original backup plus the automatic pre-restore safety backup");
});

test("restoring a nonexistent backup id throws", async (t) => {
  await withInitializedRuntime(t);
  await assert.rejects(() => restoreBackup({ id: "does-not-exist" }));
});

test("restore refuses a backup whose file no longer matches its recorded hash (tamper/corruption detection)", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { id: "place-1", slug: "s", title: { tr: "T" } }, actor: "test" });
  const backup = await createBackup({ reason: "manual" });

  const backupDbPath = path.join(process.env.BACKUP_ROOT, backup.id, "antiochia.db");
  await fs.appendFile(backupDbPath, "corruption");

  await assert.rejects(() => restoreBackup({ id: backup.id }), /integrity verification/);
});
