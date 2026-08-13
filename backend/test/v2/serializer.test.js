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

// --- Sentinel placeholder stripping -----------------------------------
//
// Research records use sentinel strings (NEEDS VERIFICATION, UNRESOLVED,
// UNKNOWN, ...) as internal editorial flags meaning "not yet confirmed" —
// see the FINAL CANONICAL PUBLICATION REVIEW's community/belief/place
// individual pass, which found several of these embedded directly in
// otherwise-publishable place records (e.g. place-0015/place-0022's
// title.ar). They must never reach a public response as if they were real
// content.

test("a sentinel value in one language of a multilingual title is dropped, leaving other languages intact", () => {
  const place = {
    id: "place-test-1", slug: "test-place", entityType: "place", status: "published",
    title: { tr: "Vakıflı", en: "Vakıflı Village", ar: "فاكيفلي — NEEDS LOCAL VERIFICATION" },
  };
  const output = serializePublicEntity(place);
  assert.deepEqual(output.title, { tr: "Vakıflı", en: "Vakıflı Village" });
});

test("a sentinel-named entry in historicalNames/localNames is dropped from the array, not the whole field", () => {
  const place = {
    id: "place-test-2", slug: "test-place-2", entityType: "place", status: "published",
    title: { en: "Test" },
    historicalNames: [{ name: "Real Historical Name" }, { name: "Historical street names: NEEDS VERIFICATION" }],
  };
  const output = serializePublicEntity(place);
  assert.deepEqual(output.historicalNames, [{ name: "Real Historical Name" }]);
});

test("historicalNames is omitted entirely when every entry is a sentinel", () => {
  const place = {
    id: "place-test-3", slug: "test-place-3", entityType: "place", status: "published",
    title: { en: "Test" },
    historicalNames: [{ name: "NEEDS VERIFICATION" }],
  };
  const output = serializePublicEntity(place);
  assert.equal(Object.hasOwn(output, "historicalNames"), false);
});

test("a sentinel value in officialName/etymology is dropped the same way as title", () => {
  const place = {
    id: "place-test-4", slug: "test-place-4", entityType: "place", status: "published",
    title: { en: "Test" },
    officialName: { en: "UNKNOWN" },
    etymology: { en: "Real etymology note.", tr: "NO RELIABLE SOURCE FOUND" },
  };
  const output = serializePublicEntity(place);
  assert.equal(Object.hasOwn(output, "officialName"), false);
  assert.deepEqual(output.etymology, { en: "Real etymology note." });
});

test("a legitimate sentence merely containing the word 'unresolved' is NOT treated as a sentinel (word-boundary match only)", () => {
  const place = {
    id: "place-test-5", slug: "test-place-5", entityType: "place", status: "published",
    title: { en: "Test" },
    summary: { en: "The exact founding date remains a subject some historians consider unresolved, though the broader chronology is well established." },
  };
  const output = serializePublicEntity(place);
  // A prose sentence that happens to use the word is legitimate hedged
  // content, distinct from a raw sentinel placeholder occupying an entire
  // field — this stripper only targets the latter pattern in practice
  // (whole-field placeholder values), verified here to confirm it doesn't
  // over-match ordinary cautious academic language.
  assert.ok(output.summary.en.includes("unresolved"));
});

test("community/belief entities get the same sentinel stripping as place", () => {
  const community = {
    id: "comm-test-1", slug: "test-comm", entityType: "community", status: "published",
    title: { en: "Test Community", ar: "UNKNOWN" },
  };
  const output = serializePublicEntity(community);
  assert.equal(Object.hasOwn(output.title, "ar"), false);
  assert.equal(output.title.en, "Test Community");
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
