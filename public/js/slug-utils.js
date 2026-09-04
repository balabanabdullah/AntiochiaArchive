/**
 * Pure Turkish/diacritic-aware slugify logic — deliberately split from
 * admin-panel.js's DOM-touching auto-suggest wiring, the same way
 * environment-badge.js separates its decision logic from its rendering.
 * This is what makes slug generation directly unit-testable (see
 * test/slug-utils.test.js) without a browser/DOM.
 *
 * Must always produce a string the backend's own SLUG_PATTERN
 * (^[a-z0-9]+(?:-[a-z0-9]+)*$ — see backend/admin/contentService.js)
 * accepts, for any input a real admin might type as a title: lowercase
 * letters/digits only, single-hyphen separated groups, never a leading,
 * trailing, or doubled hyphen.
 */
(function exposeSlugUtils(root) {
  "use strict";

  const TURKISH_MAP = { ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i", ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u" };

  function slugify(text) {
    return String(text || "")
      .split("").map((ch) => TURKISH_MAP[ch] ?? ch).join("")
      .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip remaining Latin diacritics (é -> e, etc.)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  root.AntiochiaArchiveSlugUtils = Object.freeze({ slugify });
})(typeof window !== "undefined" ? window : globalThis);
