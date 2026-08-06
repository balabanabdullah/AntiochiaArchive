// vite.config.js
// AntiochiaArchive — Vite yapılandırması
// Vanilla HTML/CSS/JS projesi; Vite bunu doğrudan sunabilir.

import { defineConfig } from "vite";

export default defineConfig({
  // ── Kök dizin: index.html buradan sunulur ──────────────────────────
  root: ".",

  // ── Public assets (statik olarak kopyalanacak dosyalar) ────────────
  publicDir: "public",   // mevcut değilse boş bırakılabilir

  // ── Geliştirme sunucusu ────────────────────────────────────────────
  server: {
    host: "0.0.0.0",   // Docker içinden dışarıya erişilebilmesi için zorunlu
    port: 5173,
    strictPort: true,   // port doluysa hata ver, rastgele port seçme

    // Docker bind-mount + Windows/macOS'ta dosya değişikliklerini
    // algılayabilmek için polling zorunludur (inotify desteği yoktur).
    watch: {
      usePolling: true,
      interval:   300,  // ms — düşük tutarak hot-reload gecikmesini azalt
    },
  },

  // ── Production build ───────────────────────────────────────────────
  build: {
    outDir:       "dist",
    emptyOutDir:  true,
    sourcemap:    false,
    rollupOptions: {
      input: "./index.html",
    },
  },

  // ── Preview (production build'i lokalde önizle) ────────────────────
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
});
