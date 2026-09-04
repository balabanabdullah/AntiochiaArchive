/**
 * Session-cookie client for the v2 admin/editorial API (/api/admin/editorial/*).
 *
 * Unlike admin-api.js (the pre-existing v1 tool, which asks for the raw
 * ADMIN_TOKEN and holds it in sessionStorage for the tab's lifetime), this
 * module NEVER sees, stores, or transmits the admin secret more than once:
 * the token is submitted exactly once, to POST /login, and the browser gets
 * back only an opaque HttpOnly session cookie it cannot read via JS, plus a
 * separate CSRF cookie it must echo back on state-changing requests (see
 * backend/admin/adminSession.js for the full design rationale). There is no
 * token constant, no localStorage/sessionStorage write, anywhere in this
 * file — by construction, not just by convention.
 */
(function exposeAdminSession(root) {
  "use strict";

  const API_BASE = "/api/admin/editorial";
  // The direct-publish content API (backend/admin/adminContentRoutes.js) —
  // same session cookie, same CSRF cookie, same origin, just a different
  // namespace. Only meaningful when the backend dashboard reports
  // contentAuthority: "direct" (V2_DATA_STORE=sqlite); see admin-panel.js.
  const CONTENT_API_BASE = "/api/admin/content";

  function readCookie(name) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  // A network-level failure (backend down, unreachable, DNS/connection
  // refused, CORS rejection) throws a raw browser TypeError — "Failed to
  // fetch" in Chromium, "NetworkError when attempting to fetch resource"
  // in Firefox — neither of which means anything to a non-technical Turkish
  // admin. This wrapper is the ONE place that distinguishes "we got a
  // response" (a normal auth failure, handled by its own specific message)
  // from "we never got a response at all" (manual QA round, "generic error
  // message" finding), converting the latter into one clear, understandable
  // message every caller below can rely on.
  async function fetchOrUnreachable(...args) {
    try {
      return await fetch(...args);
    } catch {
      throw new Error("Yönetim servisine ulaşılamadı.");
    }
  }

  /**
   * Manual QA round, "environment safety badge": returns the environment
   * metadata (environment/runtimeContentStore/mediaStorageDriver — see
   * backend/admin/adminRoutes.js's getEnvironmentInfo(), never a secret)
   * alongside `authenticated`, so the badge can render on the login screen
   * itself, before any session exists — not only after logging in.
   */
  async function checkSession() {
    const response = await fetchOrUnreachable(`${API_BASE}/session`, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return { authenticated: false };
    const body = await response.json().catch(() => null);
    return {
      authenticated: body?.data?.authenticated === true,
      environment: body?.data?.environment ?? null,
      runtimeContentStore: body?.data?.runtimeContentStore ?? null,
      mediaStorageDriver: body?.data?.mediaStorageDriver ?? null,
    };
  }

  async function login(token) {
    const response = await fetchOrUnreachable(`${API_BASE}/login`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.error || "Giriş servisi şu anda kullanılamıyor.");
    }
    return true;
  }

  async function logout() {
    await fetch(`${API_BASE}/logout`, { method: "POST", credentials: "same-origin" }).catch(() => {});
  }

  /**
   * Shared fetch wrapper: always same-origin credentials, and automatically
   * attaches X-CSRF-Token (read from the non-HttpOnly CSRF cookie the login
   * response set) on every state-changing verb. `base` lets the same
   * session/CSRF machinery serve both the editorial-draft API and the
   * direct-publish content API — the cookie pair is shared across both,
   * since both live under the same admin session.
   */
  async function requestWithBase(base, path, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const headers = new Headers(options.headers || {});
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const csrf = readCookie("aa_admin_csrf");
      if (csrf) headers.set("X-CSRF-Token", csrf);
    }
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    const response = await fetchOrUnreachable(`${base}${path}`, { ...options, method, headers, credentials: "same-origin" });
    let data = null;
    try { data = await response.json(); } catch (_) { /* empty body */ }
    if (!response.ok) {
      const error = new Error(data?.error || `İstek başarısız oldu (${response.status}).`);
      // "UX refinement" round, Sections 9/16: a 409 from createEntity()/
      // changeEntitySlug() carries a ready-to-use suggestedId/suggestedSlug
      // (never a dead end) and/or requiresConfirmation (the "this entity has
      // ever been published" confirm-gate) — surfaced here as real
      // properties on the thrown Error, not just folded into its message
      // string, so a caller that wants to act on them (e.g. offer the
      // suggested slug, or retry with confirmed:true) can, while every
      // existing caller that only reads error.message is unaffected.
      error.status = response.status;
      error.suggestedId = data?.suggestedId;
      error.suggestedSlug = data?.suggestedSlug;
      error.requiresConfirmation = data?.requiresConfirmation;
      throw error;
    }
    return data;
  }

  function request(path, options = {}) {
    return requestWithBase(API_BASE, path, options);
  }

  /** Same session, same CSRF cookie, different namespace — see backend/admin/adminContentRoutes.js. */
  function requestContent(path, options = {}) {
    return requestWithBase(CONTENT_API_BASE, path, options);
  }

  root.AntiochiaAdminSession = Object.freeze({ checkSession, login, logout, request, requestContent });
})(typeof window !== "undefined" ? window : globalThis);
