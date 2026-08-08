import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { sendContributionMail } from "./mailer.js";
import { getArchive, updateArchive } from "./archiveController.js";

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 5000;

/* ── Middleware ─────────────────────────────────────────────────────────────── */
const allowedOrigins = [
  process.env.CLIENT_URL || "http://localhost:3000",
  "http://localhost:8080",   // Nginx production
  "http://localhost:5173",   // Vite dev server
  "http://localhost:5000",   // Express backend
  "http://127.0.0.1:8080",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5000",
];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, Postman) or matched origins / localhost
    if (!origin || allowedOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return cb(null, true);
    }
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ["GET", "POST", "PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "2mb" }));

/* ── Health check ───────────────────────────────────────────────────────────── */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "AntiochiaArchive Backend", timestamp: new Date() });
});

/* ── Helper: email validation ───────────────────────────────────────────────── */
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

/* ────────────────────────────────────────────────────────────────────────────
   Archive API Endpoints (GET /api/archive, PUT /api/archive)
   ──────────────────────────────────────────────────────────────────────────── */
app.get("/api/archive", getArchive);
app.put("/api/archive", updateArchive);

/* ────────────────────────────────────────────────────────────────────────────
   GET /api/contribute — Information for direct browser requests
   ──────────────────────────────────────────────────────────────────────────── */
app.get("/api/contribute", (_req, res) => {
  res.json({
    status: "active",
    message: "AntiochiaArchive Contribution API is running. Submit data using POST method with JSON body: { name, email, message }.",
    endpoint: "POST /api/contribute",
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   POST /api/contribute  — Contribution form handler
   Body: { name: string, email: string, message: string }
   ──────────────────────────────────────────────────────────────────────────── */
app.post("/api/contribute", async (req, res) => {
  try {
    const { name, email, message } = req.body || {};

    // Log incoming payload (mask email for privacy in logs)
    console.log(`[Backend] Incoming contribution — name: "${name}" email: "${email?.slice(0, 3)}***"`);

    /* ── Validation ─── */
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ status: "error", success: false, error: "Name field is required." });
    }
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ status: "error", success: false, error: "A valid email address is required." });
    }
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ status: "error", success: false, error: "Contribution message is required." });
    }

    /* ── Send notification e-mail ─── */
    const mailResult = await sendContributionMail({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      message: message.trim(),
    });

    console.log(`[Backend] ✓ Contribution processed — ${mailResult.mock ? "mock mode" : `messageId: ${mailResult.messageId}`}`);

    return res.status(200).json({
      status: "sent",
      success: true,
      message: "Yeni katkı başarıyla gönderildi.",
      result: mailResult,
    });
  } catch (err) {
    console.error("[Backend Error]", err.message);
    return res.status(500).json({
      status: "error",
      success: false,
      error: err.message || "An error occurred while sending your contribution. Please try again later.",
    });
  }
});

/* ── Backward-compat alias: /submit → /api/contribute ──────────────────────── */
app.post("/submit", (req, res) => {
  req.url = "/api/contribute";
  app.handle(req, res);
});

/* ── 404 fallback ───────────────────────────────────────────────────────────── */
app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

/* ── Start server ───────────────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`🚀 AntiochiaArchive Backend  →  http://localhost:${PORT}`);
  console.log(`   POST /api/contribute  — contribution intake endpoint`);
  console.log(`   GET  /health          — health check`);
});
