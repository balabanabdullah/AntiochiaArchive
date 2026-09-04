// vite.config.js
// AntiochiaArchive — Vite Multi-Page Application (MPA) configuration

import { defineConfig } from "vite";
import { readFile } from "node:fs/promises";

// LOCAL, UNCOMMITTED addition for the "local SQLite activation" walkthrough
// (not part of any committed round): `vite preview` (serving the real
// dist/ build, needed so runtime cultural-entity detail pages can resolve
// their real hashed asset filenames — vite dev's raw index.html has no
// /assets/*-<hash>.js paths at all) does not automatically inherit
// `server.proxy` the way `vite dev` does; it needs its own `preview.proxy`.
// Shared here so both stay identical without hand-duplicating every entry.
const BACKEND_PROXY_TARGETS = Object.freeze({
  "/api": { target: process.env.VITE_API_PROXY_TARGET || "http://localhost:5000", changeOrigin: true },
  "/health": { target: process.env.VITE_API_PROXY_TARGET || "http://localhost:5000", changeOrigin: true },
  "/sayfa": { target: process.env.VITE_API_PROXY_TARGET || "http://localhost:5000", changeOrigin: true },
  "/archive-v2": { target: process.env.VITE_API_PROXY_TARGET || "http://localhost:5000", changeOrigin: true },
  "/media": { target: process.env.VITE_API_PROXY_TARGET || "http://localhost:5000", changeOrigin: true },
  "/sitemap-runtime.xml": { target: process.env.VITE_API_PROXY_TARGET || "http://localhost:5000", changeOrigin: true },
  "/sitemap-index.xml": { target: process.env.VITE_API_PROXY_TARGET || "http://localhost:5000", changeOrigin: true },
});

/**
 * LOCAL, UNCOMMITTED addition (manual QA round, Bug 1): the clean
 * `/admin/` alias (and `/admin` -> `/admin/` redirect) previously existed
 * ONLY in nginx/default.conf's `location = /admin` / `location = /admin/`
 * blocks — production-topology-only. Neither `vite dev`'s nor
 * `vite preview`'s server ever had an equivalent, so a non-technical local
 * user hitting the same canonical URL the real site uses got a bare 404,
 * and had to already know the internal `/pages/admin.html` path instead.
 * This mirrors nginx's exact behavior for both local dev commands: a GET
 * to `/admin` redirects to `/admin/`; a GET to `/admin/` is rewritten to
 * `/pages/admin.html` before Vite's own routing/static-serving middleware
 * ever sees it, so it renders (and, in dev, hot-reloads) exactly like
 * navigating to `/pages/admin.html` directly always has.
 */
/**
 * Pure decision logic, deliberately separated from any Vite/Node request
 * object so it can be unit-tested directly (see test/admin-clean-url.test.js)
 * without booting a real dev/preview server. Mirrors nginx/default.conf's
 * `location = /admin` (301 to `/admin/`) and `location = /admin/`
 * (try_files /pages/admin.html) exactly — same two cases, same outcomes.
 */
export function resolveAdminCleanUrl(url) {
  const [pathname] = String(url || "").split(/[?#]/, 1);
  if (pathname === "/admin") return { redirectTo: "/admin/" };
  if (pathname === "/admin/") return { rewriteTo: url.replace("/admin/", "/pages/admin.html") };
  return null;
}

function adminCleanUrlPlugin() {
  const middleware = (req, res, next) => {
    const outcome = resolveAdminCleanUrl(req.url);
    if (outcome?.redirectTo) {
      res.statusCode = 301;
      res.setHeader("Location", outcome.redirectTo);
      res.end();
      return;
    }
    if (outcome?.rewriteTo) req.url = outcome.rewriteTo;
    next();
  };
  return {
    name: "antiochia-admin-clean-url",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

const VERSIONED_PUBLIC_SCRIPTS = Object.freeze([
  "lang.js",
  "archive-api.js",
  "archive-v2-api.js",
  "script.js",
  "admin-api.js",
  "admin-archive.js",
  "admin-session.js",
  // Discovery-feature modules (search/timeline/map/collections), kept as
  // small standalone files under public/js/ rather than growing script.js
  // further. Same versioning treatment as the flat files above — see
  // buildStart()/generateBundle() below, which key the src="/js/x.js" ->
  // hashed-asset replacement off this list's exact path.
  "js/archive-store.js",
  "js/search.js",
  "js/timeline.js",
  "js/map.js",
  "js/collections.js",
  "js/music.js",
  "js/environment-badge.js",
  "js/slug-utils.js",
  "js/editor-mode-copy.js",
  "js/admin-panel.js",
]);

/**
 * Keep public/*.js as the single development source while giving production
 * HTML content-hashed URLs. Vite still serves the original root URLs in dev;
 * Rollup emits hashed copies and rewrites every built MPA HTML entry.
 */
function versionPublicScripts() {
  const emittedScripts = new Map();

  return {
    name: "antiochia-version-public-scripts",
    apply: "build",
    enforce: "post",

    async buildStart() {
      for (const filename of VERSIONED_PUBLIC_SCRIPTS) {
        const source = await readFile(new URL(`./public/${filename}`, import.meta.url), "utf8");
        // `name` is only the emitted-asset's display name (Rollup does not
        // preserve directory structure from it) — basename only, so
        // "js/timeline.js" still lands as dist/assets/timeline-<hash>.js.
        // The `/${filename}` key (kept in full, subpath included) is what
        // generateBundle() matches against src="/js/timeline.js" in HTML.
        emittedScripts.set(`/${filename}`, this.emitFile({
          type: "asset",
          name: filename.split("/").pop(),
          source,
        }));
      }
    },

    generateBundle(_options, bundle) {
      const replacements = new Map(
        [...emittedScripts].map(([publicPath, referenceId]) => [
          `src="${publicPath}"`,
          `src="/${this.getFileName(referenceId)}"`,
        ]),
      );

      for (const output of Object.values(bundle)) {
        if (output.type !== "asset" || !output.fileName.endsWith(".html")) continue;
        let html = String(output.source);
        for (const [stableReference, versionedReference] of replacements) {
          html = html.replaceAll(stableReference, versionedReference);
        }
        output.source = html;
      }
    },
  };
}

export default defineConfig({
  appType: "mpa",
  plugins: [versionPublicScripts(), adminCleanUrlPlugin()],

  // ── Kök dizin ──────────────────────────────────────────────────────
  root: ".",

  // ── Public assets ──────────────────────────────────────────────────
  publicDir: "public",

  // ── Geliştirme sunucusu ────────────────────────────────────────────
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:5000",
        changeOrigin: true,
      },
      "/health": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:5000",
        changeOrigin: true,
      },
      // Dynamic CMS pages (backend/pages/pageRoutes.js) — local-dev mirror
      // of nginx/default.conf's /sayfa/ proxy block, so `npm run dev` can
      // reach them exactly like production will once that config is
      // deployed. See backend/PERSISTENCE.md "Runtime content database
      // (SQLite)".
      "/sayfa": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:5000",
        changeOrigin: true,
      },
      // Runtime cultural-entity detail fallback (backend/v2/routes/
      // v2DetailRoutes.js). Unconditional in dev (unlike nginx's
      // ARCHIVE_V2_ROUTING_MODE toggle in production, which defaults to the
      // same always-backend-first behavior but can opt into static-first —
      // see nginx/default.conf) because `vite dev` never serves the
      // post-build dist/archive-v2/ files at all — this proxy is what
      // makes /archive-v2/:slug/ work locally during `npm run dev` for the
      // first time, dynamic entities included.
      "/archive-v2": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:5000",
        changeOrigin: true,
      },
      // Controlled local media serving (backend/media/mediaRoutes.js).
      "/media": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:5000",
        changeOrigin: true,
      },
      "/sitemap-runtime.xml": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:5000",
        changeOrigin: true,
      },
      "/sitemap-index.xml": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:5000",
        changeOrigin: true,
      },
    },
    watch: {
      usePolling: true,
      interval:   300,
    },
  },

  // ── Production build ───────────────────────────────────────────────
  build: {
    outDir:       "dist",
    emptyOutDir:  true,
    sourcemap:    false,
    rollupOptions: {
      input: {
        main:          "index.html",
        history:       "pages/history.html",
        stories:       "pages/stories.html",
        structures:    "pages/structures.html",
        beliefs:       "pages/beliefs.html",
        communities:   "pages/communities.html",
        places:        "pages/places.html",
        music:         "pages/music.html",
        proverbs:      "pages/proverbs.html",
        admin:         "pages/admin.html",
        gallery:       "pages/gallery.html",
        submissions:   "pages/submissions.html",
        contributions: "pages/contributions.html",
        methodology:    "pages/methodology.html",
        map:            "pages/map.html",
        collections:    "pages/collections.html",
        discover:       "pages/discover.html",
        search:         "pages/search.html",
        notFound:       "404.html",
      },
    },
  },

  // ── Preview ────────────────────────────────────────────────────────
  preview: {
    host: "0.0.0.0",
    port: 4173,
    proxy: BACKEND_PROXY_TARGETS,
  },
});
