// vite.config.js
// AntiochiaArchive — Vite Multi-Page Application (MPA) configuration

import { defineConfig } from "vite";

export default defineConfig({
  appType: "mpa",

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
