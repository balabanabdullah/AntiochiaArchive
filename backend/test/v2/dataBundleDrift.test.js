// Guards Phase 0's production data-bundling strategy (see V2-ARCHITECTURE.md
// "Legacy replacement layer" / Dockerfile comment above `COPY data/ ./data/`):
// backend/data/*.json is a COMMITTED, drift-checked copy of the real
// repository-root data/*.json files, bundled into the backend Docker image
// because Cloud Run's `--source backend` deploy sends only the backend/
// directory as build context — the real data/ directory is physically
// unreachable from inside that build. If the two ever diverge, production
// would silently serve stale (or, worse, unreviewed) cultural content.
//
// This mirrors an existing pattern already in this repo: scripts/
// validate-detail-pages.js already fails the build if public/sitemap.xml
// drifts from data/archive.json. Same idea, applied to the new bundle.
//
// Structural (parsed) equality, not byte/whitespace equality — only content
// drift should ever fail this test.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../");

const BUNDLE_PAIRS = Object.freeze([
  ["data/archive.json", "backend/data/archive.json"],
  ["data/v2/entities.json", "backend/data/v2/entities.json"],
  ["data/v2/relationships.json", "backend/data/v2/relationships.json"],
  ["data/v2/legacyReplacements.json", "backend/data/v2/legacyReplacements.json"],
]);

async function readJson(relativePath) {
  const raw = await fs.readFile(path.join(REPO_ROOT, relativePath), "utf-8");
  return JSON.parse(raw);
}

for (const [canonicalPath, bundledPath] of BUNDLE_PAIRS) {
  test(`${bundledPath} matches the canonical ${canonicalPath} (production bundle must not drift)`, async () => {
    const [canonical, bundled] = await Promise.all([readJson(canonicalPath), readJson(bundledPath)]);
    assert.deepEqual(
      bundled,
      canonical,
      `${bundledPath} has drifted from ${canonicalPath}. Re-sync it (copy the canonical file's content over the ` +
      "bundled one) before the next backend deploy — production reads only the bundled copy.",
    );
  });
}
