import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productionOrigin = "https://antiochia-app-6939593871.europe-west1.run.app";

const publicPages = [
  { file: "index.html", url: `${productionOrigin}/`, types: ["WebSite"] },
  { file: "pages/history.html", url: `${productionOrigin}/pages/history.html`, types: ["CollectionPage", "BreadcrumbList"] },
  { file: "pages/stories.html", url: `${productionOrigin}/pages/stories.html`, types: ["CollectionPage", "BreadcrumbList"] },
  { file: "pages/structures.html", url: `${productionOrigin}/pages/structures.html`, types: ["CollectionPage", "BreadcrumbList"] },
  { file: "pages/beliefs.html", url: `${productionOrigin}/pages/beliefs.html`, types: ["CollectionPage", "BreadcrumbList"] },
  { file: "pages/music.html", url: `${productionOrigin}/pages/music.html`, types: ["CollectionPage", "BreadcrumbList"] },
  { file: "pages/gallery.html", url: `${productionOrigin}/pages/gallery.html`, types: ["CollectionPage", "BreadcrumbList"] },
  { file: "pages/contributions.html", url: `${productionOrigin}/pages/contributions.html`, types: [] },
];

const privatePages = ["pages/admin.html", "pages/submissions.html"];
const structuredUrls = new Set(publicPages.filter((page) => page.types.length).map((page) => page.url));

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
    const withoutFragment = value.split("#", 1)[0];
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
  }
}

try {
  const documentCount = publicPages.reduce((count, page) => count + validatePublicPage(page), 0);
  validatePrivatePages();
  console.log(`Semantic SEO validation passed: ${publicPages.length} public pages, ${privatePages.length} private pages, ${documentCount} JSON-LD documents.`);
} catch (error) {
  console.error(`Semantic SEO validation failed: ${error.message}`);
  process.exitCode = 1;
}
