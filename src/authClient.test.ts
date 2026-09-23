import { afterEach, describe, expect, it, vi } from "vitest";

const connectAuthEmulator = vi.fn();
const initializeApp = vi.fn();
const getApps = vi.fn(() => [] as unknown[]);
const getAuth = vi.fn(() => ({ name: "auth" }) as { name: string; currentUser?: unknown });
const credential = vi.fn((email: string, password: string) => ({ email, password }));
const reauthenticateWithCredential = vi.fn();
const updatePassword = vi.fn();

vi.mock("firebase/app", () => ({
  getApps: () => getApps(),
  initializeApp: (...args: unknown[]) => initializeApp(...args),
}));

vi.mock("firebase/auth", () => ({
  connectAuthEmulator: (...args: unknown[]) => connectAuthEmulator(...args),
  getAuth: () => getAuth(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
  EmailAuthProvider: {
    credential: (email: string, password: string) => credential(email, password),
  },
  reauthenticateWithCredential: (...args: unknown[]) =>
    reauthenticateWithCredential(...args),
  updatePassword: (...args: unknown[]) => updatePassword(...args),
}));

import { getBusyCount, resetBusyForTests } from "./busy";
import { changePassword, loadFirebaseAuth } from "./authClient";
import { getClientResourceCaps, resetClientResourceCaps } from "./resourceCaps";

const signedInUser = { uid: "uid-alice", email: "alice@example.com" };

function signInAlice(): void {
  getAuth.mockReturnValue({ name: "auth", currentUser: signedInUser });
}

afterEach(() => {
  vi.unstubAllGlobals();
  connectAuthEmulator.mockReset();
  initializeApp.mockReset();
  getApps.mockReset();
  getApps.mockReturnValue([]);
  getAuth.mockReset();
  getAuth.mockReturnValue({ name: "auth" });
  credential.mockReset();
  credential.mockImplementation((email: string, password: string) => ({ email, password }));
  reauthenticateWithCredential.mockReset();
  updatePassword.mockReset();
  resetBusyForTests();
  resetClientResourceCaps();
});

describe("AC66: Browser Auth uses the emulator when config says so", () => {
  it("AC66: Browser Auth uses the emulator when config says so", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          apiKey: "k",
          authDomain: "demo.firebaseapp.com",
          projectId: "demo",
          authEmulatorHost: "http://127.0.0.1:9099",
        }),
      })),
    );

    await loadFirebaseAuth();

    expect(initializeApp).toHaveBeenCalledWith({
      apiKey: "k",
      authDomain: "demo.firebaseapp.com",
      projectId: "demo",
    });
    expect(connectAuthEmulator).toHaveBeenCalledWith(
      { name: "auth" },
      "http://127.0.0.1:9099",
      { disableWarnings: true },
    );
  });
});

describe("AC26: The client stores config caps and uses defaults until then", () => {
  it("AC26: The client stores config caps and uses defaults until then", async () => {
    expect(getClientResourceCaps()).toEqual({
      userCount: 3,
      userBudgetCount: 2,
      categoryCount: 4,
      entryCount: 4,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          apiKey: "k",
          authDomain: "demo.firebaseapp.com",
          projectId: "demo",
          userCount: 7,
          userBudgetCount: 9,
          categoryCount: 11,
          entryCount: 0,
        }),
      })),
    );

    await loadFirebaseAuth();

    expect(getClientResourceCaps()).toEqual({
      userCount: 7,
      userBudgetCount: 9,
      categoryCount: 11,
      entryCount: 4,
    });
    expect(initializeApp).toHaveBeenCalledWith({
      apiKey: "k",
      authDomain: "demo.firebaseapp.com",
      projectId: "demo",
    });
  });
});

describe("changePassword", () => {
  it("AC7: Password mismatch does not call updatePassword", async () => {
    signInAlice();

    await expect(changePassword("secret12", "short", "other")).rejects.toThrow(
      "New password does not match.",
    );

    expect(updatePassword).not.toHaveBeenCalled();
    expect(reauthenticateWithCredential).not.toHaveBeenCalled();
    expect(credential).not.toHaveBeenCalled();
    expect(getBusyCount()).toBe(0);
  });

  it("AC8: Short password does not call updatePassword", async () => {
    signInAlice();

    await expect(changePassword("secret12", "short", "short")).rejects.toThrow(
      "Password must be at least 6 characters.",
    );
    await expect(changePassword("secret12", "     ", "     ")).rejects.toThrow(
      "Password must be at least 6 characters.",
    );

    expect(updatePassword).not.toHaveBeenCalled();
    expect(reauthenticateWithCredential).not.toHaveBeenCalled();
    expect(credential).not.toHaveBeenCalled();
    expect(getBusyCount()).toBe(0);
  });

  it("AC9: Wrong current password does not call updatePassword", async () => {
    signInAlice();
    const codes = [
      "auth/invalid-credential",
      "auth/wrong-password",
      "auth/invalid-login-credentials",
    ];

    for (const code of codes) {
      reauthenticateWithCredential.mockRejectedValueOnce({ code });
      await expect(changePassword("wrong", "secret12", "secret12")).rejects.toThrow(
        "Current password is wrong.",
      );
    }

    expect(updatePassword).not.toHaveBeenCalled();
    expect(reauthenticateWithCredential).toHaveBeenCalledTimes(3);
    expect(getBusyCount()).toBe(0);
  });

  it("AC10: Successful password change stays signed in", async () => {
    signInAlice();
    let releaseReauth!: () => void;
    let releaseUpdate!: () => void;
    const reauthPending = new Promise<void>((resolve) => {
      releaseReauth = resolve;
    });
    const updatePending = new Promise<void>((resolve) => {
      releaseUpdate = resolve;
    });
    reauthenticateWithCredential.mockReturnValue(reauthPending);
    updatePassword.mockReturnValue(updatePending);

    const done = changePassword("secret12", "secret99", "secret99");

    expect(getBusyCount()).toBe(1);
    expect(credential).toHaveBeenCalledTimes(1);
    expect(credential).toHaveBeenCalledWith("alice@example.com", "secret12");
    expect(reauthenticateWithCredential).toHaveBeenCalledTimes(1);
    expect(reauthenticateWithCredential).toHaveBeenCalledWith(signedInUser, {
      email: "alice@example.com",
      password: "secret12",
    });
    expect(updatePassword).not.toHaveBeenCalled();

    releaseReauth();
    await reauthPending;
    expect(updatePassword).toHaveBeenCalledTimes(1);
    expect(updatePassword).toHaveBeenCalledWith(signedInUser, "secret99");
    expect(getBusyCount()).toBe(1);

    releaseUpdate();
    await done;
    expect(getBusyCount()).toBe(0);
  });

  it("does not trim passwords before Auth", async () => {
    signInAlice();
    reauthenticateWithCredential.mockResolvedValue(undefined);
    updatePassword.mockResolvedValue(undefined);

    await expect(changePassword("secret12", "secret99", "secret99 ")).rejects.toThrow(
      "New password does not match.",
    );
    expect(reauthenticateWithCredential).not.toHaveBeenCalled();

    await changePassword(" secret12", "abcde ", "abcde ");

    expect(credential).toHaveBeenCalledWith("alice@example.com", " secret12");
    expect(updatePassword).toHaveBeenCalledWith(signedInUser, "abcde ");
  });

  it("rethrows other Auth errors and does not call updatePassword", async () => {
    signInAlice();
    const failure = Object.assign(new Error("network"), { code: "auth/network-request-failed" });
    reauthenticateWithCredential.mockRejectedValueOnce(failure);

    await expect(changePassword("secret12", "secret99", "secret99")).rejects.toBe(failure);
    expect(updatePassword).not.toHaveBeenCalled();
    expect(getBusyCount()).toBe(0);
  });

  it("does not call Auth when nobody is signed in", async () => {
    getAuth.mockReturnValue({ name: "auth", currentUser: null });

    await expect(changePassword("secret12", "secret99", "secret99")).rejects.toThrow(
      "Sign in required.",
    );
    expect(reauthenticateWithCredential).not.toHaveBeenCalled();
    expect(updatePassword).not.toHaveBeenCalled();
    expect(getBusyCount()).toBe(0);
  });
});
