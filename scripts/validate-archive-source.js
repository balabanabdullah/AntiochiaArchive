import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const categories = ["history", "stories", "structures", "beliefs", "music", "gallery"];

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function publicRuntimeFiles() {
  const pageDirectory = path.join(repositoryRoot, "pages");
  const pages = fs.readdirSync(pageDirectory)
    .filter((name) => name.endsWith(".html"))
    .map((name) => `pages/${name}`);
  const scripts = fs.readdirSync(path.join(repositoryRoot, "public"))
    .filter((name) => name.endsWith(".js"))
    .map((name) => `public/${name}`);
  return ["index.html", ...pages, ...scripts];
}

try {
  const publicArchivePath = path.join(repositoryRoot, "public", "archive.json");
  const privateArchivePath = path.join(repositoryRoot, "data", "archive.json");
  check(!fs.existsSync(publicArchivePath), "public/archive.json must not exist");
  check(fs.existsSync(privateArchivePath), "data/archive.json is missing");

  const archive = JSON.parse(read("data/archive.json"));
  categories.forEach((category) => check(Array.isArray(archive[category]), `archive category '${category}' is missing`));
  const recordCount = categories.reduce((total, category) => total + archive[category].length, 0);

  for (const file of publicRuntimeFiles()) {
    check(!/archive\.json/i.test(read(file)), `${file} still references a static archive.json`);
  }

  const client = read("public/archive-api.js");
  check(client.includes('fetchImplementation("/api/archive"'), "archive client does not use /api/archive");
  check(client.includes("payload.success !== true"), "archive API wrapper is not validated strictly");

  const renderer = read("public/script.js");
  check(renderer.includes("renderArchiveErrorState"), "public renderer has no API error state");
  check(renderer.includes("archiveLoadState = \"error\""), "public renderer does not track API failure");

  check(read("backend/stores/fileStore.js").includes('../../data/archive.json'), "file store default is not data/archive.json");
  check(read("backend/scripts/migrate-json-to-firestore.js").includes('"data", "archive.json"'), "migration does not read data/archive.json");

  const builtArchivePath = path.join(repositoryRoot, "dist", "archive.json");
  check(!fs.existsSync(builtArchivePath), "dist/archive.json must not exist");

  console.log(`Archive source validation passed: ${categories.length} categories, ${recordCount} records, API-only public runtime.`);
} catch (error) {
  console.error(`Archive source validation failed: ${error.message}`);
  process.exitCode = 1;
}
