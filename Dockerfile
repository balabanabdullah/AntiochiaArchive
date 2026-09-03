# =============================================================================
# AntiochiaArchive — Dockerfile (Multi-stage: Vite build → nginx)
#
#  Stage 1 — builder  (node:20-alpine)
#    • npm ci → installs only devDependencies (vite)
#    • vite build → outputs to dist/
#       - index.html → dist/index.html  (processed by Vite)
#       - style.css  → dist/assets/*.css (hashed)
#       - public/*.js → dist/assets/*-<hash>.js (versioned production copies)
#         while publicDir originals remain available as revalidated fallbacks
#
#  Stage 2 — serve  (nginx:1.27-alpine)
#    • No Node, no Vite, no npm — pure nginx binary
#    • Copies only dist/ from the builder stage
#    • Port 8080
#
# Build:  docker build -t antiochia-archive:nginx .
# Run:    docker run -p 8080:8080 antiochia-archive:nginx
# =============================================================================

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: builder
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# 1. Install deps (only devDependencies needed — vite is a devDep)
COPY package*.json ./
RUN npm ci

# 2. Copy source files
COPY index.html     ./index.html
COPY 404.html       ./404.html
COPY style.css      ./style.css
COPY vite.config.js ./vite.config.js
COPY pages/         ./pages/
COPY scripts/       ./scripts/
COPY data/archive.json ./data/archive.json
# scripts/v2-archive-release.js (invoked by postbuild's generate-v2-detail-pages.js)
# imports the pure, no-secrets v2 mapping/serialization logic straight out of
# backend/ to compute the canonical public v2 entity list for static page
# generation — same read-only, no-Firestore code path documented in
# V2-ARCHITECTURE.md "Production v2 data path". Only source + committed JSON
# data is copied here: no backend/node_modules, no .env, no server/auth code.
COPY backend/dataModel.js ./backend/dataModel.js
COPY backend/v2/           ./backend/v2/
COPY data/v2/               ./data/v2/
# 3. Copy public/ assets (lang.js lives here)
#    Vite will copy everything in public/ verbatim to dist/
COPY public/        ./public/

# 4. Run production build
#    - vite build: bundles index.html/CSS into dist/, copies public/* to dist/
RUN npm run build

# Verify dist/ contents (shows up in docker build log)
RUN echo "=== dist/ contents ===" && ls -lh dist/ && echo "========================"

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: serve  (pure nginx — no Node, no Vite)
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS serve

LABEL maintainer="AntiochiaArchive Contributors"
LABEL description="AntiochiaArchive — nginx static file server (production)"

# Docker Compose overrides this with the backend service name. Cloud Run must set
# it to the deployed backend URL until the services are consolidated.
ENV BACKEND_UPSTREAM=http://127.0.0.1:5000

# nginx/default.conf's /archive-v2/ location branches its request handling
# on this variable. Defaults to "runtime-authoritative" — every request
# goes to the backend and its response (200 or 404) is final, with NO
# static-file fallback of any kind. This is required once
# V2_DATA_STORE=sqlite is authoritative: falling back to a static file on
# a backend 404 cannot distinguish "unknown slug" from "this entity was
# just archived," which would publicly resurrect archived content (see the
# "release-blocker" round's Section 1-3 and nginx/default.conf's header
# comment for the exact bug this fixed). A deployment confirmed to be
# running local/firestore/memory (never sqlite, where archiving-at-request-
# time cannot happen) can set ARCHIVE_V2_ROUTING_MODE=deploy-authoritative
# to restore the original, faster, static-file-first request ordering.
# This MUST be a real env var (not left unset) — nginx's envsubst template
# step only substitutes variables that are actually present in the
# container environment; an unset one would reach nginx.conf as the
# literal, unparseable text "${ARCHIVE_V2_ROUTING_MODE}".
ENV ARCHIVE_V2_ROUTING_MODE=runtime-authoritative

# Replace default nginx config
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/default.conf /etc/nginx/templates/default.conf.template

# Selects the /archive-v2/ routing mode (ARCHIVE_V2_ROUTING_MODE) once at
# container startup, before nginx's own bundled envsubst step — see
# nginx/10-select-archive-v2-mode.sh and default.conf's "IMPLEMENTATION
# NOTE" for why this can't be a runtime nginx `if`. docker-entrypoint.d
# scripts run in lexical filename order; "10-" runs before the official
# image's own "20-envsubst-on-templates.sh".
COPY nginx/10-select-archive-v2-mode.sh /docker-entrypoint.d/10-select-archive-v2-mode.sh
RUN chmod +x /docker-entrypoint.d/10-select-archive-v2-mode.sh

# Copy the full Vite build output from stage 1
# Expected layout inside /usr/share/nginx/html/:
#   index.html
#   assets/
#     style-<hash>.css
#     script-<hash>.js
#     lang-<hash>.js
COPY --from=builder /app/dist/ /usr/share/nginx/html/

# Expose HTTP port
EXPOSE 8080

# Start nginx in foreground (daemon off keeps the container alive)
CMD ["nginx", "-g", "daemon off;"]
