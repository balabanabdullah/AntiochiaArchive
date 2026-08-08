import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve absolute path to public/archive.json
const archiveFilePath = path.resolve(__dirname, "../public/archive.json");

/**
 * GET /api/archive — Fetch current archive.json contents
 */
export async function getArchive(_req, res) {
  try {
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
    const newArchiveData = req.body;

    if (!newArchiveData || typeof newArchiveData !== "object") {
      return res.status(400).json({
        success: false,
        error: "Invalid payload provided. Body must be a JSON object.",
      });
    }

    // Basic structure validation: ensure expected arrays exist
    const requiredKeys = ["history", "stories", "structures", "beliefs", "music"];
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
    await fs.writeFile(archiveFilePath, formattedJson, "utf-8");

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
