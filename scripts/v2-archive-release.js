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
import { PRODUCTION_ORIGIN, SITE_NAME, escapeHtml, safeHttpUrl, localized, truncateDescription, socialMetaTags } from "./archive-release.js";

// Path segment -> domain entityType, mirroring backend/v2/routes/v2Routes.js's
// TYPE_ROUTES (media/source excluded: they are never standalone detail-page
// content — see backend/v2/schemas/media.js). proverb has 0 public records
// today (see V2-ARCHITECTURE.md "No production migration yet") but is
// included here as static-generation infrastructure: a published proverb
// gets a real detail page the moment one exists, with zero further code
// changes, exactly like every other type in this list.
export const V2_DETAIL_TYPES = Object.freeze([
  "historicalContext",
  "community",
  "belief",
  "place",
  "structure",
  "story",
  "music",
  "proverb",
]);

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
    { navKey: "map", href: "/pages/map.html", label: "Map" },
    { navKey: "collections", href: "/pages/collections.html", label: "Collections" },
    { navKey: "discoverPage", href: "/pages/discover.html", label: "Explore the Archive" },
    { navKey: "proverbs", href: "/pages/proverbs.html", label: "Proverbs & Expressions" },
  ];
  return base.map(({ navKey, href, label }) => (
    `<a href="${href}" data-i18n="nav.${navKey}"${navKey === activeNavKey ? ' class="is-active"' : ""}>${label}</a>`
  )).join("\n          ");
}

function jsonForScript(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

// Mirrors public/lang.js's en.detail.evidenceType.* fallback text exactly —
// this generator has no access to lang.js's TRANSLATIONS at build time (that
// object is a browser-global, not an export), so the static English label is
// baked in here and the data-i18n attribute lets the client swap languages
// after load, same pattern as every other data-i18n string on this page.
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

/** place.localNames / place.historicalNames: [{ name, transliteration? }] -> "Name1, Name2". Name-only, not multilingual per entry. */
function nameListText(values) {
  if (!Array.isArray(values)) return "";
  return values.map((item) => item?.name).filter(Boolean).join(", ");
}

/** { tr: [...], en: [...], ar: [...] } -> the current language's list, joined — falls back like every other multilingual field. */
function alternateNamesText(value, language) {
  if (!value || typeof value !== "object") return "";
  const list = value[language] || value.en || value.tr || value.ar;
  return Array.isArray(list) ? list.filter(Boolean).join(", ") : "";
}

/**
 * "Also known as / Historical names / Local names" — only for the fields
 * that exist on this entity's public shape (today, only `place` carries
 * any of these). Renders nothing when none are present.
 */
function namesSectionMarkup(entity, language) {
  const rows = [
    ["detail.alternateNames", "Also known as", alternateNamesText(entity.alternateNames, language)],
    ["detail.historicalNames", "Historical names", nameListText(entity.historicalNames)],
    ["detail.localNames", "Local names", nameListText(entity.localNames)],
  ].filter(([, , value]) => value);
  if (!rows.length) return "";
  return `<section class="record-detail-section record-names-section" aria-labelledby="record-names-heading">
              <h2 id="record-names-heading" data-i18n="detail.alternateNames">Also known as</h2>
              <dl class="record-names-list">
                ${rows.map(([key, fallback, value]) => `<div><dt data-i18n="${key}">${escapeHtml(fallback)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("\n                ")}
              </dl>
            </section>`;
}

/**
 * Type-specific metadata rows, drawn only from fields the public serializer
 * allowlists for this entityType (see backend/v2/serializers/publicSerializer.js)
 * — a field simply isn't pushed when the entity doesn't carry it, so this
 * never renders an empty or "unknown" row. `placeById` (slug -> public place
 * entity) lets a story's storyPlaceId resolve to a real, linkable place
 * title — still 100% public-to-public data, no relationship record involved.
 */
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

  // dialect/originalLanguage are public fields on music and story — a
  // free-text cultural dialect label plus the ISO-ish language code already
  // used elsewhere on the site (tr/en/ar), never fabricated.
  if (entity.dialect) rows.push(["detail.dialect", "Dialect", escapeHtml(entity.dialect)]);
  if (entity.originalLanguage) rows.push(["detail.originalLanguage", "Original Language", escapeHtml(entity.originalLanguage.toUpperCase())]);
  // proverb.language is the same tr/en/ar controlled vocabulary as
  // originalLanguage above, just under its own schema field name.
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

/**
 * A "View on Map" link — only when this entity itself carries a real
 * published coordinate (see backend/v2/schemas/place.js; structure has no
 * coordinates field yet, so this never fires for one — see V2-ARCHITECTURE.md
 * "Coordinate schema"). Never renders for an entity without one, and never
 * estimates a coordinate.
 *
 * Links by canonical id (`?entity=<id>`), not slug — the map page resolves
 * the id itself (public/js/map.js has no slug-to-id ambiguity to worry
 * about). Text/aria-label are baked here as an English default (matching
 * every other detail-page string) and re-localized client-side by
 * renderV2DetailPage() in public/script.js on every language switch, the
 * same pattern already used for the title/description/taxonomy fields.
 */
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

/**
 * Music lyrics/transcript/translation — public multilingual text fields
 * already on the entity itself (backend/v2/serializers/publicSerializer.js's
 * music allowlist), so — unlike the audio player, which needs the separate
 * `media` entity resolved — this can be baked straight into the static page
 * at build time: real text on first paint, no client-side fetch, no flash.
 * Renders only the subsections that actually have content in this language
 * (falling back like every other multilingual field); renders nothing at
 * all for a music record with none of the three.
 */
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

/**
 * Hidden placeholder for the real audio player — only emitted for a music or
 * proverb entity that actually carries audioMediaIds (both types share the
 * same public `audioMediaIds` field and rights model — see
 * backend/v2/serializers/publicSerializer.js). Populated client-side (see
 * renderMusicFeature() in public/script.js + public/js/music.js): resolving
 * an audioMediaIds entry to its `media` entity, and applying the rights gate
 * (rightsStatus === "cleared"), both require the full public entity set
 * (including `media`), which this static generator's own entity list never
 * includes (see V2_DETAIL_TYPES — media has no detail page and is
 * deliberately excluded from collectPublicV2Entities()). An entity with
 * audioMediaIds that all turn out non-playable (unresolved rights,
 * unsupported format, or simply missing) is left `hidden` by the client —
 * this container never implies a player exists.
 */
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

/**
 * The proverb's local-form expression itself — the visually dominant
 * element per the card/detail design brief. `originalText` is a single
 * plain string (the canonical local-dialect form), never multilingual and
 * never auto-transliterated (see backend/v2/schemas/proverb.js) — rendered
 * exactly as the reviewed record has it, with dir="auto" so a Latin,
 * Arabizi, or Arabic-script expression each get correct directionality
 * regardless of the page's current UI language.
 */
function proverbExpressionMarkup(entity) {
  if (entity.entityType !== "proverb" || !entity.originalText) return "";
  return `<section class="record-detail-section record-proverb-expression-section" aria-labelledby="record-proverb-expression-heading">
              <h2 id="record-proverb-expression-heading" hidden>Expression</h2>
              <p class="record-proverb-expression" dir="auto">${escapeHtml(entity.originalText)}</p>
            </section>`;
}

/**
 * Proverb literal/cultural meaning, usage context, example, and translation
 * — public multilingual text fields already on the entity itself (mirrors
 * musicTextSectionMarkup's "bake real text in at build time" approach).
 * Renders only the subsections that actually have content in this language;
 * renders nothing at all for a proverb with none of them.
 */
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

/** Populated client-side (see initExploreMore() in public/script.js) — never bakes another entity's link into the static page, so nothing here can go stale between deploys. */
function exploreMoreMarkup(entity) {
  return `<section class="record-explore-more" data-explore-more data-entity-id="${escapeHtml(entity.id)}" data-entity-type="${escapeHtml(entity.entityType)}" aria-labelledby="record-explore-more-heading">
              <h2 id="record-explore-more-heading" data-i18n="detail.exploreMore">Explore more</h2>
              <div class="record-explore-more-grid" data-explore-more-grid></div>
              <button type="button" class="btn-discover-another" data-discover-another data-i18n="discover.another" hidden>Another record</button>
            </section>`;
}

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
        ${pageNavigation(typeInfo.navKey)}
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
        <button class="menu-toggle" id="menu-toggle" type="button" aria-label="Open navigation menu" aria-expanded="false" aria-controls="mobile-nav"><span class="bar"></span><span class="bar"></span><span class="bar"></span></button>
      </div>
    </div>
    <nav class="mobile-nav" id="mobile-nav" aria-label="Mobile navigation" aria-hidden="true"><div class="container mobile-nav-inner">
      <div class="mobile-nav-search"><input class="search-input-field" type="search" autocomplete="off" placeholder="Search..." aria-label="Search archive" data-i18n-placeholder="search.placeholder" data-i18n-aria="a11y.searchArchive"></div>
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
          <p class="page-badge-wrap"><span data-detail-category>${escapeHtml(typeInfo.label)}</span><span class="badge-sep" data-detail-taxonomy-sep aria-hidden="true"${fact ? "" : " hidden"}> · </span><span data-detail-taxonomy${fact ? "" : " hidden"}>${escapeHtml(fact)}</span></p>
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
            ${proverbExpressionMarkup(entity)}
            ${namesSectionMarkup(entity, "en")}
            ${metadataPanelMarkup(entity, "en", placeById)}
            ${audioSectionMarkup(entity)}
            ${musicTextSectionMarkup(entity, "en")}
            ${proverbTextSectionMarkup(entity, "en")}
            ${locationPreviewMarkup(entity)}
            ${shareControlsMarkup(canonical, title)}
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
        ${exploreMoreMarkup(entity)}
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
  ${archiveStoreScript ? `<script src="${escapeHtml(archiveStoreScript)}"></script>` : ""}
  ${searchScript ? `<script src="${escapeHtml(searchScript)}"></script>` : ""}
  ${["music", "proverb"].includes(entity.entityType) && Array.isArray(entity.audioMediaIds) && entity.audioMediaIds.length && musicScript ? `<script src="${escapeHtml(musicScript)}"></script>` : ""}
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
