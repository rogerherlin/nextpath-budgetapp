/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginScreen } from "./LoginScreen";

vi.mock("../authClient", () => ({
  signInWithPassword: vi.fn(),
  registerWithPassword: vi.fn(),
  notifyProfileReady: vi.fn(),
}));

import { registerWithPassword, signInWithPassword } from "../authClient";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(signInWithPassword).mockReset();
  vi.mocked(registerWithPassword).mockReset();
});

describe("AC14: Login screen before Home", () => {
  it("AC14: Login screen before Home", () => {
    render(<LoginScreen />);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByText("Budgets")).toBeNull();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByLabelText("Display name")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Register" })).toBeTruthy();
  });
});

describe("AC16: Sign in failure", () => {
  it("AC16: Sign in failure", async () => {
    vi.mocked(signInWithPassword).mockRejectedValue(new Error("nope"));
    render(<LoginScreen />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(screen.getByText("Could not sign in.")).toBeTruthy(),
    );
    expect(screen.getByText("Could not sign in.").className).toContain(
      "field-error",
    );
    expect(screen.queryByText("Budgets")).toBeNull();
  });
});

describe("AC17: Register from the login screen", () => {
  it("AC17: Register from the login screen", async () => {
    vi.mocked(registerWithPassword).mockResolvedValue({
      uid: "uid-alice",
      email: "alice@example.com",
      getIdToken: async () => "tok-alice",
    });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: "uid-alice",
        email: "alice@example.com",
        displayName: "Alice",
        canUseFromText: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        isModerator: false,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginScreen />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret12" },
    });
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Alice" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const call = fetchMock.mock.calls[0] as unknown as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(call[0]).toBe("/api/register");
    expect(call[1]).toEqual({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer tok-alice",
      },
      body: JSON.stringify({ displayName: "Alice" }),
    });
  });
});

describe("AC18: Register at cap from the login screen", () => {
  it("AC18: Register at cap from the login screen", async () => {
    vi.mocked(registerWithPassword).mockResolvedValue({
      uid: "uid-new",
      email: "new@example.com",
      getIdToken: async () => "tok-new",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: "The household is full (10 users)." }),
      })),
    );
    render(<LoginScreen />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret12" },
    });
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "New" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    await waitFor(() =>
      expect(
        screen.getByText("The household is full (10 users)."),
      ).toBeTruthy(),
    );
    expect(
      screen.getByText("The household is full (10 users).").className,
    ).toContain("field-error");
    expect(screen.queryByText("Budgets")).toBeNull();
  });
});
