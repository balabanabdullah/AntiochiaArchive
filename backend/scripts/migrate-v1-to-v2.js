// Read-only v1 -> v2 migration dry run. Default (and only implemented)
// behavior: read the local data/archive.json, map every record into a
// proposed v2 entity in memory, validate each one, and print a summary.
//
// This script NEVER writes to Firestore, NEVER creates Cloud Storage
// resources, and NEVER writes to data/archive.json. --apply is explicitly
// rejected — see parseArgs()/main() below.

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { assertValidArchive } from "../dataModel.js";
import { buildMigrationReport } from "../v2/migration/buildMigrationReport.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(backendDirectory, "..");
const archivePath = path.join(repositoryRoot, "data", "archive.json");

const KNOWN_FLAGS = new Set(["--apply", "--output", "--force"]);

function parseArgs(argv) {
  for (const [index, value] of argv.entries()) {
    if (!value.startsWith("--")) continue;
    if (!KNOWN_FLAGS.has(value)) {
      throw new Error(`Unknown option: ${value}`);
    }
    if (value === "--output") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error("--output requires a file path.");
      }
    }
  }

  const apply = argv.includes("--apply");
  const force = argv.includes("--force");
  const outputIndex = argv.indexOf("--output");
  const output = outputIndex === -1 ? null : argv[outputIndex + 1];

  return { apply, force, output };
}

function formatReport(report) {
  const lines = [];
  lines.push("AntiochiaArchive v1 -> v2 migration dry run");
  lines.push("=".repeat(44));
  lines.push(`INPUT RECORDS: ${report.inputCount}`);
  lines.push(`MAPPED RECORDS: ${report.mappedCount}`);
  lines.push("");

  lines.push("Mapped by entityType:");
  for (const [entityType, count] of Object.entries(report.mappedByEntityType)) {
    lines.push(`  ${entityType}: ${count}`);
  }
  lines.push("");

  lines.push("Source category -> target entityType:");
  for (const [category, entityType] of Object.entries(report.categoryToTargetType)) {
    lines.push(`  ${category} -> ${entityType}`);
  }
  lines.push("");

  lines.push(`Validation: ${report.validation.allValid ? "PASSED" : "FAILED"} (${report.validation.invalidCount} invalid)`);
  for (const invalidRecord of report.validation.invalidRecords) {
    lines.push(`  - ${invalidRecord.id} (${invalidRecord.sourceCategory}): ${invalidRecord.error}`);
  }
  lines.push("");

  lines.push(`Unique IDs: ${report.idIntegrity.uniqueIdCount} (duplicates: ${report.idIntegrity.duplicateIds})`);
  lines.push(`Unique slugs: ${report.idIntegrity.uniqueSlugCount} (duplicates: ${report.idIntegrity.duplicateSlugs})`);
  lines.push("");

  lines.push(`Records with real media: ${report.mediaPreservation.recordsWithRealMedia}`);
  lines.push(`Records with placeholders: ${report.mediaPreservation.recordsWithPlaceholders}`);
  lines.push(`Records with reviewed imageMetadata: ${report.mediaPreservation.recordsWithImageMetadata}`);
  lines.push(`Records with sources[]: ${report.sourcesPreservation.recordsWithSources}`);
  lines.push("");

  lines.push(`Potential duplicate/related records flagged: ${report.potentialDuplicates.length}`);
  for (const warning of report.potentialDuplicates) {
    lines.push(
      `  - ${warning.type}: ${warning.recordA.id} (${warning.recordA.sourceCategory}) <-> `
      + `${warning.recordB.id} (${warning.recordB.sourceCategory}) `
      + `[shared: ${warning.sharedTokens.join(", ")}; suggested relationship: ${warning.suggestedRelationshipType}]`,
    );
  }
  lines.push("");

  lines.push("FIRESTORE WRITES: 0");
  lines.push("CLOUD STORAGE RESOURCES CREATED: 0");
  lines.push("DATA/ARCHIVE.JSON MODIFIED: NO");

  return lines.join("\n");
}

async function writeOutputFile(report, output, force) {
  const outputPath = path.resolve(output);

  if (outputPath === path.resolve(archivePath)) {
    throw new Error("--output must not point at data/archive.json.");
  }

  const alreadyExists = await fs.access(outputPath).then(() => true).catch(() => false);
  if (alreadyExists && !force) {
    throw new Error(`${outputPath} already exists. Re-run with --force to overwrite it.`);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\nWrote migration preview JSON to ${outputPath} (data/archive.json was not touched).`);
}

async function main() {
  const { apply, force, output } = parseArgs(process.argv.slice(2));

  if (apply) {
    console.error(
      "[Migration] --apply is not implemented. This tool is dry-run only and will never write to "
      + "Firestore, Cloud Storage, or data/archive.json. Remove --apply and re-run.",
    );
    process.exitCode = 1;
    return;
  }

  const archive = assertValidArchive(JSON.parse(await fs.readFile(archivePath, "utf-8")));
  const report = buildMigrationReport(archive);

  console.log(formatReport(report));

  if (output) {
    await writeOutputFile(report, output, force);
  }

  if (!report.validation.allValid) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[Migration] ${error.message}`);
  process.exitCode = 1;
});
