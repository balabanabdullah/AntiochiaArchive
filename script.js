/**
 * AntiochiaArchive — script.js
 * Handles: language switching, mobile menu, scroll reveal, form UX, audio player toggles,
 *          and dynamic content rendering from archive.json
 */

/* Cached archive data (loaded once) */
let archiveData = null;

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

  // 6. Update language buttons' pressed state
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.lang === lang));
  });

  // 7. Restore scroll
  window.scrollTo({ top: scrollY, behavior: "instant" });

  // 8. Persist preference
  try { localStorage.setItem("aa-lang", lang); } catch (_) { /* noop */ }

  // 9. Re-render archive sections in new language
  renderArchiveSections(lang);
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

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );

  targets.forEach((el) => observer.observe(el));
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

  // --- API endpoint: POST /api/contribute ---
  // On the Vite dev server (:5173) we call the backend on :5000 explicitly.
  // When served directly from the Express process on :5000 we use a relative path.
  const backendBase = window.location.port === "5000"
    ? ""                           // same origin
    : "http://localhost:5000";     // cross-origin from Vite

  const endpoint = `${backendBase}/api/contribute`;

  try {
    const response = await fetch(endpoint, {
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
   SVG Builders (used by archive renderers)
   ========================================================================== */

function buildSvg(type, color, bg) {
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

function renderHistory(items, lang) {
  const readMore = resolveKey(lang, "readMore") ?? "Read more";
  return items.map((item) => {
    const svg = buildSvg(item.svgType, item.svgColor, item.svgBg);
    return `
      <article class="timeline-card" data-reveal>
        <span class="timeline-era">${item.era[lang] ?? item.era.en}</span>
        <div class="timeline-visual" aria-hidden="true">${svg}</div>
        <h3 class="timeline-title">${item.title[lang] ?? item.title.en}</h3>
        <p class="timeline-desc">${item.body[lang] ?? item.body.en}</p>
      </article>`;
  }).join("");
}

function renderStories(items, lang) {
  const readMoreLabel = resolveKey(lang, "readMore") ?? "Read Story";
  return items.map((item, idx) => {
    const svg = buildSvg(item.svgType, item.svgColor, item.svgBg);
    return `
      <article class="story-card" data-reveal aria-label="Story: ${item.title[lang] ?? item.title.en}">
        <div class="story-image-wrap">
          <svg class="story-image" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            ${svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}
          </svg>
          <span class="story-tag">${item.tag[lang] ?? item.tag.en}</span>
        </div>
        <div class="story-content">
          <h3 class="story-title">${item.title[lang] ?? item.title.en}</h3>
          <p class="story-body">${item.body[lang] ?? item.body.en}</p>
          <button class="story-read-btn" type="button" data-story-id="${idx + 1}">
            <span>${readMoreLabel}</span>
            <span class="story-link-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </article>`;
  }).join("");
}

function renderStructures(items, lang) {
  return items.map((item) => {
    const svg = buildSvg(item.svgType, item.svgColor, item.svgBg);
    return `
      <article class="struct-card" data-reveal>
        <div class="struct-media">
          <svg class="struct-svg" viewBox="0 0 360 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            ${svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}
          </svg>
          <span class="struct-tag">${item.tag[lang] ?? item.tag.en}</span>
        </div>
        <div class="struct-info">
          <h3 class="struct-title">${item.title[lang] ?? item.title.en}</h3>
          <p class="struct-desc">${item.desc[lang] ?? item.desc.en}</p>
        </div>
      </article>`;
  }).join("");
}

function renderBeliefs(items, lang) {
  return items.map((item) => `
    <div class="belief-card" data-reveal>
      <div class="belief-icon" aria-hidden="true">${item.icon}</div>
      <h3 class="belief-title">${item.title[lang] ?? item.title.en}</h3>
      <p class="belief-desc">${item.desc[lang] ?? item.desc.en}</p>
    </div>`).join("");
}

function renderMusic(items, lang) {
  const playLabel = resolveKey(lang, "musicSection.playLabel") ?? "Play audio sample";
  return items.map((item) => `
    <article class="music-track-card" data-reveal>
      <div class="track-badge" aria-hidden="true">${item.badge}</div>
      <div class="track-info">
        <span class="track-tag">${item.tag[lang] ?? item.tag.en}</span>
        <h3 class="track-title">${item.title[lang] ?? item.title.en}</h3>
        <p class="track-desc">${item.desc[lang] ?? item.desc.en}</p>
      </div>
      <button class="track-play-btn" type="button" aria-label="${playLabel}">
        <span class="play-icon" aria-hidden="true">▶</span>
      </button>
    </article>`).join("");
}

/**
 * Inject rendered content into the 5 dynamic containers.
 * Called after archive is loaded and on every language switch.
 */
function renderArchiveSections(lang) {
  if (!archiveData) return;

  const map = [
    { id: "history-timeline-container",  fn: renderHistory,    key: "history" },
    { id: "stories-grid-container",      fn: renderStories,    key: "stories" },
    { id: "structures-grid-container",   fn: renderStructures, key: "structures" },
    { id: "beliefs-grid-container",      fn: renderBeliefs,    key: "beliefs" },
    { id: "music-list-container",        fn: renderMusic,      key: "music" },
  ];

  map.forEach(({ id, fn, key }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = fn(archiveData[key], lang);
  });

  // Re-observe newly injected [data-reveal] elements
  initScrollReveal();

  // Re-wire interactive buttons
  initMusicTrackButtons();
  initStoryButtons();
}

/** Fetch archive.json once, then render for the current language. */
async function initArchive() {
  try {
    let res = null;
    const candidatePaths = ["archive.json", "/archive.json", "../public/archive.json", "../archive.json"];
    for (const p of candidatePaths) {
      try {
        const r = await fetch(p);
        if (r && r.ok) { res = r; break; }
      } catch (_) {}
    }
    if (!res) throw new Error("HTTP fetch failed for archive.json");
    archiveData = await res.json();
    renderArchiveSections(currentLang);
  } catch (err) {
    console.error("[AntiochiaArchive] Could not load archive.json:", err);
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
  const mq = window.matchMedia("(min-width: 768px)");
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

  /* --- Load saved or detected language --- */
  const saved    = (() => { try { return localStorage.getItem("aa-lang"); } catch (_) { return null; } })();
  const detected = navigator.language?.slice(0, 2);
  const initial  = (TRANSLATIONS[saved] ? saved : null)
    ?? (TRANSLATIONS[detected] ? detected : null)
    ?? "en";

  applyLanguage(initial);

  /* --- Load archive content from archive.json --- */
  initArchive();
});
