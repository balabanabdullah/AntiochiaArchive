import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import path from "path";
import { closeSqlite } from "../../db/sqliteConnection.js";
import { sqliteV2Store } from "../../v2/stores/sqliteV2Store.js";
import { uploadMedia, editMediaMetadata } from "../../admin/mediaUploadService.js";
import { ContentValidationError, ContentNotFoundError } from "../../admin/contentService.js";
import { getMediaStorage } from "../../media/mediaStorage.js";

const REAL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

/**
 * Writes a fixture buffer to a real on-disk temp file, exactly the shape
 * multer's diskStorage (see adminContentRoutes.js) hands to uploadMedia() in
 * production — a `tempFilePath`, never a Buffer. uploadMedia() is now a
 * true streaming, disk-based pipeline (Section 1 of the "correctness pass"
 * round), so its tests exercise that same real pipeline rather than a
 * bypassed in-memory shortcut.
 */
function writeTempFixture(buffer) {
  const tempPath = getMediaStorage().generateTempFilePath();
  fsSync.writeFileSync(tempPath, buffer);
  return tempPath;
}

async function withInitializedRuntime(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-media-upload-"));
  const originalPath = process.env.SQLITE_DB_PATH;
  const originalStorageRoot = process.env.LOCAL_STORAGE_ROOT;
  process.env.SQLITE_DB_PATH = path.join(dir, "test.db");
  process.env.LOCAL_STORAGE_ROOT = path.join(dir, "storage");
  await sqliteV2Store.initialize();
  t.after(async () => {
    closeSqlite();
    if (originalPath === undefined) delete process.env.SQLITE_DB_PATH; else process.env.SQLITE_DB_PATH = originalPath;
    if (originalStorageRoot === undefined) delete process.env.LOCAL_STORAGE_ROOT; else process.env.LOCAL_STORAGE_ROOT = originalStorageRoot;
    await fs.rm(dir, { recursive: true, force: true });
  });
}

test("uploadMedia rejects an invalid file and cleans up its temp file", async (t) => {
  await withInitializedRuntime(t);
  const tempPath = writeTempFixture(Buffer.from("not a real image"));
  await assert.rejects(() => uploadMedia({
    tempFilePath: tempPath, originalFilename: "fake.png", mimeType: "image/png", fields: {}, actor: "test",
  }), ContentValidationError);
  assert.equal(fsSync.existsSync(tempPath), false, "the temp file must be removed on a signature-validation failure");
});

test("uploadMedia never defaults rightsStatus to 'cleared' — Section 9's rights gate", async (t) => {
  await withInitializedRuntime(t);
  const { entity } = await uploadMedia({ tempFilePath: writeTempFixture(REAL_PNG), originalFilename: "a.png", mimeType: "image/png", fields: {}, actor: "test" });
  assert.equal(entity.rightsStatus, "unknown");
});

test("uploadMedia honors an explicit rightsStatus, storageDriver, checksum, and originalFilename", async (t) => {
  await withInitializedRuntime(t);
  const { entity } = await uploadMedia({
    tempFilePath: writeTempFixture(REAL_PNG), originalFilename: "photo.png", mimeType: "image/png",
    fields: { rightsStatus: "cleared", source: "Test", author: "A", license: "CC0" }, actor: "test",
  });
  assert.equal(entity.rightsStatus, "cleared");
  assert.equal(entity.storageDriver, "local");
  assert.equal(entity.originalFilename, "photo.png");
  assert.equal(entity.checksum.length, 64);
  assert.ok(getMediaStorage().exists({ storageKey: entity.originalStoragePath, mediaType: "image" }));
});

test("a second upload of byte-identical content is detected as a duplicate, reuses the existing record, and its own temp file is removed rather than finalized a second time", async (t) => {
  await withInitializedRuntime(t);
  const first = await uploadMedia({ tempFilePath: writeTempFixture(REAL_PNG), originalFilename: "a.png", mimeType: "image/png", fields: {}, actor: "test" });
  const secondTempPath = writeTempFixture(REAL_PNG);
  const second = await uploadMedia({ tempFilePath: secondTempPath, originalFilename: "b.png", mimeType: "image/png", fields: {}, actor: "test" });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.entity.id, first.entity.id);
  assert.equal(fsSync.existsSync(secondTempPath), false, "a duplicate's temp file must be removed, never finalized as a second copy");
  assert.equal(getMediaStorage().buildManifest().filter((f) => f.subdir === "images").length, 1, "exactly one physical image file must exist for this checksum");
});

test("a rejected upload never leaves an orphan file on disk", async (t) => {
  await withInitializedRuntime(t);
  // A validly-signatured PNG whose mediaRole is invalid trips schema validation AFTER the file is already finalized —
  // confirms the service cleans up the just-written file rather than leaking it.
  const tempPath = writeTempFixture(REAL_PNG);
  await assert.rejects(() => uploadMedia({
    tempFilePath: tempPath, originalFilename: "a.png", mimeType: "image/png", fields: { mediaRole: "not-a-real-role" }, actor: "test",
  }), ContentValidationError);
  const manifest = getMediaStorage().buildManifest();
  assert.equal(manifest.length, 0, "the invalid upload must not leave a file behind");
});

test("a DB failure after the file is finalized is cleaned up rather than left orphaned", async (t) => {
  await withInitializedRuntime(t);
  const tempPath = writeTempFixture(REAL_PNG);
  // A genuine DB-layer failure (rather than a mock): `PRAGMA query_only =
  // ON` makes the real connection reject the write while the duplicate-
  // check SELECT still succeeds, so this genuinely fails AFTER
  // finalizeFromTemp() has already moved the file into permanent storage —
  // see backend/test/media/mediaFailureCleanup.test.js for the fuller
  // audit (all 5 storage subdirectories + DB row count) of this and the
  // other failure paths, including one this exact distinction uncovered:
  // a DB failure during the duplicate-check read itself (i.e. BEFORE
  // finalize) used to be able to leak a temp file — fixed in
  // mediaUploadService.js's single try/catch around the whole
  // duplicate-check-through-insert sequence.
  const { getSqlite } = await import("../../db/sqliteConnection.js");
  getSqlite().pragma("query_only = ON");
  await assert.rejects(() => uploadMedia({
    tempFilePath: tempPath, originalFilename: "a.png", mimeType: "image/png", fields: { rightsStatus: "cleared" }, actor: "test",
  }), /readonly|read-only/i);
  assert.equal(getMediaStorage().buildManifest().length, 0, "a DB failure after finalization must not leave the finalized file(s) behind");
  getSqlite().pragma("query_only = OFF");
});

test("editMediaMetadata updates rights/credit fields but never the file itself, and rejects a nonexistent id", async (t) => {
  await withInitializedRuntime(t);
  const { entity } = await uploadMedia({ tempFilePath: writeTempFixture(REAL_PNG), originalFilename: "a.png", mimeType: "image/png", fields: {}, actor: "test" });
  const updated = editMediaMetadata({ id: entity.id, fields: { rightsStatus: "cleared", license: "CC BY 4.0" }, actor: "test" });
  assert.equal(updated.rightsStatus, "cleared");
  assert.equal(updated.license, "CC BY 4.0");
  assert.equal(updated.originalStoragePath, entity.originalStoragePath);

  assert.throws(() => editMediaMetadata({ id: "does-not-exist", fields: { rightsStatus: "cleared" }, actor: "test" }), ContentNotFoundError);
});
