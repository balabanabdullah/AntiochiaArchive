/**
 * AntiochiaArchive — script.js
 * Handles: language switching, mobile menu, scroll reveal, form UX, audio player toggles
 */

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
   Form
   ========================================================================== */
function initContributeForm() {
  const form = document.getElementById("contribute-form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const btn = form.querySelector(".btn-submit");
    const originalText = btn.textContent;

    btn.textContent = "✓";
    btn.disabled    = true;
    btn.style.background = "var(--clr-olive)";

    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled    = false;
      btn.style.background = "";
      form.reset();
    }, 2400);
  });
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
});
