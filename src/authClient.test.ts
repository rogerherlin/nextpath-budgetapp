import { afterEach, describe, expect, it, vi } from "vitest";

const connectAuthEmulator = vi.fn();
const initializeApp = vi.fn();
const getApps = vi.fn(() => [] as unknown[]);
const getAuth = vi.fn(() => ({ name: "auth" }));

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
}));

import { loadFirebaseAuth } from "./authClient";

afterEach(() => {
  vi.unstubAllGlobals();
  connectAuthEmulator.mockReset();
  initializeApp.mockReset();
  getApps.mockReset();
  getApps.mockReturnValue([]);
  getAuth.mockClear();
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
