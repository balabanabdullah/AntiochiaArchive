/**
 * Pure decision logic behind the Admin environment safety badge (manual QA
 * round) — deliberately split from its DOM rendering (public/js/admin-panel.js's
 * renderEnvironmentBadge()) into its own always-loaded, `document`-free
 * module, the same way public/js/music.js separates resolvePlayableAudio()
 * from its DOM-rendering half. This is what makes the decision testable
 * directly (see test/environment-badge.test.js) without a browser/DOM.
 *
 * Environment identification is safety-sensitive: a real user could
 * mistake local testing for production (or vice versa) if the badge ever
 * silently disappeared. This never returns a "show nothing" outcome —
 * exactly one of local/production/unknown is always returned, and
 * "unknown" (the fail-safe) is the answer whenever the environment field
 * is missing/unrecognized, never guessed from a hostname or other
 * frontend-only signal.
 */
(function exposeEnvironmentBadge(root) {
  "use strict";

  const KNOWN_ENVIRONMENTS = Object.freeze(["local", "production"]);

  /**
   * `environment`/`runtimeContentStore` come only from the backend's own
   * authoritative GET /session or /dashboard response (see
   * backend/admin/adminRoutes.js's getEnvironmentInfo()) — never from
   * window.location/hostname. Returns { cssClass, label }, always.
   */
  function resolveEnvironmentBadge({ environment, runtimeContentStore } = {}) {
    if (environment === "production") {
      return { cssClass: "production", label: "PRODUCTION" };
    }
    if (environment === "local") {
      return {
        cssClass: "local",
        label: runtimeContentStore === "sqlite" ? "LOCAL — SQLite" : "LOCAL",
      };
    }
    // Fail-safe: unset, null, or any value this codebase doesn't recognize
    // (e.g. a response from a backend that predates this feature) — never
    // silently blank, never a guess.
    return { cssClass: "unknown", label: "ORTAM DOĞRULANAMADI" };
  }

  root.AntiochiaArchiveEnvironmentBadge = Object.freeze({ KNOWN_ENVIRONMENTS, resolveEnvironmentBadge });
})(typeof window !== "undefined" ? window : globalThis);
