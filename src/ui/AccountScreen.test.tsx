/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeProfile } from "../types";
import { AccountScreen } from "./AccountScreen";

const getAuth = vi.fn(
  (): { name: string; currentUser: { uid: string; email: string } | null } => ({
    name: "auth",
    currentUser: null,
  }),
);
const credential = vi.fn((email: string, password: string) => ({ email, password }));
const reauthenticateWithCredential = vi.fn();
const updatePassword = vi.fn();

vi.mock("firebase/app", () => ({
  getApps: () => [],
  initializeApp: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  connectAuthEmulator: vi.fn(),
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

const signedInUser = { uid: "uid-alice", email: "alice@example.com" };

const alice: MeProfile = {
  id: "uid-alice",
  email: "alice@example.com",
  displayName: "Alice",
  canUseFromText: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  isModerator: false,
};

const moderator: MeProfile = { ...alice, isModerator: true };

function renderAccount(me: MeProfile = alice) {
  render(
    <AccountScreen
      me={me}
      getIdToken={async () => "tok-alice"}
      onBack={() => {}}
      onProfile={() => {}}
      onDeleted={() => {}}
    />,
  );
}

function fillPassword(current: string, next: string, confirm: string) {
  const [currentPassword] = screen.getAllByLabelText("Current password");
  fireEvent.change(currentPassword!, { target: { value: current } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: next } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: confirm },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  getAuth.mockReset();
  getAuth.mockReturnValue({ name: "auth", currentUser: signedInUser });
  credential.mockReset();
  credential.mockImplementation((email: string, password: string) => ({ email, password }));
  reauthenticateWithCredential.mockReset();
  updatePassword.mockReset();
});

describe("AC7: Password mismatch does not call updatePassword", () => {
  it("AC7: Password mismatch does not call updatePassword", async () => {
    getAuth.mockReturnValue({ name: "auth", currentUser: signedInUser });
    renderAccount();
    fillPassword("secret12", "short", "other");
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    const error = await screen.findByText("New password does not match.");
    expect(error.className).toContain("field-error");
    expect(updatePassword).not.toHaveBeenCalled();
    expect(reauthenticateWithCredential).not.toHaveBeenCalled();
  });
});

describe("AC8: Short password does not call updatePassword", () => {
  it("AC8: Short password does not call updatePassword", async () => {
    getAuth.mockReturnValue({ name: "auth", currentUser: signedInUser });
    renderAccount();
    fillPassword("secret12", "short", "short");
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    const error = await screen.findByText("Password must be at least 6 characters.");
    expect(error.className).toContain("field-error");
    expect(updatePassword).not.toHaveBeenCalled();
    expect(reauthenticateWithCredential).not.toHaveBeenCalled();
  });
});

describe("AC9: Wrong current password does not call updatePassword", () => {
  it("AC9: Wrong current password does not call updatePassword", async () => {
    getAuth.mockReturnValue({ name: "auth", currentUser: signedInUser });
    renderAccount();
    fillPassword("wrong", "secret12", "secret12");
    const codes = [
      "auth/invalid-credential",
      "auth/wrong-password",
      "auth/invalid-login-credentials",
    ];
    for (const code of codes) {
      reauthenticateWithCredential.mockRejectedValueOnce({ code });
      fireEvent.click(screen.getByRole("button", { name: "Update password" }));
      const error = await screen.findByText("Current password is wrong.");
      expect(error.className).toContain("field-error");
    }
    expect(updatePassword).not.toHaveBeenCalled();
  });
});

describe("AC10: Successful password change stays signed in", () => {
  it("AC10: Successful password change stays signed in", async () => {
    getAuth.mockReturnValue({ name: "auth", currentUser: signedInUser });
    reauthenticateWithCredential.mockResolvedValue(undefined);
    updatePassword.mockResolvedValue(undefined);
    renderAccount(moderator);
    fillPassword("secret12", "secret99", "secret99");
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() => expect(screen.getByText("Password updated.")).toBeTruthy());
    expect(reauthenticateWithCredential).toHaveBeenCalledTimes(1);
    expect(reauthenticateWithCredential).toHaveBeenCalledWith(signedInUser, {
      email: "alice@example.com",
      password: "secret12",
    });
    expect(updatePassword).toHaveBeenCalledTimes(1);
    expect(updatePassword).toHaveBeenCalledWith(signedInUser, "secret99");
    expect((screen.getByLabelText("Current password") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Confirm new password") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("heading", { name: "Sign in" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Account" })).toBeTruthy();
  });
});

describe("AC13: Cancelled delete confirm does nothing", () => {
  it("AC13: Cancelled delete confirm does nothing", () => {
    getAuth.mockReturnValue({ name: "auth", currentUser: signedInUser });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderAccount();
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(
      "Delete your account? Your budgets will also be deleted.",
    );
    expect(reauthenticateWithCredential).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("AC14: Wrong password blocks delete", () => {
  it("AC14: Wrong password blocks delete", async () => {
    getAuth.mockReturnValue({ name: "auth", currentUser: signedInUser });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    reauthenticateWithCredential.mockRejectedValue({ code: "auth/invalid-credential" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderAccount();
    fireEvent.change(screen.getAllByLabelText("Current password")[1]!, {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    const error = await screen.findByText("Current password is wrong.");
    expect(error.className).toContain("field-error");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("AC15: Moderator cannot self-delete", () => {
  it("AC15: Moderator cannot self-delete", () => {
    renderAccount(moderator);
    expect(screen.queryByRole("button", { name: "Delete account" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Delete account" })).toBeNull();
  });
});
