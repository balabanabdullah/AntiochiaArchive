// Editorial draft/proposal staging — deliberately separate from every public
// v2 read path (backend/v2/stores/*, backend/v2/serializers/*). A draft
// living here can never become reachable through GET /api/v2/... no matter
// what its status field says, because the public API code never imports
// this module at all — see backend/v2/routes/v2Routes.js.
//
// Pluggable like ../dataStore.js and ../v2/stores/v2Store.js:
//   memory     — in-process array, cleared on every restart. The correct,
//                honest default for local dev/tests: Cloud Run's filesystem
//                and process memory are both ephemeral, so this store never
//                pretends otherwise.
//   firestore  — a NEW collection (`editorialDrafts`), reusing the same
//                already-configured, ADC-authenticated Firestore client v1
//                already uses in production (see ../firestore.js) rather
//                than provisioning new infrastructure. This collection is
//                never read by any public route — only backend/admin/*.
//
// Either way, this store is PURELY administrative staging. Nothing here is
// "canonical cultural data": the only way a draft's content ever reaches the
// public site is the human-mediated path described in
// scripts/apply-editorial-changes.js — export -> review -> explicit
// `--apply` run against the real repository JSON -> the normal commit/
// build/release pipeline. This module has no method that writes to
// data/v2/entities.json, and never will.

import crypto from "crypto";
import { getFirestore, initializeFirestore } from "../firestore.js";

export const DRAFT_STATUSES = Object.freeze(["draft", "readyForReview", "approved", "rejected", "applied"]);

const EDITORIAL_DRAFTS_COLLECTION = "editorialDrafts";

function newChangeId(kind) {
  return `${kind === "create" ? "new" : "edit"}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

function createMemoryEditorialStore() {
  let drafts = new Map();

  return {
    async initialize() {},

    async createDraft({ kind, entityType, entityId, proposedChanges, note }) {
      const changeId = newChangeId(kind);
      const now = new Date().toISOString();
      const draft = {
        changeId,
        kind,
        entityType,
        entityId: entityId || null,
        proposedChanges,
        status: "draft",
        createdAt: now,
        updatedAt: now,
        history: [{ at: now, action: "created", note: note || null }],
      };
      drafts.set(changeId, draft);
      return draft;
    },

    async listDrafts({ status, entityType } = {}) {
      return [...drafts.values()]
        .filter((d) => (status ? d.status === status : true))
        .filter((d) => (entityType ? d.entityType === entityType : true))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async getDraft(changeId) {
      return drafts.get(changeId) || null;
    },

    async updateDraftContent(changeId, proposedChanges, { note } = {}) {
      const draft = drafts.get(changeId);
      if (!draft) return null;
      const now = new Date().toISOString();
      draft.proposedChanges = proposedChanges;
      draft.updatedAt = now;
      draft.history.push({ at: now, action: "contentUpdated", note: note || null });
      return draft;
    },

    async updateDraftStatus(changeId, status, { note } = {}) {
      const draft = drafts.get(changeId);
      if (!draft) return null;
      const now = new Date().toISOString();
      draft.status = status;
      draft.updatedAt = now;
      draft.history.push({ at: now, action: `status:${status}`, note: note || null });
      return draft;
    },

    async deleteDraft(changeId) {
      return drafts.delete(changeId);
    },

    async _resetForTests() {
      drafts = new Map();
    },
  };
}

function createFirestoreEditorialStore({ getDatabase = getFirestore } = {}) {
  return {
    async initialize() {
      initializeFirestore();
    },

    async createDraft({ kind, entityType, entityId, proposedChanges, note }) {
      const database = getDatabase();
      const changeId = newChangeId(kind);
      const now = new Date().toISOString();
      const draft = {
        changeId,
        kind,
        entityType,
        entityId: entityId || null,
        proposedChanges,
        status: "draft",
        createdAt: now,
        updatedAt: now,
        history: [{ at: now, action: "created", note: note || null }],
      };
      await database.collection(EDITORIAL_DRAFTS_COLLECTION).doc(changeId).set(draft);
      return draft;
    },

    async listDrafts({ status, entityType } = {}) {
      const database = getDatabase();
      let query = database.collection(EDITORIAL_DRAFTS_COLLECTION);
      if (status) query = query.where("status", "==", status);
      if (entityType) query = query.where("entityType", "==", entityType);
      const snapshot = await query.get();
      return snapshot.docs.map((doc) => doc.data()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async getDraft(changeId) {
      const database = getDatabase();
      const snapshot = await database.collection(EDITORIAL_DRAFTS_COLLECTION).doc(changeId).get();
      return snapshot.exists ? snapshot.data() : null;
    },

    async updateDraftContent(changeId, proposedChanges, { note } = {}) {
      const database = getDatabase();
      const ref = database.collection(EDITORIAL_DRAFTS_COLLECTION).doc(changeId);
      const snapshot = await ref.get();
      if (!snapshot.exists) return null;
      const draft = snapshot.data();
      const now = new Date().toISOString();
      draft.proposedChanges = proposedChanges;
      draft.updatedAt = now;
      draft.history.push({ at: now, action: "contentUpdated", note: note || null });
      await ref.set(draft);
      return draft;
    },

    async updateDraftStatus(changeId, status, { note } = {}) {
      const database = getDatabase();
      const ref = database.collection(EDITORIAL_DRAFTS_COLLECTION).doc(changeId);
      const snapshot = await ref.get();
      if (!snapshot.exists) return null;
      const draft = snapshot.data();
      const now = new Date().toISOString();
      draft.status = status;
      draft.updatedAt = now;
      draft.history.push({ at: now, action: `status:${status}`, note: note || null });
      await ref.set(draft);
      return draft;
    },

    async deleteDraft(changeId) {
      const database = getDatabase();
      const ref = database.collection(EDITORIAL_DRAFTS_COLLECTION).doc(changeId);
      const snapshot = await ref.get();
      if (!snapshot.exists) return false;
      await ref.delete();
      return true;
    },
  };
}

const stores = Object.freeze({
  memory: createMemoryEditorialStore(),
  firestore: createFirestoreEditorialStore(),
});

let selectedStore;
let selectedStoreName;

export function normalizeEditorialStoreName(value = process.env.EDITORIAL_DATA_STORE) {
  const name = String(value || "memory").trim().toLowerCase();
  if (!Object.hasOwn(stores, name)) {
    throw new Error("EDITORIAL_DATA_STORE must be either 'memory' or 'firestore'.");
  }
  return name;
}

export async function initializeEditorialStore() {
  const name = normalizeEditorialStoreName();
  selectedStoreName = name;
  selectedStore = stores[name];
  await selectedStore.initialize();
  return selectedStore;
}

export function getEditorialStore() {
  if (!selectedStore) throw new Error("The editorial store has not been initialized.");
  return selectedStore;
}

export function getSelectedEditorialStoreName() {
  return selectedStoreName || normalizeEditorialStoreName();
}

export { createMemoryEditorialStore, createFirestoreEditorialStore };
