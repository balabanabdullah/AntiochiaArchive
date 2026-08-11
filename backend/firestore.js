import { Firestore } from "@google-cloud/firestore";

let firestoreInstance;

export function initializeFirestore() {
  if (firestoreInstance) return firestoreInstance;

  const projectId = String(process.env.GOOGLE_CLOUD_PROJECT || "").trim();
  if (!projectId) {
    throw new Error("GOOGLE_CLOUD_PROJECT is required when DATA_STORE=firestore.");
  }

  // Authentication is provided by Application Default Credentials locally and
  // by the attached service identity on Cloud Run. No key file is loaded here.
  firestoreInstance = new Firestore({ projectId });
  return firestoreInstance;
}

export function getFirestore() {
  return firestoreInstance || initializeFirestore();
}
