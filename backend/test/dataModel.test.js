import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCHIVE_CATEGORIES,
  ENTITY_TYPES,
  SOURCE_TYPES,
  isAllowedArchiveMediaPath,
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

test("archive validation accepts stable slugs and controlled entity types", () => {
  const archive = validArchive();
  archive.history.push({ id: "h1", slug: "antik-akdeniz-kavsagi", entityType: "historicalContext" });
  assert.deepEqual(validateArchive(archive), { valid: true });
  assert.ok(ENTITY_TYPES.includes("beliefSite"));

  archive.history[0].slug = "Invalid Slug";
  assert.match(validateArchive(archive).error, /slug/);
  archive.history[0].slug = "valid-slug";
  archive.history[0].entityType = "touristAttraction";
  assert.match(validateArchive(archive).error, /entityType/);
});

test("archive validation rejects duplicate global slugs", () => {
  const archive = validArchive();
  archive.history.push({ id: "h1", slug: "shared-slug" });
  archive.stories.push({ id: "s1", slug: "shared-slug" });
  assert.match(validateArchive(archive).error, /Duplicate archive slug/);
});

test("archive validation identifies a missing category", () => {
  const archive = validArchive();
  delete archive.music;
  assert.equal(validateArchive(archive).valid, false);
  assert.match(validateArchive(archive).error, /music/);
});

test("archive validation rejects unsupported top-level categories", () => {
  const archive = validArchive();
  archive.hero = [];
  assert.equal(validateArchive(archive).valid, false);
  assert.match(validateArchive(archive).error, /Unsupported archive categories: hero/);
});

test("legacy archive records remain valid without provenance metadata", () => {
  const archive = validArchive();
  archive.history.push({ id: "h1", categoryKey: "all", title: { en: "Legacy record" }, image: null });
  assert.deepEqual(validateArchive(archive), { valid: true });
});

test("archive validation accepts the controlled source vocabulary and optional fields", () => {
  const archive = validArchive();
  archive.history.push({
    id: "h1",
    sources: SOURCE_TYPES.map((type, index) => ({
      id: `source-${index}`,
      type,
      title: "Verified source",
      url: "https://example.test/catalog/1",
    })),
  });
  assert.deepEqual(validateArchive(archive), { valid: true });
});

test("archive validation rejects malformed sources and unsafe source URLs", () => {
  const wrongType = validArchive();
  wrongType.history.push({ id: "h1", sources: {} });
  assert.match(validateArchive(wrongType).error, /sources must be an array/);

  const wrongEntry = validArchive();
  wrongEntry.history.push({ id: "h1", sources: ["not-an-object"] });
  assert.match(validateArchive(wrongEntry).error, /sources\[0\] must be an object/);

  const wrongVocabulary = validArchive();
  wrongVocabulary.history.push({ id: "h1", sources: [{ type: "socialMediaPost" }] });
  assert.match(validateArchive(wrongVocabulary).error, /type must be one of/);

  const wrongUrl = validArchive();
  wrongUrl.history.push({ id: "h1", sources: [{ type: "website", url: "javascript:alert(1)" }] });
  assert.match(validateArchive(wrongUrl).error, /sources\[0\]\.url.*http/);
});

test("archive media paths allow local and http(s) assets but reject scripts", () => {
  assert.equal(isAllowedArchiveMediaPath("/images/archive/example.jpg"), true);
  assert.equal(isAllowedArchiveMediaPath("https://media.example.test/example.jpg"), true);
  assert.equal(isAllowedArchiveMediaPath("javascript:alert(1)"), false);

  const archive = validArchive();
  archive.gallery.push({ id: "g1", src: "/images/archive/example.jpg" });
  assert.deepEqual(validateArchive(archive), { valid: true });
  archive.gallery[0].src = "javascript:alert(1)";
  assert.match(validateArchive(archive).error, /gallery\[0\]\.src/);
});

test("image metadata validates multilingual text, external URLs, and AI flags", () => {
  const archive = validArchive();
  archive.gallery.push({
    id: "g1",
    imageMetadata: {
      alt: { tr: "Taş yapı", en: "Stone structure", ar: "بناء حجري" },
      caption: { en: "Verified caption" },
      originalUrl: "https://archive.example.test/item/1",
      aiGenerated: false,
    },
  });
  assert.deepEqual(validateArchive(archive), { valid: true });

  archive.gallery[0].imageMetadata.aiGenerated = "false";
  assert.match(validateArchive(archive).error, /aiGenerated must be a boolean/);
  archive.gallery[0].imageMetadata.aiGenerated = false;
  archive.gallery[0].imageMetadata.originalUrl = "data:text/plain,unsafe";
  assert.match(validateArchive(archive).error, /originalUrl.*http/);
});

test("archive document normalization always returns the frontend shape", () => {
  const item = {
    id: 1,
    sources: [{ id: "source-1", type: "archive" }],
    imageMetadata: { alt: { en: "Archive image" }, aiGenerated: false },
  };
  const normalized = normalizeArchiveDocuments({ history: { items: [item] } });
  assert.deepEqual(Object.keys(normalized), ARCHIVE_CATEGORIES);
  assert.deepEqual(normalized.history, [item]);
  assert.deepEqual(normalized.history[0].sources, item.sources);
  assert.deepEqual(normalized.history[0].imageMetadata, item.imageMetadata);
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
