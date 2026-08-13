import test from "node:test";
import assert from "node:assert/strict";
import { serializePublicEntity, serializePublicEntities } from "../../v2/serializers/publicSerializer.js";

test("public serializer strips private and internal fields from a story", () => {
  const story = {
    id: "story-1",
    slug: "sample-story",
    entityType: "story",
    status: "published",
    title: { en: "Sample" },
    storyCategory: "familyMemory",
    transcript: { en: "A transcript." },
    // Private / internal fields that must never reach a public response:
    narratorRef: "contributor-42",
    consentRef: "consent-99",
    internalEditorialNotes: "Verify with grandmother's diary before publishing.",
    contributorEmail: "narrator@example.test",
    moderationFlag: "pending-review",
    adminOnly: { reviewerId: "admin-1" },
  };

  const output = serializePublicEntity(story);

  assert.equal(output.id, "story-1");
  assert.equal(output.storyCategory, "familyMemory");
  assert.deepEqual(output.transcript, { en: "A transcript." });

  for (const privateField of [
    "narratorRef",
    "consentRef",
    "internalEditorialNotes",
    "contributorEmail",
    "moderationFlag",
    "adminOnly",
  ]) {
    assert.equal(Object.hasOwn(output, privateField), false, `${privateField} must not be exposed publicly`);
  }
});

test("public serializer strips storage internals from media", () => {
  const media = {
    id: "media-1",
    entityType: "media",
    mediaType: "image",
    mediaRole: "realArchiveMedia",
    derivativeStoragePaths: ["/images/example.webp"],
    originalStoragePath: "image-staging/raw/example-original.tif",
    checksum: "sha256:abcdef1234567890",
  };

  const output = serializePublicEntity(media);

  assert.deepEqual(output.derivativeStoragePaths, ["/images/example.webp"]);
  assert.equal(Object.hasOwn(output, "originalStoragePath"), false);
  assert.equal(Object.hasOwn(output, "checksum"), false);
});

test("public serializer never exposes a nested consent record even if attached", () => {
  const story = {
    id: "story-2",
    slug: "another-story",
    entityType: "story",
    title: { en: "Another" },
    consent: {
      consentStatus: "granted",
      displayNamePermission: false,
    },
  };

  const output = serializePublicEntity(story);
  assert.equal(Object.hasOwn(output, "consent"), false);
});

test("serializePublicEntities maps across a list and returns an empty array for none", () => {
  assert.deepEqual(serializePublicEntities([]), []);
  assert.deepEqual(serializePublicEntities(undefined), []);
});

test("a structure with a real migration-preview image exposes a safe public 'media' summary", () => {
  const structure = {
    id: "st1",
    slug: "sample-structure",
    entityType: "structure",
    status: "published",
    title: { en: "Sample" },
    // Migration-only preview array (see v1ToV2Mapping.js#mapMediaPreview) —
    // must never itself reach the public response verbatim.
    media: [{
      path: "/images/structures/sample.webp",
      isPlaceholder: false,
      alt: { en: "Alt text" },
      caption: { en: "Caption text" },
      source: "Wikimedia Commons",
      author: "Someone",
      license: "CC BY-SA 4.0",
      date: "2018-06-03",
      originalUrl: "https://commons.wikimedia.org/example",
      accessedAt: "2026-08-11",
      rightsNote: "Attribution required.",
      aiGenerated: false,
    }],
    sources: [{ id: "src-1" }],
  };

  const output = serializePublicEntity(structure);

  assert.deepEqual(output.media, {
    path: "/images/structures/sample.webp",
    aiGenerated: false,
    alt: { en: "Alt text" },
    caption: { en: "Caption text" },
    source: "Wikimedia Commons",
    author: "Someone",
    license: "CC BY-SA 4.0",
    rightsNote: "Attribution required.",
  });
  // Internal-only fields from the preview (date/originalUrl/accessedAt) and
  // the raw migration array itself must not leak.
  assert.equal(Object.hasOwn(output.media, "date"), false);
  assert.equal(Object.hasOwn(output.media, "originalUrl"), false);
  assert.equal(Object.hasOwn(output.media, "accessedAt"), false);
  assert.equal(Object.hasOwn(output, "sources"), false);
});

test("a placeholder migration-preview (isPlaceholder: true) yields no public 'media' field", () => {
  const historicalContext = {
    id: "h2",
    slug: "sample-context",
    entityType: "historicalContext",
    status: "published",
    title: { en: "Sample" },
    media: [{ path: null, isPlaceholder: true, aiGenerated: false }],
  };

  const output = serializePublicEntity(historicalContext);
  assert.equal(Object.hasOwn(output, "media"), false);
});

test("an entity with no migration-preview media at all yields no public 'media' field", () => {
  const story = {
    id: "s1", slug: "sample-story", entityType: "story", status: "published", title: { en: "T" },
  };
  const output = serializePublicEntity(story);
  assert.equal(Object.hasOwn(output, "media"), false);
});

test("a media entity gains public alt/caption from its own migration preview, without duplicating other fields", () => {
  const media = {
    id: "g3",
    entityType: "media",
    mediaType: "image",
    mediaRole: "realArchiveMedia",
    derivativeStoragePaths: ["/images/gallery/sample.webp"],
    source: "Wikimedia Commons",
    license: "CC BY-SA 4.0",
    rightsStatus: "cleared",
    media: [{
      path: "/images/gallery/sample.webp",
      isPlaceholder: false,
      alt: { en: "Alt text" },
      caption: { en: "Caption text" },
      aiGenerated: false,
    }],
  };

  const output = serializePublicEntity(media);
  assert.deepEqual(output.alt, { en: "Alt text" });
  assert.deepEqual(output.caption, { en: "Caption text" });
  assert.equal(Object.hasOwn(output, "media"), false);
});
