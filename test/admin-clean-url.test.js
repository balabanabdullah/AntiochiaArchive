// Manual QA round, Bug 1: the canonical `/admin/` URL previously only
// existed in nginx/default.conf's production-topology config — neither
// `vite dev` nor `vite preview` had an equivalent, so a local user hit a
// bare 404 and had to already know the internal `/pages/admin.html` path.
// vite.config.js's resolveAdminCleanUrl() is the pure decision function
// behind the fix (a thin Vite middleware wraps it — see that file) —
// tested directly here, no dev/preview server needed to boot.

import test from "node:test";
import assert from "node:assert/strict";
import { resolveAdminCleanUrl } from "../vite.config.js";

test("/admin redirects to /admin/", () => {
  assert.deepEqual(resolveAdminCleanUrl("/admin"), { redirectTo: "/admin/" });
});

test("/admin/ rewrites to /pages/admin.html", () => {
  assert.deepEqual(resolveAdminCleanUrl("/admin/"), { rewriteTo: "/pages/admin.html" });
});

test("/admin/ with a query string preserves it after rewriting", () => {
  assert.deepEqual(resolveAdminCleanUrl("/admin/?foo=bar"), { rewriteTo: "/pages/admin.html?foo=bar" });
});

test("unrelated paths are left alone (null — 'do not intercept')", () => {
  for (const url of ["/", "/pages/admin.html", "/admin-panel", "/administrator", "/api/admin/editorial/session", "/adminx"]) {
    assert.equal(resolveAdminCleanUrl(url), null, url);
  }
});

test("mirrors nginx/default.conf's own /admin and /admin/ behavior exactly (same two cases, same outcomes)", async () => {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const nginxConf = await readFile(resolve(import.meta.dirname, "../nginx/default.conf"), "utf8");
  assert.match(nginxConf, /location = \/admin \{/, "nginx must still have the exact /admin redirect this mirrors");
  assert.match(nginxConf, /location = \/admin\/ \{/, "nginx must still have the exact /admin/ alias this mirrors");
  assert.match(nginxConf, /return 301 \/admin\//);
  assert.match(nginxConf, /try_files \/pages\/admin\.html/);
});
