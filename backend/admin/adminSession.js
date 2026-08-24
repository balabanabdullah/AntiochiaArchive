// Session-cookie authentication for the v2 admin/editorial panel.
//
// The admin secret (process.env.ADMIN_TOKEN — the same secret the existing
// v1 Bearer-token admin routes already use) is submitted ONCE, over
// POST /api/admin/login, and never again: the browser never stores it (not
// in localStorage/sessionStorage, not in a JS variable that outlives the
// request). What the browser gets back is an opaque, HttpOnly, random
// session cookie it cannot read or exfiltrate via XSS, plus a separate
// non-HttpOnly CSRF cookie it must echo back in a header on every
// state-changing request (double-submit CSRF pattern).
//
// Sessions live in an in-process Map — intentionally NOT persisted anywhere.
// A Cloud Run revision restart invalidates every session, which is the
// correct behavior for a short-lived admin session (see SESSION_TTL_MS
// below), not a bug: it is never used to store editorial data, only "is
// this browser currently allowed to act as admin."

import crypto from "crypto";

const SESSION_COOKIE = "aa_admin_session";
const CSRF_COOKIE = "aa_admin_csrf";
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 8;

// Signs session ids so a malformed/guessed cookie value fails fast without a
// map lookup. Generated once per process at boot — never logged, never an
// env var, never persisted. Losing it on restart is fine: it only
// invalidates already-issued session cookies, exactly like the session map
// itself being cleared.
const SESSION_SIGNING_SECRET = crypto.randomBytes(32);

const sessions = new Map(); // sessionId -> { expiresAt }
const loginAttempts = new Map(); // ip -> timestamps[]

function timingSafeStringsEqual(a, b) {
  const bufA = Buffer.from(String(a || ""), "utf8");
  const bufB = Buffer.from(String(b || ""), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SIGNING_SECRET).update(value).digest("base64url");
}

function isSecureRequest(req) {
  return req.secure || req.get("x-forwarded-proto") === "https";
}

/** Parses the raw `Cookie` header without an external dependency — one small, well-scoped need. */
function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function setCookie(res, name, value, { httpOnly, maxAgeMs, secure }) {
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Strict",
    `Max-Age=${Math.max(0, Math.floor(maxAgeMs / 1000))}`,
  ];
  if (httpOnly) attrs.push("HttpOnly");
  if (secure) attrs.push("Secure");
  const existing = res.getHeader("Set-Cookie");
  const next = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
  next.push(attrs.join("; "));
  res.setHeader("Set-Cookie", next);
}

function clearCookie(res, name, { secure }) {
  setCookie(res, name, "", { httpOnly: name === SESSION_COOKIE, maxAgeMs: 0, secure });
}

export function createSession(req, res) {
  const sessionId = crypto.randomBytes(24).toString("base64url");
  const csrfToken = crypto.randomBytes(24).toString("base64url");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(sessionId, { expiresAt, csrfToken });

  const secure = isSecureRequest(req);
  const cookieValue = `${sessionId}.${sign(sessionId)}`;
  setCookie(res, SESSION_COOKIE, cookieValue, { httpOnly: true, maxAgeMs: SESSION_TTL_MS, secure });
  // Deliberately NOT HttpOnly: the client must be able to read it to echo it
  // back in the X-CSRF-Token header (double-submit pattern) — it authorizes
  // nothing by itself without the paired HttpOnly session cookie.
  setCookie(res, CSRF_COOKIE, csrfToken, { httpOnly: false, maxAgeMs: SESSION_TTL_MS, secure });

  return { expiresAt };
}

function readSessionId(req) {
  const raw = parseCookies(req)[SESSION_COOKIE];
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot === -1) return null;
  const sessionId = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!timingSafeStringsEqual(sign(sessionId), signature)) return null;
  return sessionId;
}

/** True if the request carries a currently-valid admin session cookie (expired entries are evicted, never treated as valid). */
export function hasValidSession(req) {
  const sessionId = readSessionId(req);
  if (!sessionId) return false;
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return false;
  }
  return true;
}

export function destroySession(req, res) {
  const sessionId = readSessionId(req);
  if (sessionId) sessions.delete(sessionId);
  const secure = isSecureRequest(req);
  clearCookie(res, SESSION_COOKIE, { secure });
  clearCookie(res, CSRF_COOKIE, { secure });
}

/** Blocks a state-changing request whose X-CSRF-Token header doesn't match the (unguessable, session-scoped) CSRF cookie value. */
function csrfTokenValid(req) {
  const sessionId = readSessionId(req);
  if (!sessionId) return false;
  const session = sessions.get(sessionId);
  if (!session) return false;
  const header = req.get("x-csrf-token") || "";
  return timingSafeStringsEqual(header, session.csrfToken);
}

/** Session-cookie-only admin gate for the new v2 editorial API. GET requests only need a valid session; state-changing verbs also require a matching CSRF header. */
export function requireAdminSession(req, res, next) {
  if (!hasValidSession(req)) {
    return res.status(401).json({ success: false, error: "Yönetici oturumu gerekli. / Administrator session required." });
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !csrfTokenValid(req)) {
    return res.status(403).json({ success: false, error: "CSRF doğrulaması başarısız. / CSRF validation failed." });
  }
  next();
}

/**
 * Backward-compatible gate for existing v1 admin routes (PUT /api/archive,
 * submissions, backup exports): accepts EITHER the legacy Authorization:
 * Bearer <ADMIN_TOKEN> header (unchanged, so any existing script/tool that
 * already uses it keeps working) OR a valid new session cookie (so the
 * redesigned browser panel — which never touches the raw token — can use
 * the very same endpoints). Neither path is weakened by the other's
 * existence.
 */
export function requireAdminAny(req, res, next) {
  const expected = process.env.ADMIN_TOKEN || "";
  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (expected && match && timingSafeStringsEqual(match[1], expected)) return next();
  if (hasValidSession(req)) {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !csrfTokenValid(req)) {
      return res.status(403).json({ success: false, error: "CSRF doğrulaması başarısız. / CSRF validation failed." });
    }
    return next();
  }
  return res.status(401).json({ success: false, error: "Administrator authentication required." });
}

/** Mirrors server.js's contributionRateLimit pattern exactly — in-memory sliding window, no external dependency. */
export function loginRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || "unknown";
  const recent = (loginAttempts.get(key) || []).filter((timestamp) => now - timestamp < LOGIN_RATE_LIMIT_WINDOW_MS);
  if (recent.length >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
    return res.status(429).json({ success: false, error: "Çok fazla giriş denemesi. Lütfen daha sonra tekrar deneyin." });
  }
  recent.push(now);
  loginAttempts.set(key, recent);
  next();
}

export function verifyAdminToken(providedToken) {
  const expected = process.env.ADMIN_TOKEN || "";
  if (!expected) return false;
  return timingSafeStringsEqual(providedToken, expected);
}

/** Test-only: clears all in-memory session/rate-limit state between test files. */
export function _resetForTests() {
  sessions.clear();
  loginAttempts.clear();
}
