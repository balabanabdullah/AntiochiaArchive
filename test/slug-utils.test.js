// "UX refinement" round, Section 5/22: pure Turkish-slugify logic
// (public/js/slug-utils.js), tested directly without a browser/DOM — the
// same split-module pattern established for environment-badge.js.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const modulePath = pathToFileURL(path.resolve(import.meta.dirname, "../public/js/slug-utils.js")).href;
await import(modulePath);
const { slugify } = globalThis.AntiochiaArchiveSlugUtils;

// Every result must satisfy the backend's own SLUG_PATTERN (see
// backend/admin/contentService.js) — never trust slugify() by inspection
// alone, always cross-check against the real acceptance rule.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

test("Turkish diacritics are transliterated, not dropped: ç/ğ/ı/İ/ö/ş/ü", () => {
  assert.equal(slugify("Çamlıca"), "camlica");
  assert.equal(slugify("Beşikli Mağara"), "besikli-magara");
  assert.equal(slugify("İnanç"), "inanc");
  assert.equal(slugify("Öykü"), "oyku");
  assert.equal(slugify("Şükrü"), "sukru");
  assert.equal(slugify("Üzüm"), "uzum");
});

test("a real multi-clause Turkish title with punctuation and an apostrophe slugifies cleanly, as a single run of hyphen-separated groups", () => {
  const result = slugify("Seleukos Dönemi ve Antioch'un Kuruluşu");
  assert.equal(result, "seleukos-donemi-ve-antioch-un-kurulusu");
  assert.match(result, SLUG_PATTERN);
});

test("duplicate whitespace and duplicate punctuation collapse to a single hyphen, never a doubled one", () => {
  assert.equal(slugify("Test   Topluluğu"), "test-toplulugu");
  assert.equal(slugify("Test -- Kayıt"), "test-kayit");
  assert.equal(slugify("Test!!!Kayıt"), "test-kayit");
});

test("leading and trailing punctuation/whitespace never produce a leading or trailing hyphen", () => {
  assert.equal(slugify("  Test Kaydı  "), "test-kaydi");
  assert.equal(slugify("-Test Kaydı-"), "test-kaydi");
  assert.equal(slugify("?!Test!?"), "test");
});

test("non-Turkish Latin diacritics are also stripped (accented input from a pasted title)", () => {
  assert.equal(slugify("Café"), "cafe");
});

test("digits are preserved", () => {
  assert.equal(slugify("Antakya 2024 Kazısı"), "antakya-2024-kazisi");
});

test("empty, whitespace-only, or non-string input never throws — always yields an empty string", () => {
  assert.equal(slugify(""), "");
  assert.equal(slugify("   "), "");
  assert.equal(slugify(undefined), "");
  assert.equal(slugify(null), "");
});

test("every generated slug matches the backend's own SLUG_PATTERN", () => {
  const titles = ["Test Topluluğu", "Seleukos Dönemi ve Antioch'un Kuruluşu", "Beşikli Mağara", "Çamlıca 2. Yer", "İnanç: Hristiyanlık"];
  for (const title of titles) {
    const slug = slugify(title);
    assert.match(slug, SLUG_PATTERN, `"${title}" -> "${slug}" must satisfy the backend's SLUG_PATTERN`);
  }
});
