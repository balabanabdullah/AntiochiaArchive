// "release-blocker" round, Sections 9-10: an explicit, comprehensive audit
// of every upload failure path — checking ALL FIVE storage subdirectories
// (temp/images/audio/documents/originals), not just temp/, and the actual
// database row count, not merely "the function threw." This is stricter
// than the "correctness pass" round's own cleanup tests, which asserted
// only via mediaStorage.buildManifest() — a function that (by design, see
// mediaStorage.js's ALL_SUBDIRS) never scans temp/ or originals/ at all, so
// it could not have caught an originals/ copy left behind by a bug in
// delete(). Reading every directory directly here closes that gap.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import path from "path";
import { closeSqlite, getSqlite } from "../../db/sqliteConnection.js";
import { sqliteV2Store } from "../../v2/stores/sqliteV2Store.js";
import { uploadMedia } from "../../admin/mediaUploadService.js";
import { ContentValidationError } from "../../admin/contentService.js";
import { getMediaStorage } from "../../media/mediaStorage.js";
import { allEntitiesRaw } from "../../db/repositories/entityRepository.js";

const REAL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

let storageRoot;

async function withInitializedRuntime(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-media-cleanup-"));
  const originalPath = process.env.SQLITE_DB_PATH;
  const originalStorageRoot = process.env.LOCAL_STORAGE_ROOT;
  process.env.SQLITE_DB_PATH = path.join(dir, "test.db");
  process.env.LOCAL_STORAGE_ROOT = path.join(dir, "storage");
  storageRoot = process.env.LOCAL_STORAGE_ROOT;
  await sqliteV2Store.initialize();
  t.after(async () => {
    closeSqlite();
    if (originalPath === undefined) delete process.env.SQLITE_DB_PATH; else process.env.SQLITE_DB_PATH = originalPath;
    if (originalStorageRoot === undefined) delete process.env.LOCAL_STORAGE_ROOT; else process.env.LOCAL_STORAGE_ROOT = originalStorageRoot;
    await fs.rm(dir, { recursive: true, force: true });
  });
}

function writeTempFixture(buffer) {
  const tempPath = getMediaStorage().generateTempFilePath();
  fsSync.writeFileSync(tempPath, buffer);
  return tempPath;
}

/** Directly reads every one of the 5 real storage subdirectories — deliberately NOT via buildManifest(), which only ever scans images/audio/documents (see mediaStorage.js's ALL_SUBDIRS). */
function allStorageArtifacts() {
  const dirs = ["temp", "images", "audio", "documents", "originals"];
  const result = {};
  for (const dir of dirs) {
    const dirPath = path.join(storageRoot, dir);
    result[dir] = fsSync.existsSync(dirPath) ? fsSync.readdirSync(dirPath) : [];
  }
  return result;
}

function assertAllArtifactsAbsent(message) {
  const artifacts = allStorageArtifacts();
  for (const [dir, files] of Object.entries(artifacts)) {
    assert.equal(files.length, 0, `${message}: expected ${dir}/ to be empty, found [${files.join(", ")}]`);
  }
}

function mediaRowCount() {
  return allEntitiesRaw().filter((e) => e.entityType === "media").length;
}

test("Section 9: a DB INSERT failure AFTER filesystem finalization leaves temp=0, final media file=0, originals=0, AND zero DB media rows", async (t) => {
  await withInitializedRuntime(t);
  assert.equal(mediaRowCount(), 0);

  const tempPath = writeTempFixture(REAL_PNG);
  // A genuine DB-layer failure, not a mock: `PRAGMA query_only = ON` makes
  // the real connection reject any write while leaving reads (the
  // duplicate-check SELECT) working — so this exercises the exact
  // "filesystem finalize succeeded, then the DB insert genuinely failed"
  // sequence Section 9 asks for, rather than failing earlier (before
  // finalize) the way closing the whole connection would.
  getSqlite().pragma("query_only = ON");

  await assert.rejects(() => uploadMedia({
    tempFilePath: tempPath, originalFilename: "a.png", mimeType: "image/png", fields: { rightsStatus: "cleared" }, actor: "test",
  }), /readonly|read-only/i);

  assertAllArtifactsAbsent("after a DB insert failure post-finalization");
  getSqlite().pragma("query_only = OFF");
  assert.equal(mediaRowCount(), 0, "no media row may exist after a DB failure that occurred after the file was already finalized");
});

test("Section 9: a DB failure DURING the duplicate-check read (before finalization) still cleans up the temp file — a gap this round found and fixed", async (t) => {
  await withInitializedRuntime(t);
  const tempPath = writeTempFixture(REAL_PNG);
  closeSqlite(); // the duplicate-check SELECT itself now fails — before finalize ever runs

  await assert.rejects(() => uploadMedia({
    tempFilePath: tempPath, originalFilename: "a.png", mimeType: "image/png", fields: { rightsStatus: "cleared" }, actor: "test",
  }));

  assertAllArtifactsAbsent("after a DB failure during the duplicate-check read");
  await sqliteV2Store.initialize();
  assert.equal(mediaRowCount(), 0);
});

test("Section 10: an invalid signature leaves ALL five directories empty, not just temp/", async (t) => {
  await withInitializedRuntime(t);
  const tempPath = writeTempFixture(Buffer.from("not a real image"));
  await assert.rejects(() => uploadMedia({
    tempFilePath: tempPath, originalFilename: "fake.png", mimeType: "image/png", fields: {}, actor: "test",
  }), ContentValidationError);
  assertAllArtifactsAbsent("after an invalid-signature rejection");
  assert.equal(mediaRowCount(), 0);
});

test("Section 10: exceeding the size limit (checked defensively inside uploadMedia itself) leaves ALL five directories empty", async (t) => {
  await withInitializedRuntime(t);
  const original = process.env.MEDIA_UPLOAD_MAX_BYTES;
  process.env.MEDIA_UPLOAD_MAX_BYTES = "10"; // smaller than REAL_PNG
  t.after(() => { if (original === undefined) delete process.env.MEDIA_UPLOAD_MAX_BYTES; else process.env.MEDIA_UPLOAD_MAX_BYTES = original; });

  const tempPath = writeTempFixture(REAL_PNG);
  await assert.rejects(() => uploadMedia({
    tempFilePath: tempPath, originalFilename: "a.png", mimeType: "image/png", fields: {}, actor: "test",
  }), ContentValidationError);
  assertAllArtifactsAbsent("after a size-limit rejection");
  assert.equal(mediaRowCount(), 0);
});

test("Section 10: a byte-identical duplicate upload leaves the SECOND upload's temp file gone, never finalized as a second copy, and adds no second DB row", async (t) => {
  await withInitializedRuntime(t);
  const first = await uploadMedia({ tempFilePath: writeTempFixture(REAL_PNG), originalFilename: "a.png", mimeType: "image/png", fields: {}, actor: "test" });
  assert.equal(first.duplicate, false);
  assert.equal(mediaRowCount(), 1);

  const secondTemp = writeTempFixture(REAL_PNG);
  const second = await uploadMedia({ tempFilePath: secondTemp, originalFilename: "b.png", mimeType: "image/png", fields: {}, actor: "test" });
  assert.equal(second.duplicate, true);
  assert.equal(mediaRowCount(), 1, "a duplicate must never add a second DB row");

  const artifacts = allStorageArtifacts();
  assert.equal(artifacts.temp.length, 0, "the duplicate's own temp file must be removed");
  assert.equal(artifacts.images.length, 1, "exactly one physical image file — the first upload's — must exist");
  assert.equal(artifacts.originals.length, 1, "exactly one originals/ copy must exist");
});

test("Section 10: a schema failure AFTER filesystem finalization leaves ALL five directories empty and zero DB rows", async (t) => {
  await withInitializedRuntime(t);
  const tempPath = writeTempFixture(REAL_PNG);
  await assert.rejects(() => uploadMedia({
    tempFilePath: tempPath, originalFilename: "a.png", mimeType: "image/png", fields: { mediaRole: "not-a-real-role" }, actor: "test",
  }), ContentValidationError);
  assertAllArtifactsAbsent("after a schema-validation failure");
  assert.equal(mediaRowCount(), 0);
});

test("Section 10: a successful upload leaves temp=0 but exactly one file each in the correct type subdirectory AND originals/, plus exactly one DB row", async (t) => {
  await withInitializedRuntime(t);
  await uploadMedia({ tempFilePath: writeTempFixture(REAL_PNG), originalFilename: "a.png", mimeType: "image/png", fields: { rightsStatus: "cleared" }, actor: "test" });
  const artifacts = allStorageArtifacts();
  assert.equal(artifacts.temp.length, 0);
  assert.equal(artifacts.images.length, 1);
  assert.equal(artifacts.audio.length, 0);
  assert.equal(artifacts.documents.length, 0);
  assert.equal(artifacts.originals.length, 1);
  assert.equal(mediaRowCount(), 1);
});
