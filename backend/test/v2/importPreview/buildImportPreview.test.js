// Integration test for the full import-preview pipeline, using small
// synthetic research files written to a temporary directory — never the
// real (gitignored, uncommitted) research-input/ content. Fixture ids are
// obviously fictional (e.g. "hist-test-1"), except where a fixture
// deliberately reuses a REAL mapped v1 slug ("habib-i-neccar-camii") to
// prove the collision-detection code path actually rejects it.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { buildImportPreview } from "../../../v2/importPreview/buildImportPreview.js";

async function withTempDir(context) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-import-preview-"));
  context.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

const PART1 = [
  "# Test dataset",
  "",
  '```yaml id="meta"',
  "dataset:",
  "  id: test-dataset",
  "  status: inReview",
  "```",
  "",
  '```yaml id="h1"',
  "id: hist-test-1",
  "slug: test-historical-context-one",
  "entityType: historicalContext",
  "status: inReview",
  "evidenceType: [verifiedHistorical]",
  "title:",
  "  en: Test Historical Context",
  "summary:",
  "  en: A summary.",
  "sourceIds: [source-test-1]",
  "```",
  "",
  '```yaml id="c1"',
  "id: comm-test-1",
  "slug: test-community-one",
  "entityType: community",
  "status: published",
  "evidenceType: [verifiedHistorical]",
  "title:",
  "  en: Test Community",
  "sourceIds: [source-test-1]",
  "```",
  "",
  '```yaml id="b1"',
  "id: belief-test-1",
  "slug: test-belief-one",
  "entityType: belief",
  "status: draft",
  "evidenceType: [religiousTradition]",
  "title:",
  "  en: Test Belief",
  "sourceIds: []",
  "```",
].join("\n");

const PART2 = [
  '```yaml id="p1"',
  "id: place-test-1",
  "slug: test-place-one",
  "entityType: place",
  "status: inReview",
  "evidenceType: [verifiedHistorical]",
  "title:",
  "  en: Test Place",
  "coordinates: NEEDS VERIFICATION",
  "sourceIds: []",
  "```",
  "",
  '```yaml id="s1"',
  "id: structure-test-1",
  "slug: test-structure-one",
  "entityType: structure",
  "status: inReview",
  "evidenceType: [verifiedHistorical]",
  "title:",
  "  en: Test Structure",
  "structureType: testType",
  "sourceIds: []",
  "```",
  "",
  // Deliberately collides with the real v1-mapped structure slug (st1) to
  // prove the collision guard actually rejects it, end to end.
  '```yaml id="collide"',
  "id: structure-test-collide",
  "slug: habib-i-neccar-camii",
  "entityType: structure",
  "status: published",
  "evidenceType: [verifiedHistorical]",
  "title:",
  "  en: Colliding Structure",
  "sourceIds: []",
  "```",
].join("\n");

const PART3 = [
  '```yaml id="st1"',
  "id: story-test-1",
  "slug: test-story-one",
  "entityType: story",
  "status: published",
  "storyRecordType: publishedOralHistorySource",
  "evidenceType: [oralHistory]",
  "title:",
  "  en: Test Story",
  "category: dailyLife",
  "sourceIds: [source-test-1]",
  "```",
  "",
  '```yaml id="st2"',
  "id: story-test-2",
  "slug: test-story-two",
  "entityType: story",
  "status: draft",
  "storyRecordType: ORAL_HISTORY_LEAD",
  "evidenceType: [oralHistory]",
  "title:",
  "  en: Test Lead",
  "sourceIds: []",
  "```",
  "",
  '```yaml id="m1"',
  "id: music-test-1",
  "slug: test-music-one",
  "entityType: music",
  "status: inReview",
  "evidenceType: [oralHistory]",
  "title:",
  "  en: Test Music",
  "genre: test genre",
  "sourceIds: []",
  "```",
].join("\n");

const PART4 = [
  "============================================================",
  "J. MEDIA ASSETS",
  "============================================================",
  "",
  "mediaRegistryStatus:",
  "  note: test",
  "",
  "---",
  "mediaId: media-test-1",
  "mediaType: historicalPhoto",
  "rightsStatus: NEEDS_VERIFICATION",
  "safeToPublish: false",
  "",
  "============================================================",
  "K. SOURCES",
  "============================================================",
  "",
  "sourceRegistryStatus:",
  "  note: test",
  "",
  "---",
  "sourceId: source-test-1",
  "type: academicArticle",
  "title: Test Source",
  "year: 2024",
  "",
  "============================================================",
  "L. RELATIONSHIPS",
  "============================================================",
  "",
  "relationshipGenerationPolicy:",
  "  automaticInverseEdges: false",
  "",
  "---",
  "relationshipId: relationship-test-1",
  "sourceEntityId: story-test-1",
  "sourceType: story",
  "type: associatedWith",
  "targetEntityId: place-test-1",
  "targetType: place",
  "evidenceSourceIds: [source-test-1]",
  "",
  "---",
  "relationshipId: relationship-test-orphan",
  "sourceEntityId: story-test-1",
  "sourceType: story",
  "type: associatedWith",
  "targetEntityId: does-not-exist",
  "targetType: place",
  "",
  "---",
  // Targets the same fixture candidate the collision tests below use
  // (structure-test-collide). By default (no injected loadReplacements) this
  // stays excluded as an orphan, exactly like relationship-test-orphan,
  // since structure-test-collide is normally excluded as a collision. Tests
  // that inject a confirmed replacement for structure-test-collide prove it
  // resolves once that candidate is included instead.
  "relationshipId: relationship-test-collide-target",
  "sourceEntityId: story-test-1",
  "sourceType: story",
  "type: associatedWith",
  "targetEntityId: structure-test-collide",
  "targetType: structure",
  "evidenceSourceIds: [source-test-1]",
].join("\n");

const PART5 = [
  "============================================================",
  "M. DUPLICATE / ENTITY RESOLUTION LOG",
  "============================================================",
  "",
  "---",
  "note: none",
  "",
  "============================================================",
  "N. RIGHTS / COPYRIGHT ISSUES",
  "============================================================",
  "",
  "---",
  "note: none",
  "",
  "============================================================",
  "O. UNRESOLVED QUESTIONS",
  "============================================================",
  "",
  "---",
  "note: none",
  "",
  "============================================================",
  "P. DATASET QUALITY REPORT",
  "============================================================",
  "",
  "---",
  "status: test",
].join("\n");

const REGISTRY_RECOVERY = [
  "============================================================",
  "1. RESTORED SOURCE RECORDS",
  "============================================================",
  "",
  "No sources restored in this fixture.",
  "",
  "============================================================",
  "2. UNRESOLVED SOURCE IDS",
  "============================================================",
  "",
  "unresolvedSourceIds:",
  "  - source-test-1",
  "",
  "unrecoveredRegistryRecordCount: 0",
  "",
  "============================================================",
  "4. RESTORED MEDIA RECORDS",
  "============================================================",
  "",
  "No media restored in this fixture.",
  "",
  "============================================================",
  "7. RELATIONSHIP EVIDENCE CORRECTIONS",
  "============================================================",
  "",
  "No corrections in this fixture.",
].join("\n");

async function writeFixtureFiles(dir) {
  await Promise.all([
    fs.writeFile(path.join(dir, "antiochiaarchive_master_dataset_part1.txt"), PART1, "utf-8"),
    fs.writeFile(path.join(dir, "antiochiaarchive_master_dataset_part2.txt"), PART2, "utf-8"),
    fs.writeFile(path.join(dir, "antiochiaarchive_master_dataset_part3.txt"), PART3, "utf-8"),
    fs.writeFile(path.join(dir, "antiochiaarchive_master_dataset_part4_regenerated.txt"), PART4, "utf-8"),
    fs.writeFile(path.join(dir, "antiochiaarchive_master_dataset_part5_regenerated.txt"), PART5, "utf-8"),
    fs.writeFile(path.join(dir, "registry_recovery.txt"), REGISTRY_RECOVERY, "utf-8"),
  ]);
}

test("buildImportPreview produces zero invalid records against a valid synthetic fixture set", async (context) => {
  const dir = await withTempDir(context);
  await writeFixtureFiles(dir);

  const result = await buildImportPreview({ researchDir: dir });

  const allExcluded = [
    ...result.report.excludedEntities, ...result.report.excludedSources,
    ...result.report.excludedMedia, ...result.report.excludedRelationships,
  ];
  const invalid = allExcluded.filter((item) => item.reason === "schemaInvalid" || item.reason === "normalizationError");
  assert.deepEqual(invalid, []);
});

test("buildImportPreview excludes a record whose slug collides with a real mapped v1 entity", async (context) => {
  const dir = await withTempDir(context);
  await writeFixtureFiles(dir);

  const result = await buildImportPreview({ researchDir: dir });

  assert.equal(result.entities.some((e) => e.id === "structure-test-collide"), false);
  const excluded = result.report.excludedEntities.find((e) => e.id === "structure-test-collide");
  assert.ok(excluded);
  assert.equal(excluded.reason, "slugCollision");
  assert.match(excluded.detail, /habib-i-neccar-camii/);
});

test("a confirmed legacy replacement lets a colliding candidate be included instead of excluded, and unblocks its relationship", async (context) => {
  const dir = await withTempDir(context);
  await writeFixtureFiles(dir);

  const loadReplacements = async () => [
    { legacyMappedEntityId: "st1", canonicalNativeEntityId: "structure-test-collide", reason: "test: confirmed supersession" },
  ];

  const result = await buildImportPreview({ researchDir: dir, loadReplacements });

  assert.equal(result.entities.some((e) => e.id === "structure-test-collide"), true);
  assert.equal(result.report.excludedEntities.some((e) => e.id === "structure-test-collide"), false);

  const applied = result.report.legacyReplacementAudit.appliedInThisBatch.find((a) => a.canonicalId === "structure-test-collide");
  assert.ok(applied);
  assert.deepEqual(applied.supersedesLegacyIds, ["st1"]);
  assert.equal(applied.resolvedViaCollision, true);

  // The relationship that used to be an orphan (because its target was
  // excluded) now resolves, with no relationship id rewrite.
  assert.equal(result.relationships.some((r) => r.id === "relationship-test-collide-target"), true);
  assert.equal(result.report.excludedRelationships.some((r) => r.id === "relationship-test-collide-target"), false);
});

test("an id/slug collision with NO confirmed replacement still hard-excludes, even when the replacement map is non-empty", async (context) => {
  const dir = await withTempDir(context);
  await writeFixtureFiles(dir);

  // Non-empty, but names a completely different legacy id/target pair —
  // must not loosen the unrelated structure-test-collide vs st1 collision.
  const loadReplacements = async () => [
    { legacyMappedEntityId: "m1", canonicalNativeEntityId: "music-test-unrelated", reason: "test: unrelated entry" },
  ];

  const result = await buildImportPreview({ researchDir: dir, loadReplacements });

  assert.equal(result.entities.some((e) => e.id === "structure-test-collide"), false);
  const excluded = result.report.excludedEntities.find((e) => e.id === "structure-test-collide");
  assert.ok(excluded);
  assert.equal(excluded.reason, "slugCollision");
});

test("a confirmed replacement with no raw id/slug collision is still surfaced as informational (structure-0020-vs-st4-style case)", async (context) => {
  const dir = await withTempDir(context);
  await writeFixtureFiles(dir);

  // music-test-1 has no id/slug collision with any mapped v1 entity at all —
  // mirrors the real structure-0020-vs-legacy-st4 gap the slug-only
  // collision detector used to miss entirely.
  const loadReplacements = async () => [
    { legacyMappedEntityId: "m1", canonicalNativeEntityId: "music-test-1", reason: "test: no-collision supersession" },
  ];

  const result = await buildImportPreview({ researchDir: dir, loadReplacements });

  assert.equal(result.entities.some((e) => e.id === "music-test-1"), true);
  const applied = result.report.legacyReplacementAudit.appliedInThisBatch.find((a) => a.canonicalId === "music-test-1");
  assert.ok(applied);
  assert.deepEqual(applied.supersedesLegacyIds, ["m1"]);
  assert.equal(applied.resolvedViaCollision, false);
});

test("buildImportPreview's sourceReferenceAudit never conflates distinct referenced sourceIds with source registry record count", async (context) => {
  const dir = await withTempDir(context);
  await writeFixtureFiles(dir);

  const result = await buildImportPreview({ researchDir: dir });
  const audit = result.report.sourceReferenceAudit;

  // Fixture: hist-test-1, comm-test-1, and story-test-1 all cite the same
  // single sourceId ("source-test-1") — so distinct references (A) is 1,
  // matching the single source registry record (B) in this small fixture.
  // The two metrics are still computed independently, so a fixture where
  // they happen to match doesn't hide a real conflation bug (see the real
  // dataset check below, where A=51 and B=22 differ).
  assert.equal(audit.distinctSourceIdsReferencedByCulturalEntities, 1);
  assert.equal(audit.sourceRegistryRecordsRepresented, 1);
  assert.equal(typeof audit.identityLevelRestoredSources, "number");
  assert.equal(typeof audit.contextOnlySources, "number");
  assert.equal(typeof audit.bibliographicallyUnresolvedReferencedSourceIds, "number");
  assert.equal(typeof audit.unrecoverableLegacySourceRecords, "number");
  assert.match(audit.note, /must never be conflated/);

  // The old ambiguous field name is gone; the new one is unambiguous.
  assert.equal(Object.hasOwn(result.report.inputCounts, "sources"), false);
  assert.equal(typeof result.report.inputCounts.sourceRegistryRecords, "number");
});

test("buildImportPreview excludes an orphan relationship referencing an unknown entity", async (context) => {
  const dir = await withTempDir(context);
  await writeFixtureFiles(dir);

  const result = await buildImportPreview({ researchDir: dir });

  assert.equal(result.relationships.some((r) => r.id === "relationship-test-orphan"), false);
  const excluded = result.report.excludedRelationships.find((r) => r.id === "relationship-test-orphan");
  assert.ok(excluded);
  assert.equal(excluded.reason, "orphanTarget");
});

test("buildImportPreview includes a valid relationship between two included entities", async (context) => {
  const dir = await withTempDir(context);
  await writeFixtureFiles(dir);

  const result = await buildImportPreview({ researchDir: dir });
  const included = result.relationships.find((r) => r.id === "relationship-test-1");
  assert.ok(included);
  assert.equal(included.status, "inReview");
});

test("buildImportPreview downgrades 'published' status when the entity's source citation is unresolved", async (context) => {
  const dir = await withTempDir(context);
  await writeFixtureFiles(dir);

  const result = await buildImportPreview({ researchDir: dir });
  const comm1 = result.entities.find((e) => e.id === "comm-test-1");
  assert.ok(comm1);
  // source-test-1 is not in IDENTITY_RESOLVED_SOURCE_IDS, so 'published' must be downgraded.
  assert.equal(comm1.status, "inReview");
  assert.ok(result.report.publicationStatus.downgraded.some((d) => d.id === "comm-test-1"));
});

test("buildImportPreview forces status 'draft' for an ORAL_HISTORY_LEAD story regardless of research status", async (context) => {
  const dir = await withTempDir(context);
  await writeFixtureFiles(dir);

  const result = await buildImportPreview({ researchDir: dir });
  const lead = result.entities.find((e) => e.id === "story-test-2");
  assert.ok(lead);
  assert.equal(lead.status, "draft");
  assert.equal(lead.storyRecordType, "oralHistoryLead");
  assert.ok(result.report.storyClassification.oralHistoryLeadIds.includes("story-test-2"));
});

test("buildImportPreview fails loudly (does not silently treat as empty) when a research file is missing", async (context) => {
  const dir = await withTempDir(context);
  await writeFixtureFiles(dir);
  await fs.rm(path.join(dir, "registry_recovery.txt"));

  await assert.rejects(
    buildImportPreview({ researchDir: dir }),
    /Missing research input file.*registry_recovery\.txt/s,
  );
});

test("buildImportPreview never assigns 'published' unless the full source citation is identity-resolved", async (context) => {
  const dir = await withTempDir(context);
  await writeFixtureFiles(dir);

  const result = await buildImportPreview({ researchDir: dir });
  for (const entity of result.entities) {
    if (entity.status === "published") {
      const sourceIds = entity.researchExtensions?.sourceIds || [];
      for (const sourceId of sourceIds) {
        assert.ok(
          ["source-0030", "source-0046", "source-0056"].includes(sourceId),
          `entity ${entity.id} is published with unresolved source ${sourceId}`,
        );
      }
    }
  }
});
