import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  assertValidArchive,
  createSubmissionId,
  normalizeCreatedAt,
  serializeSubmission,
} from "../dataModel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mutationQueue = Promise.resolve();

function getArchiveFilePath() {
  return process.env.ARCHIVE_JSON_PATH
    ? path.resolve(process.env.ARCHIVE_JSON_PATH)
    : path.resolve(__dirname, "../../data/archive.json");
}

function getSubmissionsFilePath() {
  return process.env.SUBMISSIONS_JSON_PATH
    ? path.resolve(process.env.SUBMISSIONS_JSON_PATH)
    : path.resolve(__dirname, "../../data/submissions.json");
}

async function readSubmissionsFile() {
  try {
    const raw = await fs.readFile(getSubmissionsFilePath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new TypeError("Submissions data must be an array.");
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeJsonAtomically(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(temporaryPath, filePath);
}

function enqueueMutation(operation) {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.catch(() => undefined);
  return result;
}

export const fileStore = {
  async initialize() {
    return undefined;
  },

  async getArchive() {
    const raw = await fs.readFile(getArchiveFilePath(), "utf-8");
    return assertValidArchive(JSON.parse(raw));
  },

  async updateArchive(archive) {
    assertValidArchive(archive);
    await writeJsonAtomically(getArchiveFilePath(), archive);
  },

  async getSubmissions() {
    const list = await readSubmissionsFile();
    return list
      .map((item) => serializeSubmission(item.id, item))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  },

  async addSubmission({ name, email, message }) {
    return enqueueMutation(async () => {
      const list = await readSubmissionsFile();
      const entry = {
        id: createSubmissionId(),
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        message: String(message).trim(),
        createdAt: new Date().toISOString(),
      };
      list.unshift(entry);
      await writeJsonAtomically(getSubmissionsFilePath(), list);
      return entry;
    });
  },

  async deleteSubmission(id) {
    return enqueueMutation(async () => {
      const list = await readSubmissionsFile();
      const filtered = list.filter((item) => String(item.id) !== String(id));
      if (filtered.length === list.length) return false;
      await writeJsonAtomically(getSubmissionsFilePath(), filtered);
      return true;
    });
  },
};
