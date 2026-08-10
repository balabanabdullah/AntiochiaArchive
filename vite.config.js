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
    historyApiFallback: {
      rewrites: [
        { from: /^\/pages\/history\.html/, to: "/pages/history.html" },
        { from: /^\/pages\/stories\.html/, to: "/pages/stories.html" },
        { from: /^\/pages\/structures\.html/, to: "/pages/structures.html" },
        { from: /^\/pages\/beliefs\.html/, to: "/pages/beliefs.html" },
        { from: /^\/pages\/music\.html/, to: "/pages/music.html" },
        { from: /^\/pages\/admin\.html/, to: "/pages/admin.html" },
        { from: /^\/pages\/gallery\.html/, to: "/pages/gallery.html" },
        { from: /^\/pages\/submissions\.html/, to: "/pages/submissions.html" },
      ],
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
        main:       "index.html",
        history:    "pages/history.html",
        stories:    "pages/stories.html",
        structures: "pages/structures.html",
        beliefs:    "pages/beliefs.html",
        music:      "pages/music.html",
        admin:      "pages/admin.html",
        gallery:    "pages/gallery.html",
        submissions:"pages/submissions.html",
      },
    },
  },

  // ── Preview ────────────────────────────────────────────────────────
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
});
