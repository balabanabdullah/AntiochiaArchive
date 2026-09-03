// The ONE cultural-entity detail-page template — used by BOTH the build-time
// static generator (scripts/generate-v2-detail-pages.js, via
// scripts/v2-archive-release.js re-exporting from this module) and the
// runtime renderer (entityDetailRenderer.js). This file lives inside
// backend/ specifically so it ships inside the backend's own Docker image
// (see backend/Dockerfile's `COPY . .`) — the repository-root scripts/
// directory is NOT part of that build context (Cloud Run's `--source
// backend` deploy only sends this directory), so a runtime renderer that
// needs the real site header/nav/footer/design system MUST have that
// template physically inside backend/, not merely importable from a
// developer's full checkout. Moving it here (rather than the reverse — the
// backend importing scripts/) is also the established dependency direction
// in this codebase: scripts/v2-archive-release.js already imports FROM
// backend/v2/... for its data pipeline (localMappedV2Store, publicVisibility,
// publicSerializer); the build-time-only pieces (collectPublicV2Entities,
// validatePublicV2Entities, v2SitemapUrls) stay in scripts/ since they read
// files off disk at build time, a concern the backend doesn't have.
//
// "Do not maintain two visually-divergent detail implementations" (the
// "correctness pass" round's Section 3) — before this module existed, the
// runtime renderer was a completely separate, hand-rolled minimal HTML
// shell (no real header/nav/footer, an invented `?lang=` URL scheme the
// real site has never used) while the static generator produced the real,
// polished, on-brand page. Extracting the ACTUAL generator function here
// and having both callers share it is what closes that gap for good: a
// runtime-rendered page and a build-time-rendered page for the same slug
// are now byte-for-byte identical in template structure, differing only in
// which entity data and which currently-live asset filenames were passed
// in (see detailAssetManifest.js for how the runtime resolves the latter).

const PRODUCTION_ORIGIN_DEFAULT = "https://antiochia-app-6939593871.europe-west1.run.app";
export const PRODUCTION_ORIGIN = (process.env.CLIENT_URL || PRODUCTION_ORIGIN_DEFAULT).replace(/\/$/, "");
export const SITE_NAME = "AntiochiaArchive";
const DEFAULT_SOCIAL_IMAGE = "/images/social/og-default.png";
const DEFAULT_SOCIAL_IMAGE_WIDTH = 1200;
const DEFAULT_SOCIAL_IMAGE_HEIGHT = 630;

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function safeHttpUrl(value) {
  try {
    const parsed = new URL(String(value));
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

export function localized(value, language = "en", fallback = "") {
  if (!value || typeof value !== "object") return fallback;
  return value[language] ?? value.en ?? value.tr ?? value.ar ?? fallback;
}

function truncateDescription(value, { max = 170 } = {}) {
  const clean = String(value ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed.trimEnd()}…`;
}

/** Single source of every Open Graph + Twitter Card tag a detail page emits — mirrors scripts/archive-release.js's socialMetaTags() exactly (that copy still serves the v1 pipeline, which has no reason to depend on backend/). */
function socialMetaTags({ title, description, url, type = "website", image, imageAlt }) {
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
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(absoluteImage)}">`;
}

export function v2DetailPath(entity) {
  return `/archive-v2/${entity.slug}/`;
}

export const V2_TYPE_INFO = Object.freeze({
  historicalContext: { href: "/pages/history.html", navKey: "history", label: "History" },
  community: { href: "/pages/communities.html", navKey: "communities", label: "Communities" },
  belief: { href: "/pages/beliefs.html", navKey: "beliefs", label: "Beliefs" },
  place: { href: "/pages/places.html", navKey: "places", label: "Places" },
  structure: { href: "/pages/structures.html", navKey: "structures", label: "Structures" },
  story: { href: "/pages/stories.html", navKey: "stories", label: "Stories" },
  music: { href: "/pages/music.html", navKey: "music", label: "Music" },
  proverb: { href: "/pages/proverbs.html", navKey: "proverbs", label: "Proverbs & Expressions" },
});

/** The single type-specific fact shown under a v2 detail page's title — mirrors public/script.js's v2DetailFact(). */
export function v2EntityFact(entity, language = "en") {
  if (entity.entityType === "historicalContext") return localized(entity.period?.label, language);
  if (entity.entityType === "structure") return entity.structureType || "";
  if (entity.entityType === "music") return entity.genre || "";
  if (entity.entityType === "proverb") return entity.dialect || (entity.language ? entity.language.toUpperCase() : "");
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

const ARCHIVE_NAV_ITEMS = [
  { navKey: "history", href: "/pages/history.html", label: "History" },
  { navKey: "communities", href: "/pages/communities.html", label: "Communities" },
  { navKey: "beliefs", href: "/pages/beliefs.html", label: "Beliefs" },
  { navKey: "places", href: "/pages/places.html", label: "Places" },
  { navKey: "structures", href: "/pages/structures.html", label: "Structures" },
  { navKey: "stories", href: "/pages/stories.html", label: "Stories" },
  { navKey: "music", href: "/pages/music.html", label: "Music" },
  { navKey: "proverbs", href: "/pages/proverbs.html", label: "Proverbs &amp; Expressions" },
  { navKey: "gallery", href: "/pages/gallery.html", label: "Gallery" },
];
const DISCOVER_NAV_ITEMS = [
  { navKey: "map", href: "/pages/map.html", label: "Map" },
  { navKey: "timeline", href: "/index.html#timeline", label: "Timeline" },
  { navKey: "collections", href: "/pages/collections.html", label: "Collections" },
  { navKey: "discoverPage", href: "/pages/discover.html", label: "Explore the Archive" },
];

function navLink({ navKey, href, label }, activeNavKey) {
  return `<a href="${href}" data-i18n="nav.${navKey}"${navKey === activeNavKey ? ' class="is-active" aria-current="page"' : ""}>${label}</a>`;
}

function desktopNavPrimary(activeNavKey) {
  const archiveLinks = ARCHIVE_NAV_ITEMS.map((item) => `            ${navLink(item, activeNavKey)}`).join("\n");
  const discoverLinks = DISCOVER_NAV_ITEMS.map((item) => `            ${navLink(item, activeNavKey)}`).join("\n");
  return `<div class="nav-discover" data-nav-discover>
          <button type="button" class="nav-discover-trigger" aria-expanded="false" aria-controls="nav-archive-menu" data-i18n="nav.archive">Archive</button>
          <div class="nav-discover-menu" id="nav-archive-menu">
${archiveLinks}
          </div>
        </div>
        <div class="nav-discover" data-nav-discover>
          <button type="button" class="nav-discover-trigger" aria-expanded="false" aria-controls="nav-discover-menu" data-i18n="nav.discover">Discover</button>
          <div class="nav-discover-menu" id="nav-discover-menu">
${discoverLinks}
          </div>
        </div>
        <a href="/pages/methodology.html" data-i18n="nav.methodology"${activeNavKey === "methodology" ? ' class="is-active" aria-current="page"' : ""}>Methodology</a>`;
}

export function jsonForScript(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

const EVIDENCE_TYPE_LABELS = Object.freeze({
  verifiedHistorical: "Verified Historical Source",
  scholarlyInterpretation: "Scholarly Interpretation",
  oralHistory: "Oral History",
  localTradition: "Local Tradition",
  religiousTradition: "Religious Tradition",
  legend: "Legend",
  mythologicalNarrative: "Mythological Narrative",
});

function evidenceBadgeMarkup(entity) {
  const label = EVIDENCE_TYPE_LABELS[entity.evidenceType];
  if (!label) return "";
  return `<span class="record-evidence-badge" data-i18n="detail.evidenceType.${entity.evidenceType}">${escapeHtml(label)}</span>`;
}

function nameListText(values) {
  if (!Array.isArray(values)) return "";
  return values.map((item) => item?.name).filter(Boolean).join(", ");
}

function alternateNamesText(value, language) {
  if (!value || typeof value !== "object") return "";
  const list = value[language] || value.en || value.tr || value.ar;
  return Array.isArray(list) ? list.filter(Boolean).join(", ") : "";
}

function namesSectionMarkup(entity, language) {
  const localValue = nameListText(entity.localNames);
  const historicalAlternateRows = [
    ["detail.alternateNames", "Also known as", alternateNamesText(entity.alternateNames, language)],
    ["detail.historicalNames", "Historical names", nameListText(entity.historicalNames)],
  ].filter(([, , value]) => value);

  const sections = [];
  if (localValue) {
    sections.push(`<section class="record-detail-section record-names-section" aria-labelledby="record-local-names-heading">
              <h2 id="record-local-names-heading" data-i18n="detail.localNames">Local names</h2>
              <p class="record-names-value">${escapeHtml(localValue)}</p>
            </section>`);
  }
  if (historicalAlternateRows.length) {
    sections.push(`<section class="record-detail-section record-names-section" aria-labelledby="record-historical-names-heading">
              <h2 id="record-historical-names-heading" data-i18n="detail.historicalAlternateNames">Historical / alternate names</h2>
              <dl class="record-names-list">
                ${historicalAlternateRows.map(([key, fallback, value]) => `<div><dt data-i18n="${key}">${escapeHtml(fallback)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("\n                ")}
              </dl>
            </section>`);
  }
  return sections.join("\n            ");
}

function metadataPanelMarkup(entity, language, placeById) {
  const rows = [];
  const period = localized(entity.period?.label, language);
  if (period) rows.push(["detail.period", "Period", escapeHtml(period)]);

  const typeValue = entity.structureType || entity.genre || entity.storyCategory;
  if (typeValue) rows.push(["detail.typeLabel", "Type", escapeHtml(typeValue)]);

  if (entity.storyPlaceId && placeById?.has(entity.storyPlaceId)) {
    const place = placeById.get(entity.storyPlaceId);
    const placeTitle = escapeHtml(localized(place.title, language, place.slug));
    rows.push(["nav.places", "Place", `<a href="${escapeHtml(v2DetailPath(place))}">${placeTitle}</a>`]);
  }

  if (Array.isArray(entity.languages) && entity.languages.length) {
    rows.push(["detail.languagesLabel", "Languages", escapeHtml(entity.languages.join(", ").toUpperCase())]);
  }

  if (entity.dialect) rows.push(["detail.dialect", "Dialect", escapeHtml(entity.dialect)]);
  if (entity.originalLanguage) rows.push(["detail.originalLanguage", "Original Language", escapeHtml(entity.originalLanguage.toUpperCase())]);
  if (entity.entityType === "proverb" && entity.language) rows.push(["detail.language", "Language", escapeHtml(entity.language.toUpperCase())]);
  if (entity.entityType === "proverb" && entity.transliteration) rows.push(["detail.transliteration", "Transliteration", escapeHtml(entity.transliteration)]);

  if (!rows.length && !entity.evidenceType) return "";
  return `<section class="record-detail-section record-metadata-section" aria-labelledby="record-metadata-heading">
              <h2 id="record-metadata-heading" data-i18n="detail.metadataHeading">Record Metadata</h2>
              ${evidenceBadgeMarkup(entity)}
              ${rows.length ? `<dl class="record-metadata-list">
                ${rows.map(([key, fallback, value]) => `<div><dt data-i18n="${key}">${escapeHtml(fallback)}</dt><dd>${value}</dd></div>`).join("\n                ")}
              </dl>` : ""}
            </section>`;
}

function shareControlsMarkup(canonicalUrl, title) {
  const encodedUrl = encodeURIComponent(canonicalUrl);
  const encodedTitle = encodeURIComponent(title);
  return `<section class="record-share" aria-labelledby="record-share-heading" data-share-url="${escapeHtml(canonicalUrl)}" data-share-title="${escapeHtml(title)}">
              <h2 id="record-share-heading" data-i18n="detail.share.heading">Share this record</h2>
              <div class="record-share-buttons">
                <button type="button" class="record-share-btn record-share-copy" data-i18n="detail.share.copyLink">Copy link</button>
                <a class="record-share-btn record-share-whatsapp" href="https://wa.me/?text=${encodedTitle}%20${encodedUrl}" target="_blank" rel="noopener noreferrer" data-i18n="detail.share.whatsapp">WhatsApp</a>
                <a class="record-share-btn record-share-x" href="https://twitter.com/intent/tweet?text=${encodedTitle}&amp;url=${encodedUrl}" target="_blank" rel="noopener noreferrer" data-i18n="detail.share.x">X</a>
                <button type="button" class="record-share-btn record-share-native" data-i18n="detail.share.nativeShare" hidden>Share</button>
              </div>
            </section>`;
}

function contributionCtaMarkup() {
  return `<section class="page-cta record-detail-contribute-cta">
              <div class="page-cta-inner">
                <h2 class="page-cta-title" data-i18n="detail.contributeCta.title">Do you have information about this record?</h2>
                <p class="page-cta-body" data-i18n="detail.contributeCta.body">An old photograph, a family story, a local name, a correction, a Mettule saying, or an audio recording — your contribution helps preserve this record for future generations.</p>
                <a class="btn-cta-primary" href="/index.html#contribute">
                  <span data-i18n="detail.contributeCta.btn">Contribute to Archive</span>
                  <span aria-hidden="true">→</span>
                </a>
              </div>
            </section>`;
}

function locationPreviewMarkup(entity) {
  if (!entity.coordinates || typeof entity.coordinates.latitude !== "number") return "";
  const title = localized(entity.title, "en", entity.slug);
  return `<section class="record-detail-section record-location-section" aria-labelledby="record-location-heading">
              <h2 id="record-location-heading" data-i18n="map.locationHeading">Location</h2>
              <a class="record-location-link" data-map-cta href="/pages/map.html?entity=${escapeHtml(entity.id)}" aria-label="View ${escapeHtml(title)} on the map">
                <svg class="location-pin-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M12 21s-7-7.58-7-12a7 7 0 0 1 14 0c0 4.42-7 12-7 12z"/>
                  <circle cx="12" cy="9" r="2.5"/>
                </svg>
                <span data-i18n="map.viewOnMapCta">View on Map</span>
              </a>
            </section>`;
}

function musicTextSectionMarkup(entity, language) {
  if (entity.entityType !== "music") return "";
  const rows = [
    ["music.lyrics", "Lyrics", localized(entity.lyrics, language)],
    ["music.transcript", "Transcript", localized(entity.transcript, language)],
    ["music.translation", "Translation", localized(entity.translations, language)],
  ].filter(([, , text]) => text);
  if (!rows.length) return "";
  return `<section class="record-detail-section record-music-text-section" aria-labelledby="record-music-text-heading">
              <h2 id="record-music-text-heading" hidden>Lyrics &amp; Transcript</h2>
              ${rows.map(([key, fallback, text]) => `<h3 data-i18n="${key}">${escapeHtml(fallback)}</h3><p class="record-music-text-block">${escapeHtml(text)}</p>`).join("\n              ")}
            </section>`;
}

function audioSectionMarkup(entity) {
  if (!["music", "proverb"].includes(entity.entityType) || !Array.isArray(entity.audioMediaIds) || !entity.audioMediaIds.length) return "";
  const attr = entity.entityType === "proverb" ? "data-proverb-audio-section" : "data-music-audio-section";
  const headingKey = entity.entityType === "proverb" ? "proverbs.audio" : "music.audio";
  const headingFallback = entity.entityType === "proverb" ? "Audio Recording" : "Audio";
  return `<section class="record-detail-section record-audio-section" ${attr} hidden aria-labelledby="record-audio-heading">
              <h2 id="record-audio-heading" data-i18n="${headingKey}">${escapeHtml(headingFallback)}</h2>
              <div data-music-audio-container></div>
            </section>`;
}

function proverbExpressionMarkup(entity) {
  if (entity.entityType !== "proverb" || !entity.originalText) return "";
  return `<section class="record-detail-section record-proverb-expression-section" aria-labelledby="record-proverb-expression-heading">
              <h2 id="record-proverb-expression-heading" hidden>Expression</h2>
              <p class="record-proverb-expression" dir="auto">${escapeHtml(entity.originalText)}</p>
            </section>`;
}

function proverbTextSectionMarkup(entity, language) {
  if (entity.entityType !== "proverb") return "";
  const rows = [
    ["detail.literalMeaning", "Literal Meaning", localized(entity.literalMeaning, language)],
    ["detail.culturalMeaning", "Cultural Meaning", localized(entity.culturalMeaning, language)],
    ["detail.usageContext", "Usage Context", localized(entity.usageContext, language)],
    ["detail.example", "Example", localized(entity.example, language)],
    ["proverbs.translation", "Translation", localized(entity.translations, language)],
  ].filter(([, , text]) => text);
  if (!rows.length) return "";
  return `<section class="record-detail-section record-proverb-text-section" aria-labelledby="record-proverb-text-heading">
              <h2 id="record-proverb-text-heading" hidden>Meaning &amp; Usage</h2>
              ${rows.map(([key, fallback, text]) => `<h3 data-i18n="${key}">${escapeHtml(fallback)}</h3><p class="record-proverb-text-block">${escapeHtml(text)}</p>`).join("\n              ")}
            </section>`;
}

function exploreMoreMarkup(entity) {
  return `<section class="record-explore-more" data-explore-more data-entity-id="${escapeHtml(entity.id)}" data-entity-type="${escapeHtml(entity.entityType)}" aria-labelledby="record-explore-more-heading">
              <h2 id="record-explore-more-heading" data-i18n="detail.exploreMore">Explore more</h2>
              <div class="record-explore-more-grid" data-explore-more-grid></div>
              <button type="button" class="btn-discover-another" data-discover-another data-i18n="discover.another" hidden>Another record</button>
            </section>`;
}

/**
 * The one function that produces a cultural-entity detail page's full HTML
 * document — called at build time (scripts/generate-v2-detail-pages.js,
 * with versioned/hashed asset filenames scraped from dist/index.html) and
 * at request time (entityDetailRenderer.js, with asset filenames resolved
 * over HTTP by detailAssetManifest.js). Both callers get byte-for-byte the
 * same header/nav/footer/design system/information architecture for the
 * same entity + asset inputs — there is no second template anywhere.
 */
export function generateV2DetailDocument({ entity, stylesheet, langScript, v2ApiScript, archiveStoreScript, searchScript, musicScript, appScript, entities = [] }) {
  const typeInfo = V2_TYPE_INFO[entity.entityType];
  if (!typeInfo) throw new TypeError(`Unknown v2 entity type: ${entity.entityType}.`);

  const placeById = new Map(entities.filter((item) => item.entityType === "place").map((place) => [place.id, place]));

  const title = localized(entity.title, "en", entity.slug);
  const pageTitle = `${title} — ${SITE_NAME}`;
  const description = localized(entity.summary, "en");
  const metaDescription = truncateDescription(description);
  const fact = v2EntityFact(entity, "en");
  const path = v2DetailPath(entity);
  const canonical = `${PRODUCTION_ORIGIN}${path}`;
  const media = entity.media;
  const imageAlt = media?.path ? localized(media.alt, "en", title) : "";
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
          { "@type": "ListItem", position: 2, name: typeInfo.label, item: `${PRODUCTION_ORIGIN}${typeInfo.href}` },
          { "@type": "ListItem", position: 3, name: title, item: canonical },
        ],
      },
    ],
  };
  if (media?.path) jsonLd["@graph"][0].primaryImageOfPage = safeHttpUrl(`${PRODUCTION_ORIGIN}${media.path}`) || `${PRODUCTION_ORIGIN}${media.path}`;

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
    image: media?.path,
    imageAlt,
  })}
  <title>${escapeHtml(pageTitle)}</title>
  <link rel="canonical" href="${canonical}">
  <link rel="stylesheet" href="${escapeHtml(stylesheet)}">
  <script type="application/ld+json">${jsonForScript(jsonLd)}</script>
</head>
<body class="record-detail-page" data-entity-id="${escapeHtml(entity.id)}">
  <a class="skip-link" href="#main-content" data-i18n="a11y.skipLink">Skip to content</a>
  <header class="site-header" role="banner">
    <div class="container header-inner">
      <a class="brand" href="/index.html" aria-label="AntiochiaArchive home"><span class="brand-mark" aria-hidden="true">A</span><span>AntiochiaArchive</span></a>
      <nav class="nav-primary" aria-label="Primary navigation">
        <a href="/index.html" data-i18n="nav.home">Home</a>
        ${desktopNavPrimary(typeInfo.navKey)}
      </nav>
      <div class="header-actions">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="search" id="search-input" aria-label="Search archive" data-i18n-placeholder="search.placeholder" placeholder="Search the AntiochiaArchive…">
        </div>
        <div class="lang-switcher" role="group" aria-label="Choose language">
          <button class="lang-btn" type="button" data-lang="tr" aria-pressed="false">TR</button>
          <button class="lang-btn" type="button" data-lang="en" aria-pressed="true">EN</button>
          <button class="lang-btn" type="button" data-lang="ar" aria-pressed="false">AR</button>
        </div>
        <a class="btn-contribute" href="/index.html#contribute"><span data-i18n="actions.contribute">Contribute</span><span aria-hidden="true">＋</span></a>
        <button class="menu-toggle" id="menu-toggle" type="button" aria-label="Open navigation menu" aria-expanded="false" aria-controls="mobile-nav"><span class="bar"></span><span class="bar"></span><span class="bar"></span></button>
      </div>
    </div>
    <nav class="mobile-nav" id="mobile-nav" aria-label="Mobile navigation" aria-hidden="true"><div class="container mobile-nav-inner">
      <div class="mobile-nav-search"><input class="search-input-field" type="search" autocomplete="off" placeholder="Search..." aria-label="Search archive" data-i18n-placeholder="search.placeholder" data-i18n-aria="a11y.searchArchive"></div>
      <a href="/index.html" data-i18n="nav.home">Home</a>
      <p class="mobile-nav-group-label" data-i18n="nav.archive" aria-hidden="true">Archive</p>
      ${ARCHIVE_NAV_ITEMS.map((item) => navLink(item, typeInfo.navKey)).join("\n      ")}
      <p class="mobile-nav-group-label" data-i18n="nav.discover" aria-hidden="true">Discover</p>
      ${DISCOVER_NAV_ITEMS.map((item) => navLink(item, typeInfo.navKey)).join("\n      ")}
      <a href="/pages/methodology.html" data-i18n="nav.methodology"${typeInfo.navKey === "methodology" ? ' class="is-active" aria-current="page"' : ""}>Methodology</a>
      <div class="mobile-nav-lang"><div class="lang-switcher" role="group" aria-label="Choose language"><button class="lang-btn" type="button" data-lang="tr" aria-pressed="false">TR</button><button class="lang-btn" type="button" data-lang="en" aria-pressed="true">EN</button><button class="lang-btn" type="button" data-lang="ar" aria-pressed="false">AR</button></div></div>
      <a class="btn-contribute mobile-nav-contribute" href="/index.html#contribute"><span data-i18n="actions.contribute">Contribute</span><span aria-hidden="true">＋</span></a>
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
          <p class="page-badge-wrap"><span data-detail-category>${escapeHtml(typeInfo.label)}</span><span class="badge-sep" data-detail-taxonomy-sep aria-hidden="true"${fact ? "" : " hidden"}> · </span><span data-detail-taxonomy${fact ? "" : " hidden"}>${escapeHtml(fact)}</span></p>
          <h1 data-detail-title>${escapeHtml(title)}</h1>
          <p class="record-detail-summary" data-detail-description>${escapeHtml(description)}</p>
        </header>
        <div class="record-detail-grid">
          <div class="record-detail-media">${mediaMarkup(entity, "en")}</div>
          <div class="record-detail-content">
            ${proverbExpressionMarkup(entity)}
            ${namesSectionMarkup(entity, "en")}
            ${metadataPanelMarkup(entity, "en", placeById)}
            ${audioSectionMarkup(entity)}
            ${musicTextSectionMarkup(entity, "en")}
            ${proverbTextSectionMarkup(entity, "en")}
            ${locationPreviewMarkup(entity)}
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
        ${contributionCtaMarkup()}
        ${shareControlsMarkup(canonical, title)}
        ${exploreMoreMarkup(entity)}
      </div>
    </article>
  </main>
  <footer class="site-footer" role="contentinfo"><div class="container"><div class="footer-top">
    <div class="footer-brand-wrap"><a class="footer-brand" href="/index.html"><span class="brand-mark" aria-hidden="true">A</span><span class="brand-name">AntiochiaArchive</span></a><p class="footer-about" data-i18n="footerAbout">A living digital memory preserving the voices, images, oral histories, and shared places of Antioch.</p></div>
    <div class="footer-nav-col"><h4 class="footer-heading" data-i18n="footer.headings.archive">Archive</h4><nav class="footer-nav">${ARCHIVE_NAV_ITEMS.map((item) => navLink(item, typeInfo.navKey)).join("")}</nav></div>
    <div class="footer-nav-col"><h4 class="footer-heading" data-i18n="footer.headings.discover">Discover</h4><nav class="footer-nav">${DISCOVER_NAV_ITEMS.map((item) => navLink(item, typeInfo.navKey)).join("")}</nav></div>
    <div class="footer-social-col"><h4 class="footer-heading" data-i18n="footer.headings.contribute">Contribute</h4><div class="footer-social-links"><a class="social-link" href="/index.html#contribute"><span data-i18n="actions.contribute">Contribute</span></a><a class="social-link${typeInfo.navKey === "methodology" ? " is-active" : ""}" href="/pages/methodology.html"><span data-i18n="nav.methodology">Methodology</span></a></div></div>
  </div><div class="footer-bottom"><p>© 2026 <span data-i18n="copyright">AntiochiaArchive. Open source, open memory.</span></p><p class="coords-line">36.2021° N · 36.1608° E</p></div></div></footer>
  <script id="v2-record-data" type="application/json">${jsonForScript({ entity })}</script>
  <script src="${escapeHtml(langScript)}"></script>
  <script src="${escapeHtml(v2ApiScript)}"></script>
  ${archiveStoreScript ? `<script src="${escapeHtml(archiveStoreScript)}"></script>` : ""}
  ${searchScript ? `<script src="${escapeHtml(searchScript)}"></script>` : ""}
  ${["music", "proverb"].includes(entity.entityType) && Array.isArray(entity.audioMediaIds) && entity.audioMediaIds.length && musicScript ? `<script src="${escapeHtml(musicScript)}"></script>` : ""}
  <script src="${escapeHtml(appScript)}"></script>
  <button id="back-to-top" class="back-to-top" type="button" data-i18n-aria="backToTop" aria-label="Back to Top"><span class="back-to-top-icon" aria-hidden="true">↑</span><span class="back-to-top-text" data-i18n="backToTop">Back to Top</span></button>
</body>
</html>
`;
}
