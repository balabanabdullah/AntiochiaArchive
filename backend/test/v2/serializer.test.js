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
