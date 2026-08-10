import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Filesystem JSON is temporary local/development persistence, not durable Cloud Run storage.
function getSubmissionsFilePath() {
  return process.env.SUBMISSIONS_JSON_PATH
    ? path.resolve(process.env.SUBMISSIONS_JSON_PATH)
    : path.resolve(__dirname, "../data/submissions.json");
}

let mutationQueue = Promise.resolve();

async function readSubmissionsFile() {
  try {
    const submissionsFilePath = getSubmissionsFilePath();
    const raw = await fs.readFile(submissionsFilePath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === "ENOENT") return [];
    console.error("[SubmissionsController] Read error:", err.message);
    throw err;
  }
}

async function writeSubmissionsFile(data) {
  const submissionsFilePath = getSubmissionsFilePath();
  await fs.mkdir(path.dirname(submissionsFilePath), { recursive: true });
  const temporaryPath = `${submissionsFilePath}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(temporaryPath, submissionsFilePath);
}

function enqueueMutation(operation) {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.catch(() => undefined);
  return result;
}

export async function getSubmissions(_req, res) {
  try {
    const list = await readSubmissionsFile();
    return res.status(200).json({ success: true, data: list });
  } catch (_) {
    return res.status(500).json({
      success: false,
      error: "Could not read visitor submissions data.",
    });
  }
}

export function addSubmissionToStore({ name, email, message }) {
  return enqueueMutation(async () => {
    const list = await readSubmissionsFile();
    const newEntry = {
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      message: String(message).trim(),
      createdAt: new Date().toISOString(),
    };
    list.unshift(newEntry);
    await writeSubmissionsFile(list);
    return newEntry;
  });
}

export async function deleteSubmission(req, res) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: "Submission ID is required." });
    }

    const deleted = await enqueueMutation(async () => {
      const list = await readSubmissionsFile();
      const filtered = list.filter((item) => String(item.id) !== String(id));
      if (filtered.length === list.length) return false;
      await writeSubmissionsFile(filtered);
      return true;
    });

    if (!deleted) {
      return res.status(404).json({ success: false, error: "Submission not found." });
    }

    return res.status(200).json({ success: true, message: "Submission deleted successfully." });
  } catch (err) {
    console.error("[SubmissionsController] Delete error:", err.message);
    return res.status(500).json({ success: false, error: "Failed to delete submission." });
  }
}
