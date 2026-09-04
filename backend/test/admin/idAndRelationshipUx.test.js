// "no-code CMS UX" round: end-to-end proof of Part A (safe automatic id
// recommendation, wired all the way through createEntity()) and Part B
// (context-aware simple relationships), against the real SQLite runtime —
// not fixtures for these two, since the exact goal is proving the backend
// stays authoritative end-to-end.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { closeSqlite } from "../../db/sqliteConnection.js";
import { sqliteV2Store } from "../../v2/stores/sqliteV2Store.js";
import {
  createEntity, publishEntity, archiveEntity, deleteEntityPermanently, getSuggestedNextId,
  ContentValidationError, ContentConflictError,
} from "../../admin/contentService.js";
import {
  getAvailableRelationshipActions, searchRelationshipTargets, previewSimpleRelationship, createSimpleRelationship,
  listRelationshipsForEntity,
} from "../../admin/relationshipUxService.js";

async function withInitializedRuntime(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-id-rel-ux-"));
  const originalPath = process.env.SQLITE_DB_PATH;
  const originalStorageRoot = process.env.LOCAL_STORAGE_ROOT;
  process.env.SQLITE_DB_PATH = path.join(dir, "test.db");
  process.env.LOCAL_STORAGE_ROOT = path.join(dir, "storage");
  await sqliteV2Store.initialize();
  t.after(async () => {
    closeSqlite();
    if (originalPath === undefined) delete process.env.SQLITE_DB_PATH; else process.env.SQLITE_DB_PATH = originalPath;
    if (originalStorageRoot === undefined) delete process.env.LOCAL_STORAGE_ROOT; else process.env.LOCAL_STORAGE_ROOT = originalStorageRoot;
    await fs.rm(dir, { recursive: true, force: true });
  });
}

/* ---------------------------------------------------------------------- */
/* Part A — id recommendation, wired end-to-end through createEntity()     */
/* ---------------------------------------------------------------------- */

test("createEntity() auto-fills a suggested id when the caller omits one entirely — a nontechnical admin never has to invent one", async (t) => {
  await withInitializedRuntime(t);
  const created = createEntity({ entityType: "community", proposedFields: { slug: "test-community", title: { tr: "Test" } }, actor: "test" });
  assert.equal(created.id, "comm-0001");

  const second = createEntity({ entityType: "community", proposedFields: { slug: "test-community-2", title: { tr: "Test 2" } }, actor: "test" });
  assert.equal(second.id, "comm-0002");
});

test("GET-equivalent getSuggestedNextId() matches exactly what createEntity() would assign next", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { slug: "p1", title: { tr: "T" } }, actor: "test" });
  assert.equal(getSuggestedNextId("place"), "place-0002");
});

test("a manually-supplied, already-taken id is rejected with a 'clear retry response' — a fresh suggestedId attached to the conflict, no second round trip needed", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "belief", proposedFields: { id: "belief-0001", slug: "b1", title: { tr: "T" } }, actor: "test" });
  try {
    createEntity({ entityType: "belief", proposedFields: { id: "belief-0001", slug: "b2", title: { tr: "T2" } }, actor: "test" });
    assert.fail("must have thrown");
  } catch (error) {
    assert.ok(error instanceof ContentConflictError);
    assert.equal(error.suggestedId, "belief-0002");
  }
});

test("concurrent creates (fired together, no explicit id) never collide — every one gets a distinct id, the SQLite PRIMARY KEY remains the final guard", async (t) => {
  await withInitializedRuntime(t);
  const results = await Promise.all(
    Array.from({ length: 8 }, (_v, i) => Promise.resolve().then(() => createEntity({
      entityType: "structure", proposedFields: { slug: `s-${i}`, title: { tr: `T${i}` } }, actor: "test",
    }))),
  );
  const ids = results.map((r) => r.id);
  assert.equal(new Set(ids).size, 8, "all 8 created ids must be distinct");
});

test("an entity type with no id convention (media/page) still requires an explicit id from createEntity(), and getSuggestedNextId() refuses cleanly rather than guessing", async (t) => {
  await withInitializedRuntime(t);
  assert.throws(() => getSuggestedNextId("media"), ContentValidationError);
  assert.throws(() => createEntity({ entityType: "media", proposedFields: { mediaType: "image", mediaRole: "realArchiveMedia" }, actor: "test" }), ContentValidationError);
});

test("a permanently deleted id is never recycled by a later suggestion", async (t) => {
  await withInitializedRuntime(t);
  const created = createEntity({ entityType: "story", proposedFields: { slug: "s1", title: { tr: "T" } }, actor: "test" });
  assert.equal(created.id, "story-0001");
  deleteEntityPermanently({ id: created.id, actor: "test" });
  assert.equal(getSuggestedNextId("story"), "story-0002", "must never re-suggest story-0001 after it was permanently deleted");
});

/* ---------------------------------------------------------------------- */
/* Part B — the church/Christianity acceptance case (Section 10)           */
/* ---------------------------------------------------------------------- */

test("CHURCH ACCEPTANCE CASE: a Structure editor's 'İnançla ilişkilendir' action against a Belief search result creates the correct canonical relationship, direction-normalized, with zero raw id/type/direction knowledge required", async (t) => {
  await withInitializedRuntime(t);
  const church = createEntity({ entityType: "structure", proposedFields: { slug: "saint-paul-church", title: { tr: "Saint Paul Kilisesi", en: "Saint Paul Church" } }, actor: "test" });
  const christianity = createEntity({ entityType: "belief", proposedFields: { slug: "christianity", title: { tr: "Hristiyanlık", en: "Christianity" } }, actor: "test" });

  // 1. The editor asks "what actions are available for a structure?" —
  // this is what drives the "İlişki Ekle" button row.
  const actions = getAvailableRelationshipActions("structure");
  const belieftAction = actions.find((a) => a.targetType === "belief");
  assert.ok(belieftAction, "a structure editor must offer a belief-relating action");
  assert.equal(belieftAction.buttonLabel, "İnançla ilişkilendir");

  // 2. The admin types "Hristiyanlık" into the belief search box.
  const results = searchRelationshipTargets({ entityType: "belief", query: "Hristiyan" });
  assert.equal(results.length, 1);
  assert.equal(results[0].id, christianity.id);
  assert.equal(results[0].title, "Hristiyanlık");

  // 3. Preview before saving — a plain sentence, no JSON, no enum.
  const preview = previewSimpleRelationship({ currentEntityId: church.id, actionKey: belieftAction.actionKey, targetEntityId: christianity.id });
  assert.match(preview.sentence, /Hristiyanlık/);
  assert.match(preview.sentence, /Saint Paul Kilisesi/);
  assert.equal(preview.alreadyExists, false);

  // 4. Save — the canonical stored relation, normalized server-side.
  const { relationship, sentence } = createSimpleRelationship({ currentEntityId: church.id, actionKey: belieftAction.actionKey, targetEntityId: christianity.id, actor: "test" });
  assert.equal(relationship.type, "hasSite");
  // Direction normalization (Section 11): canonical storage is
  // belief --hasSite--> structure, EVEN THOUGH the UI action started from
  // the structure side — never the structure as source just because that
  // is where the click happened.
  assert.equal(relationship.sourceId, christianity.id);
  assert.equal(relationship.targetId, church.id);
  assert.equal(relationship.sourceType, "belief");
  assert.equal(relationship.targetType, "structure");
  assert.match(sentence, /Saint Paul Kilisesi/);
});

test("the SAME real-world fact reached from the OTHER side (editing the Belief, relating to the Structure) produces the identical canonical relationship, not a second inverse one", async (t) => {
  await withInitializedRuntime(t);
  const church = createEntity({ entityType: "structure", proposedFields: { slug: "church", title: { tr: "Kilise" } }, actor: "test" });
  const christianity = createEntity({ entityType: "belief", proposedFields: { slug: "christianity", title: { tr: "Hristiyanlık" } }, actor: "test" });

  const actions = getAvailableRelationshipActions("belief");
  const structureAction = actions.find((a) => a.targetType === "structure");
  assert.ok(structureAction);

  const { relationship } = createSimpleRelationship({ currentEntityId: christianity.id, actionKey: structureAction.actionKey, targetEntityId: church.id, actor: "test" });
  assert.equal(relationship.sourceId, christianity.id);
  assert.equal(relationship.targetId, church.id);
  assert.equal(relationship.type, "hasSite");
});

test("duplicate prevention: attempting the same canonical relationship twice (even initiated from opposite sides) is refused, not double-created", async (t) => {
  await withInitializedRuntime(t);
  const church = createEntity({ entityType: "structure", proposedFields: { slug: "church", title: { tr: "Kilise" } }, actor: "test" });
  const christianity = createEntity({ entityType: "belief", proposedFields: { slug: "christianity", title: { tr: "Hristiyanlık" } }, actor: "test" });

  const fromStructure = getAvailableRelationshipActions("structure").find((a) => a.targetType === "belief");
  const fromBelief = getAvailableRelationshipActions("belief").find((a) => a.targetType === "structure");

  createSimpleRelationship({ currentEntityId: church.id, actionKey: fromStructure.actionKey, targetEntityId: christianity.id, actor: "test" });

  // Same fact, same actionKey, same pair — a plain re-submission.
  assert.throws(
    () => createSimpleRelationship({ currentEntityId: church.id, actionKey: fromStructure.actionKey, targetEntityId: christianity.id, actor: "test" }),
    (error) => error instanceof ContentConflictError && error.message === "Bu ilişki zaten mevcut.",
  );

  // The exact same real-world fact, reached from the OTHER side — must
  // also be recognized as the identical canonical relationship, not a
  // "different" one that sneaks past duplicate detection.
  const previewFromOtherSide = previewSimpleRelationship({ currentEntityId: christianity.id, actionKey: fromBelief.actionKey, targetEntityId: church.id });
  assert.equal(previewFromOtherSide.alreadyExists, true);
  assert.throws(
    () => createSimpleRelationship({ currentEntityId: christianity.id, actionKey: fromBelief.actionKey, targetEntityId: church.id, actor: "test" }),
    ContentConflictError,
  );
});

test("target type filtering: searching while relating a Structure to 'İnançla ilişkilendir' never returns a place/community/structure — only beliefs", async (t) => {
  await withInitializedRuntime(t);
  createEntity({ entityType: "place", proposedFields: { slug: "antakya", title: { tr: "Antakya" } }, actor: "test" });
  createEntity({ entityType: "community", proposedFields: { slug: "some-community", title: { tr: "Bir Topluluk" } }, actor: "test" });
  createEntity({ entityType: "belief", proposedFields: { slug: "christianity", title: { tr: "Hristiyanlık" } }, actor: "test" });

  const results = searchRelationshipTargets({ entityType: "belief", query: "" });
  assert.ok(results.every((r) => r.entityType === "belief"));
  assert.equal(results.length, 1);
});

test("Section 22: source/target ids cannot be spoofed into an invalid type pairing — a belief-search action fed a place id server-side is rejected, even with a technically-valid actionKey", async (t) => {
  await withInitializedRuntime(t);
  const church = createEntity({ entityType: "structure", proposedFields: { slug: "church", title: { tr: "Kilise" } }, actor: "test" });
  const antakya = createEntity({ entityType: "place", proposedFields: { slug: "antakya", title: { tr: "Antakya" } }, actor: "test" });
  const beliefAction = getAvailableRelationshipActions("structure").find((a) => a.targetType === "belief");

  assert.throws(
    () => createSimpleRelationship({ currentEntityId: church.id, actionKey: beliefAction.actionKey, targetEntityId: antakya.id, actor: "test" }),
    ContentValidationError,
  );
});

test("Section 22: an actionKey is also rejected when the CURRENT entity's real type does not match what the action expects (never trusts a claimed type)", async (t) => {
  await withInitializedRuntime(t);
  const antakya = createEntity({ entityType: "place", proposedFields: { slug: "antakya", title: { tr: "Antakya" } }, actor: "test" });
  const christianity = createEntity({ entityType: "belief", proposedFields: { slug: "christianity", title: { tr: "Hristiyanlık" } }, actor: "test" });
  // This actionKey is only valid when the CURRENT entity is a structure.
  const structureBeliefAction = getAvailableRelationshipActions("structure").find((a) => a.targetType === "belief");

  assert.throws(
    () => createSimpleRelationship({ currentEntityId: antakya.id, actionKey: structureBeliefAction.actionKey, targetEntityId: christianity.id, actor: "test" }),
    ContentValidationError,
  );
});

test("archived targets are excluded from search by default (Section 15)", async (t) => {
  await withInitializedRuntime(t);
  const created = createEntity({ entityType: "belief", proposedFields: { slug: "old-belief", title: { tr: "Eski İnanç" } }, actor: "test" });
  publishEntity({ id: created.id, actor: "test" });
  archiveEntity({ id: created.id, actor: "test" });

  const results = searchRelationshipTargets({ entityType: "belief", query: "" });
  assert.equal(results.length, 0, "an archived belief must not appear as a normal relationship target");

  const explicit = searchRelationshipTargets({ entityType: "belief", query: "", includeArchived: true });
  assert.equal(explicit.length, 1, "explicitly asking to include archived records still works");
});

test("a preview/create request never lets an entity relate to itself", async (t) => {
  await withInitializedRuntime(t);
  const church = createEntity({ entityType: "structure", proposedFields: { slug: "church", title: { tr: "Kilise" } }, actor: "test" });
  const action = getAvailableRelationshipActions("structure")[0];
  assert.throws(
    () => previewSimpleRelationship({ currentEntityId: church.id, actionKey: action.actionKey, targetEntityId: church.id }),
    ContentValidationError,
  );
});

/* ---------------------------------------------------------------------- */
/* "UX refinement" round, Issue 1 — the entity editor's relationship card   */
/* list (listRelationshipsForEntity): resolved titles, human relation      */
/* labels, missing-target safety, and no reliance on the nonexistent       */
/* single-entity GET route the bug actually came from.                     */
/* ---------------------------------------------------------------------- */

test("listRelationshipsForEntity resolves the real title as primary content — never a raw id — for both directions", async (t) => {
  await withInitializedRuntime(t);
  const church = createEntity({ entityType: "structure", proposedFields: { slug: "church", title: { tr: "Beşikli Mağara" } }, actor: "test" });
  const christianity = createEntity({ entityType: "belief", proposedFields: { slug: "christianity", title: { tr: "Hristiyanlık" } }, actor: "test" });
  const action = getAvailableRelationshipActions("structure").find((a) => a.targetType === "belief");
  createSimpleRelationship({ currentEntityId: church.id, actionKey: action.actionKey, targetEntityId: christianity.id, actor: "test" });

  const fromStructure = listRelationshipsForEntity(church.id);
  assert.equal(fromStructure.length, 1);
  assert.equal(fromStructure[0].otherEntity.title, "Hristiyanlık");
  assert.equal(fromStructure[0].otherEntity.entityType, "belief");
  assert.equal(fromStructure[0].relationLabel, "İnanç");
  assert.match(fromStructure[0].removalSentence, /Beşikli Mağara/);
  assert.match(fromStructure[0].removalSentence, /Hristiyanlık/);

  const fromBelief = listRelationshipsForEntity(christianity.id);
  assert.equal(fromBelief[0].otherEntity.title, "Beşikli Mağara");
  assert.equal(fromBelief[0].relationLabel, "İnanç yapısı / kutsal alanı");
});

test("a dangling relationship (other side missing) is reported explicitly, never silently as a normal chip with only a raw id", async (t) => {
  await withInitializedRuntime(t);
  const church = createEntity({ entityType: "structure", proposedFields: { slug: "church", title: { tr: "Kilise" } }, actor: "test" });
  const ghost = createEntity({ entityType: "belief", proposedFields: { slug: "ghost", title: { tr: "Geçici" } }, actor: "test" });
  const action = getAvailableRelationshipActions("structure").find((a) => a.targetType === "belief");
  createSimpleRelationship({ currentEntityId: church.id, actionKey: action.actionKey, targetEntityId: ghost.id, actor: "test" });

  // Two real, independent safety nets already make a dangling reference
  // unreachable through any normal code path: contentService.js's own
  // "still referenced" dependency check, AND a real SQL
  // `FOREIGN KEY ... ON DELETE RESTRICT` constraint at the schema level.
  // Simulating the one way this could still exist in practice — external
  // data corruption/a migration bug — requires bypassing BOTH on purpose,
  // exactly the way this test's own comment says.
  const { getSqlite } = await import("../../db/sqliteConnection.js");
  const { deleteEntityRow } = await import("../../db/repositories/entityRepository.js");
  getSqlite().pragma("foreign_keys = OFF");
  deleteEntityRow(ghost.id);
  getSqlite().pragma("foreign_keys = ON");

  const results = listRelationshipsForEntity(church.id);
  assert.equal(results.length, 1);
  assert.equal(results[0].otherEntity, null);
  assert.equal(results[0].missingTargetId, ghost.id);
  assert.equal(results[0].removalSentence, null);
});

test("listRelationshipsForEntity does not perform an N+1 HTTP-shaped call per row — it is one function call returning every row fully resolved", async (t) => {
  await withInitializedRuntime(t);
  const church = createEntity({ entityType: "structure", proposedFields: { slug: "church", title: { tr: "Kilise" } }, actor: "test" });
  for (let i = 0; i < 5; i += 1) {
    const belief = createEntity({ entityType: "belief", proposedFields: { slug: `belief-${i}`, title: { tr: `İnanç ${i}` } }, actor: "test" });
    const action = getAvailableRelationshipActions("structure").find((a) => a.targetType === "belief");
    createSimpleRelationship({ currentEntityId: church.id, actionKey: action.actionKey, targetEntityId: belief.id, actor: "test" });
  }
  const results = listRelationshipsForEntity(church.id);
  assert.equal(results.length, 5);
  assert.ok(results.every((r) => r.otherEntity && r.otherEntity.title.startsWith("İnanç")));
});

test("only real, existing RELATIONSHIP_TYPES enum values are ever used by the compatibility matrix — no invented relation type", async () => {
  const { RELATIONSHIP_TYPES } = await import("../../v2/constants/vocabularies.js");
  const usedTypes = new Set();
  for (const entityType of ["structure", "belief", "community", "place", "story", "music", "proverb", "historicalContext", "media", "source"]) {
    for (const action of getAvailableRelationshipActions(entityType)) {
      const parsed = action.actionKey.split(":")[0];
      usedTypes.add(parsed);
    }
  }
  for (const type of usedTypes) assert.ok(RELATIONSHIP_TYPES.includes(type), `'${type}' must be a real vocabulary value`);
});
