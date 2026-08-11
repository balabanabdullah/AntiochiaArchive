import { fileStore } from "./stores/fileStore.js";
import { firestoreStore } from "./stores/firestoreStore.js";

const stores = Object.freeze({
  file: fileStore,
  firestore: firestoreStore,
});

let selectedStore;
let selectedStoreName;

export function normalizeDataStoreName(value = process.env.DATA_STORE) {
  const name = String(value || "file").trim().toLowerCase();
  if (!Object.hasOwn(stores, name)) {
    throw new Error("DATA_STORE must be either 'file' or 'firestore'.");
  }
  return name;
}

export async function initializeDataStore() {
  const name = normalizeDataStoreName();
  if (selectedStore && selectedStoreName !== name) {
    throw new Error("DATA_STORE cannot be changed after initialization.");
  }

  if (!selectedStore) {
    selectedStoreName = name;
    selectedStore = stores[name];
    await selectedStore.initialize();
  }

  return selectedStore;
}

export function getDataStore() {
  if (!selectedStore) {
    throw new Error("The data store has not been initialized.");
  }
  return selectedStore;
}

export function getSelectedDataStoreName() {
  return selectedStoreName || normalizeDataStoreName();
}
