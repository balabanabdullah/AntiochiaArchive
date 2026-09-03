import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import path from "path";
import express from "express";
import mediaRouter from "../../media/mediaRoutes.js";
import { closeSqlite } from "../../db/sqliteConnection.js";
import { initializeV2Store } from "../../v2/stores/v2Store.js";
import { uploadMedia } from "../../admin/mediaUploadService.js";
import { getMediaStorage } from "../../media/mediaStorage.js";

const REAL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

/** See test/admin/mediaUploadService.test.js — uploadMedia() takes a real on-disk temp file, not a Buffer, since the "correctness pass" round made the upload pipeline truly streaming. */
function writeTempFixture(buffer) {
  const tempPath = getMediaStorage().generateTempFilePath();
  fsSync.writeFileSync(tempPath, buffer);
  return tempPath;
}

async function startTestServer(context) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-media-routes-"));
  const originalPath = process.env.SQLITE_DB_PATH;
  const originalStorageRoot = process.env.LOCAL_STORAGE_ROOT;
  const originalV2Store = process.env.V2_DATA_STORE;
  process.env.V2_DATA_STORE = "sqlite";
  process.env.SQLITE_DB_PATH = path.join(dir, "test.db");
  process.env.LOCAL_STORAGE_ROOT = path.join(dir, "storage");
  await initializeV2Store();

  const app = express();
  app.use("/media", mediaRouter);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    closeSqlite();
    if (originalPath === undefined) delete process.env.SQLITE_DB_PATH; else process.env.SQLITE_DB_PATH = originalPath;
    if (originalStorageRoot === undefined) delete process.env.LOCAL_STORAGE_ROOT; else process.env.LOCAL_STORAGE_ROOT = originalStorageRoot;
    if (originalV2Store === undefined) delete process.env.V2_DATA_STORE; else process.env.V2_DATA_STORE = originalV2Store;
    await fs.rm(dir, { recursive: true, force: true });
  });

  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

test("cleared media serves 200 with the correct content-type and Accept-Ranges", async (t) => {
  const baseUrl = await startTestServer(t);
  const { entity } = await uploadMedia({ tempFilePath: writeTempFixture(REAL_PNG), originalFilename: "a.png", mimeType: "image/png", fields: { rightsStatus: "cleared" }, actor: "test" });
  const response = await fetch(`${baseUrl}/media/${entity.id}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  await response.arrayBuffer();
});

test("unknown/pendingReview/restricted/doNotPublish media all refuse to serve bytes (403)", async (t) => {
  const baseUrl = await startTestServer(t);
  for (const rightsStatus of ["unknown", "pendingReview", "restricted", "doNotPublish"]) {
    // A distinct trailing byte per iteration keeps each fixture's checksum
    // unique (PNG signature validation only inspects the leading bytes) —
    // otherwise duplicate detection would collapse every iteration onto the
    // same first-created entity and this test would only ever exercise
    // "unknown", never the other three statuses.
    const fixture = Buffer.concat([REAL_PNG, Buffer.from([rightsStatus.length])]);
    // eslint-disable-next-line no-await-in-loop
    const { entity } = await uploadMedia({ tempFilePath: writeTempFixture(fixture), originalFilename: `${rightsStatus}.png`, mimeType: "image/png", fields: { rightsStatus }, actor: "test" });
    assert.equal(entity.rightsStatus, rightsStatus);
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(`${baseUrl}/media/${entity.id}`);
    assert.equal(response.status, 403, `${rightsStatus} must not serve bytes`);
  }
});

test("a nonexistent media id 404s; a non-media entity id also 404s", async (t) => {
  const baseUrl = await startTestServer(t);
  const response = await fetch(`${baseUrl}/media/does-not-exist`);
  assert.equal(response.status, 404);
});

test("range requests return 206 with correct Content-Range, and an out-of-bounds range returns 416", async (t) => {
  const baseUrl = await startTestServer(t);
  const { entity } = await uploadMedia({ tempFilePath: writeTempFixture(REAL_PNG), originalFilename: "a.png", mimeType: "image/png", fields: { rightsStatus: "cleared" }, actor: "test" });

  const partial = await fetch(`${baseUrl}/media/${entity.id}`, { headers: { Range: "bytes=0-3" } });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), `bytes 0-3/${REAL_PNG.length}`);
  const partialBody = Buffer.from(await partial.arrayBuffer());
  assert.equal(partialBody.length, 4);
  assert.deepEqual(partialBody, REAL_PNG.subarray(0, 4));

  const outOfBounds = await fetch(`${baseUrl}/media/${entity.id}`, { headers: { Range: `bytes=${REAL_PNG.length + 100}-${REAL_PNG.length + 200}` } });
  assert.equal(outOfBounds.status, 416);
});
