import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import {
  sanitizeFilename,
  validateAudioFileMeta,
  sha256File,
  nextMediaId,
  findDuplicateByChecksum,
  buildMediaEntity,
  appendEntityToEntitiesFile,
  attachAudioToMusicEntity,
} from "../scripts/import-music-audio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const FIXTURE_AUDIO = path.resolve(__dirname, "fixtures/silent-test-tone.mp3");

/* --------------------------------------------------------------------------
   Pure helpers
   -------------------------------------------------------------------------- */

test("sanitizeFilename: strips path traversal, unsafe characters, keeps the extension", () => {
  assert.equal(sanitizeFilename("../../etc/passwd.mp3"), "passwd.mp3");
  assert.equal(sanitizeFilename("My Song (Live) — İstanbul!.mp3"), "my-song-live-i-stanbul.mp3");
  assert.equal(sanitizeFilename("normal-name.WAV"), "normal-name.wav");
  assert.equal(sanitizeFilename(""), "track");
});

test("validateAudioFileMeta: accepts every supported extension with cleared rights and a real size", () => {
  for (const ext of [".mp3", ".ogg", ".wav", ".m4a"]) {
    const result = validateAudioFileMeta({ extension: ext, size: 1024, rights: "cleared" });
    assert.equal(result.valid, true, `${ext} should be valid`);
    assert.ok(result.mimeType);
  }
});

test("validateAudioFileMeta: rejects an unsupported extension", () => {
  const result = validateAudioFileMeta({ extension: ".webm", size: 1024, rights: "cleared" });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Unsupported audio extension/);
});

test("validateAudioFileMeta: rejects a zero/negative/unknown size", () => {
  assert.equal(validateAudioFileMeta({ extension: ".mp3", size: 0, rights: "cleared" }).valid, false);
  assert.equal(validateAudioFileMeta({ extension: ".mp3", size: -5, rights: "cleared" }).valid, false);
  assert.equal(validateAudioFileMeta({ extension: ".mp3", size: undefined, rights: "cleared" }).valid, false);
});

test("validateAudioFileMeta: rejects a file over the size ceiling", () => {
  const result = validateAudioFileMeta({ extension: ".mp3", size: 999 * 1024 * 1024, rights: "cleared" });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /over the/);
});

test("validateAudioFileMeta: --rights is required and must be a real RIGHTS_STATUS value — this is the rights gate's entry point", () => {
  assert.equal(validateAudioFileMeta({ extension: ".mp3", size: 1024, rights: undefined }).valid, false);
  assert.equal(validateAudioFileMeta({ extension: ".mp3", size: 1024, rights: "" }).valid, false);
  assert.equal(validateAudioFileMeta({ extension: ".mp3", size: 1024, rights: "definitely-fine-trust-me" }).valid, false);
  assert.equal(validateAudioFileMeta({ extension: ".mp3", size: 1024, rights: "unknown" }).valid, true, "unknown is a real status — staged, not published");
});

test("sha256File: deterministic and content-sensitive", () => {
  const a = sha256File(FIXTURE_AUDIO);
  const b = sha256File(FIXTURE_AUDIO);
  assert.equal(a, b);
  assert.equal(a.length, 64);
});

test("nextMediaId: zero existing media entities -> media-0001; increments past the highest existing id", () => {
  assert.equal(nextMediaId([]), "media-0001");
  assert.equal(nextMediaId([{ entityType: "music", id: "music-0001" }]), "media-0001");
  assert.equal(
    nextMediaId([{ entityType: "media", id: "media-0001" }, { entityType: "media", id: "media-0007" }]),
    "media-0008",
  );
});

test("findDuplicateByChecksum: finds an existing media entity with the same checksum, ignores non-media entities", () => {
  const entities = [
    { entityType: "media", id: "media-0001", checksum: "abc123" },
    { entityType: "music", id: "music-0001", checksum: "abc123" },
  ];
  assert.equal(findDuplicateByChecksum(entities, "abc123")?.id, "media-0001");
  assert.equal(findDuplicateByChecksum(entities, "no-match"), null);
});

test("buildMediaEntity: cleared rights -> real public derivativeStoragePaths", () => {
  const entity = buildMediaEntity({
    id: "media-0001", safeFilename: "a1b2c3d4-track.mp3", mimeType: "audio/mpeg", size: 1024,
    checksum: "abc", rights: "cleared", credit: "Field recording, 2026", license: "CC BY-SA 4.0",
    rightsNote: undefined, duration: 163, isCleared: true,
  });
  assert.deepEqual(entity.derivativeStoragePaths, ["/media/music/a1b2c3d4-track.mp3"]);
  assert.equal(entity.rightsStatus, "cleared");
  assert.equal(entity.mediaType, "audio");
  assert.equal(entity.duration, 163);
  assert.equal(entity.source, "Field recording, 2026");
  assert.equal(entity.license, "CC BY-SA 4.0");
});

test("buildMediaEntity: non-cleared rights -> empty derivativeStoragePaths (never a servable path for staged/unresolved audio)", () => {
  for (const rights of ["unknown", "pendingReview", "restricted", "doNotPublish"]) {
    const entity = buildMediaEntity({
      id: "media-0001", safeFilename: "a1b2c3d4-track.mp3", mimeType: "audio/mpeg", size: 1024,
      checksum: "abc", rights, isCleared: false,
    });
    assert.deepEqual(entity.derivativeStoragePaths, [], `rights=${rights} must stage with no public path`);
  }
});

/* --------------------------------------------------------------------------
   File-surgery helpers, against a scratch fixture (never the real data files)
   -------------------------------------------------------------------------- */

function scratchEntitiesFile(entities) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-music-import-test-"));
  const filePath = path.join(dir, "entities.json");
  fs.writeFileSync(filePath, JSON.stringify({ entities }, null, 2));
  return filePath;
}

test("appendEntityToEntitiesFile: appends valid JSON, existing entities untouched", () => {
  const filePath = scratchEntitiesFile([{ id: "music-0001", entityType: "music", slug: "a" }]);
  appendEntityToEntitiesFile(filePath, { id: "media-0001", entityType: "media", mediaType: "audio" });
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  assert.equal(parsed.entities.length, 2);
  assert.equal(parsed.entities[0].id, "music-0001");
  assert.equal(parsed.entities[1].id, "media-0001");
});

test("appendEntityToEntitiesFile: works correctly appending twice in a row", () => {
  const filePath = scratchEntitiesFile([{ id: "music-0001", entityType: "music", slug: "a" }]);
  appendEntityToEntitiesFile(filePath, { id: "media-0001", entityType: "media" });
  appendEntityToEntitiesFile(filePath, { id: "media-0002", entityType: "media" });
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  assert.deepEqual(parsed.entities.map((e) => e.id), ["music-0001", "media-0001", "media-0002"]);
});

test("attachAudioToMusicEntity: inserts a new audioMediaIds field on an entity that has none", () => {
  const filePath = scratchEntitiesFile([
    {
      id: "music-0001", entityType: "music", slug: "a", title: { en: "A" }, status: "published", createdAt: "x", updatedAt: "x",
    },
    { id: "music-0002", entityType: "music", slug: "b", status: "draft" },
  ]);
  attachAudioToMusicEntity(filePath, "music-0001", "media-0001");
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const target = parsed.entities.find((e) => e.id === "music-0001");
  const untouched = parsed.entities.find((e) => e.id === "music-0002");
  assert.deepEqual(target.audioMediaIds, ["media-0001"]);
  assert.equal(untouched.audioMediaIds, undefined, "a same-shaped sibling entity must never be touched");
});

test("attachAudioToMusicEntity: appends to an existing audioMediaIds array without duplicating", () => {
  const filePath = scratchEntitiesFile([
    { id: "music-0001", entityType: "music", slug: "a", audioMediaIds: ["media-0001"], status: "published" },
  ]);
  attachAudioToMusicEntity(filePath, "music-0001", "media-0002");
  attachAudioToMusicEntity(filePath, "music-0001", "media-0002"); // idempotent re-run
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  assert.deepEqual(parsed.entities[0].audioMediaIds, ["media-0001", "media-0002"]);
});

/* --------------------------------------------------------------------------
   End-to-end CLI smoke test — runs entirely against a scratch copy under the
   OS temp dir, NEVER the real data/v2/entities.json. Uses the synthetic
   test/fixtures/silent-test-tone.mp3 placeholder, never real cultural audio
   (see brief: "no fake audio in production data").
   -------------------------------------------------------------------------- */

function runImportCli(args) {
  return execFileSync("node", [path.resolve(REPO_ROOT, "scripts/import-music-audio.js"), ...args], {
    cwd: REPO_ROOT, encoding: "utf-8",
  });
}

test("CLI end-to-end (scratch data only): --rights cleared copies the file, creates the media entity, and attaches it", () => {
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-music-import-cli-"));
  fs.writeFileSync(path.join(scratchDir, "entities.json"), JSON.stringify({
    entities: [{ id: "music-0001", entityType: "music", slug: "test-track", status: "published" }],
  }, null, 2));

  const output = runImportCli([
    "--music-id", "music-0001",
    "--file", FIXTURE_AUDIO,
    "--rights", "cleared",
    "--credit", "Test fixture, not real audio",
    "--data-dir", scratchDir,
  ]);
  assert.match(output, /Imported 'media-0001'/);

  const parsed = JSON.parse(fs.readFileSync(path.join(scratchDir, "entities.json"), "utf-8"));
  const media = parsed.entities.find((e) => e.id === "media-0001");
  const music = parsed.entities.find((e) => e.id === "music-0001");
  assert.equal(media.rightsStatus, "cleared");
  assert.equal(media.mimeType, "audio/mpeg");
  assert.deepEqual(music.audioMediaIds, ["media-0001"]);
  assert.equal(media.derivativeStoragePaths.length, 1);

  const publicPath = path.resolve(REPO_ROOT, "public", media.derivativeStoragePaths[0].replace(/^\//, ""));
  assert.ok(fs.existsSync(publicPath), "the cleared file must be copied into public/media/music/");
  fs.rmSync(publicPath); // cleanup — never leave a test-fixture file under public/
});

test("CLI end-to-end (scratch data only): --rights unknown stages the media entity but copies no file and attaches nothing", () => {
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-music-import-cli-"));
  fs.writeFileSync(path.join(scratchDir, "entities.json"), JSON.stringify({
    entities: [{ id: "music-0001", entityType: "music", slug: "test-track", status: "published" }],
  }, null, 2));

  const output = runImportCli([
    "--music-id", "music-0001",
    "--file", FIXTURE_AUDIO,
    "--rights", "unknown",
    "--data-dir", scratchDir,
  ]);
  assert.match(output, /Staged 'media-0001'/);

  const parsed = JSON.parse(fs.readFileSync(path.join(scratchDir, "entities.json"), "utf-8"));
  const media = parsed.entities.find((e) => e.id === "media-0001");
  const music = parsed.entities.find((e) => e.id === "music-0001");
  assert.equal(media.rightsStatus, "unknown");
  assert.deepEqual(media.derivativeStoragePaths, []);
  assert.equal(music.audioMediaIds, undefined, "an unresolved-rights import must never be wired up to the music entity");
});

test("CLI end-to-end: rejects import for a music id that does not exist", () => {
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-music-import-cli-"));
  fs.writeFileSync(path.join(scratchDir, "entities.json"), JSON.stringify({ entities: [] }, null, 2));
  assert.throws(() => runImportCli([
    "--music-id", "music-does-not-exist",
    "--file", FIXTURE_AUDIO,
    "--rights", "cleared",
    "--data-dir", scratchDir,
  ]));
});

test("CLI end-to-end: rejects a second import of the exact same file bytes (duplicate detection by checksum)", () => {
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-music-import-cli-"));
  fs.writeFileSync(path.join(scratchDir, "entities.json"), JSON.stringify({
    entities: [{ id: "music-0001", entityType: "music", slug: "test-track", status: "published" }],
  }, null, 2));
  runImportCli(["--music-id", "music-0001", "--file", FIXTURE_AUDIO, "--rights", "unknown", "--data-dir", scratchDir]);
  assert.throws(() => runImportCli(["--music-id", "music-0001", "--file", FIXTURE_AUDIO, "--rights", "unknown", "--data-dir", scratchDir]));
});
