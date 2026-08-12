import test from "node:test";
import assert from "node:assert/strict";
import { detectPotentialDuplicates } from "../../../v2/migration/detectRelatedRecords.js";

function entityRecord(overrides) {
  return {
    entity: {
      sourceRecordId: overrides.id,
      slug: overrides.slug,
      sourceCategory: overrides.sourceCategory,
      entityType: overrides.entityType || "structure",
    },
  };
}

test("flags a cross-category slug-token overlap as a potential duplicate/related record", () => {
  const records = [
    entityRecord({ id: "st1", slug: "habib-i-neccar-camii", sourceCategory: "structures" }),
    entityRecord({ id: "b1", slug: "habib-i-neccar-turbesi", sourceCategory: "beliefs" }),
  ];
  const warnings = detectPotentialDuplicates(records);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].type, "POTENTIAL_DUPLICATE_OR_RELATED_ENTITY");
  assert.deepEqual(warnings[0].sharedTokens.sort(), ["habib", "neccar"]);
  assert.equal(warnings[0].recordA.id, "st1");
  assert.equal(warnings[0].recordB.id, "b1");
});

test("does not flag records within the same source category", () => {
  const records = [
    entityRecord({ id: "st1", slug: "habib-i-neccar-camii", sourceCategory: "structures" }),
    entityRecord({ id: "st2", slug: "habib-i-neccar-annex", sourceCategory: "structures" }),
  ];
  assert.deepEqual(detectPotentialDuplicates(records), []);
});

test("does not flag records with no shared significant slug token", () => {
  const records = [
    entityRecord({ id: "h1", slug: "antik-akdeniz-kavsagi-antakya", sourceCategory: "history" }),
    entityRecord({ id: "m1", slug: "mezopotamya-ezgileri", sourceCategory: "music" }),
  ];
  assert.deepEqual(detectPotentialDuplicates(records), []);
});

test("generic stopwords (antakya, ve, short tokens) do not trigger false positives", () => {
  const records = [
    entityRecord({ id: "h3", slug: "antakya-kimligini-korumak", sourceCategory: "history" }),
    entityRecord({ id: "st4", slug: "antakya-evleri", sourceCategory: "structures" }),
  ];
  assert.deepEqual(detectPotentialDuplicates(records), []);
});

test("suggests 'depicts' when one side is a media entity, otherwise 'associatedWith'", () => {
  const mediaPair = detectPotentialDuplicates([
    entityRecord({ id: "st1", slug: "habib-i-neccar-camii", sourceCategory: "structures", entityType: "structure" }),
    entityRecord({ id: "g4", slug: "habib-i-neccar-camii-minaresi", sourceCategory: "gallery", entityType: "media" }),
  ]);
  assert.equal(mediaPair[0].suggestedRelationshipType, "depicts");

  const nonMediaPair = detectPotentialDuplicates([
    entityRecord({ id: "st1", slug: "habib-i-neccar-camii", sourceCategory: "structures", entityType: "structure" }),
    entityRecord({ id: "b1", slug: "habib-i-neccar-turbesi", sourceCategory: "beliefs", entityType: "structure" }),
  ]);
  assert.equal(nonMediaPair[0].suggestedRelationshipType, "associatedWith");
});

test("never merges or drops records — every input id is still present after detection", () => {
  const records = [
    entityRecord({ id: "st1", slug: "habib-i-neccar-camii", sourceCategory: "structures" }),
    entityRecord({ id: "b1", slug: "habib-i-neccar-turbesi", sourceCategory: "beliefs" }),
    entityRecord({ id: "g4", slug: "habib-i-neccar-camii-minaresi", sourceCategory: "gallery", entityType: "media" }),
  ];
  detectPotentialDuplicates(records);
  assert.deepEqual(records.map((r) => r.entity.sourceRecordId), ["st1", "b1", "g4"]);
});
