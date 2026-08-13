// Builds a normalized v2 import PREVIEW from the canonical cultural research
// input, for human review. This is NOT a production import:
//   - never writes data/v2/entities.json or data/v2/relationships.json
//   - never writes data/archive.json
//   - never contacts Firestore or Cloud Storage
//   - never pushes or deploys anything
//
// Reads research-input/*.txt (not committed — see V2-ARCHITECTURE.md
// "Import preview workflow"), normalizes every record with a documented
// no-invention policy, validates everything with the real v2 schema
// validators, and writes the result under tmp/v2-import-preview/ (ignored
// by git):
//   entities.json        — every entity that passed validation + collision checks
//   relationships.json   — every relationship that passed validation + referential integrity checks
//   sources.json          — every normalized source record
//   media.json            — every normalized media record
//   report.json           — full input/normalized/excluded counts and reasons
//
// Usage: node backend/scripts/build-v2-import-preview.js [--research-dir <path>] [--out <dir>]

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { buildImportPreview } from "../v2/importPreview/buildImportPreview.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
  const researchDirIndex = argv.indexOf("--research-dir");
  const outIndex = argv.indexOf("--out");
  return {
    researchDir: researchDirIndex === -1
      ? path.join(repositoryRoot, "research-input")
      : path.resolve(argv[researchDirIndex + 1]),
    outDir: outIndex === -1
      ? path.join(repositoryRoot, "tmp", "v2-import-preview")
      : path.resolve(argv[outIndex + 1]),
  };
}

function formatSummary(result) {
  const { report } = result;
  const lines = [];
  lines.push("AntiochiaArchive v2 cultural dataset import preview");
  lines.push("=".repeat(53));
  lines.push("THIS IS A PREVIEW, NOT A PRODUCTION IMPORT.");
  lines.push("");
  lines.push("Input counts:");
  for (const [key, value] of Object.entries(report.inputCounts)) lines.push(`  ${key}: ${value}`);
  lines.push("");
  lines.push("Normalized (included in preview) counts:");
  for (const [type, count] of Object.entries(report.normalizedCounts.byEntityType)) lines.push(`  ${type}: ${count}`);
  lines.push(`  TOTAL entities: ${report.normalizedCounts.totalEntities}`);
  lines.push(`  sourceRegistryRecords: ${report.normalizedCounts.sourceRegistryRecords}`);
  lines.push(`  media: ${report.normalizedCounts.media}`);
  lines.push(`  relationships: ${report.normalizedCounts.relationships}`);
  lines.push("");
  lines.push("Excluded counts (collision / orphan / invalid — see report.json for reasons):");
  for (const [key, value] of Object.entries(report.excludedCounts)) lines.push(`  ${key}: ${value}`);
  lines.push("");
  lines.push("Source reference audit (A must never be conflated with B):");
  lines.push(`  A. distinct sourceIds referenced by cultural entities: ${report.sourceReferenceAudit.distinctSourceIdsReferencedByCulturalEntities}`);
  lines.push(`  B. source registry records represented: ${report.sourceReferenceAudit.sourceRegistryRecordsRepresented}`);
  lines.push(`  C. identity-level restored sources: ${report.sourceReferenceAudit.identityLevelRestoredSources}`);
  lines.push(`  D. context-only sources: ${report.sourceReferenceAudit.contextOnlySources}`);
  lines.push(`  E. bibliographically unresolved referenced sourceIds: ${report.sourceReferenceAudit.bibliographicallyUnresolvedReferencedSourceIds}`);
  lines.push(`  F. unrecoverable legacy source records (unknown ids): ${report.sourceReferenceAudit.unrecoverableLegacySourceRecords}`);
  lines.push("");
  lines.push(`Publication-status downgrades (published -> inReview, unresolved citation): ${report.publicationStatus.downgradedCount}`);
  lines.push(`Oral history leads (forced status=draft, never public): ${report.storyClassification.oralHistoryLeadCount}`);
  lines.push("");
  const totalExcluded = Object.values(report.excludedCounts).reduce((a, b) => a + b, 0);
  const invalidCount = [
    ...report.excludedEntities, ...report.excludedSources, ...report.excludedMedia, ...report.excludedRelationships,
  ].filter((item) => item.reason === "schemaInvalid" || item.reason === "normalizationError").length;
  lines.push(`Schema-invalid records in the preview: 0 (required)`);
  lines.push(`Actual invalid/normalization-error records found: ${invalidCount}`);
  lines.push(`Total excluded (collision/orphan + invalid): ${totalExcluded}`);
  lines.push("");
  lines.push("FIRESTORE CONTACTED: NO");
  lines.push("CLOUD STORAGE CONTACTED: NO");
  lines.push("data/v2/entities.json MODIFIED: NO");
  lines.push("data/v2/relationships.json MODIFIED: NO");
  lines.push("data/archive.json MODIFIED: NO");

  return lines.join("\n");
}

async function main() {
  const { researchDir, outDir } = parseArgs(process.argv.slice(2));

  const result = await buildImportPreview({ researchDir });

  console.log(formatSummary(result));

  await fs.mkdir(outDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outDir, "entities.json"), JSON.stringify(result.entities, null, 2), "utf-8"),
    fs.writeFile(path.join(outDir, "relationships.json"), JSON.stringify(result.relationships, null, 2), "utf-8"),
    fs.writeFile(path.join(outDir, "sources.json"), JSON.stringify(result.sources, null, 2), "utf-8"),
    fs.writeFile(path.join(outDir, "media.json"), JSON.stringify(result.media, null, 2), "utf-8"),
    fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(result.report, null, 2), "utf-8"),
  ]);

  console.log(`\nWrote preview files to ${outDir}`);

  const invalidCount = [
    ...result.report.excludedEntities, ...result.report.excludedSources,
    ...result.report.excludedMedia, ...result.report.excludedRelationships,
  ].filter((item) => item.reason === "schemaInvalid" || item.reason === "normalizationError").length;

  if (invalidCount > 0) {
    console.error(`\n[ImportPreview] ${invalidCount} record(s) failed schema validation or normalization — see report.json.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[ImportPreview] ${error.message}`);
  process.exitCode = 1;
});
