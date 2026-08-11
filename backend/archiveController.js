import { getDataStore } from "./dataStore.js";
import { validateArchive } from "./dataModel.js";

/** GET /api/archive - Fetch the current archive in its frontend-compatible shape. */
export async function getArchive(_req, res) {
  try {
    const archive = await getDataStore().getArchive();
    return res.status(200).json({ success: true, data: archive });
  } catch (error) {
    console.error("[ArchiveController] Read error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Could not read archive data.",
    });
  }
}

/** PUT /api/archive - Atomically replace all six archive categories. */
export async function updateArchive(req, res) {
  const validation = validateArchive(req.body);
  if (!validation.valid) {
    return res.status(400).json({ success: false, error: validation.error });
  }

  try {
    await getDataStore().updateArchive(req.body);
    console.log(`[Backend] Archive successfully updated at ${new Date().toISOString()}`);
    return res.status(200).json({
      success: true,
      message: "Archive data successfully updated.",
    });
  } catch (error) {
    console.error("[ArchiveController] Write error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to update archive data.",
    });
  }
}
