import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { ARCHIVE_CATEGORIES } from "../../dataModel.js";
import { initializeDataStore } from "../../dataStore.js";
import { getArchive } from "../../archiveController.js";

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("GET /api/archive contract is unchanged after the v2 foundation is added", async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-v1-compat-"));
  const archivePath = path.join(temporaryDirectory, "archive.json");
  const submissionsPath = path.join(temporaryDirectory, "submissions.json");

  const archive = Object.fromEntries(ARCHIVE_CATEGORIES.map((category) => [category, []]));
  archive.history.push({
    id: "h1",
    slug: "sample-history-record",
    entityType: "historicalContext",
    title: { en: "Sample" },
  });
  await fs.writeFile(archivePath, JSON.stringify(archive), "utf8");
  await fs.writeFile(submissionsPath, "[]", "utf8");

  const originalDataStore = process.env.DATA_STORE;
  const originalArchivePath = process.env.ARCHIVE_JSON_PATH;
  const originalSubmissionsPath = process.env.SUBMISSIONS_JSON_PATH;

  process.env.DATA_STORE = "file";
  process.env.ARCHIVE_JSON_PATH = archivePath;
  process.env.SUBMISSIONS_JSON_PATH = submissionsPath;

  context.after(async () => {
    restoreEnvironment("DATA_STORE", originalDataStore);
    restoreEnvironment("ARCHIVE_JSON_PATH", originalArchivePath);
    restoreEnvironment("SUBMISSIONS_JSON_PATH", originalSubmissionsPath);
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  await initializeDataStore();

  const response = responseRecorder();
  await getArchive({}, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(Object.keys(response.body).sort(), ["data", "success"]);
  assert.equal(response.body.success, true);
  assert.deepEqual(Object.keys(response.body.data), ARCHIVE_CATEGORIES);
  assert.deepEqual(response.body.data, archive);
  assert.equal(
    ARCHIVE_CATEGORIES.reduce((total, category) => total + response.body.data[category].length, 0),
    1,
  );
});
