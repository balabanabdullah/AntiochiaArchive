import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

// Every hand-authored public page shares the same header/mobile-nav/footer
// architecture (see the VISUAL REDESIGN round) — spot-checked across a
// representative sample rather than exhaustively, since the batch script
// that generated them all shares one template.
const PAGES = [
  "index.html",
  "pages/places.html",
  "pages/discover.html",
  "pages/proverbs.html",
  "pages/methodology.html",
  "pages/search.html",
];

function read(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
}

for (const file of PAGES) {
  test(`${file}: header nav has exactly two dropdown groups (Archive, Discover) with no duplicate ids`, () => {
    const html = read(file);
    const navPrimary = html.match(/<nav class="nav-primary"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(navPrimary, "nav-primary block must exist");

    // Two [data-nav-discover] wrappers: Archive and Discover.
    const wrapperCount = (navPrimary.match(/data-nav-discover/g) || []).length;
    assert.equal(wrapperCount, 2, "expected exactly one Archive dropdown and one Discover dropdown");

    assert.match(navPrimary, /data-i18n="nav\.archive"/, "missing the Archive dropdown trigger");
    assert.match(navPrimary, /data-i18n="nav\.discover"[^"]*"/, "missing the Discover dropdown trigger");

    // aria-controls on each trigger must point at a real, unique id in this block.
    const controls = [...navPrimary.matchAll(/aria-controls="([a-zA-Z0-9_-]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(controls).size, controls.length, "aria-controls ids must be unique");
    for (const id of controls) {
      assert.match(navPrimary, new RegExp(`id="${id}"`), `no element has id="${id}" for aria-controls to point at`);
    }

    // No id anywhere on the page may repeat (a real regression risk when
    // duplicating the dropdown pattern across Archive + Discover).
    const allIds = [...html.matchAll(/\sid="([a-zA-Z0-9_-]+)"/g)].map((m) => m[1]);
    const seen = new Set();
    const dupes = allIds.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
    assert.deepEqual(dupes, [], `duplicate id(s) found on ${file}: ${dupes.join(", ")}`);
  });

  test(`${file}: Archive dropdown lists exactly the 8 cultural entity types plus Gallery, never duplicating Discover's items`, () => {
    const html = read(file);
    const archiveMenu = html.match(/id="nav-archive-menu">([\s\S]*?)<\/div>\s*<\/div>/)?.[1];
    assert.ok(archiveMenu, "Archive dropdown menu must exist");
    for (const key of ["history", "communities", "beliefs", "places", "structures", "stories", "music", "proverbs", "gallery"]) {
      assert.match(archiveMenu, new RegExp(`data-i18n="nav\\.${key}"`), `Archive menu is missing nav.${key}`);
    }
    // Discover-only items must not appear inside the Archive menu.
    for (const key of ["map", "timeline", "collections", "discoverPage"]) {
      assert.doesNotMatch(archiveMenu, new RegExp(`data-i18n="nav\\.${key}"`), `Archive menu wrongly duplicates Discover's nav.${key}`);
    }
  });

  test(`${file}: the header contribution CTA points to a real, working #contribute route, never a dead link`, () => {
    const html = read(file);
    const ctaMatches = [...html.matchAll(/<a class="btn-contribute[^"]*"\s+href="([^"]+)"/g)];
    assert.ok(ctaMatches.length >= 1, "expected at least one .btn-contribute link");
    for (const [, href] of ctaMatches) {
      assert.match(href, /#contribute$/, `btn-contribute href "${href}" must point at the real #contribute section, not a placeholder`);
    }
    // The section it points to must actually exist (only checkable on pages that carry it — index.html).
    if (file === "index.html") {
      assert.match(html, /<section class="section-contribute" id="contribute"/, "index.html must contain the real #contribute section the header CTA points to");
      assert.match(html, /<form class="contribute-form" id="contribute-form"/, "the #contribute section must contain a real, working form — not a placeholder");
    }
  });

  test(`${file}: mobile nav has correct ARIA toggle semantics and a working language switcher`, () => {
    const html = read(file);
    assert.match(html, /id="menu-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="mobile-nav"/, "hamburger must declare aria-expanded and aria-controls");
    const mobileNavOpenTag = html.match(/<nav[^>]*class="mobile-nav"[^>]*>/s)?.[0];
    assert.ok(mobileNavOpenTag, "mobile-nav opening tag must exist");
    assert.match(mobileNavOpenTag, /id="mobile-nav"/);
    assert.match(mobileNavOpenTag, /aria-hidden="true"/, "mobile-nav must start aria-hidden");
    const mobileNav = html.match(/<nav[^>]*class="mobile-nav"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(mobileNav, "mobile-nav block must exist");
    assert.match(mobileNav, /class="mobile-nav-group-label" data-i18n="nav\.archive"/, "mobile nav must visually group the Archive links");
    assert.match(mobileNav, /class="mobile-nav-group-label" data-i18n="nav\.discover"/, "mobile nav must visually group the Discover links");
    // Language switcher must be present and reachable inside the mobile menu too (not header-only).
    assert.match(mobileNav, /class="lang-switcher"/, "mobile nav must include its own reachable language switcher");
    assert.match(mobileNav, /data-lang="tr"/);
    assert.match(mobileNav, /data-lang="en"/);
    assert.match(mobileNav, /data-lang="ar"/);
  });

  test(`${file}: footer groups links under Archive / Discover / Contribute headings, all localized`, () => {
    const html = read(file);
    const footer = html.match(/<footer[\s\S]*?<\/footer>/)?.[0];
    assert.ok(footer, "footer must exist");
    assert.match(footer, /data-i18n="footer\.headings\.archive"/, "footer is missing the Archive column heading");
    assert.match(footer, /data-i18n="footer\.headings\.discover"/, "footer is missing the Discover column heading");
    assert.match(footer, /data-i18n="footer\.headings\.contribute"/, "footer is missing the Contribute column heading");
  });
}

test("lang.js: nav.archive and every footer.headings.* key resolve in all three languages", async () => {
  const code = fs.readFileSync(new URL("../public/lang.js", import.meta.url), "utf8");
  const TRANSLATIONS = new Function(`${code}; return TRANSLATIONS;`)();
  for (const lang of ["en", "tr", "ar"]) {
    assert.ok(TRANSLATIONS[lang].nav.archive, `${lang}.nav.archive is missing`);
    assert.ok(TRANSLATIONS[lang].footer.headings.archive, `${lang}.footer.headings.archive is missing`);
    assert.ok(TRANSLATIONS[lang].footer.headings.discover, `${lang}.footer.headings.discover is missing`);
    assert.ok(TRANSLATIONS[lang].footer.headings.contribute, `${lang}.footer.headings.contribute is missing`);
    assert.ok(TRANSLATIONS[lang].homepage.todaysTitle, `${lang}.homepage.todaysTitle is missing`);
  }
});
