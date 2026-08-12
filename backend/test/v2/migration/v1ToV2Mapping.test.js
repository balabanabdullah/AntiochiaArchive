import test from "node:test";
import assert from "node:assert/strict";
import { mapV1RecordToV2Entity, mapV1ArchiveToV2Entities, CATEGORY_TARGET_TYPE } from "../../../v2/migration/v1ToV2Mapping.js";
import { validateEntity } from "../../../v2/schemas/index.js";

test("category target type map matches the documented v1 -> v2 mapping", () => {
  assert.deepEqual(CATEGORY_TARGET_TYPE, {
    history: "historicalContext",
    stories: "story",
    structures: "structure",
    beliefs: "structure",
    music: "music",
    gallery: "media",
  });
});

test("history record maps id/slug/title/body(->summary)/era(->period) and validates", () => {
  const record = {
    id: "h1",
    slug: "sample-history",
    categoryKey: "infrastructure",
    era: { en: "300 BCE", tr: "MÖ 300", ar: "300 ق.م" },
    title: { en: "Title", tr: "Başlık", ar: "عنوان" },
    body: { en: "Body text.", tr: "Gövde metni.", ar: "نص." },
    image: "/images/history/sample.webp",
  };
  const entity = mapV1RecordToV2Entity(record, "history");

  assert.equal(entity.id, "h1");
  assert.equal(entity.slug, "sample-history");
  assert.equal(entity.entityType, "historicalContext");
  assert.deepEqual(entity.summary, record.body);
  assert.deepEqual(entity.period, { label: record.era });
  assert.deepEqual(entity.tags, ["infrastructure"]);
  assert.equal(entity.sourceCategory, "history");
  assert.equal(entity.sourceRecordId, "h1");
  assert.equal(entity.media[0].path, "/images/history/sample.webp");
  assert.equal(entity.media[0].isPlaceholder, false);

  assert.deepEqual(validateEntity(entity), { valid: true });
});

test("a placeholder (image: null) record maps to an isPlaceholder media preview entry", () => {
  const record = {
    id: "h2", slug: "sample-placeholder", title: { en: "T" }, body: { en: "B" }, image: null,
  };
  const entity = mapV1RecordToV2Entity(record, "history");
  assert.deepEqual(entity.media, [{
    path: null,
    isPlaceholder: true,
    alt: undefined,
    caption: undefined,
    source: undefined,
    author: undefined,
    license: undefined,
    date: undefined,
    originalUrl: undefined,
    accessedAt: undefined,
    rightsNote: undefined,
    aiGenerated: false,
  }]);
});

test("story record leaves storyCategory unset rather than guessing one", () => {
  const record = {
    id: "s1", slug: "sample-story", title: { en: "T" }, body: { en: "B" },
  };
  const entity = mapV1RecordToV2Entity(record, "stories");
  assert.equal(entity.storyCategory, undefined);
  assert.deepEqual(validateEntity(entity), { valid: true });
});

test("structure record maps desc(->summary) and categoryKey(->structureType/tags)", () => {
  const record = {
    id: "st1", slug: "sample-structure", categoryKey: "mosque", title: { en: "T" }, desc: { en: "D" },
  };
  const entity = mapV1RecordToV2Entity(record, "structures");
  assert.equal(entity.entityType, "structure");
  assert.deepEqual(entity.summary, record.desc);
  assert.equal(entity.structureType, "mosque");
  assert.deepEqual(entity.tags, ["mosque"]);
  assert.deepEqual(validateEntity(entity), { valid: true });
});

test("a v1 beliefs-category record maps to entityType 'structure', never 'belief'", () => {
  const record = {
    id: "b1", slug: "sample-shrine", categoryKey: "mosque", title: { en: "Shrine" }, desc: { en: "D" },
  };
  const entity = mapV1RecordToV2Entity(record, "beliefs");
  assert.equal(entity.entityType, "structure");
  assert.notEqual(entity.entityType, "belief");
  assert.ok(entity.tags.includes("beliefSite"));
  assert.ok(entity.tags.includes("migratedFromV1Beliefs"));
  assert.match(entity.migrationNote, /not a broad belief tradition/);
  assert.deepEqual(validateEntity(entity), { valid: true });
});

test("music record maps categoryKey to a free-form genre, not a hardcoded taxonomy", () => {
  const record = {
    id: "m1", slug: "sample-music", categoryKey: "folk", title: { en: "T" }, desc: { en: "D" },
  };
  const entity = mapV1RecordToV2Entity(record, "music");
  assert.equal(entity.entityType, "music");
  assert.equal(entity.genre, "folk");
  assert.deepEqual(validateEntity(entity), { valid: true });
});

test("gallery record maps to entityType 'media' with derivativeStoragePaths and preserved title/caption", () => {
  const record = {
    id: "g1",
    slug: "sample-gallery",
    src: "/images/gallery/sample.webp",
    title: { en: "Gallery Title" },
    caption: { en: "Gallery caption" },
    category: { en: "Category" },
    imageMetadata: { source: "Wikimedia", author: "A", license: "CC BY-SA 4.0", aiGenerated: false },
  };
  const entity = mapV1RecordToV2Entity(record, "gallery");
  assert.equal(entity.entityType, "media");
  assert.deepEqual(entity.derivativeStoragePaths, ["/images/gallery/sample.webp"]);
  assert.equal(entity.mediaRole, "realArchiveMedia");
  assert.equal(entity.rightsStatus, "cleared");
  assert.deepEqual(entity.title, record.title);
  assert.deepEqual(entity.caption, record.caption);
  assert.deepEqual(validateEntity(entity), { valid: true });
});

test("a gallery placeholder (src: null, no imageMetadata) maps to rightsStatus 'unknown' and empty paths", () => {
  const record = {
    id: "g2", slug: "sample-gallery-placeholder", src: null, title: { en: "T" }, caption: { en: "C" },
  };
  const entity = mapV1RecordToV2Entity(record, "gallery");
  assert.deepEqual(entity.derivativeStoragePaths, []);
  assert.equal(entity.rightsStatus, "unknown");
  assert.deepEqual(validateEntity(entity), { valid: true });
});

test("an aiGenerated gallery image maps to mediaRole 'aiGeneratedIllustration'", () => {
  const record = {
    id: "g3",
    slug: "sample-ai-gallery",
    src: "/images/gallery/ai.webp",
    title: { en: "T" },
    imageMetadata: { aiGenerated: true },
  };
  const entity = mapV1RecordToV2Entity(record, "gallery");
  assert.equal(entity.mediaRole, "aiGeneratedIllustration");
});

test("mapV1RecordToV2Entity throws for an unknown source category", () => {
  assert.throws(() => mapV1RecordToV2Entity({ id: "x" }, "unknownCategory"), /No v1 -> v2 mapping/);
});

test("mapV1ArchiveToV2Entities produces exactly one mapped entity per input record and does not mutate the archive", () => {
  const archive = {
    history: [{ id: "h1", slug: "h1-slug", title: { en: "T" }, body: { en: "B" } }],
    stories: [{ id: "s1", slug: "s1-slug", title: { en: "T" }, body: { en: "B" } }],
    structures: [],
    beliefs: [],
    music: [],
    gallery: [],
  };
  const snapshot = JSON.parse(JSON.stringify(archive));

  const mapped = mapV1ArchiveToV2Entities(archive);

  assert.equal(mapped.length, 2);
  assert.deepEqual(mapped.map((item) => item.entity.entityType).sort(), ["historicalContext", "story"]);
  assert.deepEqual(archive, snapshot);
});
