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
