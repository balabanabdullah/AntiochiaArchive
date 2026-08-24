import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryEditorialStore, DRAFT_STATUSES, normalizeEditorialStoreName } from "../../admin/editorialStore.js";

test("normalizeEditorialStoreName defaults to memory and rejects unknown values", () => {
  assert.equal(normalizeEditorialStoreName(undefined), "memory");
  assert.equal(normalizeEditorialStoreName("memory"), "memory");
  assert.equal(normalizeEditorialStoreName("firestore"), "firestore");
  assert.throws(() => normalizeEditorialStoreName("s3"));
});

test("DRAFT_STATUSES is the complete, ordered lifecycle", () => {
  assert.deepEqual(DRAFT_STATUSES, ["draft", "readyForReview", "approved", "rejected", "applied"]);
});

test("memory editorial store: create -> list -> get round-trip", async () => {
  const store = createMemoryEditorialStore();
  const draft = await store.createDraft({
    kind: "create", entityType: "place", entityId: null, proposedChanges: { title: { tr: "X" } },
  });
  assert.ok(draft.changeId);
  assert.equal(draft.status, "draft");
  assert.equal(draft.kind, "create");

  const fetched = await store.getDraft(draft.changeId);
  assert.deepEqual(fetched, draft);

  const listed = await store.listDrafts({});
  assert.equal(listed.length, 1);
  assert.equal(listed[0].changeId, draft.changeId);
});

test("memory editorial store: listDrafts filters by status and entityType", async () => {
  const store = createMemoryEditorialStore();
  const a = await store.createDraft({ kind: "create", entityType: "place", proposedChanges: {} });
  const b = await store.createDraft({ kind: "create", entityType: "music", proposedChanges: {} });
  await store.updateDraftStatus(b.changeId, "readyForReview");

  assert.deepEqual((await store.listDrafts({ entityType: "place" })).map((d) => d.changeId), [a.changeId]);
  assert.deepEqual((await store.listDrafts({ status: "readyForReview" })).map((d) => d.changeId), [b.changeId]);
  assert.equal((await store.listDrafts({})).length, 2);
});

test("memory editorial store: updateDraftContent updates content, updatedAt, and appends a history entry", async () => {
  const store = createMemoryEditorialStore();
  const draft = await store.createDraft({ kind: "edit", entityType: "place", entityId: "place-0001", proposedChanges: { title: { tr: "A" } } });
  const before = draft.updatedAt;
  await new Promise((r) => setTimeout(r, 5));
  const updated = await store.updateDraftContent(draft.changeId, { title: { tr: "B" } }, { note: "typo fix" });
  assert.deepEqual(updated.proposedChanges, { title: { tr: "B" } });
  assert.notEqual(updated.updatedAt, before);
  assert.equal(updated.history.at(-1).action, "contentUpdated");
  assert.equal(updated.history.at(-1).note, "typo fix");
});

test("memory editorial store: updateDraftStatus records the transition in history", async () => {
  const store = createMemoryEditorialStore();
  const draft = await store.createDraft({ kind: "create", entityType: "place", proposedChanges: {} });
  const updated = await store.updateDraftStatus(draft.changeId, "readyForReview");
  assert.equal(updated.status, "readyForReview");
  assert.equal(updated.history.at(-1).action, "status:readyForReview");
});

test("memory editorial store: getDraft/updateDraftContent/updateDraftStatus/deleteDraft on an unknown id are safe no-ops, never throw", async () => {
  const store = createMemoryEditorialStore();
  assert.equal(await store.getDraft("nope"), null);
  assert.equal(await store.updateDraftContent("nope", {}), null);
  assert.equal(await store.updateDraftStatus("nope", "approved"), null);
  assert.equal(await store.deleteDraft("nope"), false);
});

test("memory editorial store: deleteDraft actually removes it", async () => {
  const store = createMemoryEditorialStore();
  const draft = await store.createDraft({ kind: "create", entityType: "place", proposedChanges: {} });
  assert.equal(await store.deleteDraft(draft.changeId), true);
  assert.equal(await store.getDraft(draft.changeId), null);
});

test("memory editorial store: each draft gets a unique changeId, prefixed by kind", async () => {
  const store = createMemoryEditorialStore();
  const create = await store.createDraft({ kind: "create", entityType: "place", proposedChanges: {} });
  const edit = await store.createDraft({ kind: "edit", entityType: "place", entityId: "place-0001", proposedChanges: {} });
  assert.match(create.changeId, /^new-/);
  assert.match(edit.changeId, /^edit-/);
  assert.notEqual(create.changeId, edit.changeId);
});
