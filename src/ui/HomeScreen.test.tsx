/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetStore } from "../budgets";
import type { Budget } from "../types";
import { HomeScreen } from "./HomeScreen";

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
    expect(screen.getByText("Sign-up is full (10 users).")).toBeTruthy();
  });
});
