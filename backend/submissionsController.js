import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const submissionsFilePath = path.resolve(__dirname, "../public/submissions.json");

/**
 * Helper to safely read submissions array from JSON file.
 */
async function readSubmissionsFile() {
  try {
    const raw = await fs.readFile(submissionsFilePath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === "ENOENT") {
      return [];
    }
    console.error("[SubmissionsController] Read error:", err.message);
    throw err;
  }
}

/**
 * Helper to safely write submissions array to JSON file.
 */
async function writeSubmissionsFile(data) {
  const formatted = JSON.stringify(data, null, 2);
  await fs.writeFile(submissionsFilePath, formatted, "utf-8");
}

/**
 * GET /api/submissions — Fetch all visitor contributions
 */
export async function getSubmissions(_req, res) {
  try {
    const list = await readSubmissionsFile();
    return res.status(200).json({
      success: true,
      data: list,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: "Could not read visitor submissions data.",
    });
  }
}

/**
 * Programmatic helper called when a new contribution is POSTed to /api/contribute
 */
export async function addSubmissionToStore({ name, email, message }) {
  try {
    const list = await readSubmissionsFile();
    const newEntry = {
      id: `sub-${Date.now()}`,
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      message: String(message).trim(),
      createdAt: new Date().toISOString(),
    };
    list.unshift(newEntry); // Latest submissions first
    await writeSubmissionsFile(list);
    return newEntry;
  } catch (err) {
    console.error("[SubmissionsController] Error appending new submission:", err.message);
    return null;
  }
}

/**
 * DELETE /api/submissions/:id — Delete a visitor contribution by ID
 */
export async function deleteSubmission(req, res) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: "Submission ID is required." });
    }

    const list = await readSubmissionsFile();
    const filtered = list.filter((item) => String(item.id) !== String(id));

    if (filtered.length === list.length) {
      return res.status(404).json({ success: false, error: "Submission not found." });
    }

    await writeSubmissionsFile(filtered);
    console.log(`[Backend] ✓ Submission '${id}' deleted successfully.`);

    return res.status(200).json({
      success: true,
      message: "Submission deleted successfully.",
    });
  } catch (err) {
    console.error("[SubmissionsController] Delete error:", err.message);
    return res.status(500).json({
      success: false,
      error: "Failed to delete submission.",
    });
  }
}
