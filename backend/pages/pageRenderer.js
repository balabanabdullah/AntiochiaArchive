// Server-rendered HTML for an admin-created CMS Page (Section 15-18).
//
// Deliberately decoupled from the frontend's Vite build: this backend
// service is deployed separately from the "antiochia-app" static frontend
// (see Dockerfile / nginx/default.conf) and has no access to its
// content-hashed asset filenames, which change on every frontend deploy.
// Rather than create a fragile cross-service dependency (fetching the
// frontend's current asset manifest at render time), this template is
// fully self-contained: a small amount of inline CSS matching the site's
// warm-parchment/terracotta identity, real semantic HTML, and complete SEO
// tags (title/description/canonical/OG/Twitter/hreflang/JSON-LD). Visual
// parity with the full Vite-built site chrome (header nav, footer, webfonts)
// is a known, documented follow-up — see the round report's "Known
// Limitations".
//
// Language handling: a page's content is genuinely multilingual (tr/en/ar).
// Rather than client-side JS language switching (which would make the
// non-default languages invisible to a non-JS crawler/social scraper —
// exactly the SEO regression this project has consistently avoided
// elsewhere), the requested language is a real server-side choice
// (?lang=tr|en|ar, default tr) with plain <a href> links to the other two
// languages, each a fully separate, fully server-rendered response.

import { LANGUAGES } from "../v2/constants/vocabularies.js";

// Mirrors scripts/archive-release.js's PRODUCTION_ORIGIN without importing
// it — this backend's Docker image does not include the repository-root
// scripts/ directory (see backend/Dockerfile), so the two must stay
// independent constants. CLIENT_URL is already the env var server.js uses
// for CORS; reusing it here keeps exactly one place an operator sets "what
// is the public site's origin".
const SITE_ORIGIN = (process.env.CLIENT_URL || "https://antiochia-app-6939593871.europe-west1.run.app").replace(/\/$/, "");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function localized(value, language, fallback = "") {
  if (!value || typeof value !== "object") return fallback;
  return value[language] || value.tr || value.en || value.ar || fallback;
}

/** Blank-line-separated paragraphs, single newlines as line breaks — never raw HTML (Section 15: "do not allow arbitrary executable HTML"). Every character is escaped before any tag is added. */
function renderContentParagraphs(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("\n      ");
}

function normalizeLanguage(value) {
  return LANGUAGES.includes(value) ? value : "tr";
}

/**
 * JSON.stringify does NOT escape "<" — a title/content value containing a
 * literal "</script>" would otherwise close the JSON-LD <script> block
 * early and let anything after it execute as real HTML. Mirrors
 * scripts/v2-archive-release.js's identical jsonForScript() helper (see its
 * own test: "escapes a hostile title so a literal </script> can never
 * truncate the JSON-LD <script> element").
 */
function jsonForScript(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

const LANGUAGE_SWITCH_LABEL = Object.freeze({ tr: "Türkçe", en: "English", ar: "العربية" });

function languageSwitcherHtml(slug, currentLanguage) {
  return LANGUAGES.map((lang) => (
    lang === currentLanguage
      ? `<span aria-current="true">${escapeHtml(LANGUAGE_SWITCH_LABEL[lang])}</span>`
      : `<a href="/sayfa/${encodeURIComponent(slug)}/?lang=${lang}" hreflang="${lang}">${escapeHtml(LANGUAGE_SWITCH_LABEL[lang])}</a>`
  )).join(" · ");
}

function hreflangLinksHtml(slug) {
  return LANGUAGES.map((lang) => (
    `<link rel="alternate" hreflang="${lang}" href="${SITE_ORIGIN}/sayfa/${encodeURIComponent(slug)}/?lang=${lang}">`
  )).join("\n  ") + `\n  <link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}/sayfa/${encodeURIComponent(slug)}/">`;
}

/**
 * Full HTML document for a published page. Callers (backend/pages/pageRoutes.js)
 * are responsible for the published/draft/archived visibility gate — this
 * function trusts that `page` is already known to be publicly visible.
 */
export function renderPageHtml(page, { language: requestedLanguage } = {}) {
  const language = normalizeLanguage(requestedLanguage);
  const dir = language === "ar" ? "rtl" : "ltr";
  const title = localized(page.title, language, page.slug);
  const seoTitle = localized(page.seoTitle, language, title);
  const seoDescription = localized(page.seoDescription, language, localized(page.summary, language, ""));
  const canonical = `${SITE_ORIGIN}/sayfa/${encodeURIComponent(page.slug)}/${language === "tr" ? "" : `?lang=${language}`}`;
  const contentHtml = renderContentParagraphs(localized(page.content, language, ""));
  const summaryHtml = localized(page.summary, language, "") ? `<p class="page-summary">${escapeHtml(localized(page.summary, language, ""))}</p>` : "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": canonical,
    url: canonical,
    name: title,
    description: seoDescription || undefined,
    inLanguage: language,
    isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "AntiochiaArchive", item: SITE_ORIGIN },
        { "@type": "ListItem", position: 2, name: title, item: canonical },
      ],
    },
  };

  return `<!DOCTYPE html>
<html lang="${language}" dir="${dir}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(seoTitle)} · AntiochiaArchive</title>
${seoDescription ? `<meta name="description" content="${escapeHtml(seoDescription)}">` : ""}
<link rel="canonical" href="${canonical}">
${hreflangLinksHtml(page.slug)}
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(seoTitle)}">
${seoDescription ? `<meta property="og:description" content="${escapeHtml(seoDescription)}">` : ""}
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="AntiochiaArchive">
<meta property="og:locale" content="${language}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(seoTitle)}">
${seoDescription ? `<meta name="twitter:description" content="${escapeHtml(seoDescription)}">` : ""}
<script type="application/ld+json">${jsonForScript(jsonLd)}</script>
<style>
  :root { --clr-paper: #fffaf0; --clr-ink: #241f2e; --clr-ink-muted: #625d6e; --clr-red: #903628; --clr-line: #dedad2; }
  body { margin: 0; background: var(--clr-paper); color: var(--clr-ink); font-family: Georgia, "Times New Roman", serif; line-height: 1.65; }
  header { padding: 16px 20px; border-bottom: 1px solid var(--clr-line); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
  header a.home { font-weight: 700; color: var(--clr-red); text-decoration: none; }
  nav.lang-switch { font-size: 0.85rem; color: var(--clr-ink-muted); }
  nav.lang-switch a { color: var(--clr-ink-muted); }
  main { max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 1.9rem; margin-bottom: 4px; }
  .page-summary { color: var(--clr-ink-muted); font-size: 1.05rem; }
  main p { margin: 0 0 1em; }
  footer { text-align: center; padding: 24px; color: var(--clr-ink-muted); font-size: 0.8rem; border-top: 1px solid var(--clr-line); }
</style>
</head>
<body>
<header>
  <a class="home" href="${SITE_ORIGIN}/">AntiochiaArchive</a>
  <nav class="lang-switch" aria-label="Language">${languageSwitcherHtml(page.slug, language)}</nav>
</header>
<main>
  <h1>${escapeHtml(title)}</h1>
  ${summaryHtml}
  ${contentHtml}
</main>
<footer>AntiochiaArchive</footer>
</body>
</html>
`;
}

export { SITE_ORIGIN };
