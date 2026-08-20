/**
 * AntiochiaArchive — script.js
 * Handles: language switching, mobile menu, scroll reveal, form UX, audio player toggles,
 *          and dynamic content rendering from the archive API
 */

/* Cached archive data (loaded once) */
let archiveData = null;
/* Cached v2 archive data (loaded once), keyed by entityType: historicalContext/
   community/belief/place/structure/story/music. See V2_SECTION_RENDERERS. */
let archiveDataV2 = null;
let archiveLoadState = "idle";
let detailPageData = null;
let v2DetailPageData = null;

/* ==========================================================================
   State
   ========================================================================== */
let currentLang = "en";
let isMenuOpen  = false;

/* ==========================================================================
   DOM references (populated after DOMContentLoaded)
   ========================================================================== */
let menuToggleBtn = null;
let mobileNavEl   = null;

/** Escape untrusted text before inserting it into a trusted HTML template. */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[char]);
}

/** Allow only HTTP(S) URLs (including same-origin relative URLs) in media attributes. */
function safeHttpUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value), window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch (_) {
    return null;
  }
}

/* ==========================================================================
   Language Utilities
   ========================================================================== */

/**
 * Resolve a dot-notation key from the translations object.
 * e.g. "nav.home" → TRANSLATIONS[lang].nav.home
 */
function resolveKey(lang, keyPath) {
  const parts = keyPath.split(".");
  let node = TRANSLATIONS[lang];
  for (const part of parts) {
    if (node == null) return null;
    node = node[part];
  }
  return node ?? null;
}

/**
 * Apply a language to the whole page.
 * Preserves scroll position, updates direction, and re-renders all i18n nodes.
 */
function applyLanguage(lang) {
  if (!TRANSLATIONS[lang]) {
    console.warn(`[AntiochiaArchive] Unknown language: "${lang}"`);
    return;
  }

  // Preserve scroll before layout shift
  const scrollY = window.scrollY;

  currentLang = lang;

  const t = TRANSLATIONS[lang];

  // 1. Update <html> attributes
  document.documentElement.lang = lang;
  document.documentElement.dir  = t.dir;

  // 2. Update text nodes — data-i18n="some.key.path"
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key   = el.dataset.i18n;
    const value = resolveKey(lang, key);
    if (value != null) el.textContent = value;
  });

  // 3. Update HTML nodes — data-i18n-html="some.key.path"
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key   = el.dataset.i18nHtml;
    const value = resolveKey(lang, key);
    if (value != null) el.innerHTML = value;
  });

  // 4. Update placeholder attributes — data-i18n-placeholder="some.key"
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key   = el.dataset.i18nPlaceholder;
    const value = resolveKey(lang, key);
    if (value != null) el.placeholder = value;
  });

  // 5. Update aria-label attributes — data-i18n-aria="some.key"
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key   = el.dataset.i18nAria;
    const value = resolveKey(lang, key);
    if (value != null) el.setAttribute("aria-label", value);
  });

  if (menuToggleBtn) {
    menuToggleBtn.setAttribute(
      "aria-label",
      isMenuOpen ? t.a11y.closeMenu : t.a11y.openMenu
    );
  }

  // 6. Update language buttons' pressed state
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.lang === lang));
  });

  // 7. Restore scroll
  window.scrollTo({ top: scrollY, behavior: "instant" });

  // 8. Persist preference
  try { localStorage.setItem("aa-lang", lang); } catch (_) { /* noop */ }

  // 9. Re-render cached archive data (or its current error state) in the new language
  renderArchiveSections(lang);
  renderDetailPage(lang);
  renderV2DetailPage(lang);
  if (relatedEntitiesItems !== null) renderRelatedEntities(relatedEntitiesItems, lang);
  if (archiveLoadState === "error") renderArchiveErrorState(lang);
  renderDiscoveryFeatures();
  if (typeof window.updateContributionsLang === "function") {
    window.updateContributionsLang();
  }
  if (typeof window.updateSubmissionsLang === "function") {
    window.updateSubmissionsLang();
  }
}

/* ==========================================================================
   Mobile Menu
   ========================================================================== */
function setMenuOpen(open) {
  isMenuOpen = open;
  mobileNavEl.classList.toggle("is-open", open);
  mobileNavEl.setAttribute("aria-hidden", String(!open));
  menuToggleBtn.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("nav-open", open);

  const t = TRANSLATIONS[currentLang];
  menuToggleBtn.setAttribute(
    "aria-label",
    open ? t.a11y.closeMenu : t.a11y.openMenu
  );
}

/* ==========================================================================
   Scroll Reveal
   ========================================================================== */
function initScrollReveal() {
  const targets = document.querySelectorAll("[data-reveal]");
  if (!targets.length) return;

  // Immediately reveal elements near or in the viewport
  targets.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight + 120) {
      el.classList.add("is-visible");
    }
  });

  if (!("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.01, rootMargin: "100px 0px 100px 0px" }
  );

  targets.forEach((el) => {
    if (!el.classList.contains("is-visible")) {
      observer.observe(el);
    }
  });
}

/* ==========================================================================
   Music Audio Player Toggle
   ========================================================================== */
function initMusicTrackButtons() {
  document.querySelectorAll(".track-play-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const isPlaying = btn.classList.toggle("is-playing");
      const icon = btn.querySelector(".play-icon");
      if (icon) {
        icon.textContent = isPlaying ? "❚❚" : "▶";
      }
      btn.setAttribute("aria-label", isPlaying ? "Pause audio sample" : "Play audio sample");
    });
  });
}

/* ==========================================================================
   Story Read More Click Handler
   ========================================================================== */
function initStoryButtons() {
  document.querySelectorAll(".story-read-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const msg = resolveKey(currentLang, "fullStoryNotice")
        ?? resolveKey(currentLang, "storiesSection.fullStoryNotice")
        ?? "Tam metin burada olacak.";
      alert(msg);
    });
  });
}

/* ==========================================================================
   Form — handleContributionFormSubmit
   ========================================================================== */

/** Show an inline feedback message inside the form */
function showFormMessage(msgEl, type, text) {
  msgEl.textContent = text;
  msgEl.className = `form-message ${type}`; // "success" | "error" | "loading"
  msgEl.hidden = false;
}

/** Hide the inline feedback message */
function hideFormMessage(msgEl) {
  msgEl.hidden = true;
  msgEl.textContent = "";
  msgEl.className = "form-message";
}

/**
 * Handle contribution form submission.
 * POSTs JSON to POST /api/contribute (Express backend on :5000).
 */
async function handleContributionFormSubmit(e) {
  e.preventDefault();

  const form = e.currentTarget;
  const btn  = document.getElementById("btn-contribute-submit");
  const msgEl = document.getElementById("form-message");

  if (!btn || !msgEl) return;

  // --- Collect form values ---
  const name    = form.querySelector("#field-name")?.value?.trim() ?? "";
  const email   = form.querySelector("#field-email")?.value?.trim() ?? "";
  const message = form.querySelector("#field-message")?.value?.trim() ?? "";

  // --- Client-side validation ---
  if (!name || !email || !message) {
    const errText = resolveKey(currentLang, "contribute.requiredFields") || "Please fill in all fields.";
    showFormMessage(msgEl, "error", errText);
    return;
  }

  // --- Loading state ---
  const originalBtnText = btn.textContent;
  const loadingText = resolveKey(currentLang, "contribute.sending") || "Sending…";

  btn.disabled = true;
  showFormMessage(msgEl, "loading", loadingText);

  try {
    const response = await fetch("/api/contribute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, message }),
    });

    let data = {};
    try { data = await response.json(); } catch (_) { /* empty body */ }

    if (response.ok && data.success) {
      // --- Success ---
      const successText = resolveKey(currentLang, "contribute.success") || "Thank you! Your contribution has been successfully received.";

      showFormMessage(msgEl, "success", successText);
      form.reset();

      // Auto-hide after 6 s
      setTimeout(() => hideFormMessage(msgEl), 6000);
    } else {
      throw new Error(data.error || `Server error (${response.status})`);
    }
  } catch (err) {
    console.error("[Contribution Error]", err);
    const fallbackErr = resolveKey(currentLang, "contribute.error") || "An error occurred. Please try again.";
    const errorText = `${fallbackErr} (${err.message})`;

    showFormMessage(msgEl, "error", errorText);
  } finally {
    btn.disabled = false;
    btn.textContent = originalBtnText;
  }
}

/** Wire up the form listener */
function initContributeForm() {
  const form = document.getElementById("contribute-form");
  if (!form) return;
  form.addEventListener("submit", handleContributionFormSubmit);
}

/* ==========================================================================
   Back to Top Button
   ========================================================================== */

function initBackToTopButton() {
  const btn = document.getElementById("back-to-top");
  if (!btn) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const toggleVisibility = () => {
    const shouldShow = window.scrollY > 420;
    btn.classList.toggle("is-visible", shouldShow);
    btn.setAttribute("aria-hidden", String(!shouldShow));
  };

  btn.setAttribute("aria-hidden", "true");
  toggleVisibility();

  window.addEventListener("scroll", toggleVisibility, { passive: true });
  btn.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: reduceMotion.matches ? "auto" : "smooth",
    });
  });
}

/* ==========================================================================
   SVG Builders (used by archive renderers)
   ========================================================================== */

function buildSvg(type, color, bg) {
  const safeColor = (value, fallback) => /^#[0-9a-f]{3,8}$/i.test(String(value || "")) ? value : fallback;
  color = safeColor(color, "#903628");
  bg = safeColor(bg, "#ded4c0");
  const g = (paths) =>
    `<g fill="none" stroke="${color}" stroke-width="1.3" opacity="0.42">${paths}</g>`;
  const svgs = {
    columns: `<rect width="100%" height="100%" fill="${bg}"/>${g('<line x1="40" y1="140" x2="280" y2="140" stroke-width="2"/><line x1="60" y1="140" x2="60" y2="50"/><line x1="120" y1="140" x2="120" y2="50"/><line x1="180" y1="140" x2="180" y2="50"/><line x1="240" y1="140" x2="240" y2="50"/><path d="M 45 50 L 255 50 M 45 42 L 255 42"/>')}`,
    arches:  `<rect width="100%" height="100%" fill="${bg}"/>${g('<path d="M 80 140 L 80 80 C 80 50 160 50 160 80 L 160 140 Z"/><path d="M 160 140 L 160 80 C 160 50 240 50 240 80 L 240 140 Z"/><line x1="50" y1="140" x2="270" y2="140" stroke-width="2"/>')}`,
    circles: `<rect width="100%" height="100%" fill="${bg}"/>${g('<circle cx="160" cy="90" r="55"/><circle cx="160" cy="90" r="35"/><line x1="160" y1="20" x2="160" y2="160"/><line x1="90" y1="90" x2="230" y2="90"/>')}`,
    house:   `<rect width="100%" height="100%" fill="${bg}"/>${g('<path d="M 60 190 L 60 110 L 200 45 L 340 110 L 340 190 Z"/><path d="M 140 190 L 140 130 L 190 130 L 190 190 Z"/><rect x="220" y="115" width="55" height="45"/><line x1="40" y1="190" x2="360" y2="190" stroke-width="2"/>')}<circle cx="200" cy="45" r="4" fill="${color}" opacity="0.6"/>`,
    wheel:   `<rect width="100%" height="100%" fill="${bg}"/>${g('<circle cx="200" cy="120" r="70"/><circle cx="200" cy="120" r="22"/><line x1="200" y1="50" x2="200" y2="190"/><line x1="130" y1="120" x2="270" y2="120"/><line x1="150" y1="70" x2="250" y2="170"/><line x1="150" y1="170" x2="250" y2="70"/><path d="M 0 185 Q 200 165 400 185" stroke="#48685c" stroke-width="2.5"/>')}`,
    table:   `<rect width="100%" height="100%" fill="${bg}"/>${g('<ellipse cx="200" cy="130" rx="130" ry="60"/><ellipse cx="200" cy="130" rx="70" ry="30"/><circle cx="155" cy="125" r="16"/><circle cx="235" cy="135" r="18"/><circle cx="200" cy="115" r="14"/>')}`,
    arch:    `<rect width="100%" height="100%" fill="${bg}"/>${g('<path d="M 40 160 C 40 70 320 70 320 160 Z"/><path d="M 90 160 C 90 100 270 100 270 160 Z"/><circle cx="180" cy="80" r="14"/>')}`,
    minaret: `<rect width="100%" height="100%" fill="${bg}"/>${g('<path d="M 180 30 L 220 160 L 140 160 Z"/><line x1="180" y1="20" x2="180" y2="30"/><rect x="70" y="110" width="220" height="50"/><path d="M 120 160 C 120 130 160 130 160 160"/>')}`,
    aqueduct:`<rect width="100%" height="100%" fill="${bg}"/>${g('<path d="M 20 150 C 20 100 90 100 90 150 M 90 150 C 90 100 160 100 160 150 M 160 150 C 160 100 230 100 230 150 M 230 150 C 230 100 300 100 300 150"/><line x1="20" y1="90" x2="340" y2="90" stroke-width="2"/>')}`,
    mosaic:  `<rect width="100%" height="100%" fill="${bg}"/>${g('<rect x="50" y="35" width="45" height="45"/><rect x="105" y="35" width="45" height="45"/><rect x="160" y="35" width="45" height="45"/><rect x="215" y="35" width="45" height="45"/><rect x="50" y="90" width="45" height="45"/><rect x="105" y="90" width="45" height="45"/><rect x="160" y="90" width="45" height="45"/><rect x="215" y="90" width="45" height="45"/><line x1="30" y1="20" x2="280" y2="20" stroke-width="2"/><line x1="30" y1="150" x2="280" y2="150" stroke-width="2"/>')}`,
  };
  return `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${svgs[type] ?? svgs.circles}</svg>`;
}

/* ==========================================================================
   Archive Renderers
   ========================================================================== */

function localizedMetadataValue(value, lang, fallback = "") {
  if (!value || typeof value !== "object") return fallback;
  return value[lang] ?? value.en ?? value.tr ?? value.ar ?? fallback;
}

/**
 * Normalizes the two media-metadata shapes this app renders: v1's flat
 * item.image/item.src + item.imageMetadata, and v2's nested item.media (see
 * backend/v2/serializers/publicSerializer.js's MEDIA_PREVIEW_HOST_TYPES
 * summary — historicalContext/story/structure/music entities only). Returns
 * null when the item has no real, non-placeholder media, so callers fall
 * back to the SVG placeholder rather than rendering a broken <img>.
 */
function resolveRecordMedia(item) {
  if (item.media && typeof item.media === "object" && item.media.path) {
    return { url: item.media.path, metadata: item.media };
  }
  if (item.image || item.src) {
    return { url: item.image || item.src, metadata: item.imageMetadata || {} };
  }
  return null;
}

function imageAltText(item, lang, title) {
  const media = resolveRecordMedia(item);
  return localizedMetadataValue(media?.metadata?.alt, lang, title || "");
}

function archiveDetailHref(item) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(item?.slug || ""))
    ? `/archive/${item.slug}/`
    : null;
}

function renderArchiveDetailLink(item, lang) {
  const href = archiveDetailHref(item);
  if (!href) return "";
  const label = resolveKey(lang, "actions.viewRecord") || "View record";
  return `<a class="archive-detail-link" href="${escapeHtml(href)}"><span>${escapeHtml(label)}</span><span aria-hidden="true">→</span></a>`;
}

function multilingualSearchText(...values) {
  return escapeHtml(values.flatMap((value) => (
    value && typeof value === "object" ? Object.values(value) : [value]
  )).filter(Boolean).join(" "));
}

function formatImageAttribution(metadata, lang) {
  if (!metadata || typeof metadata !== "object") return "";
  const parts = [];
  if (metadata.author) parts.push(`${resolveKey(lang, "provenance.photoBy") || "Photo"}: ${metadata.author}`);
  if (metadata.source) parts.push(`${resolveKey(lang, "provenance.sourceLabel") || "Source"}: ${metadata.source}`);
  if (metadata.license) parts.push(`${resolveKey(lang, "provenance.license") || "License"}: ${metadata.license}`);
  return parts.join(" · ");
}

function renderAiImageLabel(metadata, lang) {
  if (metadata?.aiGenerated !== true) return "";
  const label = resolveKey(lang, "provenance.aiImageLabel")
    || "Illustrative image — generated with artificial intelligence.";
  return `<span class="archive-ai-label">${escapeHtml(label)}</span>`;
}

function renderRecordImage(item, lang, title, className) {
  const media = resolveRecordMedia(item);
  const mediaUrl = media && safeHttpUrl(media.url);
  if (!mediaUrl) return null;
  const alt = imageAltText(item, lang, title);
  return `
    <figure class="archive-media-figure" data-fallback-type="${escapeHtml(item.svgType || "circles")}" data-fallback-color="${escapeHtml(item.svgColor || "#903628")}" data-fallback-bg="${escapeHtml(item.svgBg || "#ded4c0")}">
      <img class="${escapeHtml(className)}" src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(alt)}" loading="lazy" data-archive-image>
      ${renderAiImageLabel(media.metadata, lang)}
    </figure>`;
}

/* ==========================================================================
   V2 Archive Renderers
   ==========================================================================
   v1's renderHistory/renderStories/renderStructures/renderBeliefs/renderMusic
   read v1 field names (title/era/body/desc/tag/categoryKey/svgType) directly
   with a naive `field[lang] ?? field.en` fallback — safe only because v1's
   23 hand-authored records always populate all 3 languages. v2 records are
   not guaranteed to: the public serializer strips per-language sentinel
   placeholder values (see backend/v2/serializers/publicSerializer.js), so a
   language can legitimately be missing. Every v2 field below goes through
   localizedMetadataValue()'s 4-way fallback (lang -> en -> tr -> ar ->
   fallback) instead, and never renders a missing optional field as literal
   text. See V2-ARCHITECTURE.md "Cultural entity publication review".
   ========================================================================== */

// v2 entities never carry a curated svgType/svgColor/svgBg (that was always
// a v1-only cosmetic field) — every non-imaged v2 entity of a given type
// gets the same deliberately-chosen placeholder illustration instead of
// buildSvg()'s generic "circles" fallback.
const V2_DEFAULT_SVG_TYPE = Object.freeze({
  historicalContext: "columns",
  community: "circles",
  belief: "arch",
  place: "wheel",
  structure: "arches",
  story: "house",
  music: "table",
});

// Curated homepage preview allowlist, per entity type. Empty until an editor
// hand-picks representative entities (a future backend `featured` field is
// the long-term home for this); until then every homepage section falls
// back to the first N entities in API order, which is deterministic and
// safe to ship today. See getHomepagePreviewItems() below.
const HOMEPAGE_FEATURED_IDS = Object.freeze({
  historicalContext: [],
  community: [],
  belief: [],
  place: [],
  structure: [],
  story: [],
  music: [],
});

/** Truncate a v2 list to the homepage preview size, honoring curated IDs first. */
function getHomepagePreviewItems(entityType, items, limit) {
  const featuredIds = HOMEPAGE_FEATURED_IDS[entityType] || [];
  if (!featuredIds.length) return items.slice(0, limit);
  const byId = new Map(items.map((item) => [item.id, item]));
  const featured = featuredIds.map((id) => byId.get(id)).filter(Boolean);
  if (featured.length >= limit) return featured.slice(0, limit);
  const featuredIdSet = new Set(featured.map((item) => item.id));
  const remaining = items.filter((item) => !featuredIdSet.has(item.id));
  return featured.concat(remaining).slice(0, limit);
}

function archiveV2DetailHref(item) {
  // Separate namespace from v1's /archive/{slug}/ — collision-proof by
  // construction as v2's slug set grows, no runtime uniqueness check needed.
  // See V2-ARCHITECTURE.md "Static v2 detail pages".
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(item?.slug || ""))
    ? `/archive-v2/${item.slug}/`
    : null;
}

function renderArchiveV2DetailLink(item, lang) {
  const href = archiveV2DetailHref(item);
  if (!href) return "";
  const label = resolveKey(lang, "actions.viewRecord") || "View record";
  return `<a class="archive-detail-link" href="${escapeHtml(href)}"><span>${escapeHtml(label)}</span><span aria-hidden="true">→</span></a>`;
}

/** Category used for data-category / filter-bar matching, per entity type. */
function v2CardCategory(entityType, item) {
  if (entityType === "structure") return item.structureType || "all";
  if (entityType === "music") return item.genre || "all";
  const tags = Array.isArray(item.tags) ? item.tags : [];
  if (entityType === "story") return item.storyCategory || tags[0] || "all";
  return tags[0] || "all";
}

/**
 * Display labels for free-text v2 tag/category slugs shown on filter chips.
 * The slug itself (data-filter value, filtering logic in applyCombinedFilters)
 * is never changed by this map — only what the user reads. Slugs are
 * research-authored free text (see v2CardCategory), so most values pass
 * through tagDisplayLabel()'s humanizing fallback rather than living here;
 * this map only covers slugs whose humanized form would stay opaque
 * (period/era names, historical-event shorthand) and gives them a plain
 * Turkish label instead.
 */
const TAG_DISPLAY_LABELS = {
  "2023-earthquake": "2023 Depremi",
  "earthquake": "Deprem",
  "Byzantine": "Bizans",
  "conquest": "Fetih",
  "courtyard": "Avlu Yaşamı",
  "Crusader": "Haçlılar",
  "early-Christianity": "Erken Hristiyanlık",
  "French-Mandate": "Fransız Mandası",
  "Hatay-State": "Hatay Devleti",
  "Hellenistic": "Helenistik",
  "late-antique": "Geç Antik Çağ",
  "late-Ottoman": "Geç Osmanlı",
  "Mamluk": "Memlük",
  "Ottoman": "Osmanlı",
  "Republican": "Cumhuriyet Dönemi",
  "Roman": "Roma",
  "Sasanian": "Sasani",
  "Seleucid": "Seleukos",
  "Umayyad": "Emevi",
  "World-War-I": "I. Dünya Savaşı",
};

/**
 * Logical section a tag slug belongs to, used only to group the history
 * page's period/event/belief/place tags into labeled sections. A slug with
 * no entry here has no group; if NONE of a filter bar's categories have a
 * group, the bar renders as the original flat list (structureType/genre/
 * storyCategory filters on other pages are never grouped).
 */
const TAG_GROUPS = {
  "Byzantine": "periods",
  "French-Mandate": "periods",
  "Hatay-State": "periods",
  "Hellenistic": "periods",
  "late-antique": "periods",
  "late-Ottoman": "periods",
  "Mamluk": "periods",
  "Ottoman": "periods",
  "Republican": "periods",
  "Roman": "periods",
  "Sasanian": "periods",
  "Seleucid": "periods",
  "Umayyad": "periods",
  "2023-earthquake": "events",
  "earthquake": "events",
  "conquest": "events",
  "Crusader": "events",
  "World-War-I": "events",
  "early-Christianity": "belief",
  "courtyard": "life",
};

const TAG_GROUP_ORDER = ["periods", "events", "belief", "life", "other"];

/** Plain-language label for a filter chip: mapped Turkish label, else a humanized slug. */
function tagDisplayLabel(slug) {
  if (Object.hasOwn(TAG_DISPLAY_LABELS, slug)) return TAG_DISPLAY_LABELS[slug];
  return String(slug)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function v2SearchText(item, ...extra) {
  return multilingualSearchText(item.title, item.summary, item.tags || [], ...extra);
}

function renderV2History(items, lang) {
  return items.map((item) => {
    const svg = buildSvg(V2_DEFAULT_SVG_TYPE.historicalContext);
    const title = localizedMetadataValue(item.title, lang, item.slug || item.id);
    const era = localizedMetadataValue(item.period?.label, lang, "");
    const body = localizedMetadataValue(item.summary, lang, "");
    const cat = v2CardCategory("historicalContext", item);
    const searchStr = v2SearchText(item, era);
    const mediaHtml = renderRecordImage(item, lang, title, "timeline-image") || svg;
    return `
      <article class="timeline-card" data-reveal data-search="${searchStr}" data-category="${escapeHtml(cat)}">
        ${era ? `<span class="timeline-era">${escapeHtml(era)}</span>` : ""}
        <div class="timeline-visual"${mediaHtml === svg ? ' aria-hidden="true"' : ""}>${mediaHtml}</div>
        <h3 class="timeline-title">${escapeHtml(title)}</h3>
        <p class="timeline-desc">${escapeHtml(body)}</p>
        ${renderArchiveV2DetailLink(item, lang)}
      </article>`;
  }).join("");
}

function renderV2Stories(items, lang) {
  return items.map((item) => {
    const svg = buildSvg(V2_DEFAULT_SVG_TYPE.story);
    const title = localizedMetadataValue(item.title, lang, item.slug || item.id);
    const tag = item.storyCategory || (Array.isArray(item.tags) ? item.tags[0] : "") || "";
    const body = localizedMetadataValue(item.summary, lang, "");
    const cat = v2CardCategory("story", item);
    const searchStr = v2SearchText(item, tag);
    const realImage = renderRecordImage(item, lang, title, "story-image");
    return `
      <article class="story-card" data-reveal data-search="${searchStr}" data-category="${escapeHtml(cat)}" aria-label="${escapeHtml(title)}">
        <div class="story-image-wrap">
          ${realImage || `<svg class="story-image" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</svg>`}
          ${tag ? `<span class="story-tag">${escapeHtml(tag)}</span>` : ""}
        </div>
        <div class="story-content">
          <h3 class="story-title">${escapeHtml(title)}</h3>
          <p class="story-body">${escapeHtml(body)}</p>
          ${renderArchiveV2DetailLink(item, lang)}
        </div>
      </article>`;
  }).join("");
}

function renderV2Structures(items, lang) {
  return items.map((item) => {
    const svg = buildSvg(V2_DEFAULT_SVG_TYPE.structure);
    const title = localizedMetadataValue(item.title, lang, item.slug || item.id);
    const tag = item.structureType || "";
    const desc = localizedMetadataValue(item.summary, lang, "");
    const cat = v2CardCategory("structure", item);
    const searchStr = v2SearchText(item, tag);
    const realImage = renderRecordImage(item, lang, title, "struct-image");
    return `
    <article class="struct-card" data-reveal data-search="${searchStr}" data-category="${escapeHtml(cat)}">
        <div class="struct-media">
          ${realImage || `<svg class="struct-svg" viewBox="0 0 360 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</svg>`}
          ${tag ? `<span class="struct-tag">${escapeHtml(tag)}</span>` : ""}
        </div>
        <div class="struct-info">
          <h3 class="struct-title">${escapeHtml(title)}</h3>
          <p class="struct-desc">${escapeHtml(desc)}</p>
          ${renderArchiveV2DetailLink(item, lang)}
        </div>
      </article>`;
  }).join("");
}

function renderV2Beliefs(items, lang) {
  return items.map((item) => {
    const svg = buildSvg(V2_DEFAULT_SVG_TYPE.belief);
    const title = localizedMetadataValue(item.title, lang, item.slug || item.id);
    const desc = localizedMetadataValue(item.summary, lang, "");
    const cat = v2CardCategory("belief", item);
    const searchStr = v2SearchText(item);
    // v1's belief-site records carried a curated icon emoji (🕌/⛪/🕍/🕯️); v2
    // belief-tradition entities carry no such field, so every belief card
    // now uses the same media/SVG-placeholder pattern as the other types
    // rather than an icon that would have to be invented per record.
    const mediaHtml = renderRecordImage(item, lang, title, "belief-image") || svg;
    return `
    <article class="belief-card" data-reveal data-search="${searchStr}" data-category="${escapeHtml(cat)}">
      <div class="belief-media"${mediaHtml === svg ? ' aria-hidden="true"' : ""}>${mediaHtml}</div>
      <h3 class="belief-title">${escapeHtml(title)}</h3>
      <p class="belief-desc">${escapeHtml(desc)}</p>
      ${renderArchiveV2DetailLink(item, lang)}
    </article>`;
  }).join("");
}

function renderV2Music(items, lang) {
  return items.map((item) => {
    const title = localizedMetadataValue(item.title, lang, item.slug || item.id);
    const tag = item.genre || "";
    const desc = localizedMetadataValue(item.summary, lang, "");
    const cat = v2CardCategory("music", item);
    const searchStr = v2SearchText(item, tag);
    return `
    <article class="music-track-card" data-reveal data-search="${searchStr}" data-category="${escapeHtml(cat)}">
      <div class="track-badge" aria-hidden="true">🎵</div>
      <div class="track-info">
        ${tag ? `<span class="track-tag">${escapeHtml(tag)}</span>` : ""}
        <h3 class="track-title">${escapeHtml(title)}</h3>
        <p class="track-desc">${escapeHtml(desc)}</p>
        ${renderArchiveV2DetailLink(item, lang)}
      </div>
    </article>`;
  }).join("");
}

function renderV2Communities(items, lang) {
  return items.map((item) => {
    const svg = buildSvg(V2_DEFAULT_SVG_TYPE.community);
    const title = localizedMetadataValue(item.title, lang, item.slug || item.id);
    const desc = localizedMetadataValue(item.summary, lang, "");
    const cat = v2CardCategory("community", item);
    const searchStr = v2SearchText(item);
    const mediaHtml = renderRecordImage(item, lang, title, "community-image") || svg;
    return `
    <article class="community-card" data-reveal data-search="${searchStr}" data-category="${escapeHtml(cat)}">
      <div class="community-media"${mediaHtml === svg ? ' aria-hidden="true"' : ""}>${mediaHtml}</div>
      <h3 class="community-title">${escapeHtml(title)}</h3>
      <p class="community-desc">${escapeHtml(desc)}</p>
      ${renderArchiveV2DetailLink(item, lang)}
    </article>`;
  }).join("");
}

function renderV2Places(items, lang) {
  return items.map((item) => {
    const svg = buildSvg(V2_DEFAULT_SVG_TYPE.place);
    const title = localizedMetadataValue(item.title, lang, item.slug || item.id);
    const desc = localizedMetadataValue(item.summary, lang, "");
    const officialName = localizedMetadataValue(item.officialName, lang, "");
    const cat = v2CardCategory("place", item);
    const searchStr = v2SearchText(item, officialName);
    const mediaHtml = renderRecordImage(item, lang, title, "place-image") || svg;
    return `
    <article class="place-card" data-reveal data-search="${searchStr}" data-category="${escapeHtml(cat)}">
      <div class="place-media"${mediaHtml === svg ? ' aria-hidden="true"' : ""}>${mediaHtml}</div>
      <h3 class="place-title">${escapeHtml(title)}</h3>
      ${officialName && officialName !== title ? `<p class="place-official-name">${escapeHtml(officialName)}</p>` : ""}
      <p class="place-desc">${escapeHtml(desc)}</p>
      ${renderArchiveV2DetailLink(item, lang)}
    </article>`;
  }).join("");
}

// Maps entityType -> the nav.* i18n key used for that type's label, for the
// compact related-entity card badge. historicalContext/story/music etc. all
// use plural subpage nav labels already defined in lang.js.
const V2_ENTITY_TYPE_NAV_KEY = Object.freeze({
  historicalContext: "history",
  community: "communities",
  belief: "beliefs",
  place: "places",
  structure: "structures",
  story: "stories",
  music: "music",
});

function relatedEntityCompactCard(entity, lang) {
  const title = localizedMetadataValue(entity.title, lang, entity.slug || entity.id);
  const typeKey = V2_ENTITY_TYPE_NAV_KEY[entity.entityType];
  const typeLabel = (typeKey && resolveKey(lang, `nav.${typeKey}`)) || entity.entityType || "";
  return `
    <article class="related-entity-card">
      ${typeLabel ? `<span class="related-entity-type">${escapeHtml(typeLabel)}</span>` : ""}
      <h3 class="related-entity-title">${escapeHtml(title)}</h3>
      ${renderArchiveV2DetailLink(entity, lang)}
    </article>`;
}

// Raw { relationship, entity } pairs from the last successful fetch, cached
// so a language switch re-renders instantly from memory instead of
// re-fetching. null = not yet loaded; [] = loaded and genuinely empty.
let relatedEntitiesItems = null;

/**
 * Renders (or hides) the related-entities section from already-fetched data.
 * Never shows a visible-but-empty heading: an empty/missing result keeps the
 * section `hidden` rather than rendering a zero-item grid, since virtually
 * all relationships are still `inReview` today (see V2-ARCHITECTURE.md
 * "Public relationship gating") and this section must degrade cleanly.
 */
function renderRelatedEntities(items, lang) {
  const section = document.querySelector("[data-related-entities-section]");
  const container = document.getElementById("related-entities-container");
  if (!section || !container) return;

  const publicItems = (items || []).filter((item) => item && item.entity);
  if (!publicItems.length) {
    section.hidden = true;
    container.innerHTML = "";
    return;
  }

  container.innerHTML = publicItems.map(({ entity }) => relatedEntityCompactCard(entity, lang)).join("");
  section.hidden = false;
}

/** Fetches (once, then cached) and renders the related-entities section, if present on this page. */
async function loadAndRenderRelatedEntities(lang) {
  const section = document.querySelector("[data-related-entities-section]");
  if (!section) return;
  const entityId = section.getAttribute("data-entity-id");
  if (!entityId || !window.AntiochiaArchiveV2API) return;

  if (relatedEntitiesItems === null) {
    try {
      relatedEntitiesItems = await window.AntiochiaArchiveV2API.fetchRelatedEntities(entityId);
    } catch (error) {
      console.error("[AntiochiaArchive] Related entities could not be loaded:", error);
      relatedEntitiesItems = [];
    }
  }
  renderRelatedEntities(relatedEntitiesItems, lang);
}

function renderGallery(items, lang) {
  if (!items || !items.length) return "";
  return items.map((item, idx) => {
    const title = item.title[lang] ?? item.title.en;
    const cat = item.category[lang] ?? item.category.en;
    const caption = item.caption[lang] ?? item.caption.en;
    const catKey = item.categoryKey || "all";
    const searchStr = multilingualSearchText(item.title, item.category, item.caption);
    
    let mediaHtml = "";
    const realImage = renderRecordImage(item, lang, title, "gallery-img");
    if (realImage) {
      mediaHtml = realImage;
    } else {
      const svg = buildSvg(item.svgType || "house", item.svgColor || "#903628", item.svgBg || "#ded4c0");
      mediaHtml = `<svg class="gallery-svg" viewBox="0 0 360 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</svg>`;
    }

    return `
      <article class="gallery-card" data-reveal data-search="${searchStr}" data-category="${escapeHtml(catKey)}">
        <button class="gallery-lightbox-trigger" type="button" data-gallery-idx="${idx}" aria-label="View ${escapeHtml(title)}">
          <div class="gallery-media-wrap">
            ${mediaHtml}
            <span class="gallery-category">${escapeHtml(cat)}</span>
            <div class="gallery-overlay-icon" aria-hidden="true">🔍</div>
          </div>
        </button>
        <div class="gallery-info">
          <h3 class="gallery-title">${escapeHtml(title)}</h3>
          <p class="gallery-caption">${escapeHtml(caption)}</p>
          ${renderArchiveDetailLink(item, lang)}
        </div>
      </article>`;
  }).join("");
}

// v1 /api/archive still backs gallery only — no v2 media entity is
// promoted yet (see V2-ARCHITECTURE.md "Source/media deferred promotion"),
// so gallery has nothing to gain from v2 and stays exactly as it always was.
const V1_SECTION_RENDERERS = Object.freeze([
  { id: "gallery-grid-container", fn: renderGallery, key: "gallery" },
]);

// The 7 v2 cultural-entity types. `typeRoute` matches
// backend/v2/routes/v2Routes.js's TYPE_ROUTES keys exactly (also mirrored in
// public/archive-v2-api.js's V2_TYPE_ROUTES). `key` is the property name
// used in the local archiveDataV2 cache. Container ids for history/stories/
// structures/beliefs/music are the SAME ids the old v1-only sections used —
// only their data source changes; communities/places are net-new containers.
const V2_SECTION_RENDERERS = Object.freeze([
  { id: "history-timeline-container", fn: renderV2History, key: "historicalContext", typeRoute: "historical-contexts" },
  { id: "communities-grid-container", fn: renderV2Communities, key: "community", typeRoute: "communities" },
  { id: "beliefs-grid-container", fn: renderV2Beliefs, key: "belief", typeRoute: "beliefs" },
  { id: "places-grid-container", fn: renderV2Places, key: "place", typeRoute: "places" },
  { id: "structures-grid-container", fn: renderV2Structures, key: "structure", typeRoute: "structures" },
  { id: "stories-grid-container", fn: renderV2Stories, key: "story", typeRoute: "stories" },
  { id: "music-list-container", fn: renderV2Music, key: "music", typeRoute: "music" },
]);

// Every card class across both v1 and v2 sections — defined once and reused
// by both the "mark newly rendered cards is-visible" step below and
// applyCombinedFilters(), so the two can never drift out of sync with each
// other again (they used to be two separately hardcoded copies).
const ALL_CARD_SELECTORS = ".timeline-card, .story-card, .struct-card, .belief-card, .music-track-card, .gallery-card, .community-card, .place-card";

function getV1SectionRenderers() {
  return V1_SECTION_RENDERERS.filter(({ id }) => document.getElementById(id));
}

function getV2SectionRenderers() {
  return V2_SECTION_RENDERERS.filter(({ id }) => document.getElementById(id));
}

/** Backward-compatible alias: every container (v1 + v2) present on this page. */
function getArchiveSectionRenderers() {
  return [...getV1SectionRenderers(), ...getV2SectionRenderers()];
}

/** Inject cached archive content into every container present on the current page. */
function renderArchiveSections(lang) {
  if (archiveData) {
    getV1SectionRenderers().forEach(({ id, fn, key }) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = fn(archiveData[key], lang);
    });
  }

  if (archiveDataV2) {
    getV2SectionRenderers().forEach(({ id, fn, key }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const allItems = archiveDataV2[key] || [];
      const previewSection = el.closest("[data-homepage-limit]");
      const items = previewSection
        ? getHomepagePreviewItems(key, allItems, Number(previewSection.getAttribute("data-homepage-limit")) || allItems.length)
        : allItems;
      el.innerHTML = fn(items, lang);
    });
  }

  if (!archiveData && !archiveDataV2) return;

  // Ensure rendered cards receive is-visible class immediately
  document.querySelectorAll(ALL_CARD_SELECTORS).forEach((card) => {
    card.classList.add("is-visible");
  });

  // Re-observe newly injected [data-reveal] elements
  initScrollReveal();

  // Re-wire interactive buttons & gallery lightbox handlers
  initMusicTrackButtons();
  initStoryButtons();
  initGalleryClickHandlers();
  initArchiveImageFallbacks();
  renderDynamicFilterBars(lang);
  applyCombinedFilters();
  renderHomepageSectionCounts();
}

/**
 * Update each homepage preview section's live count badge and "View all N"
 * link with the real fetched total for its entity type — never a hardcoded
 * number, since the public v2 dataset grows over time. A no-op on subpages
 * (structures.html etc.), which don't mark up data-homepage-limit sections.
 */
function renderHomepageSectionCounts() {
  if (!archiveDataV2) return;
  document.querySelectorAll("[data-homepage-limit]").forEach((section) => {
    const entityType = section.getAttribute("data-homepage-entity-type");
    if (!entityType) return;
    const total = (archiveDataV2[entityType] || []).length;
    const badge = section.querySelector("[data-homepage-count-badge]");
    if (badge) badge.textContent = String(total);
  });
}

/**
 * Rebuild filter-bar buttons/select from the distinct category values
 * actually present in the loaded v2 dataset. v2 entity types have no fixed
 * taxonomy (structureType/genre/tags are free text set per-record during
 * research), so a hardcoded v1-style filter button list (e.g. "mosque",
 * "folk") would silently match zero cards. Only wraps opting in via
 * data-dynamic-filter="<entityType>" are rebuilt; pages with no natural
 * taxonomy (communities, places) simply omit the attribute and keep no
 * filter bar at all.
 */
/** Chips beyond this count (excluding "All") collapse behind a show all/less toggle. */
const FILTER_COLLAPSE_THRESHOLD = 10;

function renderDynamicFilterBars(lang) {
  if (!archiveDataV2) return;
  document.querySelectorAll(".filter-bar-wrap[data-dynamic-filter]").forEach((wrap) => {
    const entityType = wrap.getAttribute("data-dynamic-filter");
    const items = archiveDataV2[entityType] || [];
    const btnGroup = wrap.querySelector(".filter-bar");
    const select = wrap.querySelector(".filter-select");
    if (!btnGroup || !select) return;

    const categories = Array.from(new Set(
      items.map((item) => v2CardCategory(entityType, item)).filter((cat) => cat && cat !== "all"),
    )).sort((a, b) => a.localeCompare(b));

    const allLabel = resolveKey(lang, "filters.all") || "All";
    // Group only when at least one category is a known period/event/belief/
    // place tag (currently just the history page) — every other dynamic
    // filter (structureType, genre, storyCategory) stays a flat chip list.
    const hasGroups = categories.some((cat) => TAG_GROUPS[cat]);

    btnGroup.innerHTML = buildFilterChipsHtml(categories, allLabel, lang, hasGroups);
    select.innerHTML = buildFilterOptionsHtml(categories, allLabel, lang, hasGroups);

    wrap.classList.toggle("filter-bar-wrap--grouped", hasGroups);

    const isCollapsible = categories.length > FILTER_COLLAPSE_THRESHOLD;
    wrap.classList.toggle("filter-bar-wrap--collapsible", isCollapsible);
    wrap.classList.remove("is-expanded");
    let toggle = wrap.querySelector(".filter-expand-toggle");
    if (isCollapsible) {
      if (!toggle) {
        toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "filter-expand-toggle";
        // Keep the results-count line (appended after this in the render
        // pipeline, but may already exist from a prior render) last in DOM.
        wrap.insertBefore(toggle, wrap.querySelector(".filter-results-count"));
      }
      toggle.textContent = resolveKey(lang, "filters.showAll") || "Show all";
      toggle.setAttribute("aria-expanded", "false");
    } else if (toggle) {
      toggle.remove();
    }
  });

  currentActiveFilter = "all";
  initFilterListeners();
  initFilterExpandToggles(lang);
}

/** Renders the desktop pill/chip button group, grouped into sections when hasGroups is true. */
function buildFilterChipsHtml(categories, allLabel, lang, hasGroups) {
  const allBtn = `<button class="filter-btn is-active" type="button" data-filter="all">${escapeHtml(allLabel)}</button>`;
  if (!hasGroups) {
    const chips = categories.map((cat) => (
      `<button class="filter-btn" type="button" data-filter="${escapeHtml(cat)}">${escapeHtml(tagDisplayLabel(cat))}</button>`
    )).join("");
    return allBtn + chips;
  }

  const buckets = new Map();
  categories.forEach((cat) => {
    const key = TAG_GROUPS[cat] || "other";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(cat);
  });

  const sections = TAG_GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => {
    const groupLabel = resolveKey(lang, `filters.group.${key}`) || key;
    const chips = buckets.get(key).map((cat) => (
      `<button class="filter-btn" type="button" data-filter="${escapeHtml(cat)}" data-group="${escapeHtml(key)}">${escapeHtml(tagDisplayLabel(cat))}</button>`
    )).join("");
    return `<div class="filter-group" data-filter-group="${escapeHtml(key)}">
      <span class="filter-group-label">${escapeHtml(groupLabel)}</span>
      <div class="filter-group-chips">${chips}</div>
    </div>`;
  }).join("");

  return `<div class="filter-group filter-group--all"><div class="filter-group-chips">${allBtn}</div></div>${sections}`;
}

/** Renders the mobile <select> fallback, using <optgroup> when hasGroups is true. */
function buildFilterOptionsHtml(categories, allLabel, lang, hasGroups) {
  const allOpt = `<option value="all">${escapeHtml(allLabel)}</option>`;
  if (!hasGroups) {
    return allOpt + categories.map((cat) => (
      `<option value="${escapeHtml(cat)}">${escapeHtml(tagDisplayLabel(cat))}</option>`
    )).join("");
  }

  const buckets = new Map();
  categories.forEach((cat) => {
    const key = TAG_GROUPS[cat] || "other";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(cat);
  });

  const groups = TAG_GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => {
    const groupLabel = resolveKey(lang, `filters.group.${key}`) || key;
    const opts = buckets.get(key).map((cat) => (
      `<option value="${escapeHtml(cat)}">${escapeHtml(tagDisplayLabel(cat))}</option>`
    )).join("");
    return `<optgroup label="${escapeHtml(groupLabel)}">${opts}</optgroup>`;
  }).join("");

  return allOpt + groups;
}

/** Wire each filter bar's "Show all / Show less" toggle (re-created on every render). */
function initFilterExpandToggles(lang) {
  document.querySelectorAll(".filter-bar-wrap--collapsible .filter-expand-toggle").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const wrap = toggle.closest(".filter-bar-wrap");
      const expanded = wrap.classList.toggle("is-expanded");
      toggle.textContent = resolveKey(lang, expanded ? "filters.showLess" : "filters.showAll")
        || (expanded ? "Show less" : "Show all");
      toggle.setAttribute("aria-expanded", String(expanded));
    });
  });
}

function initArchiveImageFallbacks(root = document) {
  root.querySelectorAll("img[data-archive-image]").forEach((image) => {
    if (image.dataset.fallbackReady === "true") return;
    image.dataset.fallbackReady = "true";
    const replaceBrokenImage = () => {
      const figure = image.closest(".archive-media-figure");
      if (!figure || figure.dataset.fallbackApplied === "true") return;
      figure.dataset.fallbackApplied = "true";
      figure.classList.add("archive-media-fallback");
      figure.setAttribute("aria-hidden", "true");
      figure.innerHTML = buildSvg(
        figure.dataset.fallbackType || "circles",
        figure.dataset.fallbackColor || "#903628",
        figure.dataset.fallbackBg || "#ded4c0",
      );
    };
    image.addEventListener("error", replaceBrokenImage, { once: true });
    if (image.complete && image.naturalWidth === 0) replaceBrokenImage();
  });
}

function readDetailPageData() {
  if (detailPageData) return detailPageData;
  const element = document.getElementById("archive-record-data");
  if (!element) return null;
  try {
    detailPageData = JSON.parse(element.textContent);
    return detailPageData;
  } catch (error) {
    console.error("[AntiochiaArchive] Detail page data is invalid:", error);
    return null;
  }
}

function renderDetailPage(lang) {
  const data = readDetailPageData();
  if (!data?.record) return;
  const { category, record } = data;
  const title = localizedMetadataValue(record.title, lang, record.id);
  const description = localizedMetadataValue(record.body || record.desc || record.caption, lang);
  const taxonomy = localizedMetadataValue(record.era || record.tag || record.category, lang, record.categoryKey || record.entityType);
  document.querySelectorAll("[data-detail-title]").forEach((element) => { element.textContent = title; });
  document.querySelectorAll("[data-detail-description]").forEach((element) => { element.textContent = description; });
  document.querySelectorAll("[data-detail-taxonomy]").forEach((element) => { element.textContent = taxonomy; });
  document.querySelectorAll("[data-detail-category]").forEach((element) => {
    element.textContent = resolveKey(lang, `nav.${category}`) || category;
  });
  const image = document.querySelector(".record-detail-image");
  if (image) image.alt = imageAltText(record, lang, title);
  const caption = document.querySelector("[data-detail-image-caption]");
  if (caption) caption.textContent = localizedMetadataValue(record.imageMetadata?.caption, lang);
  document.title = `${title} — AntiochiaArchive`;
  initArchiveImageFallbacks();
}

/**
 * Reads the embedded serialized public entity from a static v2 detail page
 * (see scripts/v2-archive-release.js's generateV2DetailDocument()). A
 * distinct script id and reader from v1's #archive-record-data /
 * readDetailPageData(): v2 entities have per-type field shapes (period.label,
 * structureType, genre, storyCategory, officialName) that don't match v1's
 * flat era/tag/category convention, so the two must not be conflated.
 */
function readV2DetailPageData() {
  if (v2DetailPageData) return v2DetailPageData;
  const element = document.getElementById("v2-record-data");
  if (!element) return null;
  try {
    v2DetailPageData = JSON.parse(element.textContent);
    return v2DetailPageData;
  } catch (error) {
    console.error("[AntiochiaArchive] v2 detail page data is invalid:", error);
    return null;
  }
}

/** The single type-specific fact shown under a v2 detail page's title, mirroring each card renderer's own tag/fact field. */
function v2DetailFact(entity, lang) {
  if (entity.entityType === "historicalContext") return localizedMetadataValue(entity.period?.label, lang, "");
  if (entity.entityType === "structure") return entity.structureType || "";
  if (entity.entityType === "music") return entity.genre || "";
  if (entity.entityType === "story") return entity.storyCategory || (Array.isArray(entity.tags) ? entity.tags[0] : "") || "";
  if (entity.entityType === "place") {
    const officialName = localizedMetadataValue(entity.officialName, lang, "");
    const title = localizedMetadataValue(entity.title, lang, "");
    return officialName && officialName !== title ? officialName : "";
  }
  return "";
}

function renderV2DetailPage(lang) {
  const data = readV2DetailPageData();
  if (!data?.entity) return;
  const entity = data.entity;
  const title = localizedMetadataValue(entity.title, lang, entity.slug || entity.id);
  const description = localizedMetadataValue(entity.summary, lang, "");
  const fact = v2DetailFact(entity, lang);

  document.querySelectorAll("[data-detail-title]").forEach((element) => { element.textContent = title; });
  document.querySelectorAll("[data-detail-description]").forEach((element) => { element.textContent = description; });
  document.querySelectorAll("[data-detail-taxonomy]").forEach((element) => { element.textContent = fact; element.hidden = !fact; });
  document.querySelectorAll("[data-detail-taxonomy-sep]").forEach((element) => { element.hidden = !fact; });
  document.querySelectorAll("[data-detail-category]").forEach((element) => {
    const typeKey = V2_ENTITY_TYPE_NAV_KEY[entity.entityType];
    element.textContent = (typeKey && resolveKey(lang, `nav.${typeKey}`)) || entity.entityType;
  });

  const image = document.querySelector(".record-detail-image");
  if (image) image.alt = imageAltText(entity, lang, title);
  const caption = document.querySelector("[data-detail-image-caption]");
  if (caption) {
    const media = resolveRecordMedia(entity);
    caption.textContent = localizedMetadataValue(media?.metadata?.caption, lang, "");
  }

  const mapCta = document.querySelector("[data-map-cta]");
  if (mapCta) {
    const ctaLabel = resolveKey(lang, "map.viewOnMapCta");
    const ctaTextEl = mapCta.querySelector("span");
    if (ctaTextEl && ctaLabel != null) ctaTextEl.textContent = ctaLabel;
    const ariaTemplate = resolveKey(lang, "map.viewOnMapAria");
    if (ariaTemplate != null) mapCta.setAttribute("aria-label", ariaTemplate.replace("{title}", title));
  }

  document.title = `${title} — AntiochiaArchive`;
  initArchiveImageFallbacks();
}

function localizedArchiveText(key, lang) {
  const fallback = {
    archiveLoading: "Loading archive data…",
    archiveLoadError: "Archive data could not be loaded.",
    archiveRetry: "Try Again",
  };
  return resolveKey(lang, key) ?? fallback[key];
}

function renderArchiveLoadingState(lang) {
  getArchiveSectionRenderers().forEach(({ id }) => {
    const container = document.getElementById(id);
    const status = document.createElement("div");
    status.className = "archive-load-state";
    status.setAttribute("role", "status");
    status.textContent = localizedArchiveText("archiveLoading", lang);
    container.replaceChildren(status);
  });
}

function renderArchiveErrorState(lang) {
  getArchiveSectionRenderers().forEach(({ id }) => {
    const container = document.getElementById(id);
    const status = document.createElement("div");
    const message = document.createElement("p");
    const retry = document.createElement("button");

    status.className = "archive-load-state archive-load-error";
    status.setAttribute("role", "alert");
    message.textContent = localizedArchiveText("archiveLoadError", lang);
    retry.className = "archive-load-retry";
    retry.type = "button";
    retry.textContent = localizedArchiveText("archiveRetry", lang);
    retry.addEventListener("click", () => initArchive({ force: true }));
    status.append(message, retry);
    container.replaceChildren(status);
  });
}

/** Fetches every v2 type whose container is present on this page, in parallel. */
async function fetchV2ArchiveData() {
  const renderers = getV2SectionRenderers();
  const entries = await Promise.all(
    renderers.map(({ key, typeRoute }) => (
      window.AntiochiaArchiveV2API.fetchEntitiesByType(typeRoute).then((items) => [key, items])
    )),
  );
  return Object.fromEntries(entries);
}

/**
 * Fetch v1 (gallery only) and v2 (7 cultural-entity types) once; language
 * changes reuse the in-memory result. Both sources are fetched in parallel
 * and treated as one atomic load: either failing puts the whole page into
 * the existing error/retry state, matching today's all-or-nothing loading
 * UX rather than partial/silent degradation.
 */
async function initArchive({ force = false } = {}) {
  const hasV1 = getV1SectionRenderers().length > 0;
  const hasV2 = getV2SectionRenderers().length > 0;
  if (!hasV1 && !hasV2) return;
  if (archiveLoadState === "loading") return;
  if ((archiveData || !hasV1) && (archiveDataV2 || !hasV2) && !force) {
    renderArchiveSections(currentLang);
    return;
  }

  archiveLoadState = "loading";
  renderArchiveLoadingState(currentLang);

  try {
    const tasks = [];
    if (hasV1) {
      if (!window.AntiochiaArchiveAPI) throw new Error("Archive API client is unavailable.");
      tasks.push(window.AntiochiaArchiveAPI.fetchArchive().then((data) => { archiveData = data; }));
    }
    if (hasV2) {
      if (!window.AntiochiaArchiveV2API) throw new Error("Archive v2 API client is unavailable.");
      tasks.push(fetchV2ArchiveData().then((data) => { archiveDataV2 = data; }));
    }
    await Promise.all(tasks);
    archiveLoadState = "loaded";
    renderArchiveSections(currentLang);
  } catch (err) {
    if (hasV1) archiveData = null;
    if (hasV2) archiveDataV2 = null;
    archiveLoadState = "error";
    console.error("[AntiochiaArchive] Archive API is unavailable:", err);
    renderArchiveErrorState(currentLang);
  }
}

/* ==========================================================================
   Discovery Features (search / timeline / map / collections / discover)
   ========================================================================== */

/**
 * A second, page-independent public v2 dataset: every discovery feature
 * needs the WHOLE archive (a story page's "more from this type" needs every
 * story; the map needs every place) rather than just the types the current
 * page's own card grid fetches (see fetchV2ArchiveData()/archiveDataV2
 * above). Loaded once via AntiochiaArchiveStore's own cache, so even with
 * five features on one page (homepage) this is a single network request.
 */
let discoveryEntities = null;
let discoverySearchIndex = null;
let discoveryLoadPromise = null;

function ensureDiscoveryEntities() {
  if (discoveryEntities) return Promise.resolve(discoveryEntities);
  if (discoveryLoadPromise) return discoveryLoadPromise;
  if (!window.AntiochiaArchiveStore) return Promise.resolve(null);
  discoveryLoadPromise = window.AntiochiaArchiveStore.loadAllPublicEntities()
    .then((entities) => {
      discoveryEntities = entities;
      discoverySearchIndex = window.AntiochiaArchiveSearch ? window.AntiochiaArchiveSearch.buildSearchIndex(entities) : null;
      return entities;
    })
    .catch((err) => {
      console.error("[AntiochiaArchive] Discovery data unavailable:", err);
      discoveryLoadPromise = null;
      return null;
    });
  return discoveryLoadPromise;
}

/** entityType -> localized plural label, reusing the same nav.* strings the related-entity cards already use. */
function v2TypeLabels(lang) {
  const labels = {};
  for (const [type, navKey] of Object.entries(V2_ENTITY_TYPE_NAV_KEY)) {
    labels[type] = resolveKey(lang, `nav.${navKey}`) || type;
  }
  return labels;
}

/** One shared compact card markup for any public entity — used by search results, collections, explore-more, and random discover alike. */
function genericEntityCardHtml(entity, lang, typeLabels) {
  const title = escapeHtml(window.AntiochiaArchiveSearch ? window.AntiochiaArchiveSearch.displayTitle(entity, lang) : localizedMetadataValue(entity.title, lang, entity.slug));
  const summary = escapeHtml(localizedMetadataValue(entity.summary, lang, ""));
  const typeLabel = escapeHtml(typeLabels?.[entity.entityType] || entity.entityType);
  const period = escapeHtml(localizedMetadataValue(entity.period?.label, lang, ""));
  const imagePath = entity.media?.path ? escapeHtml(entity.media.path) : "";
  const href = archiveV2DetailHref(entity);
  const inner = `
      <span class="generic-card-type">${typeLabel}</span>
      ${imagePath ? `<img class="generic-card-image" src="${imagePath}" alt="" loading="lazy">` : ""}
      <h3 class="generic-card-title">${title}</h3>
      ${summary ? `<p class="generic-card-summary">${summary}</p>` : ""}
      ${period ? `<span class="generic-card-period">${period}</span>` : ""}`;
  return href
    ? `<a class="generic-entity-card" href="${escapeHtml(href)}">${inner}</a>`
    : `<div class="generic-entity-card">${inner}</div>`;
}

/* -------------------------------------------------------------------------
   Nav "Discover" dropdown (Map / Timeline / Collections)
   ------------------------------------------------------------------------- */
function initNavDiscoverMenus() {
  document.querySelectorAll("[data-nav-discover]").forEach((wrap) => {
    const trigger = wrap.querySelector(".nav-discover-trigger");
    const menu = wrap.querySelector(".nav-discover-menu");
    if (!trigger || !menu || trigger.dataset.wired) return;
    trigger.dataset.wired = "true";

    const close = () => { wrap.classList.remove("is-open"); trigger.setAttribute("aria-expanded", "false"); };
    const open = () => { wrap.classList.add("is-open"); trigger.setAttribute("aria-expanded", "true"); };

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      if (wrap.classList.contains("is-open")) close(); else open();
    });
    document.addEventListener("click", (event) => { if (!wrap.contains(event.target)) close(); });
    wrap.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { close(); trigger.focus(); }
    });
    menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", close));
  });
}

/* -------------------------------------------------------------------------
   Header search autocomplete (every page)
   ------------------------------------------------------------------------- */
function initHeaderSearchAutocomplete() {
  if (!window.AntiochiaArchiveSearchBox) return;
  ensureDiscoveryEntities();
  document.querySelectorAll("#search-input, .search-input-field").forEach((input) => {
    window.AntiochiaArchiveSearchBox.initSearchAutocomplete(input, {
      getIndex: () => discoverySearchIndex,
      getLang: () => currentLang,
      getTypeLabels: () => v2TypeLabels(currentLang),
      resultsHref: "/pages/search.html",
    });
  });
}

/* -------------------------------------------------------------------------
   Timeline ("Antioch Through Time") — homepage compact preview
   ------------------------------------------------------------------------- */
function initHomepageTimeline() {
  if (!document.getElementById("timeline-preview-container")) return;
  ensureDiscoveryEntities().then(() => renderHomepageTimeline());
}

function renderHomepageTimeline() {
  const container = document.getElementById("timeline-preview-container");
  if (!container || !discoveryEntities || !window.AntiochiaArchiveTimeline) return;
  const entries = window.AntiochiaArchiveTimeline.getTimelineEntries(discoveryEntities);
  window.AntiochiaArchiveTimeline.renderTimeline(container, entries, currentLang, {
    limit: 12,
    emptyLabel: resolveKey(currentLang, "timeline.empty") || "",
  });
}

/* -------------------------------------------------------------------------
   Interactive map — full /pages/map.html and the homepage mini preview
   ------------------------------------------------------------------------- */
const mapInstances = {}; // containerId -> { map, group, listContainerId, filter, limit }

function initOneMapInstance(containerId, listContainerId, { limit = null, mapOptions = {} } = {}) {
  const container = document.getElementById(containerId);
  if (!container || mapInstances[containerId] || !window.AntiochiaArchiveMapDom) return;
  let map;
  try {
    map = window.AntiochiaArchiveMapDom.createLeafletMap(containerId, mapOptions);
  } catch (err) {
    console.error("[AntiochiaArchive] Map init failed:", err);
    container.innerHTML = "";
    const notice = document.createElement("p");
    notice.className = "map-init-error";
    notice.textContent = resolveKey(currentLang, "map.empty") || "";
    container.appendChild(notice);
    return;
  }
  mapInstances[containerId] = { map, group: null, listContainerId, filter: "all", limit };
}

function renderMapInstance(containerId) {
  const state = mapInstances[containerId];
  if (!state || !discoveryEntities || !window.AntiochiaArchiveMapCore) return;
  const mappable = window.AntiochiaArchiveMapCore.getMappableEntities(discoveryEntities);
  const filtered = window.AntiochiaArchiveMapCore.filterByType(mappable, state.filter);
  const limited = state.limit ? filtered.slice(0, state.limit) : filtered;

  if (state.group) state.map.removeLayer(state.group);
  const typeLabels = v2TypeLabels(currentLang);
  const labels = { typeLabels, detailLabel: resolveKey(currentLang, "map.viewDetail") || "", emptyLabel: resolveKey(currentLang, "map.empty") || "" };
  state.group = window.AntiochiaArchiveMapDom.renderMarkers(state.map, limited, currentLang, labels);
  window.AntiochiaArchiveMapDom.fitToMarkers(state.map, limited);

  const listContainer = document.getElementById(state.listContainerId);
  if (listContainer) window.AntiochiaArchiveMapDom.renderMapList(listContainer, limited, currentLang, labels);
}

function initMapFilterButtons() {
  const bar = document.querySelector("[data-map-filters]");
  if (!bar || bar.dataset.wired) return;
  bar.dataset.wired = "true";
  bar.querySelectorAll("[data-map-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      bar.querySelectorAll("[data-map-filter]").forEach((other) => other.classList.toggle("is-active", other === btn));
      const state = mapInstances["map-explore-container"];
      if (state) { state.filter = btn.dataset.mapFilter; renderMapInstance("map-explore-container"); }
    });
  });
}

/** Hides/clears the "no map location" deep-link status message, if shown. */
function hideMapDeepLinkStatus() {
  const status = document.querySelector("[data-map-deep-link-status]");
  if (status) { status.hidden = true; status.textContent = ""; }
}

/** Shows the localized "no map location is available" status message for an invalid/coordinate-less deep-link target. Never logs to console — an unresolved deep link is an expected, safely-handled outcome, not an error. */
function showMapDeepLinkNotFound() {
  const status = document.querySelector("[data-map-deep-link-status]");
  if (!status) return;
  const message = resolveKey(currentLang, "map.locationNotFound");
  if (!message) return;
  status.textContent = message;
  status.hidden = false;
}

/**
 * A place detail page's "View on Map" link points at
 * /pages/map.html?entity={canonical id} (see locationPreviewMarkup() in
 * scripts/v2-archive-release.js; ?focus={slug} is still read as a legacy
 * fallback for any older links). Resolves the target via
 * AntiochiaArchiveMapCore.findDeepLinkEntity(), which only ever matches a
 * public entity already present in `entities` (the array this function
 * receives is always the public-API-served set — see loadAllPublicEntities()
 * — so an inReview/draft id can never resolve here; it just falls through to
 * the same "not found" path as any other invalid id, with no distinguishing
 * behavior that could leak its existence).
 *
 * On a real match: switches the type filter to "all" if the marker would
 * otherwise be hidden by the current filter, re-fits/re-renders, pans to the
 * marker, and opens its popup. Runs once on first load only — deliberately
 * not re-applied on later filter-button clicks, so switching the
 * Places/Structures filter re-fits to the filtered set (fitToMarkers,
 * already called inside renderMapInstance) instead of snapping back to the
 * original deep-linked record every time.
 */
function focusMapOnQueryParam(entities) {
  const state = mapInstances["map-explore-container"];
  if (!state || !window.AntiochiaArchiveStore || !window.AntiochiaArchiveMapCore) return;
  const params = new URLSearchParams(window.location.search);
  const entityId = params.get("entity");
  const focusSlug = params.get("focus");
  if (!entityId && !focusSlug) return;

  const entity = window.AntiochiaArchiveMapCore.findDeepLinkEntity(entities, { id: entityId, slug: focusSlug });
  if (!entity) {
    showMapDeepLinkNotFound();
    return;
  }
  hideMapDeepLinkStatus();

  if (state.filter !== "all" && state.filter !== entity.entityType) {
    state.filter = "all";
    document.querySelectorAll("[data-map-filters] [data-map-filter]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.mapFilter === "all");
    });
    renderMapInstance("map-explore-container");
  }

  state.map.setView([entity.coordinates.latitude, entity.coordinates.longitude], 15);
  const marker = state.group?.markersByEntityId?.get(entity.id);
  if (marker) marker.openPopup();
}

function initMapFeature() {
  const fullContainer = document.querySelector("[data-map-container]");
  const previewContainer = document.getElementById("map-preview-container");
  if (!fullContainer && !previewContainer) return;

  if (fullContainer) {
    initOneMapInstance("map-explore-container", "map-list-container");
    initMapFilterButtons();
  }
  if (previewContainer) {
    initOneMapInstance("map-preview-container", "map-preview-list", { limit: 24, mapOptions: { zoom: 8, scrollWheelZoom: false } });
  }

  ensureDiscoveryEntities().then((entities) => {
    if (!entities) return;
    if (fullContainer) {
      renderMapInstance("map-explore-container");
      focusMapOnQueryParam(entities);
    }
    if (previewContainer) renderMapInstance("map-preview-container");
  });
}

function rerenderMapFeature() {
  Object.keys(mapInstances).forEach((containerId) => renderMapInstance(containerId));
}

/* -------------------------------------------------------------------------
   Collections — homepage preview cards + the full /pages/collections.html
   ------------------------------------------------------------------------- */
function collectionCountText(count, lang) {
  const template = resolveKey(lang, count === 1 ? "collections.recordCountOne" : "collections.recordCount") || "{count}";
  return template.replace("{count}", String(count));
}

function collectionPreviewCardHtml(collection, lang) {
  const title = escapeHtml(resolveKey(lang, `collections.items.${collection.id}.title`) || collection.id);
  const desc = escapeHtml(resolveKey(lang, `collections.items.${collection.id}.desc`) || "");
  const previewTitles = collection.members.slice(0, 4)
    .map((entity) => escapeHtml(window.AntiochiaArchiveSearch.displayTitle(entity, lang)))
    .join(" · ");
  return `<article class="collection-preview-card">
      <span class="collection-card-icon" aria-hidden="true">${collection.icon}</span>
      <h3 class="collection-card-title">${title}</h3>
      <p class="collection-card-desc">${desc}</p>
      ${previewTitles ? `<p class="collection-card-preview">${previewTitles}</p>` : ""}
      <div class="collection-card-footer">
        <span class="collection-card-count">${escapeHtml(collectionCountText(collection.members.length, lang))}</span>
        <a class="collection-card-cta" href="/pages/collections.html#collection-${escapeHtml(collection.id)}">${escapeHtml(resolveKey(lang, "collections.openCollection") || "Open collection")}</a>
      </div>
    </article>`;
}

function collectionFullSectionHtml(collection, lang, typeLabels) {
  const title = escapeHtml(resolveKey(lang, `collections.items.${collection.id}.title`) || collection.id);
  const desc = escapeHtml(resolveKey(lang, `collections.items.${collection.id}.desc`) || "");
  return `<section class="collection-full-section" id="collection-${escapeHtml(collection.id)}" aria-labelledby="collection-${escapeHtml(collection.id)}-heading">
      <header class="collection-full-header">
        <span class="collection-card-icon" aria-hidden="true">${collection.icon}</span>
        <div>
          <h2 id="collection-${escapeHtml(collection.id)}-heading">${title}</h2>
          <p class="collection-card-desc">${desc}</p>
          <span class="collection-card-count">${escapeHtml(collectionCountText(collection.members.length, lang))}</span>
        </div>
      </header>
      <div class="collection-full-grid">
        ${collection.members.map((entity) => genericEntityCardHtml(entity, lang, typeLabels)).join("")}
      </div>
    </section>`;
}

function initCollectionsFeature() {
  const previewContainer = document.getElementById("collections-preview-container");
  const fullContainer = document.getElementById("collections-grid-container");
  if (!previewContainer && !fullContainer) return;
  ensureDiscoveryEntities().then(() => {
    renderCollectionsFeature();
    // A homepage preview card links to collections.html#collection-{id}; that
    // section only exists once this render runs, so a browser navigating
    // straight to the hash from another page attempts its native anchor
    // scroll before the target exists and silently lands at the top instead.
    // Do it manually, once, the first time this page's collections render.
    if (fullContainer && window.location.hash) {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
    }
  });
}

function renderCollectionsFeature() {
  if (!discoveryEntities || !window.AntiochiaArchiveCollections) return;
  const resolved = window.AntiochiaArchiveCollections.resolveCollections(discoveryEntities);
  const lang = currentLang;
  const typeLabels = v2TypeLabels(lang);

  const previewContainer = document.getElementById("collections-preview-container");
  if (previewContainer) previewContainer.innerHTML = resolved.slice(0, 4).map((c) => collectionPreviewCardHtml(c, lang)).join("");

  const fullContainer = document.getElementById("collections-grid-container");
  if (fullContainer) fullContainer.innerHTML = resolved.map((c) => collectionFullSectionHtml(c, lang, typeLabels)).join("");
}

/* -------------------------------------------------------------------------
   Search results page (/pages/search.html)
   ------------------------------------------------------------------------- */
let searchResultsTypeFilter = "all";

function initSearchResultsPage() {
  const grid = document.querySelector("[data-search-results-grid]");
  if (!grid) return;
  ensureDiscoveryEntities().then(() => renderSearchResultsPage());

  const filterBar = document.querySelector("[data-search-filters]");
  if (filterBar && !filterBar.dataset.wired) {
    filterBar.dataset.wired = "true";
    filterBar.querySelectorAll(".filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        filterBar.querySelectorAll(".filter-btn").forEach((other) => other.classList.toggle("is-active", other === btn));
        searchResultsTypeFilter = btn.dataset.filter;
        renderSearchResultsPage();
      });
    });
  }
}

function renderSearchResultsPage() {
  const grid = document.querySelector("[data-search-results-grid]");
  if (!grid || !discoverySearchIndex || !window.AntiochiaArchiveSearch) return;

  const query = new URLSearchParams(window.location.search).get("q") || "";
  const summaryEl = document.querySelector("[data-search-results-summary]");
  const results = window.AntiochiaArchiveSearch.searchEntities(discoverySearchIndex, query, { typeFilter: searchResultsTypeFilter });

  if (summaryEl) {
    if (!query.trim()) {
      summaryEl.textContent = resolveKey(currentLang, "search.noQuery") || "";
    } else {
      const countTemplate = resolveKey(currentLang, results.length === 1 ? "search.resultsCountOne" : "search.resultsCount") || "{count}";
      const forText = (resolveKey(currentLang, "search.resultsFor") || "{query}").replace("{query}", query);
      summaryEl.textContent = `${forText} — ${countTemplate.replace("{count}", String(results.length))}`;
    }
  }

  if (!query.trim()) { grid.innerHTML = ""; return; }
  if (!results.length) {
    grid.innerHTML = `<p class="search-results-empty">${escapeHtml(resolveKey(currentLang, "search.empty") || "")}</p>`;
    return;
  }
  const typeLabels = v2TypeLabels(currentLang);
  grid.innerHTML = results.map((entity) => genericEntityCardHtml(entity, currentLang, typeLabels)).join("");
}

/* -------------------------------------------------------------------------
   Detail page: "Explore more" (same-type picks + discover-another)
   ------------------------------------------------------------------------- */
function initExploreMore() {
  if (!document.querySelector("[data-explore-more]")) return;
  ensureDiscoveryEntities().then(() => renderExploreMore());
}

function renderExploreMore() {
  const container = document.querySelector("[data-explore-more]");
  if (!container || !discoveryEntities || !window.AntiochiaArchiveStore) return;
  const entityId = container.dataset.entityId;
  const entityType = container.dataset.entityType;
  const grid = container.querySelector("[data-explore-more-grid]");
  const picks = window.AntiochiaArchiveStore.byType(discoveryEntities, entityType)
    .filter((entity) => entity.id !== entityId)
    .slice(0, 3);
  if (grid) grid.innerHTML = picks.map((entity) => genericEntityCardHtml(entity, currentLang, v2TypeLabels(currentLang))).join("");

  const discoverBtn = container.querySelector("[data-discover-another]");
  if (discoverBtn) {
    discoverBtn.hidden = picks.length === 0;
    if (!discoverBtn.dataset.wired) {
      discoverBtn.dataset.wired = "true";
      discoverBtn.addEventListener("click", () => {
        const picked = window.AntiochiaArchiveStore.pickRandomEntity(discoveryEntities, { excludeId: entityId });
        const href = picked && archiveV2DetailHref(picked);
        if (href) window.location.href = href;
      });
    }
  }
}

/* -------------------------------------------------------------------------
   Detail page share controls (copy link / WhatsApp / X / native share)
   ------------------------------------------------------------------------- */
function initShareControls() {
  document.querySelectorAll(".record-share").forEach((section) => {
    if (section.dataset.wired) return;
    section.dataset.wired = "true";
    const url = section.dataset.shareUrl;
    const copyBtn = section.querySelector(".record-share-copy");
    const nativeBtn = section.querySelector(".record-share-native");

    copyBtn?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(url);
        const original = copyBtn.textContent;
        copyBtn.textContent = resolveKey(currentLang, "detail.share.linkCopied") || original;
        window.setTimeout(() => { copyBtn.textContent = resolveKey(currentLang, "detail.share.copyLink") || original; }, 2000);
      } catch (_) { /* Clipboard API unavailable/denied — WhatsApp/X links still work. */ }
    });

    if (typeof navigator.share === "function" && nativeBtn) {
      nativeBtn.hidden = false;
      nativeBtn.addEventListener("click", () => {
        navigator.share({ title: section.dataset.shareTitle, url }).catch(() => {});
      });
    }
  });
}

/* -------------------------------------------------------------------------
   "Discover a Record" — homepage random-entity button
   ------------------------------------------------------------------------- */
let hasDiscoveredOnce = false;

function renderDiscoverButtonLabel() {
  const button = document.querySelector("[data-discover-button]");
  if (!button) return;
  button.textContent = resolveKey(currentLang, hasDiscoveredOnce ? "discover.another" : "discover.button") || button.textContent;
}

function initRandomDiscover() {
  const button = document.querySelector("[data-discover-button]");
  const panel = document.querySelector("[data-discover-panel]");
  if (!button || !panel) return;
  ensureDiscoveryEntities();
  button.addEventListener("click", () => {
    if (!discoveryEntities || !window.AntiochiaArchiveStore) return;
    const entity = window.AntiochiaArchiveStore.pickRandomEntity(discoveryEntities);
    if (!entity) return;
    panel.hidden = false;
    panel.innerHTML = genericEntityCardHtml(entity, currentLang, v2TypeLabels(currentLang));
    hasDiscoveredOnce = true;
    renderDiscoverButtonLabel();
  });
}

/* -------------------------------------------------------------------------
   Archive summary — homepage live counts by type (never hardcoded)
   ------------------------------------------------------------------------- */
function initArchiveSummary() {
  if (!document.getElementById("archive-summary-container")) return;
  ensureDiscoveryEntities().then(() => renderArchiveSummary());
}

function renderArchiveSummary() {
  const container = document.getElementById("archive-summary-container");
  if (!container || !discoveryEntities || !window.AntiochiaArchiveStore) return;
  const typeLabels = v2TypeLabels(currentLang);
  const rows = window.AntiochiaArchiveStore.DETAIL_TYPES.map((type) => ({
    label: typeLabels[type],
    count: window.AntiochiaArchiveStore.byType(discoveryEntities, type).length,
  }));
  container.innerHTML = rows.map((row) => `
      <div class="archive-stat">
        <span class="archive-stat-count">${row.count}</span>
        <span class="archive-stat-label">${escapeHtml(row.label)}</span>
      </div>`).join("");
}

/** Re-renders every discovery feature already present on this page in the new language. Each renderer is itself a safe no-op when its container or data isn't there — same idiom as renderArchiveSections(). */
function renderDiscoveryFeatures() {
  renderHomepageTimeline();
  rerenderMapFeature();
  renderCollectionsFeature();
  renderSearchResultsPage();
  renderExploreMore();
  renderArchiveSummary();
  renderDiscoverButtonLabel();
}

/* ==========================================================================
   Init
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {

  /* --- DOM refs --- */
  menuToggleBtn = document.getElementById("menu-toggle");
  mobileNavEl   = document.getElementById("mobile-nav");

  /* --- Mobile menu toggle --- */
  menuToggleBtn.addEventListener("click", () => setMenuOpen(!isMenuOpen));

  /* --- Close menu on nav link click --- */
  mobileNavEl.querySelectorAll("a").forEach((link) =>
    link.addEventListener("click", () => setMenuOpen(false))
  );

  /* --- Close menu on Escape --- */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isMenuOpen) {
      setMenuOpen(false);
      menuToggleBtn.focus();
    }
  });

  /* --- Reset menu state on resize to desktop --- */
  const mq = window.matchMedia("(min-width: 1101px)");
  mq.addEventListener("change", (e) => { if (e.matches) setMenuOpen(false); });

  /* --- Language buttons --- */
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => applyLanguage(btn.dataset.lang));
  });

  /* --- Scroll reveal --- */
  initScrollReveal();

  /* --- Music audio buttons --- */
  initMusicTrackButtons();

  /* --- Story buttons --- */
  initStoryButtons();

  /* --- Contribute form --- */
  initContributeForm();

  /* --- Back to top button --- */
  initBackToTopButton();

  /* --- Load saved or detected language --- */
  const saved    = (() => { try { return localStorage.getItem("aa-lang"); } catch (_) { return null; } })();
  const detected = navigator.language?.slice(0, 2);
  const initial  = (TRANSLATIONS[saved] ? saved : null)
    ?? (TRANSLATIONS[detected] ? detected : null)
    ?? "en";

  applyLanguage(initial);

  /* --- Load archive content from the backend API --- */
  initArchive();

  /* --- Related entities (v2 detail pages only; no-op if absent) --- */
  loadAndRenderRelatedEntities(currentLang);

  /* --- Search filtering --- */
  initSearch();

  /* --- Category filtering (desktop buttons and mobile selects) --- */
  initFilterListeners();

  /* --- Lightbox modal init --- */
  initLightbox();

  /* --- Discovery features: nav dropdown, search autocomplete, timeline, map, collections, search results, explore-more, share, random discover, archive summary --- */
  initNavDiscoverMenus();
  initHeaderSearchAutocomplete();
  initHomepageTimeline();
  initMapFeature();
  initCollectionsFeature();
  initSearchResultsPage();
  initExploreMore();
  initShareControls();
  initRandomDiscover();
  initArchiveSummary();

  /* Contribution map intentionally disabled until submissions have location data. */
});

/* ==========================================================================
   Contributions Map Logic
   ========================================================================== */

let contributionsMap = null;

/**
 * Initialize the Leaflet map on the Contributions page.
 */
function initContributionsMap() {
  const mapContainer = document.getElementById("map-container");
  if (!mapContainer || contributionsMap) return;

  try {
    contributionsMap = L.map("map-container", {
      center: [36.2021, 36.1608],
      zoom: 10,
      scrollWheelZoom: false,
    });

    L.tileLayer("https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    }).addTo(contributionsMap);

    // Add zoom controls to bottom-right
    contributionsMap.zoomControl.setPosition("bottomright");

  } catch (err) {
    console.error("Failed to initialize Leaflet map:", err);
    mapContainer.innerHTML = `<p style="padding: 1rem; text-align: center; color: var(--clr-red-dark);">Could not load map.</p>`;
  }
}

/**
 * Render contribution markers on the map.
 */
function renderContributionsMap(items) {
  if (!contributionsMap || !items || !items.length) return;

  // Clear existing markers
  contributionsMap.eachLayer((layer) => {
    if (layer instanceof L.Marker) {
      contributionsMap.removeLayer(layer);
    }
  });

  const terracottaIcon = L.divIcon({
    className: "terracotta-marker",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14]
  });

  let validLocations = 0;
  items.forEach(item => {
    const { name, message, location } = item;
    if (location && typeof location.lat === "number" && typeof location.lng === "number") {
      validLocations++;
      const marker = L.marker([location.lat, location.lng], { icon: terracottaIcon }).addTo(contributionsMap);

      const popupContent = document.createElement("div");
      popupContent.className = "leaflet-popup-content";
      const heading = document.createElement("h4");
      heading.textContent = name || "";
      const body = document.createElement("p");
      body.textContent = message || "";
      popupContent.append(heading, body);
      marker.bindPopup(popupContent);
    }
  });

  // If there's only one marker, center and zoom in on it
  if (validLocations === 1) {
    const singleItem = items.find(item => item.location && typeof item.location.lat === "number");
    if(singleItem) {
      contributionsMap.setView([singleItem.location.lat, singleItem.location.lng], 13);
    }
  }
}


/* ==========================================================================
   Gallery Lightbox Logic
   ========================================================================== */

let lastLightboxTrigger = null;

function openLightbox(itemIndex, trigger = null) {
  if (!archiveData || !archiveData.gallery || !archiveData.gallery[itemIndex]) return;
  const item = archiveData.gallery[itemIndex];
  const lang = currentLang;

  const modal = document.getElementById("lightbox-modal");
  const mediaContainer = document.getElementById("lightbox-media");
  const catEl = document.getElementById("lightbox-category");
  const titleEl = document.getElementById("lightbox-title");
  const captionEl = document.getElementById("lightbox-caption");
  const attributionEl = document.getElementById("lightbox-attribution");

  if (!modal || !mediaContainer) return;

  const title = item.title[lang] ?? item.title.en;
  const cat = item.category[lang] ?? item.category.en;
  const caption = item.caption[lang] ?? item.caption.en;
  const imageCaption = localizedMetadataValue(item.imageMetadata?.caption, lang);
  const attribution = formatImageAttribution(item.imageMetadata, lang);

  const mediaUrl = safeHttpUrl(item.src);
  if (mediaUrl) {
    const figure = document.createElement("figure");
    const image = document.createElement("img");
    image.src = mediaUrl;
    image.alt = imageAltText(item, lang, title);
    image.className = "lightbox-img";
    image.dataset.archiveImage = "";
    figure.className = "lightbox-figure";
    figure.classList.add("archive-media-figure");
    figure.dataset.fallbackType = item.svgType || "circles";
    figure.dataset.fallbackColor = item.svgColor || "#903628";
    figure.dataset.fallbackBg = item.svgBg || "#ded4c0";
    figure.appendChild(image);
    if (imageCaption) {
      const figcaption = document.createElement("figcaption");
      figcaption.className = "lightbox-media-caption";
      figcaption.textContent = imageCaption;
      figure.appendChild(figcaption);
    }
    if (item.imageMetadata?.aiGenerated === true) {
      const aiLabel = document.createElement("span");
      aiLabel.className = "archive-ai-label";
      aiLabel.textContent = resolveKey(lang, "provenance.aiImageLabel")
        || "Illustrative image — generated with artificial intelligence.";
      figure.appendChild(aiLabel);
    }
    mediaContainer.replaceChildren(figure);
    initArchiveImageFallbacks(mediaContainer);
  } else {
    const svg = buildSvg(item.svgType || "house", item.svgColor || "#903628", item.svgBg || "#ded4c0");
    mediaContainer.innerHTML = `<svg class="lightbox-svg" viewBox="0 0 360 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</svg>`;
  }

  if (catEl) catEl.textContent = cat;
  if (titleEl) titleEl.textContent = title;
  if (captionEl) captionEl.textContent = caption;
  if (attributionEl) {
    attributionEl.textContent = attribution;
    attributionEl.hidden = !attribution;
  }

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  lastLightboxTrigger = trigger;
  document.getElementById("lightbox-close")?.focus();
}

function closeLightbox() {
  const modal = document.getElementById("lightbox-modal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  lastLightboxTrigger?.focus();
  lastLightboxTrigger = null;
}

function initGalleryClickHandlers() {
  document.querySelectorAll(".gallery-lightbox-trigger").forEach((trigger) => {
    trigger.onclick = () => {
      const idx = parseInt(trigger.dataset.galleryIdx, 10);
      if (!isNaN(idx)) openLightbox(idx, trigger);
    };
  });
}

function initLightbox() {
  const modal = document.getElementById("lightbox-modal");
  const closeBtn = document.getElementById("lightbox-close");

  if (closeBtn) closeBtn.onclick = closeLightbox;
  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) closeLightbox();
    };
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && modal.classList.contains("open")) {
      closeLightbox();
    } else if (e.key === "Tab" && modal && modal.classList.contains("open")) {
      e.preventDefault();
      closeBtn?.focus();
    }
  });
}

/* ==========================================================================
   Combined Category Filter & Live Search Logic
   ========================================================================== */

let currentActiveFilter = "all";
let currentSearchQuery = "";

/** Apply both Category Filter and Search Query simultaneously */
function applyCombinedFilters() {
  const q = (currentSearchQuery || "").trim().toLowerCase();
  const cat = currentActiveFilter || "all";

  const allCards = document.querySelectorAll(ALL_CARD_SELECTORS);
  let visibleCount = 0;

  allCards.forEach((card) => {
    const cardCategory = card.getAttribute("data-category") || "all";
    const dataSearch = (card.getAttribute("data-search") || "").toLowerCase();
    const textContent = (card.textContent || "").toLowerCase();

    // 1. Search Query Match
    const matchesSearch = !q || dataSearch.includes(q) || textContent.includes(q);

    // 2. Category Filter Match
    const matchesCategory = (cat === "all") || (cardCategory === cat);

    if (matchesSearch && matchesCategory) {
      card.classList.remove("hidden");
      visibleCount += 1;
    } else {
      card.classList.add("hidden");
    }
  });

  if (allCards.length) updateFilterResultsCount(visibleCount);
}

/**
 * Show a plain "N records shown" line under each filter bar. Only pages with
 * a filter bar (and cards already rendered) get one — applyCombinedFilters()
 * skips this when the page has no cards yet (e.g. before the archive API
 * response lands), so no "0 records" flash on first paint.
 */
function updateFilterResultsCount(count) {
  const wraps = document.querySelectorAll(".filter-bar-wrap");
  if (!wraps.length) return;

  const key = count === 1 ? "filters.resultsCountOne" : "filters.resultsCount";
  const fallback = count === 1 ? "{count} record shown" : "{count} records shown";
  const text = (resolveKey(currentLang, key) || fallback).replace("{count}", String(count));

  wraps.forEach((wrap) => {
    let el = wrap.querySelector(".filter-results-count");
    if (!el) {
      el = document.createElement("p");
      el.className = "filter-results-count";
      el.setAttribute("aria-live", "polite");
      wrap.appendChild(el);
    }
    el.textContent = text;
  });
}

/** Update category filter and refresh card visibility */
function handleFilter(category) {
  currentActiveFilter = category || "all";

  // Update button UI states
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    if (btn.dataset.filter === currentActiveFilter) {
      btn.classList.add("is-active");
    } else {
      btn.classList.remove("is-active");
    }
  });

  // Update dropdown select UI values
  document.querySelectorAll(".filter-select").forEach((sel) => {
    sel.value = currentActiveFilter;
  });

  applyCombinedFilters();
}

/** Wire filter buttons and select dropdown event listeners */
function initFilterListeners() {
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      handleFilter(btn.dataset.filter);
    });
  });

  document.querySelectorAll(".filter-select").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      handleFilter(e.target.value);
    });
  });
}

/** Filter archive cards across all sections based on input query */
function handleSearch(query) {
  currentSearchQuery = query || "";
  applyCombinedFilters();
}

/** Wire search input event listeners */
function initSearch() {
  const inputs = document.querySelectorAll("#search-input, .search-input-field");
  inputs.forEach((input) => {
    input.addEventListener("input", (e) => {
      inputs.forEach((otherInput) => {
        if (otherInput !== input) otherInput.value = e.target.value;
      });
      handleSearch(e.target.value);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        inputs.forEach((searchInput) => { searchInput.value = ""; });
        handleSearch("");
        input.blur();
      }
    });
  });
}
