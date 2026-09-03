import test from "node:test";
import assert from "node:assert/strict";
import { renderPageHtml } from "../../pages/pageRenderer.js";

const BASE_PAGE = Object.freeze({
  id: "page-1",
  slug: "test-page",
  title: { tr: "Test Sayfası", en: "Test Page" },
  summary: { tr: "Kısa özet" },
  content: { tr: "Birinci paragraf.\n\nİkinci paragraf." },
  seoTitle: { tr: "SEO Başlık" },
  seoDescription: { tr: "SEO açıklaması" },
});

test("a hostile title/content can never inject a tag — Section 15's 'no arbitrary executable HTML' rule", () => {
  const hostile = {
    ...BASE_PAGE,
    title: { tr: '<script>alert(1)</script>' },
    content: { tr: '<img src=x onerror=alert(1)>\n\nSecond <b>paragraph</b>.' },
  };
  const html = renderPageHtml(hostile, { language: "tr" });
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("<b>paragraph</b>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("&lt;img src=x"));
});

test("a hostile title cannot break out of the inline JSON-LD <script> block", () => {
  const hostile = { ...BASE_PAGE, title: { tr: "</script><script>alert(1)</script>" } };
  const html = renderPageHtml(hostile, { language: "tr" });
  assert.ok(!html.includes("</script><script>alert(1)"));
});

test("renders complete SEO tags: title, description, canonical, OG, Twitter, JSON-LD", () => {
  const html = renderPageHtml(BASE_PAGE, { language: "tr" });
  assert.match(html, /<title>SEO Başlık · AntiochiaArchive<\/title>/);
  assert.match(html, /<meta name="description" content="SEO açıklaması">/);
  assert.match(html, /<link rel="canonical" href="[^"]+\/sayfa\/test-page\/">/);
  assert.match(html, /<meta property="og:title" content="SEO Başlık">/);
  assert.match(html, /<meta name="twitter:card" content="summary">/);
  assert.match(html, /"@type":"WebPage"/);
  assert.match(html, /"@type":"BreadcrumbList"/);
});

test("hreflang alternates are emitted for all three languages plus x-default", () => {
  const html = renderPageHtml(BASE_PAGE, { language: "tr" });
  for (const lang of ["tr", "en", "ar"]) {
    assert.match(html, new RegExp(`hreflang="${lang}"`));
  }
  assert.match(html, /hreflang="x-default"/);
});

test("an unsupported/absent language falls back to 'tr', never crashes", () => {
  const html = renderPageHtml(BASE_PAGE, { language: "klingon" });
  assert.match(html, /<html lang="tr" dir="ltr">/);
});

test("Arabic renders dir=rtl; everything else renders dir=ltr", () => {
  const arHtml = renderPageHtml({ ...BASE_PAGE, title: { ar: "صفحة" } }, { language: "ar" });
  assert.match(arHtml, /<html lang="ar" dir="rtl">/);
  const enHtml = renderPageHtml(BASE_PAGE, { language: "en" });
  assert.match(enHtml, /<html lang="en" dir="ltr">/);
});

test("content with no localized value for the requested language falls back through tr/en/ar rather than rendering blank", () => {
  const html = renderPageHtml({ ...BASE_PAGE, content: { en: "English only content." } }, { language: "tr" });
  assert.ok(html.includes("English only content."));
});

test("blank-line-separated paragraphs become separate <p> tags; a single newline becomes <br>", () => {
  const html = renderPageHtml({ ...BASE_PAGE, content: { tr: "Line one\nLine two.\n\nSecond paragraph." } }, { language: "tr" });
  assert.match(html, /<p>Line one<br>Line two\.<\/p>/);
  assert.match(html, /<p>Second paragraph\.<\/p>/);
});

test("a page with no summary renders no summary paragraph at all, not an empty one", () => {
  const html = renderPageHtml({ ...BASE_PAGE, summary: undefined }, { language: "tr" });
  assert.ok(!html.includes('class="page-summary"'));
});
