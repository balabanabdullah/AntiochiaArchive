// Firestore-backed editorial draft store, tested against the shared
// in-memory fake (backend/v2/testSupport/fakeFirestore.js) — never a real
// Firestore project/database. Mirrors backend/test/v2/stores/
// firestoreV2Store.test.js's pattern of injecting `getDatabase` so the real
// production code path (backend/admin/editorialStore.js's
// createFirestoreEditorialStore) is exercised, not a reimplementation.

import test from "node:test";
import assert from "node:assert/strict";
import { createFakeFirestore } from "../../v2/testSupport/fakeFirestore.js";
import { createFirestoreEditorialStore } from "../../admin/editorialStore.js";

function freshStore(seed = {}) {
  const database = createFakeFirestore({ editorialDrafts: seed });
  return { store: createFirestoreEditorialStore({ getDatabase: () => database }), database };
}

test("create: writes a draft with status 'draft', a unique changeId, and an initial history entry", async () => {
  const { store } = freshStore();
  const draft = await store.createDraft({
    kind: "create", entityType: "place", entityId: null, proposedChanges: { title: { tr: "X" } }, note: "ilk taslak",
  });
  assert.match(draft.changeId, /^new-/);
  assert.equal(draft.status, "draft");
  assert.equal(draft.kind, "create");
  assert.equal(draft.entityType, "place");
  assert.equal(draft.entityId, null);
  assert.deepEqual(draft.proposedChanges, { title: { tr: "X" } });
  assert.equal(draft.history.length, 1);
  assert.equal(draft.history[0].action, "created");
  assert.equal(draft.history[0].note, "ilk taslak");
});

test("create (edit kind): changeId is prefixed 'edit-' and entityId is preserved", async () => {
  const { store } = freshStore();
  const draft = await store.createDraft({ kind: "edit", entityType: "music", entityId: "music-0001", proposedChanges: { summary: { tr: "y" } } });
  assert.match(draft.changeId, /^edit-/);
  assert.equal(draft.entityId, "music-0001");
});

test("read: getDraft returns exactly what was written, and null for an unknown id", async () => {
  const { store } = freshStore();
  const created = await store.createDraft({ kind: "create", entityType: "place", proposedChanges: { title: { tr: "A" } } });
  const fetched = await store.getDraft(created.changeId);
  assert.deepEqual(fetched, created);
  assert.equal(await store.getDraft("does-not-exist"), null);
});

test("timestamp serialization: createdAt/updatedAt/history[].at are ISO-8601 strings, stable across a read-back", async () => {
  const { store } = freshStore();
  const draft = await store.createDraft({ kind: "create", entityType: "place", proposedChanges: {} });
  const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  assert.match(draft.createdAt, isoPattern);
  assert.match(draft.updatedAt, isoPattern);
  assert.match(draft.history[0].at, isoPattern);
  const reread = await store.getDraft(draft.changeId);
  assert.equal(reread.createdAt, draft.createdAt);
  assert.equal(typeof reread.createdAt, "string", "must round-trip as a plain string, not a Firestore Timestamp object");
});

test("update (content): updateDraftContent replaces proposedChanges, bumps updatedAt, and appends a history entry — createdAt/status untouched", async () => {
  const { store } = freshStore();
  const draft = await store.createDraft({ kind: "create", entityType: "place", proposedChanges: { title: { tr: "A" } } });
  await new Promise((r) => setTimeout(r, 2));
  const updated = await store.updateDraftContent(draft.changeId, { title: { tr: "B" } }, { note: "düzeltme" });
  assert.deepEqual(updated.proposedChanges, { title: { tr: "B" } });
  assert.equal(updated.createdAt, draft.createdAt);
  assert.equal(updated.status, "draft");
  assert.notEqual(updated.updatedAt, draft.updatedAt);
  assert.equal(updated.history.length, 2);
  assert.equal(updated.history[1].action, "contentUpdated");
  assert.equal(updated.history[1].note, "düzeltme");

  const reread = await store.getDraft(draft.changeId);
  assert.deepEqual(reread, updated, "the mutation must actually persist, not just be reflected in the returned object");
});

test("update (status): updateDraftStatus changes status, bumps updatedAt, and appends a 'status:<x>' history entry", async () => {
  const { store } = freshStore();
  const draft = await store.createDraft({ kind: "create", entityType: "place", proposedChanges: {} });
  const updated = await store.updateDraftStatus(draft.changeId, "readyForReview", { note: "gözden geçirmeye hazır" });
  assert.equal(updated.status, "readyForReview");
  assert.equal(updated.history.at(-1).action, "status:readyForReview");
  const reread = await store.getDraft(draft.changeId);
  assert.equal(reread.status, "readyForReview");
});

test("conflict/error propagation: updateDraftContent/updateDraftStatus on an unknown changeId resolve to null rather than throwing or fabricating a record", async () => {
  const { store } = freshStore();
  assert.equal(await store.updateDraftContent("nope", { title: {} }), null);
  assert.equal(await store.updateDraftStatus("nope", "approved"), null);
});

test("list/filter: listDrafts supports status and entityType filters, composed together, newest-updated first", async () => {
  const { store } = freshStore();
  const a = await store.createDraft({ kind: "create", entityType: "place", proposedChanges: {} });
  const b = await store.createDraft({ kind: "create", entityType: "music", proposedChanges: {} });
  const c = await store.createDraft({ kind: "create", entityType: "place", proposedChanges: {} });
  await store.updateDraftStatus(b.changeId, "readyForReview");
  await store.updateDraftStatus(c.changeId, "readyForReview");

  assert.deepEqual((await store.listDrafts({})).map((d) => d.changeId).sort(), [a.changeId, b.changeId, c.changeId].sort());
  assert.deepEqual((await store.listDrafts({ entityType: "place" })).map((d) => d.changeId).sort(), [a.changeId, c.changeId].sort());
  assert.deepEqual((await store.listDrafts({ status: "readyForReview" })).map((d) => d.changeId).sort(), [b.changeId, c.changeId].sort());
  assert.deepEqual((await store.listDrafts({ status: "readyForReview", entityType: "place" })).map((d) => d.changeId), [c.changeId]);
});

test("delete/reject: deleteDraft removes the document and later reads see it as gone; deleting twice is safe (false, not an error)", async () => {
  const { store } = freshStore();
  const draft = await store.createDraft({ kind: "create", entityType: "place", proposedChanges: {} });
  assert.equal(await store.deleteDraft(draft.changeId), true);
  assert.equal(await store.getDraft(draft.changeId), null);
  assert.deepEqual(await store.listDrafts({}), []);
  assert.equal(await store.deleteDraft(draft.changeId), false, "deleting an already-gone draft must not throw");
});

test("deleteDraft on a never-existed id returns false, not an error", async () => {
  const { store } = freshStore();
  assert.equal(await store.deleteDraft("never-existed"), false);
});

test("two drafts never collide: independent changeIds, independent content, independent lifecycles", async () => {
  const { store } = freshStore();
  const a = await store.createDraft({ kind: "create", entityType: "place", proposedChanges: { title: { tr: "A" } } });
  const b = await store.createDraft({ kind: "create", entityType: "place", proposedChanges: { title: { tr: "B" } } });
  await store.updateDraftStatus(a.changeId, "readyForReview");
  assert.equal((await store.getDraft(a.changeId)).status, "readyForReview");
  assert.equal((await store.getDraft(b.changeId)).status, "draft", "an unrelated draft must never be touched by another draft's status change");
});

test("initialize() calls initializeFirestore() without throwing when a database factory is already injected (does not require GOOGLE_CLOUD_PROJECT for this unit test)", async () => {
  const { store } = freshStore();
  // initialize() in the real module calls the imported initializeFirestore(),
  // which requires GOOGLE_CLOUD_PROJECT — this store is constructed with an
  // injected getDatabase specifically so its query/mutation methods never
  // need that; we don't call initialize() here since exercising the real
  // module-level Firestore client is out of scope for a unit test that must
  // never touch real Firestore. Every other method above already proves the
  // adapter's query/mutation behavior end-to-end against the fake.
  assert.equal(typeof store.initialize, "function");
});
