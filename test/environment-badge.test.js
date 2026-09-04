// Manual QA round (2nd pass): a real browser check found the environment
// badge simply absent from the login screen — this is the pure decision
// logic behind it (public/js/environment-badge.js), tested directly. The
// most likely real-world trigger during manual QA (documented in the
// report) was a stale/misrouted local backend process answering the
// session request without the `environment` field at all — these tests
// cover exactly that "field missing" case alongside the designed ones.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const modulePath = pathToFileURL(path.resolve(import.meta.dirname, "../public/js/environment-badge.js")).href;
await import(modulePath);
const { resolveEnvironmentBadge } = globalThis.AntiochiaArchiveEnvironmentBadge;

test("local + sqlite -> 'LOCAL — SQLite', local css class", () => {
  assert.deepEqual(resolveEnvironmentBadge({ environment: "local", runtimeContentStore: "sqlite" }), { cssClass: "local", label: "LOCAL — SQLite" });
});

test("local + a non-sqlite store -> plain 'LOCAL', still the local css class", () => {
  assert.deepEqual(resolveEnvironmentBadge({ environment: "local", runtimeContentStore: "firestore" }), { cssClass: "local", label: "LOCAL" });
  assert.deepEqual(resolveEnvironmentBadge({ environment: "local", runtimeContentStore: undefined }), { cssClass: "local", label: "LOCAL" });
});

test("production -> 'PRODUCTION', production css class, regardless of runtimeContentStore", () => {
  assert.deepEqual(resolveEnvironmentBadge({ environment: "production", runtimeContentStore: "firestore" }), { cssClass: "production", label: "PRODUCTION" });
});

test("fail-safe: never returns a blank/empty outcome — missing, null, empty-object, or an unrecognized environment value all resolve to the visible 'unknown' warning state", () => {
  const expected = { cssClass: "unknown", label: "ORTAM DOĞRULANAMADI" };
  assert.deepEqual(resolveEnvironmentBadge({}), expected);
  assert.deepEqual(resolveEnvironmentBadge({ environment: null }), expected);
  assert.deepEqual(resolveEnvironmentBadge({ environment: undefined }), expected);
  assert.deepEqual(resolveEnvironmentBadge(), expected);
  assert.deepEqual(resolveEnvironmentBadge({ environment: "staging" }), expected, "an unrecognized value must fail safe, never be guessed at");
});

test("never guesses from a hostname or any other field — an extraneous hostname-like property is ignored entirely", () => {
  assert.deepEqual(
    resolveEnvironmentBadge({ hostname: "antiochia-app-6939593871.europe-west1.run.app" }),
    { cssClass: "unknown", label: "ORTAM DOĞRULANAMADI" },
    "a hostname alone, with no explicit environment field, must still fail safe rather than being inferred as production",
  );
});

test("KNOWN_ENVIRONMENTS lists exactly the two real backend-reported values", () => {
  assert.deepEqual([...globalThis.AntiochiaArchiveEnvironmentBadge.KNOWN_ENVIRONMENTS].sort(), ["local", "production"]);
});

test("regression guard: admin-panel.js renders the badge before checking authenticated state, and renders it (fail-safe) even when the session fetch throws — badge rendering must never depend on a successful login", async () => {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const source = await readFile(resolve(import.meta.dirname, "../public/js/admin-panel.js"), "utf8");

  const initBlock = source.slice(source.indexOf('document.addEventListener("DOMContentLoaded"'));
  const renderIndex = initBlock.indexOf("renderEnvironmentBadge(sessionInfo)");
  const authCheckIndex = initBlock.indexOf("sessionInfo.authenticated");
  assert.ok(renderIndex > -1 && authCheckIndex > -1, "both calls must still exist in the init handler");
  assert.ok(renderIndex < authCheckIndex, "the badge must render BEFORE the authenticated branch, not after");

  const catchBlock = initBlock.slice(initBlock.indexOf("} catch (error) {"));
  assert.match(catchBlock, /renderEnvironmentBadge\(\{\}\)/, "a totally failed session fetch must still render the fail-safe badge, not leave it blank");
});

test("regression guard: refreshDashboard() also re-renders the badge, so the post-login topbar never falls out of sync with what the login screen showed", async () => {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const source = await readFile(resolve(import.meta.dirname, "../public/js/admin-panel.js"), "utf8");
  const dashboardBlock = source.slice(source.indexOf("async function refreshDashboard()"), source.indexOf("async function refreshDashboard()") + 1500);
  assert.match(dashboardBlock, /renderEnvironmentBadge\(data\)/);
});
