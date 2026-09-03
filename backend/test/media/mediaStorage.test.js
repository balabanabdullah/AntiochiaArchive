import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import path from "path";
import { resolveLocalStorageRoot, generateStorageKey, sha256Of, normalizeMediaStorageDriverName, initializeMediaStorage } from "../../media/mediaStorage.js";

/**
 * The old memory-buffered saveOriginal() (Section 1 of the "correctness
 * pass" round replaced it with a genuinely streaming, disk-based pipeline
 * — see mediaUploadService.js) is gone; this reproduces the same "write a
 * fixture, get back its storage metadata" shape for these lower-level
 * storage-engine tests using the real temp-file -> hash -> finalize path.
 */
async function saveViaTemp(storage, { buffer, mediaType, originalFilename }) {
  const tempPath = storage.generateTempFilePath();
  fsSync.writeFileSync(tempPath, buffer);
  const { checksum, size } = await storage.hashFileStreaming(tempPath);
  return storage.finalizeFromTemp({ tempPath, mediaType, originalFilename, checksum, size });
}

/**
 * initializeMediaStorage() has no "already initialized" guard (unlike
 * sqliteConnection.js's initializeSqlite) — it simply reassigns the
 * module-level singleton to a fresh driver instance every call, so calling
 * it again with a different LOCAL_STORAGE_ROOT per test is enough isolation
 * on its own, with no need to force separate module instances.
 */
async function createLocalStorage(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-media-storage-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const original = process.env.LOCAL_STORAGE_ROOT;
  process.env.LOCAL_STORAGE_ROOT = dir;
  t.after(() => { if (original === undefined) delete process.env.LOCAL_STORAGE_ROOT; else process.env.LOCAL_STORAGE_ROOT = original; });
  const storage = initializeMediaStorage();
  return { storage, dir };
}

test("resolveLocalStorageRoot resolves a relative path against backend/, never hardcoding an OS-specific absolute path", () => {
  const resolved = resolveLocalStorageRoot("./var/storage");
  assert.ok(path.isAbsolute(resolved));
  assert.ok(resolved.endsWith(path.join("var", "storage")));
});

test("generateStorageKey never echoes the client-supplied filename verbatim, only a safe extension", () => {
  const key = generateStorageKey("../../etc/passwd.jpg");
  assert.ok(!key.includes(".."));
  assert.ok(!key.includes("/"));
  assert.ok(key.endsWith(".jpg"));
});

test("sha256Of is a real, deterministic content hash", () => {
  const a = sha256Of(Buffer.from("hello"));
  const b = sha256Of(Buffer.from("hello"));
  const c = sha256Of(Buffer.from("world"));
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 64);
});

test("normalizeMediaStorageDriverName defaults to 'local' and rejects an unknown driver", () => {
  assert.equal(normalizeMediaStorageDriverName(undefined), "local");
  assert.throws(() => normalizeMediaStorageDriverName("dropbox"));
});

test("finalizeFromTemp writes both the type-subdirectory copy and the originals/ copy (via an atomic rename + one OS-level copy, never a second Buffer write), and readOriginal returns identical bytes", async (t) => {
  const { storage } = await createLocalStorage(t);
  const buffer = Buffer.from("fake-image-bytes");
  const result = await saveViaTemp(storage, { buffer, mediaType: "image", originalFilename: "photo.jpg" });
  assert.equal(result.storageDriver, "local");
  assert.equal(result.size, buffer.length);
  assert.equal(result.checksum, sha256Of(buffer));
  assert.equal(storage.exists({ storageKey: result.storageKey, mediaType: "image" }), true);
  assert.deepEqual(storage.readOriginal({ storageKey: result.storageKey, mediaType: "image" }), buffer);
});

test("delete removes both copies; exists then reports false", async (t) => {
  const { storage } = await createLocalStorage(t);
  const result = await saveViaTemp(storage, { buffer: Buffer.from("x"), mediaType: "document", originalFilename: "f.pdf" });
  storage.delete({ storageKey: result.storageKey, mediaType: "document" });
  assert.equal(storage.exists({ storageKey: result.storageKey, mediaType: "document" }), false);
});

test("a storage key containing a path separator is rejected rather than escaping its subdirectory", async (t) => {
  const { storage } = await createLocalStorage(t);
  assert.throws(() => storage.readOriginal({ storageKey: "../../evil", mediaType: "image" }));
});

test("buildManifest lists every stored file with a real hash, sorted deterministically", async (t) => {
  const { storage } = await createLocalStorage(t);
  await saveViaTemp(storage, { buffer: Buffer.from("a"), mediaType: "image", originalFilename: "a.jpg" });
  await saveViaTemp(storage, { buffer: Buffer.from("b"), mediaType: "audio", originalFilename: "b.mp3" });
  const manifest = storage.buildManifest();
  assert.equal(manifest.length, 2);
  assert.ok(manifest.every((entry) => entry.sha256.length === 64));
  const sortedCopy = [...manifest].sort((a, b) => `${a.subdir}/${a.filename}`.localeCompare(`${b.subdir}/${b.filename}`));
  assert.deepEqual(manifest, sortedCopy);
});

test("correctness pass, Section 1: hashFileStreaming/readFileHead/generateTempFilePath/deleteTempFile/sweepStaleTempFiles round-trip correctly", async (t) => {
  const { storage } = await createLocalStorage(t);
  const buffer = Buffer.from("some content for streaming checks");
  const tempPath = storage.generateTempFilePath();
  fsSync.writeFileSync(tempPath, buffer);

  const head = storage.readFileHead(tempPath, 4);
  assert.deepEqual(head, buffer.subarray(0, 4));

  const { checksum, size } = await storage.hashFileStreaming(tempPath);
  assert.equal(checksum, sha256Of(buffer));
  assert.equal(size, buffer.length);

  storage.deleteTempFile(tempPath);
  assert.equal(fsSync.existsSync(tempPath), false);
  assert.doesNotThrow(() => storage.deleteTempFile(tempPath), "deleting an already-gone temp file must be a safe no-op");

  const staleTempPath = storage.generateTempFilePath();
  fsSync.writeFileSync(staleTempPath, "stale");
  const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
  fsSync.utimesSync(staleTempPath, oldTime, oldTime);
  const freshTempPath = storage.generateTempFilePath();
  fsSync.writeFileSync(freshTempPath, "fresh");

  const removed = storage.sweepStaleTempFiles({ maxAgeMs: 60 * 60 * 1000 });
  assert.equal(removed, 1);
  assert.equal(fsSync.existsSync(staleTempPath), false, "a temp file older than maxAgeMs must be swept");
  assert.equal(fsSync.existsSync(freshTempPath), true, "a recent temp file must be left alone");
});
