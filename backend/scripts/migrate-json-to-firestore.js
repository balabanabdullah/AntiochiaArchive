import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Timestamp } from "@google-cloud/firestore";
import { initializeFirestore } from "../firestore.js";
import {
  ARCHIVE_CATEGORIES,
  assertValidArchive,
  normalizeCreatedAt,
  validateSubmissionRecord,
} from "../dataModel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(backendDirectory, "..");
dotenv.config({ path: path.join(backendDirectory, ".env") });

const flags = new Set(process.argv.slice(2));
const dryRun = flags.has("--dry-run");
const apply = flags.has("--apply");
const forceArchive = flags.has("--force");
const knownFlags = new Set(["--dry-run", "--apply", "--force"]);

function validateOptions() {
  for (const flag of flags) {
    if (!knownFlags.has(flag)) throw new Error(`Unknown option: ${flag}`);
  }

  if (dryRun === apply) {
    throw new Error("Choose exactly one migration mode: --dry-run or --apply.");
  }

  if (forceArchive && !apply) {
    throw new Error("--force may only be used together with --apply.");
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf-8"));
}

function validateSubmissions(submissions) {
  if (!Array.isArray(submissions)) throw new TypeError("data/submissions.json must contain an array.");
  for (const [index, submission] of submissions.entries()) {
    const validation = validateSubmissionRecord(submission);
    if (!validation.valid) {
      throw new TypeError(`Invalid submission at index ${index}: ${validation.error}`);
    }
  }
  return submissions;
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function findExistingSubmissionIds(database, submissions) {
  const existing = new Set();
  for (const group of chunk(submissions, 400)) {
    const references = group.map(({ id }) => database.collection("submissions").doc(id));
    const snapshots = references.length ? await database.getAll(...references) : [];
    snapshots.filter((snapshot) => snapshot.exists).forEach((snapshot) => existing.add(snapshot.id));
  }
  return existing;
}

async function migrate() {
  validateOptions();
  const archivePath = path.join(repositoryRoot, "data", "archive.json");
  const submissionsPath = path.join(repositoryRoot, "data", "submissions.json");
  const archive = assertValidArchive(await readJson(archivePath));
  const submissions = validateSubmissions(await readJson(submissionsPath));
  const targetProject = String(process.env.GOOGLE_CLOUD_PROJECT || "").trim();

  const archiveRecordCount = ARCHIVE_CATEGORIES.reduce((total, category) => total + archive[category].length, 0);
  console.log(
    `Validated ${ARCHIVE_CATEGORIES.length} archive categories, `
    + `${archiveRecordCount} archive records, and ${submissions.length} submissions.`,
  );
  console.log(`Migration mode: ${dryRun ? "dry-run" : "apply"}`);
  console.log(`Target project: ${targetProject || "not configured (not required for dry-run)"}`);
  console.log("Target Firestore database: (default)");
  if (dryRun) {
    console.log("Dry run complete. Firestore was not initialized and no data was written.");
    return;
  }

  const database = initializeFirestore();
  const archiveReferences = ARCHIVE_CATEGORIES.map((category) => database.collection("archive").doc(category));
  const archiveSnapshots = await database.getAll(...archiveReferences);
  const existingArchiveDocuments = archiveSnapshots.filter((snapshot) => snapshot.exists).map(({ id }) => id);

  if (existingArchiveDocuments.length && !forceArchive) {
    throw new Error(
      `Archive documents already exist (${existingArchiveDocuments.join(", ")}). `
      + "Re-run with --force only after confirming they should be replaced.",
    );
  }

  const archiveBatch = database.batch();
  ARCHIVE_CATEGORIES.forEach((category, index) => {
    archiveBatch.set(archiveReferences[index], { items: archive[category] });
  });
  await archiveBatch.commit();

  const existingSubmissionIds = await findExistingSubmissionIds(database, submissions);
  const pendingSubmissions = submissions.filter(({ id }) => !existingSubmissionIds.has(id));

  for (const group of chunk(pendingSubmissions, 450)) {
    const batch = database.batch();
    for (const submission of group) {
      const reference = database.collection("submissions").doc(submission.id);
      batch.create(reference, {
        name: submission.name,
        email: submission.email,
        message: submission.message,
        createdAt: Timestamp.fromDate(new Date(normalizeCreatedAt(submission.createdAt))),
      });
    }
    await batch.commit();
  }

  console.log(`Migrated ${ARCHIVE_CATEGORIES.length} archive documents.`);
  console.log(`Migrated ${pendingSubmissions.length} submissions; skipped ${existingSubmissionIds.size} existing IDs.`);
}

migrate().catch((error) => {
  console.error(`[Migration] ${error.message}`);
  process.exitCode = 1;
});
