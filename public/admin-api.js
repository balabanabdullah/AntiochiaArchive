/** Shared same-origin API and session-only administrator authentication helpers. */
(function () {
  const TOKEN_KEY = "antiochia-admin-token";

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
  }

  function promptForToken() {
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.setAttribute("aria-labelledby", "admin-auth-title");
      dialog.style.cssText = "max-width:420px;width:calc(100% - 32px);padding:24px;border:1px solid #903628;border-radius:4px;background:#fffaf0;color:#1c1814;";

      const form = document.createElement("form");
      form.method = "dialog";
      const title = document.createElement("h2");
      title.id = "admin-auth-title";
      title.textContent = "Administrator authentication required";
      const label = document.createElement("label");
      label.htmlFor = "admin-token-input";
      label.textContent = "Administrator token";
      const input = document.createElement("input");
      input.id = "admin-token-input";
      input.type = "password";
      input.autocomplete = "off";
      input.required = true;
      input.style.cssText = "box-sizing:border-box;width:100%;margin:8px 0 18px;padding:10px;border:1px solid #8a8e68;";
      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;justify-content:flex-end;gap:8px;";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      const submit = document.createElement("button");
      submit.type = "submit";
      submit.textContent = "Authenticate";
      actions.append(cancel, submit);
      form.append(title, label, input, actions);
      dialog.appendChild(form);
      document.body.appendChild(dialog);

      const finish = (token) => {
        dialog.close();
        dialog.remove();
        resolve(token);
      };
      cancel.addEventListener("click", () => finish(""));
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        finish(input.value.trim());
      });
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        finish("");
      });
      dialog.showModal();
      input.focus();
    });
  }

  async function getToken({ promptIfMissing = false } = {}) {
    let token = sessionStorage.getItem(TOKEN_KEY) || "";
    if (!token && promptIfMissing) {
      token = await promptForToken();
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
    }
    return token;
  }

  function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
  }

  async function tryRequest(path, fetchOptions, headers) {
    const response = await fetch(path, { ...fetchOptions, headers, credentials: "same-origin" });
    let data = null;
    try { data = await response.json(); } catch (_) { /* response may be empty */ }
    return { response, data };
  }

  async function request(path, options = {}) {
    const { admin = false, ...fetchOptions } = options;

    if (admin) {
      // Prefer an already-active v2 admin-panel session cookie (see
      // admin-session.js) over prompting for the raw token again — a
      // browser that already logged into the redesigned panel should never
      // be asked a second time for these legacy v1 routes, since the
      // backend's requireAdminAny accepts either credential. State-changing
      // verbs also need the paired CSRF header the session cookie requires.
      const sessionHeaders = new Headers(fetchOptions.headers || {});
      const method = (fetchOptions.method || "GET").toUpperCase();
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        const csrfMatch = document.cookie.match(/(?:^|; )aa_admin_csrf=([^;]*)/);
        if (csrfMatch) sessionHeaders.set("X-CSRF-Token", decodeURIComponent(csrfMatch[1]));
      }
      const sessionAttempt = await tryRequest(path, fetchOptions, sessionHeaders);
      if (sessionAttempt.response.ok) return sessionAttempt.data;
      if (sessionAttempt.response.status !== 401 && sessionAttempt.response.status !== 403) {
        throw new Error(sessionAttempt.data?.error || `Request failed (${sessionAttempt.response.status}).`);
      }
    }

    const headers = new Headers(fetchOptions.headers || {});
    if (admin) {
      const token = await getToken({ promptIfMissing: true });
      if (!token) throw new Error("Administrator authentication required.");
      headers.set("Authorization", `Bearer ${token}`);
    }

    const { response, data } = await tryRequest(path, fetchOptions, headers);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) clearToken();
      throw new Error(data?.error || `Request failed (${response.status}).`);
    }

    return data;
  }

  function filenameFromDisposition(value, fallback) {
    const match = String(value || "").match(/filename="?([^";\r\n]+)"?/i);
    const filename = match?.[1] || fallback;
    return /^[a-z0-9][a-z0-9._-]*\.json$/i.test(filename) ? filename : fallback;
  }

  async function download(path, fallbackFilename = "antiochia-backup.json") {
    const token = await getToken({ promptIfMissing: true });
    if (!token) throw new Error("Administrator authentication required.");

    const response = await fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!response.ok) {
      let data = null;
      try { data = await response.json(); } catch (_) { /* response may be empty */ }
      if (response.status === 401 || response.status === 403) clearToken();
      throw new Error(data?.error || `Backup request failed (${response.status}).`);
    }

    const filename = filenameFromDisposition(
      response.headers.get("Content-Disposition"),
      fallbackFilename,
    );
    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    return filename;
  }

  window.AntiochiaAdminAPI = { request, download, getToken, clearToken, escapeHtml };
})();
