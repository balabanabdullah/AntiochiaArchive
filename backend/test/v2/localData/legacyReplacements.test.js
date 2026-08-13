// Unit tests for the legacy replacement loader/validator/classifier, using
// temporary fixture files — never the real (committed) data/v2/
// legacyReplacements.json. Fixture ids are obviously fictional except where
// a mapped-v1 id is needed to exercise "must exist in the mapped baseline".

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { loadLegacyReplacements, classifyLegacyReplacements } from "../../../v2/localData/legacyReplacements.js";

async function withTempDir(context) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-legacy-replacements-"));
  context.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

async function writeReplacementsFile(dir, data) {
  const filePath = path.join(dir, "legacyReplacements.json");
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  return filePath;
}

const MAPPED_ENTITIES = Object.freeze([
  { id: "st1", slug: "habib-i-neccar-camii", entityType: "structure" },
  { id: "b1", slug: "habib-i-neccar-turbesi", entityType: "structure" },
  { id: "st4", slug: "antakya-evleri", entityType: "structure" },
]);

test("a well-formed replacement entry loads successfully", async (context) => {
  const dir = await withTempDir(context);
  const filePath = await writeReplacementsFile(dir, {
    replacements: [
      { legacyMappedEntityId: "st1", canonicalNativeEntityId: "structure-0001", reason: "test evidence" },
    ],
  });

  const replacements = await loadLegacyReplacements({ filePath, mappedEntities: MAPPED_ENTITIES });
  assert.equal(replacements.length, 1);
  assert.equal(replacements[0].legacyMappedEntityId, "st1");
  assert.equal(replacements[0].canonicalNativeEntityId, "structure-0001");
});

test("many-to-one is allowed (two legacy ids superseded by the same canonical id, each with its own documented reason)", async (context) => {
  const dir = await withTempDir(context);
  const filePath = await writeReplacementsFile(dir, {
    replacements: [
      { legacyMappedEntityId: "st1", canonicalNativeEntityId: "structure-0003", reason: "merge case A" },
      { legacyMappedEntityId: "b1", canonicalNativeEntityId: "structure-0003", reason: "merge case B" },
    ],
  });

  const replacements = await loadLegacyReplacements({ filePath, mappedEntities: MAPPED_ENTITIES });
  assert.equal(replacements.length, 2);
  assert.deepEqual(replacements.map((r) => r.canonicalNativeEntityId), ["structure-0003", "structure-0003"]);
});

test("rejects an unknown field", async (context) => {
  const dir = await withTempDir(context);
  const filePath = await writeReplacementsFile(dir, {
    replacements: [
      { legacyMappedEntityId: "st1", canonicalNativeEntityId: "structure-0001", reason: "test", extra: "nope" },
    ],
  });

  await assert.rejects(
    loadLegacyReplacements({ filePath, mappedEntities: MAPPED_ENTITIES }),
    /unknown field\(s\): extra/,
  );
});

test("rejects a missing reason", async (context) => {
  const dir = await withTempDir(context);
  const filePath = await writeReplacementsFile(dir, {
    replacements: [{ legacyMappedEntityId: "st1", canonicalNativeEntityId: "structure-0001" }],
  });

  await assert.rejects(
    loadLegacyReplacements({ filePath, mappedEntities: MAPPED_ENTITIES }),
    /reason is required/,
  );
});

test("rejects an empty-string reason", async (context) => {
  const dir = await withTempDir(context);
  const filePath = await writeReplacementsFile(dir, {
    replacements: [{ legacyMappedEntityId: "st1", canonicalNativeEntityId: "structure-0001", reason: "   " }],
  });

  await assert.rejects(
    loadLegacyReplacements({ filePath, mappedEntities: MAPPED_ENTITIES }),
    /reason is required/,
  );
});

test("rejects a malformed canonicalNativeEntityId", async (context) => {
  const dir = await withTempDir(context);
  const filePath = await writeReplacementsFile(dir, {
    replacements: [{ legacyMappedEntityId: "st1", canonicalNativeEntityId: "Structure_1", reason: "test" }],
  });

  await assert.rejects(
    loadLegacyReplacements({ filePath, mappedEntities: MAPPED_ENTITIES }),
    /canonicalNativeEntityId must be a valid canonical research id/,
  );
});

test("rejects self-replacement", async (context) => {
  const dir = await withTempDir(context);
  const filePath = await writeReplacementsFile(dir, {
    // Contrived: a mapped entity whose id happens to already look like a
    // canonical id, purely to exercise the self-replacement guard in
    // isolation from the (unrelated) id-format check.
    replacements: [{ legacyMappedEntityId: "structure-0001", canonicalNativeEntityId: "structure-0001", reason: "test" }],
  });

  await assert.rejects(
    loadLegacyReplacements({
      filePath,
      mappedEntities: [...MAPPED_ENTITIES, { id: "structure-0001", slug: "self-test", entityType: "structure" }],
    }),
    /self-replacement/,
  );
});

test("rejects a duplicate legacyMappedEntityId (contradictory mapping)", async (context) => {
  const dir = await withTempDir(context);
  const filePath = await writeReplacementsFile(dir, {
    replacements: [
      { legacyMappedEntityId: "st1", canonicalNativeEntityId: "structure-0001", reason: "a" },
      { legacyMappedEntityId: "st1", canonicalNativeEntityId: "structure-0099", reason: "b" },
    ],
  });

  await assert.rejects(
    loadLegacyReplacements({ filePath, mappedEntities: MAPPED_ENTITIES }),
    /is listed more than once/,
  );
});

test("rejects a legacyMappedEntityId not present in the mapped v1 baseline", async (context) => {
  const dir = await withTempDir(context);
  const filePath = await writeReplacementsFile(dir, {
    replacements: [{ legacyMappedEntityId: "does-not-exist", canonicalNativeEntityId: "structure-0001", reason: "test" }],
  });

  await assert.rejects(
    loadLegacyReplacements({ filePath, mappedEntities: MAPPED_ENTITIES }),
    /does not exist in the mapped v1 baseline/,
  );
});

test("rejects a malformed replacements file (not an object with a replacements array)", async (context) => {
  const dir = await withTempDir(context);
  const filePath = await writeReplacementsFile(dir, { notReplacements: [] });

  await assert.rejects(
    loadLegacyReplacements({ filePath, mappedEntities: MAPPED_ENTITIES }),
    /must be a JSON object with a 'replacements' array/,
  );
});

test("a missing file fails loudly rather than being treated as empty", async (context) => {
  const dir = await withTempDir(context);
  const filePath = path.join(dir, "does-not-exist.json");

  await assert.rejects(
    loadLegacyReplacements({ filePath, mappedEntities: MAPPED_ENTITIES }),
    /file is missing/,
  );
});

test("classifyLegacyReplacements: no native entities means every entry is pending, none active", () => {
  const replacements = [
    { legacyMappedEntityId: "st1", canonicalNativeEntityId: "structure-0001", reason: "test" },
    { legacyMappedEntityId: "st4", canonicalNativeEntityId: "structure-0020", reason: "test" },
  ];
  const { active, pending, activeLegacyIdsToSuppress } = classifyLegacyReplacements(replacements, []);
  assert.deepEqual(active, []);
  assert.equal(pending.length, 2);
  assert.equal(activeLegacyIdsToSuppress.size, 0);
});

test("classifyLegacyReplacements: a replacement whose canonical target exists in native entities is active", () => {
  const replacements = [
    { legacyMappedEntityId: "st1", canonicalNativeEntityId: "structure-0001", reason: "test" },
    { legacyMappedEntityId: "st4", canonicalNativeEntityId: "structure-0020", reason: "test" },
  ];
  const nativeEntities = [{ id: "structure-0001", entityType: "structure" }];
  const { active, pending, activeLegacyIdsToSuppress } = classifyLegacyReplacements(replacements, nativeEntities);
  assert.deepEqual(active.map((e) => e.legacyMappedEntityId), ["st1"]);
  assert.deepEqual(pending.map((e) => e.legacyMappedEntityId), ["st4"]);
  assert.deepEqual([...activeLegacyIdsToSuppress], ["st1"]);
});
