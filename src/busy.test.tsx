/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUSY_SPINNER_DELAY_MS, BUSY_SPINNER_HIDE_DELAY_MS, resetBusyForTests } from "./busy";
import { clientFetch } from "./clientFetch";
import { BusyOverlay } from "./ui/BusyOverlay";

const signInWithEmailAndPassword = vi.hoisted(() => vi.fn());

vi.mock("firebase/app", () => ({
  getApps: () => [{}],
  initializeApp: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  connectAuthEmulator: vi.fn(),
  getAuth: () => ({}),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: (...args: unknown[]) =>
    signInWithEmailAndPassword(...args),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

import { signInWithPassword } from "./authClient";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const fakeResponse = { ok: true } as Response;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  resetBusyForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("delayed busy spinner", () => {
  it("AC1: Fast call does not show the spinner", async () => {
    render(<BusyOverlay />);
    const pending = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending.promise),
    );
    const done = clientFetch("/api/me");
    pending.resolve(fakeResponse);
    await act(async () => {
      await done;
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BUSY_SPINNER_DELAY_MS - 1);
    });
    expect(document.querySelector(".busy-overlay")).toBeNull();
  });

  it("AC2: Slow call shows spinner after 400ms", async () => {
    expect(BUSY_SPINNER_DELAY_MS).toBe(400);
    render(<BusyOverlay />);
    const pending = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending.promise),
    );
    void clientFetch("/api/me");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BUSY_SPINNER_DELAY_MS);
    });
    expect(document.querySelector(".busy-overlay")).toBeTruthy();
    expect(document.querySelector(".spinner")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Loading.");
  });

  it("AC3: Overlay hides 250ms after the last call finishes", async () => {
    expect(BUSY_SPINNER_HIDE_DELAY_MS).toBe(250);
    render(<BusyOverlay />);
    const pending = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending.promise),
    );
    const done = clientFetch("/api/me");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BUSY_SPINNER_DELAY_MS);
    });
    expect(document.querySelector(".busy-overlay")).toBeTruthy();
    pending.resolve(fakeResponse);
    await act(async () => {
      await done;
    });
    expect(document.querySelector(".busy-overlay")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BUSY_SPINNER_HIDE_DELAY_MS - 1);
    });
    expect(document.querySelector(".busy-overlay")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(document.querySelector(".busy-overlay")).toBeNull();
  });

  it("AC4: Overlapping calls do not restart the delay", async () => {
    render(<BusyOverlay />);
    const first = deferred<Response>();
    const second = deferred<Response>();
    const fetchMock = vi.fn();
    fetchMock.mockReturnValueOnce(first.promise);
    fetchMock.mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", fetchMock);
    const firstDone = clientFetch("/api/a");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BUSY_SPINNER_DELAY_MS);
    });
    expect(document.querySelector(".busy-overlay")).toBeTruthy();
    void clientFetch("/api/b");
    first.resolve(fakeResponse);
    await act(async () => {
      await firstDone;
    });
    expect(document.querySelector(".busy-overlay")).toBeTruthy();
    second.resolve(fakeResponse);
  });

  it("AC5: Failed fetch still clears busy", async () => {
    render(<BusyOverlay />);
    const pending = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending.promise),
    );
    const done = clientFetch("/api/me");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BUSY_SPINNER_DELAY_MS);
    });
    pending.reject(new Error("network"));
    await act(async () => {
      await done.catch(() => undefined);
    });
    expect(document.querySelector(".busy-overlay")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BUSY_SPINNER_HIDE_DELAY_MS);
    });
    expect(document.querySelector(".busy-overlay")).toBeNull();
  });

  it("AC7: Auth credential calls increment the same counter", async () => {
    render(<BusyOverlay />);
    const pending = deferred<{ user: { uid: string; email: string } }>();
    signInWithEmailAndPassword.mockReturnValue(pending.promise);
    const done = signInWithPassword("alice@example.com", "secret");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BUSY_SPINNER_DELAY_MS);
    });
    expect(document.querySelector(".busy-overlay")).toBeTruthy();
    pending.resolve({
      user: { uid: "uid-alice", email: "alice@example.com" },
    });
    await act(async () => {
      await done;
    });
    expect(document.querySelector(".busy-overlay")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BUSY_SPINNER_HIDE_DELAY_MS);
    });
    expect(document.querySelector(".busy-overlay")).toBeNull();
  });

  it("AC8: Sequential follow-up keeps the spinner", async () => {
    render(<BusyOverlay />);
    const first = deferred<Response>();
    const second = deferred<Response>();
    const fetchMock = vi.fn();
    fetchMock.mockReturnValueOnce(first.promise);
    fetchMock.mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", fetchMock);
    const firstDone = clientFetch("/api/a");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BUSY_SPINNER_DELAY_MS);
    });
    expect(document.querySelector(".busy-overlay")).toBeTruthy();
    first.resolve(fakeResponse);
    await act(async () => {
      await firstDone;
    });
    expect(document.querySelector(".busy-overlay")).toBeTruthy();
    const secondDone = clientFetch("/api/b");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BUSY_SPINNER_HIDE_DELAY_MS);
    });
    expect(document.querySelector(".busy-overlay")).toBeTruthy();
    second.resolve(fakeResponse);
    await act(async () => {
      await secondDone;
    });
    expect(document.querySelector(".busy-overlay")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BUSY_SPINNER_HIDE_DELAY_MS);
    });
    expect(document.querySelector(".busy-overlay")).toBeNull();
  });
});
