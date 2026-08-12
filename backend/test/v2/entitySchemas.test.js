import test from "node:test";
import assert from "node:assert/strict";
import { validateCommunity } from "../../v2/schemas/community.js";
import { validateBelief } from "../../v2/schemas/belief.js";
import { validateStructure } from "../../v2/schemas/structure.js";
import { validateStory } from "../../v2/schemas/story.js";
import { validateMusic } from "../../v2/schemas/music.js";
import { validateProverb } from "../../v2/schemas/proverb.js";
import { validatePlace } from "../../v2/schemas/place.js";
import { validateMedia } from "../../v2/schemas/media.js";
import { validateSourceEntity } from "../../v2/schemas/source.js";

test("community must not embed belief documents", () => {
  const community = {
    id: "community-1",
    slug: "sample-community",
    entityType: "community",
    title: { en: "Sample" },
    beliefs: [{ title: { en: "Embedded belief" } }],
  };
  const result = validateCommunity(community);
  assert.equal(result.valid, false);
  assert.match(result.error, /must not be embedded/);
});

test("belief must not embed structure/site documents", () => {
  const belief = {
    id: "belief-1",
    slug: "sample-belief",
    entityType: "belief",
    title: { en: "Sample" },
    sites: [{ title: { en: "Embedded site" } }],
  };
  const result = validateBelief(belief);
  assert.equal(result.valid, false);
  assert.match(result.error, /must not embed structure\/site/);
});

test("structure rejects embedded community/belief/place objects", () => {
  const structure = {
    id: "structure-1",
    slug: "sample-structure",
    entityType: "structure",
    title: { en: "Sample" },
    community: { id: "community-1" },
  };
  const result = validateStructure(structure);
  assert.equal(result.valid, false);
  assert.match(result.error, /must not embed a full entity object/);
});

test("structure accepts mediaIds/sourceIds reference arrays", () => {
  const structure = {
    id: "structure-1",
    slug: "sample-structure",
    entityType: "structure",
    title: { en: "Sample" },
    mediaIds: ["media-1"],
    sourceIds: ["source-1"],
  };
  assert.deepEqual(validateStructure(structure), { valid: true });
});

function validStory(overrides = {}) {
  return {
    id: "story-1",
    slug: "sample-story",
    entityType: "story",
    title: { en: "Sample" },
    storyCategory: "familyMemory",
    ...overrides,
  };
}

test("story accepts a controlled storyCategory value", () => {
  assert.deepEqual(validateStory(validStory()), { valid: true });
});

test("story rejects an uncontrolled storyCategory value", () => {
  const result = validateStory(validStory({ storyCategory: "conspiracyTheory" }));
  assert.equal(result.valid, false);
  assert.match(result.error, /storyCategory must be one of/);
});

test("music accepts free-form genre without a hardcoded taxonomy", () => {
  const music = {
    id: "music-1",
    slug: "sample-music",
    entityType: "music",
    title: { en: "Sample" },
    genre: "an unlisted regional style",
  };
  assert.deepEqual(validateMusic(music), { valid: true });
});

test("proverb requires non-empty originalText", () => {
  const proverb = {
    id: "proverb-1",
    slug: "sample-proverb",
    entityType: "proverb",
    title: { en: "Sample" },
    originalText: "",
  };
  const result = validateProverb(proverb);
  assert.equal(result.valid, false);
  assert.match(result.error, /originalText is required/);
});

test("place localNames validate language, name, and optional transliteration", () => {
  const place = {
    id: "place-1",
    slug: "sample-place",
    entityType: "place",
    title: { en: "Sample" },
    localNames: [{ language: "tr", name: "Örnek" }],
  };
  assert.deepEqual(validatePlace(place), { valid: true });

  const invalidPlace = { ...place, localNames: [{ language: "tr" }] };
  const result = validatePlace(invalidPlace);
  assert.equal(result.valid, false);
  assert.match(result.error, /localNames\[0\]\.name is required/);
});

test("media requires a controlled mediaRole", () => {
  const base = {
    id: "media-1",
    entityType: "media",
    mediaType: "image",
  };

  const missingRole = validateMedia(base);
  assert.equal(missingRole.valid, false);
  assert.match(missingRole.error, /mediaRole is required/);

  const invalidRole = validateMedia({ ...base, mediaRole: "stockPhoto" });
  assert.equal(invalidRole.valid, false);
  assert.match(invalidRole.error, /mediaRole must be one of/);

  const validRole = validateMedia({ ...base, mediaRole: "realArchiveMedia" });
  assert.deepEqual(validRole, { valid: true });

  const aiRole = validateMedia({ ...base, mediaRole: "aiGeneratedIllustration", aiGenerated: true });
  assert.deepEqual(aiRole, { valid: true });
});

test("source rejects a non http(s) url", () => {
  const source = {
    id: "source-1",
    type: "website",
    url: "javascript:alert(1)",
  };
  const result = validateSourceEntity(source);
  assert.equal(result.valid, false);
  assert.match(result.error, /url must use http or https/);
});
