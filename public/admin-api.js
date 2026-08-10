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

  async function request(path, options = {}) {
    const { admin = false, ...fetchOptions } = options;
    const headers = new Headers(fetchOptions.headers || {});
    if (admin) {
      const token = await getToken({ promptIfMissing: true });
      if (!token) throw new Error("Administrator authentication required.");
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(path, { ...fetchOptions, headers });
    let data = null;
    try { data = await response.json(); } catch (_) { /* response may be empty */ }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) clearToken();
      throw new Error(data?.error || `Request failed (${response.status}).`);
    }

    return data;
  }

  window.AntiochiaAdminAPI = { request, getToken, clearToken, escapeHtml };
})();
