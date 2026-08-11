import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { ARCHIVE_CATEGORIES } from "../dataModel.js";
import { fileStore } from "../stores/fileStore.js";

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("file store preserves archive and submission operations", async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-file-store-"));
  const archivePath = path.join(temporaryDirectory, "archive.json");
  const submissionsPath = path.join(temporaryDirectory, "submissions.json");
  const originalArchivePath = process.env.ARCHIVE_JSON_PATH;
  const originalSubmissionsPath = process.env.SUBMISSIONS_JSON_PATH;

  context.after(async () => {
    restoreEnvironment("ARCHIVE_JSON_PATH", originalArchivePath);
    restoreEnvironment("SUBMISSIONS_JSON_PATH", originalSubmissionsPath);
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  process.env.ARCHIVE_JSON_PATH = archivePath;
  process.env.SUBMISSIONS_JSON_PATH = submissionsPath;

  const archive = Object.fromEntries(ARCHIVE_CATEGORIES.map((category) => [category, []]));
  archive.history.push({ id: "history-1", categoryKey: "history", title: { en: "Test" } });
  await fs.writeFile(archivePath, JSON.stringify(archive), "utf8");
  await fs.writeFile(submissionsPath, "[]", "utf8");

  assert.deepEqual(await fileStore.getArchive(), archive);

  archive.gallery.push({ id: "gallery-1", categoryKey: "gallery", src: "https://example.test/image.jpg" });
  await fileStore.updateArchive(archive);
  assert.deepEqual(await fileStore.getArchive(), archive);

  const created = await fileStore.addSubmission({
    name: " Test Visitor ",
    email: "VISITOR@EXAMPLE.TEST",
    message: " Test message ",
  });
  assert.equal(created.name, "Test Visitor");
  assert.equal(created.email, "visitor@example.test");
  assert.match(created.createdAt, /^\d{4}-\d{2}-\d{2}T/);

  const submissions = await fileStore.getSubmissions();
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].id, created.id);
  assert.equal(await fileStore.deleteSubmission(created.id), true);
  assert.deepEqual(await fileStore.getSubmissions(), []);
  assert.equal(await fileStore.deleteSubmission(created.id), false);
});
