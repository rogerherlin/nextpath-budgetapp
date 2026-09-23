/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetStore } from "../budgets";
import { DEFAULT_RESOURCE_CAPS, setClientResourceCaps } from "../resourceCaps";
import type { Budget, UserProfile } from "../types";
import { HomeScreen, deleteUserConfirmMessage } from "./HomeScreen";

function summerBudget(): Budget {
  return {
    id: "b1",
    name: "Summer",
    ownerId: "uid-alice",
    visibility: "hidden",
    grants: [],
    description: "",
    startDate: null,
    endDate: null,
    targetLeftoverCents: null,
    incomeCategories: [],
    expenseCategories: [],
    incomeEntries: [],
    expenseEntries: [],
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setClientResourceCaps(DEFAULT_RESOURCE_CAPS);
});

describe("AC16: Delete-budget confirmation copy", () => {
  it("AC16: Delete-budget confirmation copy", () => {
    resetStore([summerBudget()]);
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    render(<HomeScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledWith(
      "Delete budget “Summer”? This cannot be undone.",
    );
  });
});

describe("AC17: Home list labels when empty", () => {
  it("AC17: Home list labels when empty", () => {
    resetStore([]);
    render(<HomeScreen />);
    expect(screen.getByText("No budgets yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New budget" })).toBeTruthy();
  });
});

describe("AC18: Home list shows names", () => {
  it("AC18: Home list shows names", () => {
    resetStore([
      summerBudget(),
      { ...summerBudget(), id: "b2", name: "Winter" },
    ]);
    render(<HomeScreen />);
    expect(screen.getByText("Summer")).toBeTruthy();
    expect(screen.getByText("Winter")).toBeTruthy();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(within(row).getByRole("button", { name: "Open" })).toBeTruthy();
      expect(within(row).getByRole("button", { name: "Copy" })).toBeTruthy();
      expect(within(row).getByRole("button", { name: "Delete" })).toBeTruthy();
    }
  });
});

describe("AC61: Moderator panel hidden for ordinary user", () => {
  it("AC61: Moderator panel hidden for ordinary user", () => {
    resetStore([]);
    render(
      <HomeScreen
        actor={{
          profile: {
            id: "uid-alice",
            email: "alice@example.com",
            displayName: "Alice",
            canUseFromText: false,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          isModerator: false,
        }}
      />,
    );
    expect(screen.queryByRole("heading", { name: "Household" })).toBeNull();
  });
});

describe("AC60: Moderator panel", () => {
  it("AC60: Moderator panel", () => {
    const users = Array.from({ length: 10 }, (_, index) => ({
      id: `uid-${index}`,
      email: `user${index}@example.com`,
      displayName: `User ${index}`,
      canUseFromText: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    }));
    resetStore([]);
    render(
      <HomeScreen
        actor={{
          profile: {
            id: "uid-mod",
            email: "mod@example.com",
            displayName: "Mod",
            canUseFromText: true,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          isModerator: true,
        }}
        household={users}
      />,
    );
    expect(screen.getByRole("heading", { name: "Household" })).toBeTruthy();
    for (const user of users) {
      expect(screen.getByText(user.email)).toBeTruthy();
    }
    expect(screen.getAllByLabelText("From text")).toHaveLength(10);
    expect(screen.getByText("Sign-up is full (3 users).")).toBeTruthy();
  });
});

describe("AC72: Household Delete user control", () => {
  it("AC72: Household Delete user control", () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    resetStore([]);
    render(
      <HomeScreen
        actor={{
          profile: {
            id: "uid-mod",
            email: "mod@example.com",
            displayName: "Mod",
            canUseFromText: true,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          isModerator: true,
        }}
        household={[
          {
            id: "uid-alice",
            email: "alice@example.com",
            displayName: "Alice",
            canUseFromText: false,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "uid-mod",
            email: "mod@example.com",
            displayName: "Mod",
            canUseFromText: true,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ]}
      />,
    );
    const aliceRow = screen.getByText("alice@example.com").closest("li");
    const modRow = screen.getByText("mod@example.com").closest("li");
    expect(aliceRow).toBeTruthy();
    expect(modRow).toBeTruthy();
    expect(
      within(aliceRow as HTMLElement).getByRole("button", { name: "Delete user" }),
    ).toBeTruthy();
    expect(
      within(modRow as HTMLElement).queryByRole("button", { name: "Delete user" }),
    ).toBeNull();
    fireEvent.click(
      within(aliceRow as HTMLElement).getByRole("button", { name: "Delete user" }),
    );
    expect(confirm).toHaveBeenCalledWith(
      'Delete user “alice@example.com”? Their budgets will also be deleted.',
    );
    expect(deleteUserConfirmMessage("alice@example.com")).toBe(
      'Delete user “alice@example.com”? Their budgets will also be deleted.',
    );
  });
});

function householdOf(count: number): UserProfile[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `uid-${index}`,
    email: `user${index}@example.com`,
    displayName: `User ${index}`,
    canUseFromText: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  }));
}

function renderModeratorHousehold(count: number): void {
  resetStore([]);
  render(
    <HomeScreen
      actor={{
        profile: {
          id: "uid-mod",
          email: "mod@example.com",
          displayName: "Mod",
          canUseFromText: true,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        isModerator: true,
      }}
      household={householdOf(count)}
    />,
  );
}

describe("AC27: Home sign-up full uses the user cap", () => {
  it("AC27: Home sign-up full uses the user cap", () => {
    renderModeratorHousehold(3);
    expect(screen.getByText("Sign-up is full (3 users).")).toBeTruthy();

    cleanup();
    renderModeratorHousehold(2);
    expect(screen.queryByText("Sign-up is full (3 users).")).toBeNull();

    cleanup();
    setClientResourceCaps({ ...DEFAULT_RESOURCE_CAPS, userCount: 10 });
    renderModeratorHousehold(3);
    expect(screen.queryByText("Sign-up is full (10 users).")).toBeNull();

    cleanup();
    setClientResourceCaps({ ...DEFAULT_RESOURCE_CAPS, userCount: 10 });
    renderModeratorHousehold(10);
    expect(screen.getByText("Sign-up is full (10 users).")).toBeTruthy();
  });
});
