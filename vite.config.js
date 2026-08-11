// vite.config.js
// AntiochiaArchive — Vite Multi-Page Application (MPA) configuration

import { defineConfig } from "vite";
import { readFile } from "node:fs/promises";

const VERSIONED_PUBLIC_SCRIPTS = Object.freeze([
  "lang.js",
  "archive-api.js",
  "script.js",
  "admin-api.js",
  "admin-archive.js",
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
        emittedScripts.set(`/${filename}`, this.emitFile({
          type: "asset",
          name: filename,
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
  plugins: [versionPublicScripts()],

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
        music:         "pages/music.html",
        admin:         "pages/admin.html",
        gallery:       "pages/gallery.html",
        submissions:   "pages/submissions.html",
        contributions: "pages/contributions.html",
      },
    },
  },

  // ── Preview ────────────────────────────────────────────────────────
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
});
