import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { sendContributionMail } from "./mailer.js";
import { getArchive, updateArchive } from "./archiveController.js";
import { getSubmissions, addSubmissionToStore, deleteSubmission } from "./submissionsController.js";
import { getSelectedDataStoreName, initializeDataStore } from "./dataStore.js";
import { backupHandlers, preventBackupCaching } from "./backupController.js";
import v2Router from "./v2/routes/v2Routes.js";
import { initializeV2Store } from "./v2/stores/v2Store.js";
import adminEditorialRouter from "./admin/adminRoutes.js";
import adminContentRouter from "./admin/adminContentRoutes.js";
import { requireAdminAny } from "./admin/adminSession.js";
import { initializeEditorialStore, getSelectedEditorialStoreName } from "./admin/editorialStore.js";
import { publicPageJsonRouter, publicPageHtmlRouter } from "./pages/pageRoutes.js";
import v2DetailRouter from "./v2/routes/v2DetailRoutes.js";
import mediaRouter from "./media/mediaRoutes.js";
import { runtimeSitemapHandler, sitemapIndexHandler } from "./v2/render/runtimeSitemap.js";

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
  res.json({
    status: "ok",
    service: "AntiochiaArchive Backend",
    dataStore: getSelectedDataStoreName(),
    timestamp: new Date().toISOString(),
  });
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
// requireAdminAny accepts EITHER the legacy Authorization: Bearer <ADMIN_TOKEN>
// header (unchanged — any existing script keeps working) OR a new admin
// session cookie (see admin/adminSession.js), so the redesigned browser
// panel can use these same routes without ever holding the raw token.
app.put("/api/archive", requireAdminAny, updateArchive);

app.get("/api/submissions", requireAdminAny, getSubmissions);
app.delete("/api/submissions/:id", requireAdminAny, deleteSubmission);

app.get("/api/admin/export/archive", preventBackupCaching, requireAdminAny, backupHandlers.archive);
app.get("/api/admin/export/submissions", preventBackupCaching, requireAdminAny, backupHandlers.submissions);
app.get("/api/admin/export/full", preventBackupCaching, requireAdminAny, backupHandlers.full);

// v2 admin/editorial API — session-cookie authenticated, drafts/proposals
// only. Never writes to the v2 store the public API reads from; see
// admin/editorialStore.js. Admin JSON responses are never cached.
app.use("/api/admin/editorial", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
}, adminEditorialRouter);

// v2 domain foundation: read-only, additive, and does not alter any v1 route above.
app.use("/api/v2", v2Router);

// Direct-publish admin content API (Section 5-14 of the "no-code CMS"
// round) — separate namespace from /api/admin/editorial above; see
// admin/adminContentRoutes.js's header for why the two coexist. Mounted
// unconditionally: the router itself 409s cleanly when V2_DATA_STORE is not
// "sqlite", so mounting it never changes behavior for an existing
// local/firestore/memory/empty deployment.
app.use("/api/admin/content", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
}, adminContentRouter);

// Public CMS page routes (Section 17-18) — JSON for programmatic/mobile
// use, plus a full server-rendered HTML page at /sayfa/:slug for the
// public site (see pages/pageRenderer.js for why this is rendered here
// rather than by the separate static frontend). Pages only exist at all
// when V2_DATA_STORE=sqlite (see pageRoutes.js's own guard, which 404s
// cleanly rather than throwing when the SQLite connection was never
// opened) — harmless to mount unconditionally.
app.use("/api/pages", publicPageJsonRouter);
app.use("/sayfa", publicPageHtmlRouter);

// Runtime cultural-entity detail fallback (Section 1-3 of the "no-code CMS
// hard-requirement" round) — nginx tries the pre-built static file at this
// exact path first (see nginx/default.conf's error_page fallback) and only
// reaches this route when no static file exists for the slug, OR always
// reaches it first when that fallback is configured store-first — either
// way, this route is what makes a brand-new or just-edited SQLite entity
// publicly visible with zero rebuild. Store-agnostic (works against
// whichever V2Store is active) — see v2/render/entityDetailRenderer.js.
app.use("/archive-v2", v2DetailRouter);

// Controlled local media serving (Section 11) — never a static directory,
// never a raw filesystem path in the URL, rights-gated. See media/mediaRoutes.js.
app.use("/media", mediaRouter);

// Single, coherent runtime sitemap strategy (Section 6/7) — see
// v2/render/runtimeSitemap.js's header for the full design and the
// staleness bug this round found and fixed in the static sitemap.
app.get("/sitemap-runtime.xml", runtimeSitemapHandler);
app.get("/sitemap-index.xml", sitemapIndexHandler);

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

try {
  await initializeDataStore();
  await initializeV2Store();
  await initializeEditorialStore();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AntiochiaArchive backend listening on port ${PORT} using ${getSelectedDataStoreName()} storage (editorial: ${getSelectedEditorialStoreName()})`);
  });
} catch (error) {
  console.error("[Backend] Data store initialization failed:", error.message);
  process.exitCode = 1;
}
