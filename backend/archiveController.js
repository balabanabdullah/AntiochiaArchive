import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Filesystem JSON is temporary local/development persistence, not durable Cloud Run storage.
function getArchiveFilePath() {
  return process.env.ARCHIVE_JSON_PATH
    ? path.resolve(process.env.ARCHIVE_JSON_PATH)
    : path.resolve(__dirname, "../public/archive.json");
}

/**
 * GET /api/archive — Fetch current archive.json contents
 */
export async function getArchive(_req, res) {
  try {
    const archiveFilePath = getArchiveFilePath();
    const fileData = await fs.readFile(archiveFilePath, "utf-8");
    const json = JSON.parse(fileData);
    return res.status(200).json({
      success: true,
      data: json,
    });
  } catch (err) {
    console.error("[Backend Error] Error reading archive.json:", err.message);
    return res.status(500).json({
      success: false,
      error: "Could not read archive data file.",
    });
  }
}

/**
 * PUT /api/archive — Update archive.json with new content
 */
export async function updateArchive(req, res) {
  try {
    const archiveFilePath = getArchiveFilePath();
    const newArchiveData = req.body;

    if (!newArchiveData || typeof newArchiveData !== "object") {
      return res.status(400).json({
        success: false,
        error: "Invalid payload provided. Body must be a JSON object.",
      });
    }

    // Basic structure validation: ensure expected arrays exist
    const requiredKeys = ["history", "stories", "structures", "beliefs", "music", "gallery"];
    for (const key of requiredKeys) {
      if (!Array.isArray(newArchiveData[key])) {
        return res.status(400).json({
          success: false,
          error: `Invalid archive structure: '${key}' must be an array.`,
        });
      }
    }

    // Format JSON with 2 spaces indent and write to public/archive.json
    const formattedJson = JSON.stringify(newArchiveData, null, 2);
    const temporaryPath = `${archiveFilePath}.tmp`;
    await fs.writeFile(temporaryPath, formattedJson, "utf-8");
    await fs.rename(temporaryPath, archiveFilePath);

    console.log(`[Backend] ✓ archive.json successfully updated at ${new Date().toISOString()}`);

    return res.status(200).json({
      success: true,
      message: "Archive data successfully updated.",
    });
  } catch (err) {
    console.error("[Backend Error] Error writing archive.json:", err.message);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to update archive data file.",
    });
  }
}
