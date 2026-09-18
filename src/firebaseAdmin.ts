import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreRepo } from "./firestoreRepo";
import { MemoryRepo, type AppRepo } from "./repo";
import { persistAdapterName } from "./secrets";

export type VerifiedToken = { uid: string; email?: string };

export function firebaseProjectId(): string {
  return (
    process.env.GCLOUD_PROJECT ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.FIREBASE_PROJECT_ID ??
    process.env.FIREBASE_WEB_PROJECT_ID ??
    "budgetapp-local"
  );
}

export function initFirebaseAdmin(): void {
  if (getApps().length > 0) {
    return;
  }
  const projectId = firebaseProjectId();
  if (
    process.env.FIRESTORE_EMULATOR_HOST !== undefined &&
    process.env.FIRESTORE_EMULATOR_HOST !== ""
  ) {
    initializeApp({ projectId });
    return;
  }
  initializeApp({
    projectId,
    credential: applicationDefault(),
  });
}

export async function verifyIdToken(token: string): Promise<VerifiedToken> {
  initFirebaseAdmin();
  const decoded = await getAuth().verifyIdToken(token);
  return { uid: decoded.uid, email: decoded.email };
}

export async function deleteAuthUser(uid: string): Promise<void> {
  initFirebaseAdmin();
  await getAuth().deleteUser(uid);
}

export function createAppRepo(): AppRepo {
  if (persistAdapterName() === "memory") {
    return new MemoryRepo();
  }
  initFirebaseAdmin();
  return new FirestoreRepo(getFirestore());
}
