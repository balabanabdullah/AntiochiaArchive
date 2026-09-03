#!/bin/sh
# Runs as a docker-entrypoint.d script (see the root Dockerfile), BEFORE
# nginx's own bundled 20-envsubst-on-templates.sh — see nginx/default.conf's
# "IMPLEMENTATION NOTE" comment on the /archive-v2/ location for why this
# exists: nginx cannot conditionally choose between "always proxy to the
# backend, no fallback" and "try the static file first" at REQUEST time
# (try_files is rejected inside `if`, and cannot take a variable as its
# named-location fallback), so the choice is made once here, at container
# STARTUP, by deleting whichever of the two marker-delimited location
# blocks in the template was NOT selected — envsubst then only ever sees
# one of them.
set -e

TEMPLATE_DIR="/etc/nginx/templates"
RAW_MODE="${ARCHIVE_V2_ROUTING_MODE:-runtime-authoritative}"

# "backend-first"/"static-first" were this mechanism's original names
# (the "correctness pass" round); kept as accepted aliases so an
# already-configured deployment does not silently break, but
# "runtime-authoritative"/"deploy-authoritative" are the names used going
# forward (see nginx/default.conf's header comment for why "backend-first"
# stopped being an accurate description once the static fallback on a
# backend 404 was removed — the "release-blocker" round's Section 1-3).
case "$RAW_MODE" in
  backend-first) MODE="runtime-authoritative" ;;
  static-first) MODE="deploy-authoritative" ;;
  *) MODE="$RAW_MODE" ;;
esac

for template in "$TEMPLATE_DIR"/*.template; do
  [ -f "$template" ] || continue
  if ! grep -q "ARCHIVE_V2_MODE_RUNTIME_AUTHORITATIVE_START" "$template"; then
    continue
  fi
  if [ "$MODE" = "deploy-authoritative" ]; then
    sed -i '/# ARCHIVE_V2_MODE_RUNTIME_AUTHORITATIVE_START/,/# ARCHIVE_V2_MODE_RUNTIME_AUTHORITATIVE_END/d' "$template"
    sed -i '/# ARCHIVE_V2_MODE_DEPLOY_AUTHORITATIVE_START/d;/# ARCHIVE_V2_MODE_DEPLOY_AUTHORITATIVE_END/d' "$template"
  elif [ "$MODE" = "runtime-authoritative" ]; then
    sed -i '/# ARCHIVE_V2_MODE_DEPLOY_AUTHORITATIVE_START/,/# ARCHIVE_V2_MODE_DEPLOY_AUTHORITATIVE_END/d' "$template"
    sed -i '/# ARCHIVE_V2_MODE_RUNTIME_AUTHORITATIVE_START/d;/# ARCHIVE_V2_MODE_RUNTIME_AUTHORITATIVE_END/d' "$template"
  else
    echo "[10-select-archive-v2-mode.sh] ARCHIVE_V2_ROUTING_MODE must be 'runtime-authoritative' or 'deploy-authoritative' (or the legacy aliases 'backend-first'/'static-first'), got: '$RAW_MODE'. Refusing to guess — failing startup." >&2
    exit 1
  fi
  echo "[10-select-archive-v2-mode.sh] /archive-v2/ routing mode: $MODE ($template)"
done
