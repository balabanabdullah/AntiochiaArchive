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

test("default file mode reads the private data/archive.json seed", async (context) => {
  const originalArchivePath = process.env.ARCHIVE_JSON_PATH;
  delete process.env.ARCHIVE_JSON_PATH;
  context.after(() => restoreEnvironment("ARCHIVE_JSON_PATH", originalArchivePath));

  const archive = await fileStore.getArchive();
  assert.deepEqual(Object.keys(archive), ARCHIVE_CATEGORIES);
  assert.equal(
    ARCHIVE_CATEGORIES.reduce((total, category) => total + archive[category].length, 0),
    23,
  );
});

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

  const provenance = {
    sources: [{
      id: "source-file-round-trip",
      type: "archive",
      title: "Catalog record",
      url: "https://archive.example.test/catalog/1",
    }],
    imageMetadata: {
      alt: { tr: "Arşiv görseli", en: "Archive image", ar: "صورة أرشيفية" },
      caption: { en: "Verified caption" },
      source: "Example Archive",
      license: "CC BY 4.0",
      originalUrl: "https://archive.example.test/image/1",
      aiGenerated: false,
    },
  };
  archive.gallery.push({
    id: "gallery-1",
    categoryKey: "gallery",
    src: "https://example.test/image.jpg",
    ...provenance,
  });
  await fileStore.updateArchive(archive);
  const roundTrippedArchive = await fileStore.getArchive();
  assert.deepEqual(roundTrippedArchive, archive);
  assert.deepEqual(roundTrippedArchive.gallery[0].sources, provenance.sources);
  assert.deepEqual(roundTrippedArchive.gallery[0].imageMetadata, provenance.imageMetadata);

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
