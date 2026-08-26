export const PRODUCTION_ORIGIN = "https://antiochia-app-6939593871.europe-west1.run.app";

// Single authoritative brand identity for every social/SEO tag this module
// (and v2-archive-release.js, which imports from here) emits — see
// socialMetaTags() below. The default image is a purpose-built 1200x630
// branded card (public/images/social/og-default.png); no per-entity raster
// generation exists, so any page without its own public-safe image falls
// back to this one rather than emitting a broken or missing og:image.
export const SITE_NAME = "AntiochiaArchive";
export const DEFAULT_SOCIAL_IMAGE = "/images/social/og-default.png";
export const DEFAULT_SOCIAL_IMAGE_WIDTH = 1200;
export const DEFAULT_SOCIAL_IMAGE_HEIGHT = 630;

export const ARCHIVE_CATEGORIES = Object.freeze([
  "history",
  "stories",
  "structures",
  "beliefs",
  "music",
  "gallery",
]);

export const ENTITY_TYPES = Object.freeze([
  "historicalContext",
  "story",
  "structure",
  "beliefSite",
  "musicTradition",
  "media",
]);

export const CATEGORY_INFO = Object.freeze({
  history: { label: "History", href: "/pages/history.html" },
  stories: { label: "Stories", href: "/pages/stories.html" },
  structures: { label: "Structures", href: "/pages/structures.html" },
  beliefs: { label: "Beliefs", href: "/pages/beliefs.html" },
  music: { label: "Music", href: "/pages/music.html" },
  gallery: { label: "Gallery", href: "/pages/gallery.html" },
});

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

export function safeHttpUrl(value) {
  try {
    const parsed = new URL(String(value));
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

export function localized(value, language = "en", fallback = "") {
  if (!isObject(value)) return fallback;
  return value[language] ?? value.en ?? value.tr ?? value.ar ?? fallback;
}

export function flattenArchive(archive) {
  return ARCHIVE_CATEGORIES.flatMap((category) => (
    (archive[category] || []).map((record) => ({ category, record }))
  ));
}

export function validateReleaseArchive(archive) {
  if (!isObject(archive)) throw new TypeError("Archive must be an object.");

  const ids = new Set();
  const slugs = new Set();
  for (const category of ARCHIVE_CATEGORIES) {
    if (!Array.isArray(archive[category])) throw new TypeError(`${category} must be an array.`);
    for (const record of archive[category]) {
      if (!record?.id || typeof record.id !== "string") throw new TypeError(`${category} contains a record without a valid ID.`);
      if (ids.has(record.id)) throw new TypeError(`Duplicate record ID: ${record.id}.`);
      ids.add(record.id);
      if (!SLUG_PATTERN.test(String(record.slug || ""))) throw new TypeError(`${record.id} has an invalid or missing slug.`);
      if (slugs.has(record.slug)) throw new TypeError(`Duplicate record slug: ${record.slug}.`);
      slugs.add(record.slug);
      if (!ENTITY_TYPES.includes(record.entityType)) throw new TypeError(`${record.id} has an invalid entityType.`);
    }
  }

  return { ids, slugs, count: ids.size };
}

export function recordDescription(record, language = "en") {
  return localized(record.body || record.desc || record.caption, language);
}

/**
 * Cleans and bounds a meta description: strips any HTML, collapses
 * whitespace, and — only past `max` characters — cuts on the last whole
 * word rather than mid-word, so a long summary never renders an awkward
 * truncation in a Google/social preview. Short text is returned untouched.
 */
export function truncateDescription(value, { max = 170 } = {}) {
  const clean = String(value ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed.trimEnd()}…`;
}

/**
 * The single source of every Open Graph + Twitter Card tag this project
 * emits, for both static category pages (via the batch head-injection in
 * scripts/inject-social-meta.mjs) and generated detail pages (below). A
 * page with its own public-safe `image` (already rights-gated by the
 * caller — see recordMedia()/entity.media — before it ever reaches here)
 * gets that image with no invented width/height (see DEFAULT_SOCIAL_IMAGE
 * comment above); a page with none gets the branded 1200x630 fallback with
 * its real, verified dimensions. `url` must already be the page's own
 * absolute canonical URL — this function never guesses or rewrites it.
 */
export function socialMetaTags({ title, description, url, type = "website", image, imageAlt }) {
  const absoluteImage = image
    ? (safeHttpUrl(image) || `${PRODUCTION_ORIGIN}${image}`)
    : `${PRODUCTION_ORIGIN}${DEFAULT_SOCIAL_IMAGE}`;
  const resolvedAlt = imageAlt || title;
  const dimensions = image ? "" : `
  <meta property="og:image:width" content="${DEFAULT_SOCIAL_IMAGE_WIDTH}">
  <meta property="og:image:height" content="${DEFAULT_SOCIAL_IMAGE_HEIGHT}">`;
  return `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
  <meta property="og:type" content="${escapeHtml(type)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(absoluteImage)}">
  <meta property="og:image:alt" content="${escapeHtml(resolvedAlt)}">${dimensions}
  <meta property="og:locale" content="en_US">
  <meta property="og:locale:alternate" content="tr_TR">
  <meta property="og:locale:alternate" content="ar_AR">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(absoluteImage)}">
  <meta name="twitter:image:alt" content="${escapeHtml(resolvedAlt)}">`;
}

export function recordTaxonomy(record, language = "en") {
  return localized(record.era || record.tag || record.category, language, record.categoryKey || record.entityType);
}

export function recordMedia(record) {
  const candidate = record.image || record.src;
  return typeof candidate === "string" && candidate.startsWith("/images/") ? candidate : null;
}

export function recordDetailPath(record) {
  return `/archive/${record.slug}/`;
}

function pageNavigation(activeCategory) {
  return ARCHIVE_CATEGORIES.map((category) => (
    `<a href="${CATEGORY_INFO[category].href}" data-i18n="nav.${category}"${category === activeCategory ? ' class="is-active" aria-current="page"' : ""}>${CATEGORY_INFO[category].label}</a>`
  )).join("\n          ");
}

function mobileNavigation(activeCategory) {
  return `<a href="/index.html" data-i18n="nav.home">Home</a>\n          ${pageNavigation(activeCategory)}\n          <a href="/index.html#contribute" data-i18n="actions.contribute">Contribute</a>`;
}

function sourceList(record) {
  if (!Array.isArray(record.sources) || record.sources.length === 0) return "";
  const entries = record.sources.map((source) => {
    const title = source.title || source.author || source.publisher || source.type || "Source";
    const link = safeHttpUrl(source.url);
    const heading = link
      ? `<a href="${escapeHtml(link)}" rel="noopener noreferrer">${escapeHtml(title)}</a>`
      : escapeHtml(title);
    const details = [source.author, source.publisher, source.year, source.locator]
      .filter(Boolean)
      .map(escapeHtml)
      .join(" · ");
    return `<li>${heading}${details ? `<span>${details}</span>` : ""}</li>`;
  }).join("\n              ");
  return `<section class="record-detail-section" aria-labelledby="record-sources-heading">
          <h2 id="record-sources-heading" data-i18n="provenance.sources">Sources</h2>
          <ol class="record-source-list">${entries}</ol>
        </section>`;
}

function mediaMarkup(record, language = "en") {
  const media = recordMedia(record);
  if (!media) {
    return `<div class="record-detail-placeholder" aria-hidden="true">
            <span class="record-detail-placeholder-mark">A</span>
          </div>
          <p class="record-placeholder-label" data-i18n="detail.imagePending">Image pending archival review</p>`;
  }

  const metadata = record.imageMetadata || {};
  const alt = localized(metadata.alt, language, localized(record.title, language));
  const caption = localized(metadata.caption, language);
  const sourceUrl = safeHttpUrl(metadata.originalUrl);
  const facts = [
    metadata.author && `<span><strong data-i18n="provenance.photoBy">Photo</strong>: ${escapeHtml(metadata.author)}</span>`,
    metadata.source && `<span><strong data-i18n="provenance.sourceLabel">Source</strong>: ${escapeHtml(metadata.source)}</span>`,
    metadata.license && `<span><strong data-i18n="provenance.license">License</strong>: ${escapeHtml(metadata.license)}</span>`,
  ].filter(Boolean).join("");
  const originalLink = sourceUrl
    ? `<a class="record-source-link" href="${escapeHtml(sourceUrl)}" rel="noopener noreferrer" data-i18n="detail.viewOriginal">View original source</a>`
    : "";
  const rights = metadata.rightsNote
    ? `<p class="record-rights-note">${escapeHtml(metadata.rightsNote)}</p>`
    : "";

  return `<figure class="record-detail-figure archive-media-figure" data-fallback-type="${escapeHtml(record.svgType || "circles")}" data-fallback-color="${escapeHtml(record.svgColor || "#903628")}" data-fallback-bg="${escapeHtml(record.svgBg || "#ded4c0")}">
          <img class="record-detail-image" src="${escapeHtml(media)}" alt="${escapeHtml(alt)}" width="1600" height="1000" data-archive-image>
          ${caption ? `<figcaption data-detail-image-caption>${escapeHtml(caption)}</figcaption>` : ""}
        </figure>
        ${facts || originalLink || rights ? `<aside class="record-provenance" aria-label="Image provenance">
          ${facts ? `<div class="record-provenance-facts">${facts}</div>` : ""}
          ${originalLink}
          ${rights}
        </aside>` : ""}`;
}

function jsonForScript(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function generateDetailDocument({ category, record, stylesheet, langScript, appScript }) {
  const categoryInfo = CATEGORY_INFO[category];
  if (!categoryInfo) throw new TypeError(`Unknown category: ${category}.`);

  const title = localized(record.title, "en", record.id);
  const pageTitle = `${title} — ${SITE_NAME}`;
  const description = recordDescription(record, "en");
  const metaDescription = truncateDescription(description);
  const taxonomy = recordTaxonomy(record, "en");
  const path = recordDetailPath(record);
  const canonical = `${PRODUCTION_ORIGIN}${path}`;
  const media = recordMedia(record);
  const metadata = record.imageMetadata || {};
  const imageAlt = media ? localized(metadata.alt, "en", title) : "";
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: pageTitle,
        description,
        inLanguage: ["tr", "en", "ar"],
        isPartOf: { "@id": `${PRODUCTION_ORIGIN}/#website` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${PRODUCTION_ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: categoryInfo.label, item: `${PRODUCTION_ORIGIN}${categoryInfo.href}` },
          { "@type": "ListItem", position: 3, name: title, item: canonical },
        ],
      },
    ],
  };
  if (media) jsonLd["@graph"][0].primaryImageOfPage = `${PRODUCTION_ORIGIN}${media}`;

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(metaDescription)}">
  <meta name="theme-color" content="#f2ead8">
  ${socialMetaTags({
    title: pageTitle,
    description: metaDescription,
    url: canonical,
    type: "article",
    image: media,
    imageAlt,
  })}
  <title>${escapeHtml(pageTitle)}</title>
  <link rel="canonical" href="${canonical}">
  <link rel="stylesheet" href="${escapeHtml(stylesheet)}">
  <script type="application/ld+json">${jsonForScript(jsonLd)}</script>
</head>
<body class="record-detail-page" data-record-id="${escapeHtml(record.id)}">
  <a class="skip-link" href="#main-content" data-i18n="a11y.skipLink">Skip to content</a>
  <header class="site-header" role="banner">
    <div class="container header-inner">
      <a class="brand" href="/index.html" aria-label="AntiochiaArchive home"><span class="brand-mark" aria-hidden="true">A</span><span>AntiochiaArchive</span></a>
      <nav class="nav-primary" aria-label="Primary navigation">
        <a href="/index.html" data-i18n="nav.home">Home</a>
        ${pageNavigation(category)}
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
    <nav class="mobile-nav" id="mobile-nav" aria-label="Mobile navigation" aria-hidden="true"><div class="container mobile-nav-inner">${mobileNavigation(category)}</div></nav>
  </header>
  <main id="main-content">
    <article class="record-detail">
      <div class="container record-detail-container">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <a href="/index.html" data-i18n="nav.home">Home</a><span class="breadcrumb-separator">/</span>
          <a href="${categoryInfo.href}" data-i18n="nav.${category}">${categoryInfo.label}</a><span class="breadcrumb-separator">/</span>
          <span data-detail-title>${escapeHtml(title)}</span>
        </nav>
        <header class="record-detail-header">
          <p class="page-badge-wrap"><span data-detail-category>${escapeHtml(categoryInfo.label)}</span> · <span data-detail-taxonomy>${escapeHtml(taxonomy)}</span></p>
          <h1 data-detail-title>${escapeHtml(title)}</h1>
          <p class="record-detail-summary" data-detail-description>${escapeHtml(description)}</p>
        </header>
        <div class="record-detail-grid">
          <div class="record-detail-media">${mediaMarkup(record, "en")}</div>
          <div class="record-detail-content">
            <section class="record-detail-section" aria-labelledby="record-about-heading">
              <h2 id="record-about-heading" data-i18n="detail.aboutRecord">About this record</h2>
              <p data-detail-description>${escapeHtml(description)}</p>
            </section>
            ${sourceList(record)}
          </div>
        </div>
        <nav class="record-detail-actions" aria-label="Record navigation">
          <a class="btn-cta-primary" href="${categoryInfo.href}"><span data-i18n="detail.backToCollection">Back to collection</span></a>
          <a class="archive-detail-link" href="/index.html" data-i18n="pages.backToHome">← Back to Home</a>
        </nav>
      </div>
    </article>
  </main>
  <footer class="site-footer" role="contentinfo"><div class="container"><div class="footer-top">
    <div class="footer-brand-wrap"><a class="footer-brand" href="/index.html"><span class="brand-mark" aria-hidden="true">A</span><span class="brand-name">AntiochiaArchive</span></a><p class="footer-about" data-i18n="footerAbout">A living digital memory preserving the voices, images, oral histories, and shared places of Antioch.</p></div>
    <div class="footer-nav-col"><h2 class="footer-heading" data-i18n="footer.links.about">Navigation</h2><nav class="footer-nav">${pageNavigation(category)}<a href="/pages/methodology.html" data-i18n="nav.methodology">Methodology</a></nav></div>
  </div><div class="footer-bottom"><p>© 2026 <span data-i18n="copyright">AntiochiaArchive. Open source, open memory.</span></p><p class="coords-line">36.2021° N · 36.1608° E</p></div></div></footer>
  <script id="archive-record-data" type="application/json">${jsonForScript({ category, record })}</script>
  <script src="${escapeHtml(langScript)}"></script>
  <script src="${escapeHtml(appScript)}"></script>
  <button id="back-to-top" class="back-to-top" type="button" data-i18n-aria="backToTop" aria-label="Back to Top"><span class="back-to-top-icon" aria-hidden="true">↑</span><span class="back-to-top-text" data-i18n="backToTop">Back to Top</span></button>
</body>
</html>
`;
}

export function sitemapUrls(archive, { includeMethodology = true } = {}) {
  validateReleaseArchive(archive);
  const paths = [
    "/",
    ...ARCHIVE_CATEGORIES.map((category) => CATEGORY_INFO[category].href),
    ...(includeMethodology ? ["/pages/methodology.html"] : []),
    ...flattenArchive(archive).map(({ record }) => recordDetailPath(record)),
  ];
  return paths.map((path) => `${PRODUCTION_ORIGIN}${path}`);
}
