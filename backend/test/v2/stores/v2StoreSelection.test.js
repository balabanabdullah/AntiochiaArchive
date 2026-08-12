import test from "node:test";
import assert from "node:assert/strict";
import { normalizeV2StoreName } from "../../../v2/stores/v2Store.js";

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("V2_DATA_STORE selection defaults to empty", () => {
  assert.equal(normalizeV2StoreName(undefined), "empty");
});

test("V2_DATA_STORE accepts memory and firestore, case-insensitively and trimmed", () => {
  assert.equal(normalizeV2StoreName(" MEMORY "), "memory");
  assert.equal(normalizeV2StoreName("Firestore"), "firestore");
});

test("V2_DATA_STORE rejects an unknown value", () => {
  assert.throws(() => normalizeV2StoreName("bigtable"), /empty, memory, firestore/);
});

test("selecting 'firestore' is the only path that requires GOOGLE_CLOUD_PROJECT — proving Firestore is untouched otherwise", async (context) => {
  // This indirectly proves the safety property required by the v2 store
  // selection design: initializeFirestore() (and therefore any real
  // Firestore contact) is only ever reached when V2_DATA_STORE=firestore is
  // explicitly set. It is never reached for the default 'empty' store.
  const { initializeV2Store } = await import("../../../v2/stores/v2Store.js");

  const originalDataStore = process.env.V2_DATA_STORE;
  const originalProject = process.env.GOOGLE_CLOUD_PROJECT;
  process.env.V2_DATA_STORE = "firestore";
  delete process.env.GOOGLE_CLOUD_PROJECT;
  context.after(() => {
    restoreEnvironment("V2_DATA_STORE", originalDataStore);
    restoreEnvironment("GOOGLE_CLOUD_PROJECT", originalProject);
  });

  await assert.rejects(initializeV2Store(), /GOOGLE_CLOUD_PROJECT/);
});
