import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  flattenArchive,
  generateDetailDocument,
  recordDetailPath,
  validateReleaseArchive,
} from "./archive-release.js";
import { collectPublicV2Entities, v2SitemapUrls } from "./v2-archive-release.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productionOrigin = "https://antiochia-app-6939593871.europe-west1.run.app";

const publicPages = [
  { file: "index.html", url: `${productionOrigin}/`, types: ["WebSite"] },
  { file: "pages/history.html", url: `${productionOrigin}/pages/history.html`, types: ["CollectionPage", "BreadcrumbList"] },
  { file: "pages/stories.html", url: `${productionOrigin}/pages/stories.html`, types: ["CollectionPage", "BreadcrumbList"] },
  { file: "pages/structures.html", url: `${productionOrigin}/pages/structures.html`, types: ["CollectionPage", "BreadcrumbList"] },
  { file: "pages/beliefs.html", url: `${productionOrigin}/pages/beliefs.html`, types: ["CollectionPage", "BreadcrumbList"] },
  { file: "pages/communities.html", url: `${productionOrigin}/pages/communities.html`, types: ["CollectionPage", "BreadcrumbList"] },
  { file: "pages/places.html", url: `${productionOrigin}/pages/places.html`, types: ["CollectionPage", "BreadcrumbList"] },
  { file: "pages/music.html", url: `${productionOrigin}/pages/music.html`, types: ["CollectionPage", "BreadcrumbList"] },
  { file: "pages/proverbs.html", url: `${productionOrigin}/pages/proverbs.html`, types: ["CollectionPage", "BreadcrumbList"] },
  { file: "pages/gallery.html", url: `${productionOrigin}/pages/gallery.html`, types: ["CollectionPage", "BreadcrumbList"] },
  { file: "pages/contributions.html", url: `${productionOrigin}/pages/contributions.html`, types: [] },
  { file: "pages/methodology.html", url: `${productionOrigin}/pages/methodology.html`, types: ["WebPage"] },
  { file: "pages/map.html", url: `${productionOrigin}/pages/map.html`, types: ["CollectionPage", "BreadcrumbList"] },
  { file: "pages/collections.html", url: `${productionOrigin}/pages/collections.html`, types: ["CollectionPage", "BreadcrumbList"] },
  { file: "pages/discover.html", url: `${productionOrigin}/pages/discover.html`, types: ["CollectionPage", "BreadcrumbList"] },
  // Results vary by query string, so this is registered like contributions.html:
  // a real public page with no stable structured-data claim to make about it.
  { file: "pages/search.html", url: `${productionOrigin}/pages/search.html`, types: [] },
];

const privatePages = ["pages/admin.html", "pages/submissions.html"];
const structuredUrls = new Set(publicPages.filter((page) => page.types.length).map((page) => page.url));
// The homepage's WebSite SearchAction legitimately targets /pages/search.html
// even though that page carries no structured data of its own (types: []) —
// it's still a real, existing public page, so it's a valid cross-page
// reference target.
structuredUrls.add(`${productionOrigin}/pages/search.html`);
const archive = JSON.parse(read("data/archive.json"));
validateReleaseArchive(archive);
flattenArchive(archive).forEach(({ record }) => structuredUrls.add(`${productionOrigin}${recordDetailPath(record)}`));

// v2 detail pages are generated entirely at build time (no source HTML file
// to read here) — computed live via the same merge/suppress/publish pipeline
// the static generator and the live API both use, never a hardcoded list.
const v2Entities = await collectPublicV2Entities();
v2SitemapUrls(v2Entities).forEach((url) => structuredUrls.add(url));

function read(file) {
  return fs.readFileSync(path.join(repositoryRoot, file), "utf8");
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function attributeContent(html, attribute, value) {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(
    `<meta\\s+[^>]*${attribute}=["']${escapedValue}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  return html.match(expression)?.[1] || "";
}

function canonicalUrl(html) {
  return html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] || "";
}

function jsonLdDocuments(html, file) {
  const documents = [];
  const expression = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = expression.exec(html)) !== null) {
    try {
      documents.push(JSON.parse(match[1]));
    } catch (error) {
      throw new Error(`${file}: invalid JSON-LD (${error.message})`);
    }
  }
  return documents;
}

function walk(value, visitor) {
  visitor(value);
  if (Array.isArray(value)) value.forEach((item) => walk(item, visitor));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => walk(item, visitor));
}

function schemaTypes(documents) {
  const types = new Set();
  walk(documents, (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const declared = value["@type"];
    if (Array.isArray(declared)) declared.forEach((type) => types.add(type));
    else if (typeof declared === "string") types.add(declared);
  });
  return types;
}

function nodesByType(documents, expectedType) {
  const nodes = [];
  walk(documents, (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const declared = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
    if (declared.includes(expectedType)) nodes.push(value);
  });
  return nodes;
}

function validateStructuredUrls(documents, file) {
  walk(documents, (value) => {
    if (typeof value !== "string" || !value.startsWith(productionOrigin)) return;
    // SearchAction's target is a URL *template* (RFC 6570), not a page
    // reference — {search_term_string} is meant to be substituted by the
    // consumer, so only the base page (before "?") needs to be a real,
    // known public URL.
    const withoutFragment = value.split("#", 1)[0].split("?", 1)[0];
    check(structuredUrls.has(withoutFragment), `${file}: JSON-LD points to an unknown public URL: ${value}`);
  });
}

function validatePublicPage(page) {
  const html = read(page.file);
  const title = html.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1].trim() || "";
  const description = attributeContent(html, "name", "description");
  const viewport = attributeContent(html, "name", "viewport");
  const canonical = canonicalUrl(html);
  const h1Count = (html.match(/<h1\b/gi) || []).length;

  check(title, `${page.file}: missing title`);
  check(description, `${page.file}: missing meta description`);
  check(viewport, `${page.file}: missing viewport metadata`);
  check(canonical === page.url, `${page.file}: canonical URL does not match ${page.url}`);
  check(attributeContent(html, "property", "og:type"), `${page.file}: missing og:type`);
  check(attributeContent(html, "property", "og:title"), `${page.file}: missing og:title`);
  check(attributeContent(html, "property", "og:description"), `${page.file}: missing og:description`);
  check(attributeContent(html, "property", "og:url") === page.url, `${page.file}: og:url does not match its canonical URL`);
  check(h1Count === 1, `${page.file}: expected exactly one h1, found ${h1Count}`);

  // Open Graph + Twitter Card — required on every indexable public page
  // (never on admin/submissions, which validatePrivatePages() covers
  // separately and which must publish no social metadata at all).
  const ogSiteName = attributeContent(html, "property", "og:site_name");
  const ogImage = attributeContent(html, "property", "og:image");
  const twitterCard = attributeContent(html, "name", "twitter:card");
  const twitterTitle = attributeContent(html, "name", "twitter:title");
  const twitterDescription = attributeContent(html, "name", "twitter:description");
  const twitterImage = attributeContent(html, "name", "twitter:image");
  check(ogSiteName === "AntiochiaArchive", `${page.file}: missing or incorrect og:site_name`);
  check(/^https:\/\//.test(ogImage), `${page.file}: og:image must be an absolute https URL`);
  check(twitterCard === "summary_large_image", `${page.file}: missing or incorrect twitter:card`);
  check(twitterTitle, `${page.file}: missing twitter:title`);
  check(twitterDescription, `${page.file}: missing twitter:description`);
  check(/^https:\/\//.test(twitterImage), `${page.file}: twitter:image must be an absolute https URL`);
  // Duplicate-meta guard (section 63): the batch injector must never run twice.
  check((html.match(/property="og:site_name"/g) || []).length === 1, `${page.file}: duplicate og:site_name`);
  check((html.match(/property="og:image"\s/g) || []).length === 1, `${page.file}: duplicate og:image`);
  check((html.match(/rel="canonical"/g) || []).length === 1, `${page.file}: duplicate canonical link`);

  const documents = jsonLdDocuments(html, page.file);
  const types = schemaTypes(documents);
  documents.forEach((document) => check(document["@context"] === "https://schema.org", `${page.file}: JSON-LD must use the Schema.org context`));
  page.types.forEach((type) => check(types.has(type), `${page.file}: missing ${type} JSON-LD`));
  if (!page.types.length) check(documents.length === 0, `${page.file}: unexpected public structured data`);

  if (page.types.includes("WebSite")) {
    const [website] = nodesByType(documents, "WebSite");
    check(website?.name === "AntiochiaArchive", `${page.file}: WebSite name is incorrect`);
    check(website?.url === page.url, `${page.file}: WebSite URL is incorrect`);
    check(typeof website?.description === "string" && website.description.length > 0, `${page.file}: WebSite description is missing`);
    check(["tr", "en", "ar"].every((language) => website?.inLanguage?.includes(language)), `${page.file}: WebSite languages are incomplete`);
    check(website?.potentialAction?.["@type"] === "SearchAction", `${page.file}: WebSite is missing SearchAction`);
    check(website?.potentialAction?.target === `${productionOrigin}/pages/search.html?q={search_term_string}`, `${page.file}: SearchAction target does not match the real /pages/search.html?q= contract`);
    check(website?.potentialAction?.["query-input"] === "required name=search_term_string", `${page.file}: SearchAction query-input is malformed`);
  }

  if (page.types.includes("BreadcrumbList")) {
    check(/<nav\s+class=["']breadcrumb["']/i.test(html), `${page.file}: structured breadcrumb has no visible navigation counterpart`);
    const [collection] = nodesByType(documents, "CollectionPage");
    const [breadcrumb] = nodesByType(documents, "BreadcrumbList");
    check(collection?.url === page.url, `${page.file}: CollectionPage URL is incorrect`);
    check(typeof collection?.name === "string" && collection.name.length > 0, `${page.file}: CollectionPage name is missing`);
    check(typeof collection?.description === "string" && collection.description.length > 0, `${page.file}: CollectionPage description is missing`);
    check(collection?.isPartOf?.["@id"] === `${productionOrigin}/#website`, `${page.file}: CollectionPage website relationship is incorrect`);
    check(Array.isArray(breadcrumb?.itemListElement) && breadcrumb.itemListElement.length === 2, `${page.file}: breadcrumb must contain Home and the collection page`);
    check(breadcrumb.itemListElement[0]?.position === 1 && breadcrumb.itemListElement[0]?.item === `${productionOrigin}/`, `${page.file}: breadcrumb Home item is incorrect`);
    check(breadcrumb.itemListElement[1]?.position === 2 && breadcrumb.itemListElement[1]?.item === page.url, `${page.file}: breadcrumb collection item is incorrect`);
  }
  validateStructuredUrls(documents, page.file);
  return documents.length;
}

function validatePrivatePages() {
  for (const file of privatePages) {
    const html = read(file);
    const robots = attributeContent(html, "name", "robots").toLowerCase();
    check(robots.includes("noindex") && robots.includes("nofollow"), `${file}: missing noindex,nofollow`);
    check(jsonLdDocuments(html, file).length === 0, `${file}: administrative page must not publish JSON-LD`);
    check(!attributeContent(html, "property", "og:image"), `${file}: private page must not publish a social preview image`);
    check(!attributeContent(html, "name", "twitter:card"), `${file}: private page must not publish Twitter Card metadata`);
  }
}

function validateGeneratedDetails() {
  let count = 0;
  for (const { category, record } of flattenArchive(archive)) {
    const html = generateDetailDocument({
      category,
      record,
      stylesheet: "/assets/style-test.css",
      langScript: "/assets/lang-test.js",
      appScript: "/assets/script-test.js",
    });
    const url = `${productionOrigin}${recordDetailPath(record)}`;
    const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1].trim() || "";
    check(title, `${record.id}: missing generated title`);
    check(attributeContent(html, "name", "description"), `${record.id}: missing generated description`);
    check(canonicalUrl(html) === url, `${record.id}: generated canonical is incorrect`);
    check(attributeContent(html, "property", "og:url") === url, `${record.id}: generated og:url is incorrect`);
    check((html.match(/<h1\b/gi) || []).length === 1, `${record.id}: generated page must have one H1`);
    check(/<p class="record-detail-summary"[^>]*>[^<]+<\/p>/.test(html), `${record.id}: primary summary is not present in static HTML`);
    const documents = jsonLdDocuments(html, record.id);
    check(schemaTypes(documents).has("WebPage"), `${record.id}: missing WebPage JSON-LD`);
    check(schemaTypes(documents).has("BreadcrumbList"), `${record.id}: missing BreadcrumbList JSON-LD`);
    check(attributeContent(html, "property", "og:site_name") === "AntiochiaArchive", `${record.id}: missing og:site_name`);
    check(/^https:\/\//.test(attributeContent(html, "property", "og:image")), `${record.id}: og:image must be an absolute https URL`);
    check(attributeContent(html, "name", "twitter:card") === "summary_large_image", `${record.id}: missing twitter:card`);
    count += 1;
  }
  return count;
}

try {
  const documentCount = publicPages.reduce((count, page) => count + validatePublicPage(page), 0);
  validatePrivatePages();
  const detailCount = validateGeneratedDetails();
  console.log(`Semantic SEO validation passed: ${publicPages.length} public pages, ${detailCount} detail pages, ${privatePages.length} private pages, ${documentCount + detailCount} JSON-LD documents.`);
} catch (error) {
  console.error(`Semantic SEO validation failed: ${error.message}`);
  process.exitCode = 1;
}
