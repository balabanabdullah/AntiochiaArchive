// "release-blocker" round, Sections 1-4: the mandatory, real,
// through-the-actual-nginx-layer proof that an archived SQLite entity
// can never be resurrected from a stale static file. Every other test in
// this codebase hits either the backend directly or the static build
// directly — this is the only one that boots a real nginx container from
// the real nginx/default.conf template and requests THROUGH it, exactly as
// a public visitor would.
//
// Requires Docker. Skips (not fails) when Docker is unavailable, since a
// missing Docker daemon is an environment limitation, not a code defect —
// every test here is otherwise exercised via the backend-direct tests in
// backend/test/v2/routes/v2DetailRoutes.test.js.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const BACKEND_ROOT = path.resolve(REPO_ROOT, "backend");

/** Dynamic import() requires a file:// URL for an absolute path on Windows — a bare "C:\..." path throws ERR_UNSUPPORTED_ESM_URL_SCHEME. */
function importBackendModule(relativePath) {
  return import(pathToFileURL(path.join(BACKEND_ROOT, relativePath)).href);
}

function dockerAvailable() {
  const result = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" });
  return result.status === 0;
}

const DOCKER_OK = dockerAvailable();
const STALE_MARKER = "STALE-STATIC-MARKER-DO-NOT-SERVE";

const FIXTURE_ASSET_HTML = `<!doctype html><html><head>
  <link rel="stylesheet" href="/assets/style-testhash.css">
  <script src="/assets/lang-testhash.js"></script>
  <script src="/assets/archive-v2-api-testhash.js"></script>
  <script src="/assets/archive-store-testhash.js"></script>
  <script src="/assets/search-testhash.js"></script>
  <script src="/assets/music-testhash.js"></script>
  <script src="/assets/script-testhash.js"></script>
</head><body></body></html>`;

/**
 * Starts the REAL backend Express app (v2DetailRouter, on a real, isolated
 * SQLite DB) bound to 0.0.0.0 so a Docker container can reach it via
 * host.docker.internal (Docker Desktop's documented bridge from a
 * container back to the host).
 */
async function startBackend(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-nginx-routing-"));
  const originalEnv = {
    SQLITE_DB_PATH: process.env.SQLITE_DB_PATH,
    LOCAL_STORAGE_ROOT: process.env.LOCAL_STORAGE_ROOT,
    V2_DATA_STORE: process.env.V2_DATA_STORE,
    CLIENT_URL: process.env.CLIENT_URL,
  };
  process.env.V2_DATA_STORE = "sqlite";
  process.env.SQLITE_DB_PATH = path.join(dir, "test.db");
  process.env.LOCAL_STORAGE_ROOT = path.join(dir, "storage");

  const assetServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(FIXTURE_ASSET_HTML);
  });
  await new Promise((resolvePromise) => assetServer.listen(0, "127.0.0.1", resolvePromise));
  process.env.CLIENT_URL = `http://127.0.0.1:${assetServer.address().port}`;

  const { initializeV2Store } = await importBackendModule("v2/stores/v2Store.js");
  const { closeSqlite } = await importBackendModule("db/sqliteConnection.js");
  const v2DetailRoutesModule = await importBackendModule("v2/routes/v2DetailRoutes.js");
  const { _resetDetailAssetCacheForTests } = await importBackendModule("v2/render/detailAssetManifest.js");
  const contentService = await importBackendModule("admin/contentService.js");
  // express is a backend-only dependency (backend/node_modules), not
  // hoisted to the repo root — resolve it from there explicitly rather
  // than a bare `import("express")`, which Node would never find from a
  // root-level test file.
  const expressModule = await importBackendModule("node_modules/express/index.js");
  const express = expressModule.default;

  await initializeV2Store();
  _resetDetailAssetCacheForTests();

  const app = express();
  app.use("/archive-v2", v2DetailRoutesModule.default);
  const server = await new Promise((resolvePromise) => {
    const instance = app.listen(0, "0.0.0.0", () => resolvePromise(instance));
  });
  const { port } = server.address();

  t.after(async () => {
    await new Promise((resolvePromise) => server.close(resolvePromise));
    await new Promise((resolvePromise) => assetServer.close(resolvePromise));
    closeSqlite();
    _resetDetailAssetCacheForTests();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await fs.rm(dir, { recursive: true, force: true });
  });

  return { port, contentService };
}

/**
 * Builds a temporary "dist"-shaped static root containing exactly one stale
 * archive-v2/<slug>/index.html (with a distinctive marker string), and
 * boots a real nginx container from the real nginx/default.conf +
 * 10-select-archive-v2-mode.sh, pointed at the host backend via
 * host.docker.internal. Returns the container's published port; caller is
 * responsible for `docker rm -f` via t.after.
 */
async function startNginxWithStaleStatic(t, { slug, backendPort, routingMode }) {
  const distDir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-nginx-dist-"));
  await fs.mkdir(path.join(distDir, "archive-v2", slug), { recursive: true });
  await fs.writeFile(
    path.join(distDir, "archive-v2", slug, "index.html"),
    `<!doctype html><html><body><h1>${STALE_MARKER}</h1></body></html>`,
    "utf8",
  );
  await fs.writeFile(path.join(distDir, "index.html"), "<!doctype html><html><body>root</body></html>", "utf8");

  const imageDir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-nginx-image-"));
  await fs.writeFile(path.join(imageDir, "Dockerfile"), [
    "FROM nginx:1.27-alpine",
    "ENV BACKEND_UPSTREAM=http://host.docker.internal:__BACKEND_PORT__",
    `ENV ARCHIVE_V2_ROUTING_MODE=${routingMode}`,
    "RUN rm /etc/nginx/conf.d/default.conf",
    "COPY default.conf /etc/nginx/templates/default.conf.template",
    "COPY select-mode.sh /docker-entrypoint.d/10-select-archive-v2-mode.sh",
    "RUN chmod +x /docker-entrypoint.d/10-select-archive-v2-mode.sh",
  ].join("\n").replace("__BACKEND_PORT__", String(backendPort)), "utf8");
  await fs.copyFile(path.join(REPO_ROOT, "nginx/default.conf"), path.join(imageDir, "default.conf"));
  await fs.copyFile(path.join(REPO_ROOT, "nginx/10-select-archive-v2-mode.sh"), path.join(imageDir, "select-mode.sh"));

  const imageTag = `antiochia-nginx-routing-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  execFileSync("docker", ["build", "-q", "-t", imageTag, imageDir], { encoding: "utf8" });

  const containerName = `${imageTag}-c`;
  execFileSync("docker", [
    "run", "-d", "--name", containerName,
    "-v", `${distDir}:/usr/share/nginx/html:ro`,
    "-p", "0:8080",
    imageTag,
  ], { encoding: "utf8" });

  t.after(async () => {
    spawnSync("docker", ["rm", "-f", containerName]);
    spawnSync("docker", ["rmi", imageTag]);
    await fs.rm(distDir, { recursive: true, force: true });
    await fs.rm(imageDir, { recursive: true, force: true });
  });

  const inspect = execFileSync("docker", ["inspect", containerName, "--format", "{{(index (index .NetworkSettings.Ports \"8080/tcp\") 0).HostPort}}"], { encoding: "utf8" }).trim();
  // Give nginx's entrypoint a moment to finish envsubst + start.
  await new Promise((resolvePromise) => { setTimeout(resolvePromise, 1500); });
  return Number(inspect);
}

test("release-blocker Section 4: an archived existing entity is NEVER resurrected from a stale static file, through the real nginx layer (runtime-authoritative mode)", { skip: !DOCKER_OK && "Docker is not available in this environment" }, async (t) => {
  const { port: backendPort, contentService } = await startBackend(t);
  const slug = "nginx-routing-existing";
  contentService.createEntity({ entityType: "place", proposedFields: { id: "place-existing", slug, title: { tr: "Var Olan Kayıt" } }, actor: "test" });
  contentService.publishEntity({ id: "place-existing", actor: "test" });

  const nginxPort = await startNginxWithStaleStatic(t, { slug, backendPort, routingMode: "runtime-authoritative" });

  // Before archive: published entity, stale static file ALSO present —
  // runtime-authoritative must still serve the live backend render, 200.
  const before = await fetch(`http://127.0.0.1:${nginxPort}/archive-v2/${slug}`);
  assert.equal(before.status, 200);
  const beforeBody = await before.text();
  assert.ok(!beforeBody.includes(STALE_MARKER), "even before archiving, the live backend page must be served, never the stale static file");
  assert.match(beforeBody, /Var Olan Kayıt/);

  // Archive via the real content service — no build, no static file
  // deletion, no deploy.
  contentService.archiveEntity({ id: "place-existing", actor: "test" });

  const afterArchive = await fetch(`http://127.0.0.1:${nginxPort}/archive-v2/${slug}`);
  assert.equal(afterArchive.status, 404, "an archived entity must 404 through nginx, even though a stale static file for it still exists on disk");
  const afterArchiveBody = await afterArchive.text();
  assert.ok(!afterArchiveBody.includes(STALE_MARKER), "the 404 response body must not be the stale static page's content");

  // Restore.
  contentService.restoreEntity({ id: "place-existing", toStatus: "published", actor: "test" });
  const afterRestore = await fetch(`http://127.0.0.1:${nginxPort}/archive-v2/${slug}`);
  assert.equal(afterRestore.status, 200);
  assert.match(await afterRestore.text(), /Var Olan Kayıt/);
});

test("release-blocker Section 5: draft/inReview/archived all 404 through nginx even with a stale static file present; only published/restored-published serve 200", { skip: !DOCKER_OK && "Docker is not available in this environment" }, async (t) => {
  const { port: backendPort, contentService } = await startBackend(t);
  const slug = "nginx-routing-states";
  contentService.createEntity({ entityType: "place", proposedFields: { id: "place-states", slug, title: { tr: "T" } }, actor: "test" });
  const nginxPort = await startNginxWithStaleStatic(t, { slug, backendPort, routingMode: "runtime-authoritative" });

  async function statusFor() {
    return (await fetch(`http://127.0.0.1:${nginxPort}/archive-v2/${slug}`)).status;
  }

  assert.equal(await statusFor(), 404, "draft must 404");

  contentService.sendToReview({ id: "place-states", actor: "test" });
  assert.equal(await statusFor(), 404, "inReview must 404");

  contentService.publishEntity({ id: "place-states", actor: "test" });
  assert.equal(await statusFor(), 200, "published must 200");

  contentService.archiveEntity({ id: "place-states", actor: "test" });
  assert.equal(await statusFor(), 404, "archived must 404, even with the stale static file present");

  contentService.restoreEntity({ id: "place-states", toStatus: "published", actor: "test" });
  assert.equal(await statusFor(), 200, "restored-published must 200 again");
});

test("release-blocker Section 6: a brand-new entity with NO static file at all behaves identically through nginx — published/archived/restored, no build", { skip: !DOCKER_OK && "Docker is not available in this environment" }, async (t) => {
  const { port: backendPort, contentService } = await startBackend(t);
  const slug = "nginx-routing-brand-new";
  // No static file created for this slug at all (unlike the other tests).
  const distDir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-nginx-dist-empty-"));
  await fs.writeFile(path.join(distDir, "index.html"), "<!doctype html><html><body>root</body></html>", "utf8");
  t.after(() => fs.rm(distDir, { recursive: true, force: true }));

  const imageDir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-nginx-image-empty-"));
  t.after(() => fs.rm(imageDir, { recursive: true, force: true }));
  await fs.writeFile(path.join(imageDir, "Dockerfile"), [
    "FROM nginx:1.27-alpine",
    `ENV BACKEND_UPSTREAM=http://host.docker.internal:${backendPort}`,
    "ENV ARCHIVE_V2_ROUTING_MODE=runtime-authoritative",
    "RUN rm /etc/nginx/conf.d/default.conf",
    "COPY default.conf /etc/nginx/templates/default.conf.template",
    "COPY select-mode.sh /docker-entrypoint.d/10-select-archive-v2-mode.sh",
    "RUN chmod +x /docker-entrypoint.d/10-select-archive-v2-mode.sh",
  ].join("\n"), "utf8");
  await fs.copyFile(path.join(REPO_ROOT, "nginx/default.conf"), path.join(imageDir, "default.conf"));
  await fs.copyFile(path.join(REPO_ROOT, "nginx/10-select-archive-v2-mode.sh"), path.join(imageDir, "select-mode.sh"));
  const imageTag = `antiochia-nginx-routing-test-newent-${Date.now()}`;
  execFileSync("docker", ["build", "-q", "-t", imageTag, imageDir], { encoding: "utf8" });
  const containerName = `${imageTag}-c`;
  execFileSync("docker", ["run", "-d", "--name", containerName, "-v", `${distDir}:/usr/share/nginx/html:ro`, "-p", "0:8080", imageTag], { encoding: "utf8" });
  t.after(() => { spawnSync("docker", ["rm", "-f", containerName]); spawnSync("docker", ["rmi", imageTag]); });
  const nginxPort = Number(execFileSync("docker", ["inspect", containerName, "--format", "{{(index (index .NetworkSettings.Ports \"8080/tcp\") 0).HostPort}}"], { encoding: "utf8" }).trim());
  await new Promise((resolvePromise) => { setTimeout(resolvePromise, 1500); });

  contentService.createEntity({ entityType: "place", proposedFields: { id: "place-brand-new", slug, title: { tr: "Yepyeni" } }, actor: "test" });
  contentService.publishEntity({ id: "place-brand-new", actor: "test" });
  const published = await fetch(`http://127.0.0.1:${nginxPort}/archive-v2/${slug}`);
  assert.equal(published.status, 200);
  assert.match(await published.text(), /Yepyeni/);

  contentService.archiveEntity({ id: "place-brand-new", actor: "test" });
  assert.equal((await fetch(`http://127.0.0.1:${nginxPort}/archive-v2/${slug}`)).status, 404);

  contentService.restoreEntity({ id: "place-brand-new", toStatus: "published", actor: "test" });
  assert.equal((await fetch(`http://127.0.0.1:${nginxPort}/archive-v2/${slug}`)).status, 200);
});

test("release-blocker Section 3: deploy-authoritative mode DOES serve the stale static file for an archived entity — proves the two modes are genuinely, observably different, and documents why deploy-authoritative is unsafe for a SQLite-authoritative deployment", { skip: !DOCKER_OK && "Docker is not available in this environment" }, async (t) => {
  const { port: backendPort, contentService } = await startBackend(t);
  const slug = "nginx-routing-deploy-authoritative";
  contentService.createEntity({ entityType: "place", proposedFields: { id: "place-deploy-auth", slug, title: { tr: "T" } }, actor: "test" });
  contentService.publishEntity({ id: "place-deploy-auth", actor: "test" });
  contentService.archiveEntity({ id: "place-deploy-auth", actor: "test" });

  const nginxPort = await startNginxWithStaleStatic(t, { slug, backendPort, routingMode: "deploy-authoritative" });
  const response = await fetch(`http://127.0.0.1:${nginxPort}/archive-v2/${slug}`);
  assert.equal(response.status, 200, "deploy-authoritative intentionally prefers the static file — this is why it must never be used for a SQLite-authoritative deployment");
  assert.ok((await response.text()).includes(STALE_MARKER));
});
