import { getDataStore } from "./dataStore.js";

export async function getSubmissions(_req, res) {
  try {
    const list = await getDataStore().getSubmissions();
    return res.status(200).json({ success: true, data: list });
  } catch (error) {
    console.error("[SubmissionsController] Read error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Could not read visitor submissions data.",
    });
  }
}

export function addSubmissionToStore(submission) {
  return getDataStore().addSubmission(submission);
}

export async function deleteSubmission(req, res) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: "Submission ID is required." });
    }

    const deleted = await getDataStore().deleteSubmission(id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: "Submission not found." });
    }

    return res.status(200).json({ success: true, message: "Submission deleted successfully." });
  } catch (error) {
    console.error("[SubmissionsController] Delete error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to delete submission." });
  }
}
