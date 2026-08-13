// Static-release pipeline for the v2 cultural-entity archive, parallel to
// archive-release.js (v1). Only the 7 cultural entity types that actually
// carry a slug (historicalContext/community/belief/place/structure/story/
// music) get a static detail page — media/source entities have no slug at
// all (see backend/v2/schemas/media.js) and are never linked to directly.
//
// collectPublicV2Entities() runs the exact same merge/suppress pipeline the
// live backend uses (createLocalMappedV2Store, reading the canonical
// repo-root data/ files) and applies the exact same publication-visibility
// rule (isPublic, from backend/v2/serializers/publicVisibility.js) and
// public-field allowlist (serializePublicEntity) the live API applies — a
// static page can never show a field, or an entity, the API itself would
// not serve. Everything else in this module is pure and synchronous, so it
// can be unit-tested against fixtures without touching disk (see
// test/v2-archive-release.test.js).

import { createLocalMappedV2Store } from "../backend/v2/stores/localMappedV2Store.js";
import { isPublic } from "../backend/v2/serializers/publicVisibility.js";
import { serializePublicEntity } from "../backend/v2/serializers/publicSerializer.js";
import { PRODUCTION_ORIGIN, escapeHtml, safeHttpUrl, localized } from "./archive-release.js";

// Path segment -> domain entityType, mirroring backend/v2/routes/v2Routes.js's
// TYPE_ROUTES (proverb/media/source excluded: proverb has 0 public records
// today, and media/source are never standalone detail-page content).
export const V2_DETAIL_TYPES = Object.freeze([
  "historicalContext",
  "community",
  "belief",
  "place",
  "structure",
  "story",
  "music",
]);

export const V2_TYPE_INFO = Object.freeze({
  historicalContext: { href: "/pages/history.html", navKey: "history", label: "History" },
  community: { href: "/pages/communities.html", navKey: "communities", label: "Communities" },
  belief: { href: "/pages/beliefs.html", navKey: "beliefs", label: "Beliefs" },
  place: { href: "/pages/places.html", navKey: "places", label: "Places" },
  structure: { href: "/pages/structures.html", navKey: "structures", label: "Structures" },
  story: { href: "/pages/stories.html", navKey: "stories", label: "Stories" },
  music: { href: "/pages/music.html", navKey: "music", label: "Music" },
});

export function v2DetailPath(entity) {
  return `/archive-v2/${entity.slug}/`;
}

/**
 * Runs the live merge/suppress pipeline (createLocalMappedV2Store) and
 * returns the public, serialized, detail-page-eligible entities — the exact
 * set (and exact field shape) GET /api/v2/entities would serve today,
 * filtered to the 7 types that have a static page at all. Accepts an
 * injectable store factory so callers (tests) can supply a fixture store
 * instead of reading the real data/ files from disk.
 */
export async function collectPublicV2Entities({ createStore = createLocalMappedV2Store } = {}) {
  const store = createStore();
  await store.initialize();
  const page = await store.listEntities({ limit: 100000 });
  return page.items
    .filter(isPublic)
    .filter((entity) => V2_DETAIL_TYPES.includes(entity.entityType))
    .map(serializePublicEntity)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function validatePublicV2Entities(entities) {
  const slugs = new Set();
  for (const entity of entities) {
    if (!SLUG_PATTERN.test(String(entity.slug || ""))) {
      throw new TypeError(`${entity.id} has an invalid or missing slug.`);
    }
    if (slugs.has(entity.slug)) throw new TypeError(`Duplicate v2 slug: ${entity.slug}.`);
    slugs.add(entity.slug);
    if (!V2_TYPE_INFO[entity.entityType]) {
      throw new TypeError(`${entity.id} has an entityType with no detail-page mapping: ${entity.entityType}.`);
    }
  }
  return { slugs, count: entities.length };
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The single type-specific fact shown under a v2 detail page's title — mirrors public/script.js's v2DetailFact(). */
export function v2EntityFact(entity, language = "en") {
  if (entity.entityType === "historicalContext") return localized(entity.period?.label, language);
  if (entity.entityType === "structure") return entity.structureType || "";
  if (entity.entityType === "music") return entity.genre || "";
  if (entity.entityType === "story") return entity.storyCategory || (Array.isArray(entity.tags) ? entity.tags[0] : "") || "";
  if (entity.entityType === "place") {
    const officialName = localized(entity.officialName, language);
    const title = localized(entity.title, language);
    return officialName && officialName !== title ? officialName : "";
  }
  return "";
}

function mediaMarkup(entity, language = "en") {
  const media = entity.media;
  if (!media?.path) {
    return `<div class="record-detail-placeholder" aria-hidden="true">
            <span class="record-detail-placeholder-mark">A</span>
          </div>
          <p class="record-placeholder-label" data-i18n="detail.imagePending">Image pending archival review</p>`;
  }

  const alt = localized(media.alt, language, localized(entity.title, language));
  const caption = localized(media.caption, language);
  const facts = [
    media.author && `<span><strong data-i18n="provenance.photoBy">Photo</strong>: ${escapeHtml(media.author)}</span>`,
    media.source && `<span><strong data-i18n="provenance.sourceLabel">Source</strong>: ${escapeHtml(media.source)}</span>`,
    media.license && `<span><strong data-i18n="provenance.license">License</strong>: ${escapeHtml(media.license)}</span>`,
  ].filter(Boolean).join("");
  const rights = media.rightsNote
    ? `<p class="record-rights-note">${escapeHtml(media.rightsNote)}</p>`
    : "";
  const aiLabel = media.aiGenerated
    ? `<span class="archive-ai-label" data-i18n="provenance.aiImageLabel">Illustrative image — generated with artificial intelligence.</span>`
    : "";

  return `<figure class="record-detail-figure archive-media-figure" data-fallback-type="circles" data-fallback-color="#903628" data-fallback-bg="#ded4c0">
          <img class="record-detail-image" src="${escapeHtml(media.path)}" alt="${escapeHtml(alt)}" width="1600" height="1000" data-archive-image>
          ${aiLabel}
          ${caption ? `<figcaption data-detail-image-caption>${escapeHtml(caption)}</figcaption>` : ""}
        </figure>
        ${facts || rights ? `<aside class="record-provenance" aria-label="Image provenance">
          ${facts ? `<div class="record-provenance-facts">${facts}</div>` : ""}
          ${rights}
        </aside>` : ""}`;
}

function pageNavigation(activeNavKey) {
  const base = [
    { navKey: "history", href: "/pages/history.html", label: "History" },
    { navKey: "stories", href: "/pages/stories.html", label: "Stories" },
    { navKey: "structures", href: "/pages/structures.html", label: "Structures" },
    { navKey: "beliefs", href: "/pages/beliefs.html", label: "Beliefs" },
    { navKey: "communities", href: "/pages/communities.html", label: "Communities" },
    { navKey: "places", href: "/pages/places.html", label: "Places" },
    { navKey: "music", href: "/pages/music.html", label: "Music" },
    { navKey: "gallery", href: "/pages/gallery.html", label: "Gallery" },
  ];
  return base.map(({ navKey, href, label }) => (
    `<a href="${href}" data-i18n="nav.${navKey}"${navKey === activeNavKey ? ' class="is-active"' : ""}>${label}</a>`
  )).join("\n          ");
}

function jsonForScript(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function generateV2DetailDocument({ entity, stylesheet, langScript, v2ApiScript, appScript }) {
  const typeInfo = V2_TYPE_INFO[entity.entityType];
  if (!typeInfo) throw new TypeError(`Unknown v2 entity type: ${entity.entityType}.`);

  const title = localized(entity.title, "en", entity.slug);
  const description = localized(entity.summary, "en");
  const fact = v2EntityFact(entity, "en");
  const path = v2DetailPath(entity);
  const canonical = `${PRODUCTION_ORIGIN}${path}`;
  const media = entity.media;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${canonical}#webpage`,
    url: canonical,
    name: `${title} — AntiochiaArchive`,
    description,
    inLanguage: ["tr", "en", "ar"],
    isPartOf: { "@id": `${PRODUCTION_ORIGIN}/#website` },
  };
  if (media?.path) jsonLd.primaryImageOfPage = safeHttpUrl(`${PRODUCTION_ORIGIN}${media.path}`) || `${PRODUCTION_ORIGIN}${media.path}`;

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#f2ead8">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(title)} — AntiochiaArchive">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  ${media?.path ? `<meta property="og:image" content="${PRODUCTION_ORIGIN}${escapeHtml(media.path)}">` : ""}
  <title>${escapeHtml(title)} — AntiochiaArchive</title>
  <link rel="canonical" href="${canonical}">
  <link rel="stylesheet" href="${escapeHtml(stylesheet)}">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="record-detail-page" data-entity-id="${escapeHtml(entity.id)}">
  <a class="skip-link" href="#main-content" data-i18n="a11y.skipLink">Skip to content</a>
  <header class="site-header" role="banner">
    <div class="container header-inner">
      <a class="brand" href="/index.html" aria-label="AntiochiaArchive home"><span class="brand-mark" aria-hidden="true">A</span><span>AntiochiaArchive</span></a>
      <nav class="nav-primary" aria-label="Primary navigation">
        <a href="/index.html" data-i18n="nav.home">Home</a>
        ${pageNavigation(typeInfo.navKey)}
      </nav>
      <div class="header-actions">
        <div class="lang-switcher" role="group" aria-label="Choose language">
          <button class="lang-btn" type="button" data-lang="tr" aria-pressed="false">TR</button>
          <button class="lang-btn" type="button" data-lang="en" aria-pressed="true">EN</button>
          <button class="lang-btn" type="button" data-lang="ar" aria-pressed="false">AR</button>
        </div>
        <button class="menu-toggle" id="menu-toggle" type="button" aria-label="Open navigation menu" aria-expanded="false" aria-controls="mobile-nav"><span class="bar"></span><span class="bar"></span><span class="bar"></span></button>
      </div>
    </div>
    <nav class="mobile-nav" id="mobile-nav" aria-label="Mobile navigation" aria-hidden="true"><div class="container mobile-nav-inner">
      <a href="/index.html" data-i18n="nav.home">Home</a>
      ${pageNavigation(typeInfo.navKey)}
      <a href="/index.html#contribute" data-i18n="actions.contribute">Contribute</a>
    </div></nav>
  </header>
  <main id="main-content">
    <article class="record-detail">
      <div class="container record-detail-container">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <a href="/index.html" data-i18n="nav.home">Home</a><span class="breadcrumb-separator">/</span>
          <a href="${typeInfo.href}" data-i18n="nav.${typeInfo.navKey}">${typeInfo.label}</a><span class="breadcrumb-separator">/</span>
          <span data-detail-title>${escapeHtml(title)}</span>
        </nav>
        <header class="record-detail-header">
          <p class="page-badge-wrap"><span data-detail-category>${escapeHtml(typeInfo.label)}</span>${fact ? ` · <span data-detail-taxonomy>${escapeHtml(fact)}</span>` : '<span data-detail-taxonomy hidden></span>'}</p>
          <h1 data-detail-title>${escapeHtml(title)}</h1>
          <p class="record-detail-summary" data-detail-description>${escapeHtml(description)}</p>
        </header>
        <div class="record-detail-grid">
          <div class="record-detail-media">${mediaMarkup(entity, "en")}</div>
          <div class="record-detail-content">
            <section class="record-detail-section" aria-labelledby="record-about-heading">
              <h2 id="record-about-heading" data-i18n="detail.aboutRecord">About this record</h2>
              <p data-detail-description>${escapeHtml(description)}</p>
            </section>
          </div>
        </div>
        <nav class="record-detail-actions" aria-label="Record navigation">
          <a class="btn-cta-primary" href="${typeInfo.href}"><span data-i18n="detail.backToCollection">Back to collection</span></a>
          <a class="archive-detail-link" href="/index.html" data-i18n="pages.backToHome">← Back to Home</a>
        </nav>
        <section class="related-entities-section" data-related-entities-section data-entity-id="${escapeHtml(entity.id)}" hidden aria-labelledby="related-entities-heading">
          <h2 id="related-entities-heading" data-i18n="detail.relatedEntities">Related records</h2>
          <div class="related-entities-grid" id="related-entities-container" aria-live="polite"></div>
        </section>
      </div>
    </article>
  </main>
  <footer class="site-footer" role="contentinfo"><div class="container"><div class="footer-top">
    <div class="footer-brand-wrap"><a class="footer-brand" href="/index.html"><span class="brand-mark" aria-hidden="true">A</span><span class="brand-name">AntiochiaArchive</span></a><p class="footer-about" data-i18n="footerAbout">A living digital memory preserving the voices, images, oral histories, and shared places of Antioch.</p></div>
    <div class="footer-nav-col"><h2 class="footer-heading" data-i18n="footer.links.about">Navigation</h2><nav class="footer-nav">${pageNavigation(typeInfo.navKey)}<a href="/pages/methodology.html" data-i18n="nav.methodology">Methodology</a></nav></div>
  </div><div class="footer-bottom"><p>© 2026 <span data-i18n="copyright">AntiochiaArchive. Open source, open memory.</span></p><p class="coords-line">36.2021° N · 36.1608° E</p></div></div></footer>
  <script id="v2-record-data" type="application/json">${jsonForScript({ entity })}</script>
  <script src="${escapeHtml(langScript)}"></script>
  <script src="${escapeHtml(v2ApiScript)}"></script>
  <script src="${escapeHtml(appScript)}"></script>
  <button id="back-to-top" class="back-to-top" type="button" data-i18n-aria="backToTop" aria-label="Back to Top"><span class="back-to-top-icon" aria-hidden="true">↑</span><span class="back-to-top-text" data-i18n="backToTop">Back to Top</span></button>
</body>
</html>
`;
}

export function v2SitemapUrls(entities) {
  validatePublicV2Entities(entities);
  return entities.map((entity) => `${PRODUCTION_ORIGIN}${v2DetailPath(entity)}`);
}
