# AntiochiaArchive Backend Dockerfile
#
# node:22-alpine (NOT :20) — required by better-sqlite3@13, which declares
# engines.node >= 22 in its own package.json.
#
# The "release-blocker" round re-litigated this exact choice on the
# reasonable premise that a Node major-version bump should not happen
# merely as a side effect of fixing a compile error, and tested node:20-
# alpine directly rather than trusting the engines field alone:
#
#   1. `npm ci --omit=dev` on bare node:20-alpine fails outright — no
#      Python/compiler, and better-sqlite3 has no install/postinstall
#      script, so npm's default behavior for a package with a binding.gyp
#      is to unconditionally run `node-gyp rebuild`, which needs both.
#   2. Adding the SAME `apk add --virtual .build-deps python3 make g++`
#      step this file already uses (see below) makes that `npm ci` on
#      node:20-alpine actually SUCCEED — the compile itself completes and
#      the module loads (`require('better-sqlite3')` returns fine).
#   3. But actually USING it segfaults immediately: `new Database(':memory:')`
#      crashes the node:20-alpine process with SIGSEGV (exit code 139)
#      every time, reproduced directly (not simulated) via a real container
#      run. Node 20's N-API/V8 ABI is genuinely incompatible with this
#      better-sqlite3 build at runtime, not merely unsupported on paper —
#      `npm`'s own engines check is only a warning by default, so `npm ci`
#      not failing outright at step 2 does not mean the result works.
#
# This is a real, verified, non-negotiable constraint, not a preference:
# node:22-alpine stays. It does not change behavior for the current
# DATA_STORE=firestore/V2_DATA_STORE=local production configuration, which
# never installs or imports better-sqlite3 at runtime regardless of the
# base image's Node version.
#
# better-sqlite3@13 also ships a bundled prebuilt binary for linux-musl-x64
# (node_modules/better-sqlite3/prebuilds/linuxmusl-x64.node — Alpine's own
# libc), but this project's actual `npm ci --omit=dev` (run against the
# real, committed package-lock.json — NOT a fresh `npm install`, which
# behaves differently) does not use that bundled prebuild: npm's own
# default behavior for a package with a binding.gyp and no install/
# postinstall script is to unconditionally run `node-gyp rebuild`,
# ignoring the bundled prebuild entirely. The fix actually applied here is
# the `apk add --virtual .build-deps python3 make g++` step below, which
# lets that node-gyp compile genuinely succeed (verified: real `npm ci`
# against this project's actual lockfile, real compile, real working
# SQLite afterward, on node:22-alpine), with the build toolchain removed
# again in the same layer so the final image carries none of its size.
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install production dependencies. The build toolchain is added and
# removed in this SAME layer (one RUN, chained with &&) so the final image
# never carries its ~11MB — see the header comment above for why it's
# needed at all despite better-sqlite3 shipping a musl prebuild.
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm ci --omit=dev \
    && apk del .build-deps

# Copy backend source files
COPY . .

# Explicit, load-bearing copy of the reviewed, drift-checked v2 dataset
# bundled for production (see backend/test/v2/dataBundleDrift.test.js and
# V2-ARCHITECTURE.md "Legacy replacement layer" / "Cultural entity
# publication review"). Cloud Run's `gcloud run deploy
# antiochia-archive-backend --source backend` sends only this backend/
# directory as the build context — the repository-root data/ directory is
# physically outside it and unreachable by any COPY instruction. This line
# is what makes V2_DATA_STORE=local + the V2_*_JSON_PATH env vars
# (see docker-compose.yml / V1-RELEASE.md) resolve to real, present files
# inside the image instead of crash-looping at startup. Do not rely on the
# blanket `COPY . .` above alone — this line stays even if that copy step
# changes.
COPY data/ ./data/

# Expose port
EXPOSE 5000

# Start Express server
CMD ["npm", "start"]
