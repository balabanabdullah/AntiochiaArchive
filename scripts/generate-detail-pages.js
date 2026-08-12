import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  flattenArchive,
  generateDetailDocument,
  recordDetailPath,
  sitemapUrls,
  validateReleaseArchive,
} from "./archive-release.js";

const repositoryRoot = resolve(import.meta.dirname, "..");
const distRoot = resolve(repositoryRoot, "dist");
const archive = JSON.parse(await readFile(resolve(repositoryRoot, "data/archive.json"), "utf8"));
const validation = validateReleaseArchive(archive);

if (validation.count !== 23) throw new Error(`Expected 23 v1.0 records, found ${validation.count}.`);

const builtIndex = await readFile(resolve(distRoot, "index.html"), "utf8");
const stylesheet = builtIndex.match(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/i)?.[1];
const scripts = [...builtIndex.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi)].map((match) => match[1]);
const langScript = scripts.find((source) => /\/assets\/lang-[^/]+\.js$/.test(source));
const appScript = scripts.find((source) => /\/assets\/script-[^/]+\.js$/.test(source));

if (!stylesheet || !langScript || !appScript) {
  throw new Error("Could not resolve versioned stylesheet, language script, and application script from dist/index.html.");
}

for (const { category, record } of flattenArchive(archive)) {
  const relative = `${recordDetailPath(record).slice(1)}index.html`;
  const destination = resolve(distRoot, relative);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, generateDetailDocument({
    category,
    record,
    stylesheet,
    langScript,
    appScript,
  }), "utf8");
}

const sitemap = await readFile(resolve(distRoot, "sitemap.xml"), "utf8");
for (const url of sitemapUrls(archive)) {
  if (!sitemap.includes(`<loc>${url}</loc>`)) throw new Error(`Sitemap is missing ${url}.`);
}

await Promise.all(flattenArchive(archive).map(({ record }) => (
  access(resolve(distRoot, `archive/${record.slug}/index.html`))
)));

console.log(`Generated ${validation.count} static archive detail pages with versioned assets.`);
