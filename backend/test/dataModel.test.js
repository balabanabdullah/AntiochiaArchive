import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCHIVE_CATEGORIES,
  normalizeArchiveDocuments,
  normalizeCreatedAt,
  serializeSubmission,
  validateArchive,
} from "../dataModel.js";

function validArchive() {
  return Object.fromEntries(ARCHIVE_CATEGORIES.map((category) => [category, []]));
}

test("archive validation accepts all six array categories", () => {
  assert.deepEqual(validateArchive(validArchive()), { valid: true });
});

test("archive validation identifies a missing category", () => {
  const archive = validArchive();
  delete archive.music;
  assert.equal(validateArchive(archive).valid, false);
  assert.match(validateArchive(archive).error, /music/);
});

test("archive document normalization always returns the frontend shape", () => {
  const normalized = normalizeArchiveDocuments({ history: { items: [{ id: 1 }] } });
  assert.deepEqual(Object.keys(normalized), ARCHIVE_CATEGORIES);
  assert.deepEqual(normalized.history, [{ id: 1 }]);
  assert.deepEqual(normalized.gallery, []);
});

test("createdAt normalization accepts Firestore-like timestamps", () => {
  const timestamp = { toDate: () => new Date("2025-01-02T03:04:05.000Z") };
  assert.equal(normalizeCreatedAt(timestamp), "2025-01-02T03:04:05.000Z");
});

test("submission serialization does not expose Firestore types", () => {
  const result = serializeSubmission("sub-1", {
    name: "Ada",
    email: "ada@example.test",
    message: "Archive note",
    createdAt: { seconds: 1735787045, nanoseconds: 0 },
  });
  assert.deepEqual(result, {
    id: "sub-1",
    name: "Ada",
    email: "ada@example.test",
    message: "Archive note",
    createdAt: "2025-01-02T03:04:05.000Z",
  });
});
