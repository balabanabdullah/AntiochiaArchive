/**
 * AntiochiaArchive — script.js
 * Handles: language switching, mobile menu, scroll reveal, form UX, audio player toggles,
 *          and dynamic content rendering from the archive API
 */

/* Cached archive data (loaded once) */
let archiveData = null;
let archiveLoadState = "idle";

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
  if (archiveLoadState === "error") renderArchiveErrorState(lang);
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

function imageAltText(item, lang, title) {
  return localizedMetadataValue(item.imageMetadata?.alt, lang, title || "");
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
  const mediaUrl = safeHttpUrl(item.image || item.src);
  if (!mediaUrl) return null;
  const alt = imageAltText(item, lang, title);
  return `
    <figure class="archive-media-figure">
      <img class="${escapeHtml(className)}" src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(alt)}" loading="lazy">
      ${renderAiImageLabel(item.imageMetadata, lang)}
    </figure>`;
}

function renderHistory(items, lang) {
  return items.map((item) => {
    const svg = buildSvg(item.svgType, item.svgColor, item.svgBg);
    const title = item.title[lang] ?? item.title.en;
    const era = item.era[lang] ?? item.era.en;
    const body = item.body[lang] ?? item.body.en;
    const cat = item.categoryKey || "all";
    const searchStr = escapeHtml(`${title} ${era} ${body}`);
    const mediaHtml = renderRecordImage(item, lang, title, "timeline-image") || svg;
    return `
      <article class="timeline-card" data-reveal data-search="${searchStr}" data-category="${escapeHtml(cat)}">
        <span class="timeline-era">${escapeHtml(era)}</span>
        <div class="timeline-visual"${mediaHtml === svg ? ' aria-hidden="true"' : ""}>${mediaHtml}</div>
        <h3 class="timeline-title">${escapeHtml(title)}</h3>
        <p class="timeline-desc">${escapeHtml(body)}</p>
      </article>`;
  }).join("");
}

function renderStories(items, lang) {
  return items.map((item) => {
    const svg = buildSvg(item.svgType, item.svgColor, item.svgBg);
    const title = item.title[lang] ?? item.title.en;
    const tag = item.tag[lang] ?? item.tag.en;
    const body = item.body[lang] ?? item.body.en;
    const cat = item.categoryKey || "all";
    const searchStr = escapeHtml(`${title} ${tag} ${body}`);
    const realImage = renderRecordImage(item, lang, title, "story-image");
    return `
      <article class="story-card" data-reveal data-search="${searchStr}" data-category="${escapeHtml(cat)}" aria-label="Story: ${escapeHtml(title)}">
        <div class="story-image-wrap">
          ${realImage || `<svg class="story-image" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</svg>`}
          <span class="story-tag">${escapeHtml(tag)}</span>
        </div>
        <div class="story-content">
          <h3 class="story-title">${escapeHtml(title)}</h3>
          <p class="story-body">${escapeHtml(body)}</p>
        </div>
      </article>`;
  }).join("");
}

function renderStructures(items, lang) {
  return items.map((item) => {
    const svg = buildSvg(item.svgType, item.svgColor, item.svgBg);
    const title = item.title[lang] ?? item.title.en;
    const tag = item.tag[lang] ?? item.tag.en;
    const desc = item.desc[lang] ?? item.desc.en;
    const cat = item.categoryKey || "all";
    const searchStr = escapeHtml(`${title} ${tag} ${desc}`);
    const realImage = renderRecordImage(item, lang, title, "struct-image");
    return `
    <article class="struct-card" data-reveal data-search="${searchStr}" data-category="${escapeHtml(cat)}">
        <div class="struct-media">
          ${realImage || `<svg class="struct-svg" viewBox="0 0 360 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</svg>`}
          <span class="struct-tag">${escapeHtml(tag)}</span>
        </div>
        <div class="struct-info">
          <h3 class="struct-title">${escapeHtml(title)}</h3>
          <p class="struct-desc">${escapeHtml(desc)}</p>
        </div>
      </article>`;
  }).join("");
}

function renderBeliefs(items, lang) {
  return items.map((item) => {
    const title = item.title[lang] ?? item.title.en;
    const desc = item.desc[lang] ?? item.desc.en;
    const cat = item.categoryKey || "all";
    const searchStr = escapeHtml(`${title} ${desc}`);
    const realImage = renderRecordImage(item, lang, title, "belief-image");
    return `
    <article class="belief-card" data-reveal data-search="${searchStr}" data-category="${escapeHtml(cat)}">
      ${realImage ? `<div class="belief-media">${realImage}</div>` : ""}
      <div class="belief-icon" aria-hidden="true">${escapeHtml(item.icon)}</div>
      <h3 class="belief-title">${escapeHtml(title)}</h3>
      <p class="belief-desc">${escapeHtml(desc)}</p>
    </article>`;
  }).join("");
}

function renderMusic(items, lang) {
  return items.map((item) => {
    const title = item.title[lang] ?? item.title.en;
    const tag = item.tag[lang] ?? item.tag.en;
    const desc = item.desc[lang] ?? item.desc.en;
    const cat = item.categoryKey || "all";
    const searchStr = escapeHtml(`${title} ${tag} ${desc}`);
    return `
    <article class="music-track-card" data-reveal data-search="${searchStr}" data-category="${escapeHtml(cat)}">
      <div class="track-badge" aria-hidden="true">${escapeHtml(item.badge)}</div>
      <div class="track-info">
        <span class="track-tag">${escapeHtml(tag)}</span>
        <h3 class="track-title">${escapeHtml(title)}</h3>
        <p class="track-desc">${escapeHtml(desc)}</p>
      </div>
    </article>`;
  }).join("");
}

function renderGallery(items, lang) {
  if (!items || !items.length) return "";
  return items.map((item, idx) => {
    const title = item.title[lang] ?? item.title.en;
    const cat = item.category[lang] ?? item.category.en;
    const caption = item.caption[lang] ?? item.caption.en;
    const catKey = item.categoryKey || "all";
    const searchStr = escapeHtml(`${title} ${cat} ${caption}`);
    
    let mediaHtml = "";
    const realImage = renderRecordImage(item, lang, title, "gallery-img");
    if (realImage) {
      mediaHtml = realImage;
    } else {
      const svg = buildSvg(item.svgType || "house", item.svgColor || "#903628", item.svgBg || "#ded4c0");
      mediaHtml = `<svg class="gallery-svg" viewBox="0 0 360 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</svg>`;
    }

    return `
      <article class="gallery-card" data-reveal data-search="${searchStr}" data-category="${escapeHtml(catKey)}" data-gallery-idx="${idx}" tabindex="0" role="button" aria-label="View ${escapeHtml(title)}">
        <div class="gallery-media-wrap">
          ${mediaHtml}
          <span class="gallery-category">${escapeHtml(cat)}</span>
          <div class="gallery-overlay-icon" aria-hidden="true">🔍</div>
        </div>
        <div class="gallery-info">
          <h3 class="gallery-title">${escapeHtml(title)}</h3>
          <p class="gallery-caption">${escapeHtml(caption)}</p>
        </div>
      </article>`;
  }).join("");
}

const ARCHIVE_SECTION_RENDERERS = Object.freeze([
  { id: "history-timeline-container", fn: renderHistory, key: "history" },
  { id: "stories-grid-container", fn: renderStories, key: "stories" },
  { id: "structures-grid-container", fn: renderStructures, key: "structures" },
  { id: "beliefs-grid-container", fn: renderBeliefs, key: "beliefs" },
  { id: "music-list-container", fn: renderMusic, key: "music" },
  { id: "gallery-grid-container", fn: renderGallery, key: "gallery" },
]);

function getArchiveSectionRenderers() {
  return ARCHIVE_SECTION_RENDERERS.filter(({ id }) => document.getElementById(id));
}

/** Inject cached archive content into every container present on the current page. */
function renderArchiveSections(lang) {
  if (!archiveData) return;

  getArchiveSectionRenderers().forEach(({ id, fn, key }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = fn(archiveData[key], lang);
  });

  // Ensure rendered cards receive is-visible class immediately
  document.querySelectorAll(".struct-card, .timeline-card, .story-card, .belief-card, .music-track-card, .gallery-card").forEach((card) => {
    card.classList.add("is-visible");
  });

  // Re-observe newly injected [data-reveal] elements
  initScrollReveal();

  // Re-wire interactive buttons & gallery lightbox handlers
  initMusicTrackButtons();
  initStoryButtons();
  initGalleryClickHandlers();
  applyCombinedFilters();
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

/** Fetch the backend archive once; language changes reuse the in-memory result. */
async function initArchive({ force = false } = {}) {
  if (!getArchiveSectionRenderers().length) return;
  if (archiveLoadState === "loading") return;
  if (archiveData && !force) {
    renderArchiveSections(currentLang);
    return;
  }

  archiveLoadState = "loading";
  renderArchiveLoadingState(currentLang);

  try {
    if (!window.AntiochiaArchiveAPI) throw new Error("Archive API client is unavailable.");
    archiveData = await window.AntiochiaArchiveAPI.fetchArchive();
    archiveLoadState = "loaded";
    renderArchiveSections(currentLang);
  } catch (err) {
    archiveData = null;
    archiveLoadState = "error";
    console.error("[AntiochiaArchive] Archive API is unavailable:", err);
    renderArchiveErrorState(currentLang);
  }
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

  /* --- Search filtering --- */
  initSearch();

  /* --- Category filtering (desktop buttons and mobile selects) --- */
  initFilterListeners();

  /* --- Lightbox modal init --- */
  initLightbox();

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

function openLightbox(itemIndex) {
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
    figure.className = "lightbox-figure";
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
}

function closeLightbox() {
  const modal = document.getElementById("lightbox-modal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function initGalleryClickHandlers() {
  document.querySelectorAll(".gallery-card").forEach((card) => {
    const handler = () => {
      const idx = parseInt(card.dataset.galleryIdx, 10);
      if (!isNaN(idx)) openLightbox(idx);
    };

    card.onclick = handler;
    card.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handler();
      }
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

  const allCards = document.querySelectorAll(
    ".timeline-card, .story-card, .struct-card, .belief-card, .music-track-card, .gallery-card"
  );

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
    } else {
      card.classList.add("hidden");
    }
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
