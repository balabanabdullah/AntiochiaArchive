import { FieldValue } from "@google-cloud/firestore";
import { getFirestore, initializeFirestore } from "../firestore.js";
import {
  ARCHIVE_CATEGORIES,
  assertValidArchive,
  createSubmissionId,
  normalizeArchiveDocuments,
  serializeSubmission,
} from "../dataModel.js";

const ARCHIVE_COLLECTION = "archive";
const SUBMISSIONS_COLLECTION = "submissions";

export const firestoreStore = {
  async initialize() {
    initializeFirestore();
  },

  async getArchive() {
    const database = getFirestore();
    const references = ARCHIVE_CATEGORIES.map((category) => (
      database.collection(ARCHIVE_COLLECTION).doc(category)
    ));
    const snapshots = await database.getAll(...references);

    const documents = Object.fromEntries(ARCHIVE_CATEGORIES.map((category, index) => (
      [category, snapshots[index].data()]
    )));
    return normalizeArchiveDocuments(documents);
  },

  async updateArchive(archive) {
    assertValidArchive(archive);
    const database = getFirestore();
    const batch = database.batch();

    for (const category of ARCHIVE_CATEGORIES) {
      const reference = database.collection(ARCHIVE_COLLECTION).doc(category);
      batch.set(reference, { items: archive[category] });
    }

    await batch.commit();
  },

  async getSubmissions() {
    const snapshot = await getFirestore()
      .collection(SUBMISSIONS_COLLECTION)
      .orderBy("createdAt", "desc")
      .get();

    return snapshot.docs.map((document) => serializeSubmission(document.id, document.data()));
  },

  async addSubmission({ name, email, message }) {
    const database = getFirestore();
    const id = createSubmissionId();
    const reference = database.collection(SUBMISSIONS_COLLECTION).doc(id);

    await reference.create({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      message: String(message).trim(),
      createdAt: FieldValue.serverTimestamp(),
    });

    const snapshot = await reference.get();
    return serializeSubmission(snapshot.id, snapshot.data());
  },

  async deleteSubmission(id) {
    const reference = getFirestore().collection(SUBMISSIONS_COLLECTION).doc(String(id));
    return getFirestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) return false;
      transaction.delete(reference);
      return true;
    });
  },
};
