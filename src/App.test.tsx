/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientUser } from "./authClient";

let authListener: (user: ClientUser | null) => void = () => {};

vi.mock("./authClient", () => ({
  loadFirebaseAuth: vi.fn(async () => {}),
  subscribeAuth: vi.fn((cb: (user: ClientUser | null) => void) => {
    authListener = cb;
    cb(null);
    return () => {};
  }),
  signInWithPassword: vi.fn(async () => {
    authListener({
      uid: "uid-alice",
      email: "alice@example.com",
      getIdToken: async () => "tok-alice",
    });
  }),
  registerWithPassword: vi.fn(),
  signOutUser: vi.fn(async () => {
    authListener(null);
  }),
  onProfileReady: vi.fn(() => () => {}),
  notifyProfileReady: vi.fn(),
}));

import { signInWithPassword, signOutUser } from "./authClient";
import { App } from "./App";

const aliceMe = {
  id: "uid-alice",
  email: "alice@example.com",
  displayName: "Alice",
  canUseFromText: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  isModerator: false,
};

function mockSignedInFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url === "/api/me") {
        return { ok: true, json: async () => aliceMe };
      }
      if (url === "/api/budgets") {
        return { ok: true, json: async () => ({ budgets: [] }) };
      }
      return { ok: false, json: async () => ({ error: "Not found." }) };
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(signInWithPassword).mockClear();
  vi.mocked(signOutUser).mockClear();
});

describe("AC14: Login screen before Home", () => {
  it("AC14: Login screen before Home", async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy(),
    );
    expect(screen.queryByText("Budgets")).toBeNull();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByLabelText("Display name")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Register" })).toBeTruthy();
  });
});

describe("AC15: Sign in success shows Home", () => {
  it("AC15: Sign in success shows Home", async () => {
    mockSignedInFetch();
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy(),
    );
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByText("Budgets")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Sign in" })).toBeNull();
  });
});

describe("AC19: Sign out returns to login", () => {
  it("AC19: Sign out returns to login", async () => {
    mockSignedInFetch();
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy(),
    );
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByText("Budgets")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOutUser).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy(),
    );
    expect(screen.queryByText("Budgets")).toBeNull();
  });
});

describe("AC64: Client never uses Firestore data SDK", () => {
  it("AC64: Client never uses Firestore data SDK", () => {
    const root = process.cwd();
    const files = [
      "src/App.tsx",
      "src/main.tsx",
      "src/ui/LoginScreen.tsx",
      "src/ui/HomeScreen.tsx",
      "src/ui/BudgetScreen.tsx",
      "src/ui/FromTextTab.tsx",
      "src/authClient.ts",
    ];
    for (const file of files) {
      const text = readFileSync(join(root, file), "utf8");
      expect(text.includes("firebase/firestore")).toBe(false);
      expect(text.includes("getFirestore")).toBe(false);
    }
  });
});
