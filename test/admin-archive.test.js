import test from "node:test";
import assert from "node:assert/strict";

await import("../public/admin-archive.js");

const {
  compactImageMetadata,
  createSourceId,
  isAllowedMediaPath,
  mergeArchiveRecord,
} = globalThis.AntiochiaAdminArchive;

test("admin source IDs are stable UUID-based identifiers when crypto is available", () => {
  const id = createSourceId({ randomUUID: () => "00000000-0000-4000-8000-000000000001" });
  assert.equal(id, "source-00000000-0000-4000-8000-000000000001");
});

test("ordinary admin edits preserve provenance and category-specific metadata", () => {
  const existing = {
    id: "g1",
    categoryKey: "gallery",
    title: { en: "Old title" },
    src: "/images/archive/example.jpg",
    svgType: "mosaic",
    customMetadata: { reviewed: true },
    sources: [{ id: "source-1", type: "archive", title: "Catalog" }],
    imageMetadata: { alt: { en: "Archive image" }, license: "CC BY 4.0", aiGenerated: false },
  };

  const result = mergeArchiveRecord(existing, { title: { en: "Updated title" } });
  assert.equal(result.title.en, "Updated title");
  assert.equal(result.src, existing.src);
  assert.equal(result.svgType, "mosaic");
  assert.deepEqual(result.sources, existing.sources);
  assert.deepEqual(result.imageMetadata, existing.imageMetadata);
  assert.deepEqual(result.customMetadata, existing.customMetadata);
});

test("admin provenance edits preserve unrelated record fields", () => {
  const existing = { id: "h1", icon: "preserve", sources: [{ id: "source-1", type: "book" }] };
  const imageMetadata = compactImageMetadata({
    alt: { tr: "Taş yapı", en: "Stone structure", ar: "" },
    caption: { en: "Verified caption" },
    source: "Example Archive",
    originalUrl: "https://archive.example.test/item/1",
    aiGenerated: true,
  });
  const result = mergeArchiveRecord(existing, { categoryKey: "all" }, {
    sources: [{ id: "source-1", type: "book", title: "Verified title" }],
    imageMetadata,
    mediaKey: "image",
    mediaValue: "/images/archive/example.jpg",
  });

  assert.equal(result.icon, "preserve");
  assert.equal(result.sources[0].id, "source-1");
  assert.equal(result.imageMetadata.aiGenerated, true);
  assert.equal(result.image, "/images/archive/example.jpg");
});

test("source reordering preserves extension fields by stable ID, not array position", () => {
  const existing = {
    sources: [
      { id: "source-1", type: "book", catalogMetadata: { shelf: "A" } },
      { id: "source-2", type: "archive", catalogMetadata: { shelf: "B" } },
    ],
  };
  const result = mergeArchiveRecord(existing, {}, {
    sources: [{ id: "source-2", type: "archive", title: "Updated" }],
  });

  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].id, "source-2");
  assert.deepEqual(result.sources[0].catalogMetadata, { shelf: "B" });
});

test("admin media path validation rejects script and data protocols", () => {
  assert.equal(isAllowedMediaPath("/images/archive/example.jpg"), true);
  assert.equal(isAllowedMediaPath("https://media.example.test/example.jpg"), true);
  assert.equal(isAllowedMediaPath("javascript:alert(1)"), false);
  assert.equal(isAllowedMediaPath("data:image/svg+xml,test"), false);
});
