# =============================================================================
# AntiochiaArchive — Dockerfile (nginx)
# Static dosyaları dist/ klasöründen nginx'e kopyalar.
# Port: 80
# =============================================================================

FROM nginx:1.27-alpine

# ── Metadata ──────────────────────────────────────────────────────────────────
LABEL maintainer="AntiochiaArchive Contributors"
LABEL description="AntiochiaArchive — nginx static file server"

# ── Varsayılan nginx config'i kaldır, özel config'i yerleştir ────────────────
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# ── dist/ içindeki proje dosyalarını nginx html dizinine kopyala ──────────────
COPY dist/index.html  /usr/share/nginx/html/index.html
COPY dist/style.css   /usr/share/nginx/html/style.css
COPY dist/script.js   /usr/share/nginx/html/script.js
COPY dist/lang.js     /usr/share/nginx/html/lang.js

# ── Port ──────────────────────────────────────────────────────────────────────
EXPOSE 80

# ── nginx ön planda çalışsın (daemon off → container canlı kalsın) ────────────
CMD ["nginx", "-g", "daemon off;"]
