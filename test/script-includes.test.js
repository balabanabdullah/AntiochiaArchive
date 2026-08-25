import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

// archive-store.js's loadAllPublicEntities() calls window.AntiochiaArchiveV2API
// directly (see public/js/archive-store.js) — any page that loads
// js/archive-store.js but not archive-v2-api.js throws "Archive v2 API
// client is unavailable" the moment header search autocomplete (or any
// other discovery feature) initializes. This regressed silently on 4 pages
// (gallery/contributions/methodology/submissions) before being caught by
// live production console monitoring; this test exists so it can't happen
// silently again.
const PUBLIC_PAGES = [
  "index.html",
  "pages/beliefs.html",
  "pages/collections.html",
  "pages/communities.html",
  "pages/contributions.html",
  "pages/discover.html",
  "pages/gallery.html",
  "pages/history.html",
  "pages/map.html",
  "pages/methodology.html",
  "pages/music.html",
  "pages/places.html",
  "pages/proverbs.html",
  "pages/search.html",
  "pages/stories.html",
  "pages/structures.html",
  "pages/submissions.html",
];

for (const file of PUBLIC_PAGES) {
  test(`${file}: loads archive-v2-api.js before js/archive-store.js whenever it loads archive-store at all`, () => {
    const html = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const storeIndex = html.indexOf('src="/js/archive-store.js"');
    if (storeIndex === -1) return; // page doesn't use the discovery store at all — nothing to check
    const v2ApiIndex = html.indexOf('src="/archive-v2-api.js"');
    assert.notEqual(v2ApiIndex, -1, `${file} loads js/archive-store.js but never loads archive-v2-api.js — AntiochiaArchiveStore.loadAllPublicEntities() will throw at runtime`);
    assert.ok(v2ApiIndex < storeIndex, `${file} must load archive-v2-api.js BEFORE js/archive-store.js`);
  });
}
