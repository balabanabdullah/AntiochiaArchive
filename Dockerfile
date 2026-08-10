# =============================================================================
# AntiochiaArchive — Dockerfile (Multi-stage: Vite build → nginx)
#
#  Stage 1 — builder  (node:20-alpine)
#    • npm ci → installs only devDependencies (vite)
#    • vite build → outputs to dist/
#       - index.html → dist/index.html  (processed by Vite)
#       - style.css  → dist/assets/*.css (hashed)
#       - public/lang.js   → dist/lang.js   (publicDir: verbatim copy)
#       - public/script.js → dist/script.js (publicDir: verbatim copy)
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
COPY style.css      ./style.css
COPY vite.config.js ./vite.config.js
COPY pages/         ./pages/
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

# Replace default nginx config
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/default.conf /etc/nginx/templates/default.conf.template

# Copy the full Vite build output from stage 1
# Expected layout inside /usr/share/nginx/html/:
#   index.html
#   lang.js
#   script.js
#   assets/
#     index-<hash>.css
COPY --from=builder /app/dist/ /usr/share/nginx/html/

# Expose HTTP port
EXPOSE 8080

# Start nginx in foreground (daemon off keeps the container alive)
CMD ["nginx", "-g", "daemon off;"]
