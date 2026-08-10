import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { sendContributionMail } from "./mailer.js";
import { getArchive, updateArchive } from "./archiveController.js";
import { getSubmissions, addSubmissionToStore, deleteSubmission } from "./submissionsController.js";
import { requireAdmin } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:8080",
  "http://localhost:5173",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:5173",
].filter(Boolean);

app.disable("x-powered-by");
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("CORS origin not allowed."));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "64kb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "AntiochiaArchive Backend", timestamp: new Date() });
});

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase());
}

const contributionAttempts = new Map();
function contributionRateLimit(req, res, next) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const key = req.ip || "unknown";
  const recent = (contributionAttempts.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= 5) {
    return res.status(429).json({ success: false, error: "Too many contribution attempts. Please try again later." });
  }
  recent.push(now);
  contributionAttempts.set(key, recent);
  next();
}

app.get("/api/archive", getArchive);
app.put("/api/archive", requireAdmin, updateArchive);

app.get("/api/submissions", requireAdmin, getSubmissions);
app.delete("/api/submissions/:id", requireAdmin, deleteSubmission);

app.get("/api/contribute", (_req, res) => {
  res.json({ status: "active", endpoint: "POST /api/contribute" });
});

app.post("/api/contribute", contributionRateLimit, async (req, res) => {
  try {
    const { name, email, message } = req.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, error: "Name field is required." });
    }
    if (name.trim().length > 120) {
      return res.status(400).json({ success: false, error: "Name must not exceed 120 characters." });
    }
    if (!email || typeof email !== "string" || email.length > 254 || !isValidEmail(email)) {
      return res.status(400).json({ success: false, error: "A valid email address is required." });
    }
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ success: false, error: "Contribution message is required." });
    }
    if (message.trim().length > 5000) {
      return res.status(400).json({ success: false, error: "Contribution message must not exceed 5000 characters." });
    }

    const contribution = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      message: message.trim(),
    };

    // Persistence is authoritative: never report success if the record was not saved.
    await addSubmissionToStore(contribution);

    let mailStatus = "failed";
    try {
      const mailResult = await sendContributionMail(contribution);
      mailStatus = mailResult.status;
    } catch (mailError) {
      console.error("[Mailer] Notification delivery failed:", mailError.message);
    }

    return res.status(201).json({
      status: "saved",
      success: true,
      saved: true,
      mail: { status: mailStatus },
      message: mailStatus === "failed"
        ? "Contribution saved, but notification email could not be delivered."
        : "Contribution saved successfully.",
    });
  } catch (err) {
    console.error("[Backend] Contribution persistence failed:", err.message);
    return res.status(500).json({
      status: "error",
      success: false,
      saved: false,
      error: "The contribution could not be saved. Please try again later.",
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

app.use((err, _req, res, _next) => {
  console.error("[Backend] Request error:", err.message);
  res.status(500).json({ success: false, error: "Request could not be processed." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AntiochiaArchive backend listening on port ${PORT}`);
});
