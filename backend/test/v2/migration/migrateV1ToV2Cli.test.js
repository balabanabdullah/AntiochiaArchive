import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import fs from "fs/promises";
import crypto from "crypto";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(__dirname, "../../..");
const repositoryRoot = path.resolve(backendDirectory, "..");
const scriptPath = path.join(backendDirectory, "scripts", "migrate-v1-to-v2.js");
const archivePath = path.join(repositoryRoot, "data", "archive.json");

async function sha256(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function runCli(args, options = {}) {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], {
      cwd: repositoryRoot,
      encoding: "utf-8",
      ...options,
    });
    return { status: 0, stdout };
  } catch (error) {
    return { status: error.status, stdout: error.stdout, stderr: error.stderr };
  }
}

test("dry run (no args) reports 23 input/mapped records and zero Firestore writes, and leaves data/archive.json untouched", async () => {
  const hashBefore = await sha256(archivePath);
  const result = runCli([]);
  const hashAfter = await sha256(archivePath);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /INPUT RECORDS: 23/);
  assert.match(result.stdout, /MAPPED RECORDS: 23/);
  assert.match(result.stdout, /FIRESTORE WRITES: 0/);
  assert.match(result.stdout, /CLOUD STORAGE RESOURCES CREATED: 0/);
  assert.match(result.stdout, /Validation: PASSED/);
  assert.equal(hashAfter, hashBefore);
});

test("--apply is explicitly rejected with a clear message and performs no reads or writes", async () => {
  const hashBefore = await sha256(archivePath);
  const result = runCli(["--apply"]);
  const hashAfter = await sha256(archivePath);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--apply is not implemented/);
  assert.doesNotMatch(result.stdout || "", /INPUT RECORDS/);
  assert.equal(hashAfter, hashBefore);
});

test("an unknown flag is rejected", () => {
  const result = runCli(["--bogus-flag"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown option: --bogus-flag/);
});

test("--output writes a preview JSON file outside data/archive.json without modifying it", async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-v2-migration-"));
  const outputPath = path.join(temporaryDirectory, "v2-preview.json");
  context.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }));

  const hashBefore = await sha256(archivePath);
  const result = runCli(["--output", outputPath]);
  const hashAfter = await sha256(archivePath);

  assert.equal(result.status, 0);
  assert.equal(hashAfter, hashBefore);

  const written = JSON.parse(await fs.readFile(outputPath, "utf-8"));
  assert.equal(written.inputCount, 23);
  assert.equal(written.mappedCount, 23);
  assert.equal(written.entities.length, 23);
});

test("--output refuses to overwrite an existing file without --force", async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-v2-migration-"));
  const outputPath = path.join(temporaryDirectory, "v2-preview.json");
  await fs.writeFile(outputPath, "{}", "utf-8");
  context.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }));

  const result = runCli(["--output", outputPath]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /already exists/);
});

test("--output rejects pointing at data/archive.json", () => {
  const result = runCli(["--output", archivePath]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not point at data\/archive\.json/);
});
