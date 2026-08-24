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

  function readCookie(name) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  async function checkSession() {
    const response = await fetch(`${API_BASE}/session`, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.data?.authenticated === true;
  }

  async function login(token) {
    const response = await fetch(`${API_BASE}/login`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.error || "Yönetici anahtarı geçersiz.");
    }
    return true;
  }

  async function logout() {
    await fetch(`${API_BASE}/logout`, { method: "POST", credentials: "same-origin" }).catch(() => {});
  }

  /**
   * Fetch wrapper for the editorial API: always same-origin credentials,
   * and automatically attaches X-CSRF-Token (read from the non-HttpOnly
   * CSRF cookie the login response set) on every state-changing verb.
   */
  async function request(path, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const headers = new Headers(options.headers || {});
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const csrf = readCookie("aa_admin_csrf");
      if (csrf) headers.set("X-CSRF-Token", csrf);
    }
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    const response = await fetch(`${API_BASE}${path}`, { ...options, method, headers, credentials: "same-origin" });
    let data = null;
    try { data = await response.json(); } catch (_) { /* empty body */ }
    if (!response.ok) {
      throw new Error(data?.error || `İstek başarısız oldu (${response.status}).`);
    }
    return data;
  }

  root.AntiochiaAdminSession = Object.freeze({ checkSession, login, logout, request });
})(typeof window !== "undefined" ? window : globalThis);
