import { getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";

export type ClientUser = {
  uid: string;
  email: string;
  getIdToken: () => Promise<string>;
};

function mapUser(user: User): ClientUser {
  return {
    uid: user.uid,
    email: user.email ?? "",
    getIdToken: () => user.getIdToken(),
  };
}

export async function loadFirebaseAuth(): Promise<void> {
  const response = await fetch("/api/config");
  const data: unknown = await response.json();
  if (
    !response.ok ||
    typeof data !== "object" ||
    data === null ||
    !("apiKey" in data) ||
    !("authDomain" in data) ||
    !("projectId" in data)
  ) {
    throw new Error("Firebase web config is missing.");
  }
  const config = data as {
    apiKey: string;
    authDomain: string;
    projectId: string;
  };
  if (getApps().length === 0) {
    initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
    });
  }
}

export function subscribeAuth(
  onChange: (user: ClientUser | null) => void,
): () => void {
  return onAuthStateChanged(getAuth(), (user) => {
    onChange(user === null ? null : mapUser(user));
  });
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<void> {
  await signInWithEmailAndPassword(getAuth(), email, password);
}

export async function registerWithPassword(
  email: string,
  password: string,
): Promise<ClientUser> {
  const credential = await createUserWithEmailAndPassword(
    getAuth(),
    email,
    password,
  );
  return mapUser(credential.user);
}

export async function signOutUser(): Promise<void> {
  await signOut(getAuth());
}

const profileReadyListeners = new Set<() => void>();

export function onProfileReady(listener: () => void): () => void {
  profileReadyListeners.add(listener);
  return () => {
    profileReadyListeners.delete(listener);
  };
}

export function notifyProfileReady(): void {
  for (const listener of profileReadyListeners) {
    listener();
  }
}
