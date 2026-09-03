// "correctness pass" round, Section 6/7: proves the actual bug and its fix
// against a REAL run of scripts/generate-sitemap.js (not just an isolated
// unit of its logic) — the previous round's static sitemap.xml baked every
// public v2 entity's URL in at build time via v2SitemapUrls(), which would
// go stale the moment that entity was later archived through Admin in a
// V2_DATA_STORE=sqlite deployment (removed from the live
// backend/v2/render/runtimeSitemap.js sitemap, but not from this file until
// the next deploy). Fixed by removing entity URLs from this static file
// entirely — see scripts/generate-sitemap.js's header for the full account.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

function runGenerateSitemap() {
  execFileSync("node", [path.resolve(REPO_ROOT, "scripts/generate-sitemap.js")], { cwd: REPO_ROOT, encoding: "utf-8" });
}

test("generate-sitemap.js's real output contains zero /archive-v2/ (cultural entity) URLs — those are served live from /sitemap-runtime.xml instead", async () => {
  runGenerateSitemap();
  const xml = await readFile(path.resolve(REPO_ROOT, "dist/sitemap.xml"), "utf8");
  assert.ok(!xml.includes("/archive-v2/"), "sitemap.xml must never bake in a cultural-entity URL again — that is exactly the bug this round fixed");
  // Still contains the real static system routes it always has.
  assert.match(xml, /<loc>[^<]*\/pages\/places\.html<\/loc>/);
  assert.match(xml, /<loc>[^<]*\/pages\/map\.html<\/loc>/);
});

test("generate-sitemap.js's real output has no duplicate URLs", async () => {
  runGenerateSitemap();
  const xml = await readFile(path.resolve(REPO_ROOT, "dist/sitemap.xml"), "utf8");
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(new Set(urls).size, urls.length);
});
