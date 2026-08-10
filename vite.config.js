// vite.config.js
// AntiochiaArchive — Vite yapılandırması
// Vanilla HTML/CSS/JS projesi; Vite bunu doğrudan sunabilir.

import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";

/** Vite dev server middleware to reliably serve subpages from /pages/*.html */
function mpaServerPlugin() {
  return {
    name: "mpa-server-plugin",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = (req.url || "").split("?")[0];
        if (rawUrl.includes("pages/") && rawUrl.endsWith(".html")) {
          const relativePath = rawUrl.substring(rawUrl.indexOf("pages/"));
          const filePath = path.join(process.cwd(), relativePath);
          if (fs.existsSync(filePath)) {
            try {
              let html = fs.readFileSync(filePath, "utf-8");
              html = await server.transformIndexHtml(rawUrl, html);
              res.statusCode = 200;
              res.setHeader("Content-Type", "text/html; charset=utf-8");
              return res.end(html);
            } catch (e) {
              return next(e);
            }
          }
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [mpaServerPlugin()],

  // ── Kök dizin: index.html buradan sunulur ──────────────────────────
  root: ".",

  // ── Public assets (statik olarak kopyalanacak dosyalar) ────────────
  publicDir: "public",

  // ── Geliştirme sunucusu ────────────────────────────────────────────
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
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
      },
    },
  },

  // ── Preview (production build'i lokalde önizle) ────────────────────
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
});
