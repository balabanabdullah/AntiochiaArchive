import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { buildMigrationReport } from "../../../v2/migration/buildMigrationReport.js";
import { assertValidArchive, ARCHIVE_CATEGORIES } from "../../../dataModel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const archivePath = path.resolve(__dirname, "../../../../data/archive.json");

async function loadRealArchive() {
  return assertValidArchive(JSON.parse(await fs.readFile(archivePath, "utf-8")));
}

test("the real 23-record v1 archive maps to exactly 23 valid v2 entities", async () => {
  const archive = await loadRealArchive();
  const report = buildMigrationReport(archive);

  assert.equal(report.inputCount, 23);
  assert.equal(report.mappedCount, 23);
  assert.equal(report.validation.allValid, true);
  assert.equal(report.validation.invalidCount, 0);
  assert.equal(report.idIntegrity.uniqueIdCount, 23);
  assert.equal(report.idIntegrity.duplicateIds, 0);
  assert.equal(report.idIntegrity.uniqueSlugCount, 23);
  assert.equal(report.idIntegrity.duplicateSlugs, 0);
});

test("no new cultural entity types are introduced: only the six mapped types appear", async () => {
  const archive = await loadRealArchive();
  const report = buildMigrationReport(archive);

  const producedTypes = Object.keys(report.mappedByEntityType).sort();
  assert.deepEqual(producedTypes, ["historicalContext", "media", "music", "story", "structure"]);
  assert.equal(report.mappedByEntityType.belief, undefined);
  assert.equal(report.mappedByEntityType.community, undefined);
  assert.equal(report.mappedByEntityType.place, undefined);
  assert.equal(report.mappedByEntityType.proverb, undefined);
});

test("all four v1 beliefs-category records map to entityType 'structure', not 'belief'", async () => {
  const archive = await loadRealArchive();
  const report = buildMigrationReport(archive);

  const beliefOrigin = report.entities.filter((entity) => entity.sourceCategory === "beliefs");
  assert.equal(beliefOrigin.length, 4);
  assert.deepEqual(new Set(beliefOrigin.map((e) => e.id)), new Set(["b1", "b2", "b3", "b4"]));
  for (const entity of beliefOrigin) {
    assert.equal(entity.entityType, "structure");
  }
});

test("all six gallery records map safely to entityType 'media'", async () => {
  const archive = await loadRealArchive();
  const report = buildMigrationReport(archive);

  const galleryOrigin = report.entities.filter((entity) => entity.sourceCategory === "gallery");
  assert.equal(galleryOrigin.length, 6);
  for (const entity of galleryOrigin) {
    assert.equal(entity.entityType, "media");
  }
});

test("media and sources are preserved per MEDIA-PROVENANCE.md's documented 16 real / 7 placeholder split", async () => {
  const archive = await loadRealArchive();
  const report = buildMigrationReport(archive);

  assert.equal(report.mediaPreservation.recordsWithRealMedia, 16);
  assert.equal(report.mediaPreservation.recordsWithPlaceholders, 7);
  assert.equal(report.mediaPreservation.recordsWithImageMetadata, 16);
  // The current v1 archive has no populated sources[] arrays yet (see
  // SEO-GEO.md); this assertion documents that current state rather than
  // fabricating any.
  assert.equal(report.sourcesPreservation.recordsWithSources, 0);
});

test("known same-site cross-category pairs are flagged for editorial review, without merging any record", async () => {
  const archive = await loadRealArchive();
  const report = buildMigrationReport(archive);

  const pairKey = (a, b) => [a, b].sort().join("<->");
  const flaggedPairs = new Set(
    report.potentialDuplicates.map((warning) => pairKey(warning.recordA.id, warning.recordB.id)),
  );

  for (const [a, b] of [
    ["st1", "b1"], ["st1", "g4"], ["b1", "g4"], // Habib-i Neccar
    ["st2", "b2"], ["st2", "g2"], ["b2", "g2"], // St. Pierre
    ["s2", "g5"], // Orontes waterwheels
    ["s1", "g1"], // Kurtuluş Street
    ["st3", "g3"], // Roman mosaics
  ]) {
    assert.ok(flaggedPairs.has(pairKey(a, b)), `expected ${a} <-> ${b} to be flagged`);
  }

  // All 23 ids are still present and distinct — flagging never merges.
  assert.equal(new Set(report.entities.map((e) => e.id)).size, 23);
});

test("buildMigrationReport reports a clear validation error rather than weakening validators", () => {
  const invalidArchive = Object.fromEntries(ARCHIVE_CATEGORIES.map((category) => [category, []]));
  invalidArchive.history.push({ id: "h1", slug: "bad slug with spaces", title: {} });

  const report = buildMigrationReport(invalidArchive);

  assert.equal(report.inputCount, 1);
  assert.equal(report.mappedCount, 1);
  assert.equal(report.validation.allValid, false);
  assert.equal(report.validation.invalidCount, 1);
  assert.equal(report.validation.invalidRecords[0].id, "h1");
  assert.match(report.validation.invalidRecords[0].error, /slug|title/);
});
