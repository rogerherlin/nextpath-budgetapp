import { getApps, initializeApp } from "firebase/app";
import { trackBusy } from "./busy";
import { clientFetch } from "./clientFetch";
import { clientCapsFromConfig, setClientResourceCaps } from "./resourceCaps";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
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
  const response = await clientFetch("/api/config");
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
    authEmulatorHost?: unknown;
  };
  setClientResourceCaps(clientCapsFromConfig(data));
  if (getApps().length === 0) {
    initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
    });
    if (
      typeof config.authEmulatorHost === "string" &&
      config.authEmulatorHost.trim() !== ""
    ) {
      connectAuthEmulator(getAuth(), config.authEmulatorHost, {
        disableWarnings: true,
      });
    }
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
  await trackBusy(signInWithEmailAndPassword(getAuth(), email, password));
}

export async function registerWithPassword(
  email: string,
  password: string,
): Promise<ClientUser> {
  const credential = await trackBusy(
    createUserWithEmailAndPassword(getAuth(), email, password),
  );
  return mapUser(credential.user);
}

export async function signOutUser(): Promise<void> {
  await trackBusy(signOut(getAuth()));
}

const wrongPasswordCodes = new Set([
  "auth/wrong-password",
  "auth/invalid-credential",
  "auth/invalid-login-credentials",
]);

function isWrongPassword(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    wrongPasswordCodes.has(error.code)
  );
}

function requireCurrentUser(): { user: User; email: string } {
  const user = getAuth().currentUser;
  const email = user?.email ?? "";
  if (user === null || email === "") {
    throw new Error("Sign in required.");
  }
  return { user, email };
}

export async function reauthenticateCurrentPassword(currentPassword: string): Promise<void> {
  const { user, email } = requireCurrentUser();
  const authCredential = EmailAuthProvider.credential(email, currentPassword);
  await trackBusy(
    (async () => {
      try {
        await reauthenticateWithCredential(user, authCredential);
      } catch (error: unknown) {
        if (isWrongPassword(error)) {
          throw new Error("Current password is wrong.");
        }
        throw error;
      }
    })(),
  );
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<void> {
  if (newPassword !== confirmPassword) {
    throw new Error("New password does not match.");
  }
  if (newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }
  const { user, email } = requireCurrentUser();
  const authCredential = EmailAuthProvider.credential(email, currentPassword);
  await trackBusy(
    (async () => {
      try {
        await reauthenticateWithCredential(user, authCredential);
      } catch (error: unknown) {
        if (isWrongPassword(error)) {
          throw new Error("Current password is wrong.");
        }
        throw error;
      }
      await updatePassword(user, newPassword);
    })(),
  );
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
