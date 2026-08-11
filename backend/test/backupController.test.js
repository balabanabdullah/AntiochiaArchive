import test from "node:test";
import assert from "node:assert/strict";
import { requireAdmin } from "../auth.js";
import {
  createBackupHandlers,
  normalizeArchiveExport,
  normalizeSubmissionsExport,
  preventBackupCaching,
} from "../backupController.js";
import { ARCHIVE_CATEGORIES } from "../dataModel.js";

const fixedDate = new Date("2026-08-11T12:34:56.000Z");

function sampleArchive() {
  const archive = Object.fromEntries(ARCHIVE_CATEGORIES.map((category) => [category, []]));
  archive.history.push({
    id: "history-1",
    categoryKey: "history",
    title: { tr: "Antakya", en: "Antioch", ar: "أنطاكية" },
    sources: [{ id: "source-backup", type: "book", title: "Verified title" }],
    image: "/images/archive/example.jpg",
    imageMetadata: {
      alt: { tr: "Arşiv görseli", en: "Archive image", ar: "صورة أرشيفية" },
      source: "Example Archive",
      license: "CC BY 4.0",
      aiGenerated: false,
    },
    customMetadata: { preserved: true },
  });
  return archive;
}

function sampleSubmissions() {
  return [{
    id: "sub-1",
    name: "Archive Visitor",
    email: "visitor@example.test",
    message: "A private memory",
    createdAt: { toDate: () => new Date("2026-08-10T10:20:30.000Z") },
  }];
}

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    set(values) {
      Object.assign(this.headers, values);
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function invokeProtected(handler, authorization = "") {
  const request = { get: (name) => (name === "authorization" ? authorization : "") };
  const response = responseRecorder();
  let handlerResult;
  preventBackupCaching(request, response, () => {
    requireAdmin(request, response, () => {
      handlerResult = handler(request, response);
    });
  });
  await handlerResult;
  return response;
}

function handlersFor(store) {
  return createBackupHandlers({
    storeProvider: () => store,
    now: () => fixedDate,
  });
}

test("unauthenticated archive export is rejected", async () => {
  const original = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = "backup-test-token";
  const response = await invokeProtected(handlersFor({}).archive);
  assert.equal(response.statusCode, 401);
  assert.match(response.headers["Cache-Control"], /no-store/);
  if (original === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = original;
});

test("unauthenticated submissions export is rejected", async () => {
  const original = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = "backup-test-token";
  const response = await invokeProtected(handlersFor({}).submissions);
  assert.equal(response.statusCode, 401);
  assert.match(response.headers["Cache-Control"], /no-store/);
  if (original === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = original;
});

test("authenticated archive export returns all categories and a safe filename", async () => {
  const original = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = "backup-test-token";
  const archive = sampleArchive();
  const handlers = handlersFor({ getArchive: async () => archive });
  const response = await invokeProtected(handlers.archive, "Bearer backup-test-token");
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(Object.keys(body), ARCHIVE_CATEGORIES);
  assert.deepEqual(body.history[0].customMetadata, { preserved: true });
  assert.deepEqual(body.history[0].sources, archive.history[0].sources);
  assert.deepEqual(body.history[0].imageMetadata, archive.history[0].imageMetadata);
  assert.equal(body.history[0].image, "/images/archive/example.jpg");
  assert.equal(
    response.headers["Content-Disposition"],
    'attachment; filename="antiochia-archive-backup-2026-08-11-123456.json"',
  );
  assert.match(response.headers["Content-Type"], /application\/json/);
  assert.match(response.body, /\n  "history"/);
  if (original === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = original;
});

test("authenticated submissions export returns normalized private records", async () => {
  const original = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = "backup-test-token";
  const handlers = handlersFor({ getSubmissions: async () => sampleSubmissions() });
  const response = await invokeProtected(handlers.submissions, "Bearer backup-test-token");
  const body = JSON.parse(response.body);

  assert.deepEqual(body, [{
    id: "sub-1",
    name: "Archive Visitor",
    email: "visitor@example.test",
    message: "A private memory",
    createdAt: "2026-08-10T10:20:30.000Z",
  }]);
  assert.match(response.headers["Cache-Control"], /private/);
  assert.match(response.headers["Cache-Control"], /no-store/);
  if (original === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = original;
});

test("full export contains snapshots but never environment secrets", async () => {
  const originalAdmin = process.env.ADMIN_TOKEN;
  const originalMail = process.env.MAIL_PASS;
  process.env.ADMIN_TOKEN = "never-export-this-admin-token";
  process.env.MAIL_PASS = "never-export-this-mail-secret";
  const store = {
    getArchive: async () => sampleArchive(),
    getSubmissions: async () => sampleSubmissions(),
  };
  const response = await invokeProtected(
    handlersFor(store).full,
    "Bearer never-export-this-admin-token",
  );
  const body = JSON.parse(response.body);

  assert.equal(body.version, 1);
  assert.equal(body.exportedAt, fixedDate.toISOString());
  assert.equal(body.archive.history.length, 1);
  assert.deepEqual(body.archive.history[0].sources, sampleArchive().history[0].sources);
  assert.deepEqual(body.archive.history[0].imageMetadata, sampleArchive().history[0].imageMetadata);
  assert.equal(body.submissions.length, 1);
  assert.doesNotMatch(response.body, /never-export-this-admin-token/);
  assert.doesNotMatch(response.body, /never-export-this-mail-secret/);
  assert.equal(
    response.headers["Content-Disposition"],
    'attachment; filename="antiochia-full-backup-2026-08-11-123456.json"',
  );

  if (originalAdmin === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = originalAdmin;
  if (originalMail === undefined) delete process.env.MAIL_PASS;
  else process.env.MAIL_PASS = originalMail;
});

test("malformed datastore snapshots are rejected before export", () => {
  assert.throws(() => normalizeArchiveExport({ history: [] }), /stories/);
  assert.throws(() => normalizeSubmissionsExport({}), /array/);
});
