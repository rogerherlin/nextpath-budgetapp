/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetStore } from "../budgets";
import type { Budget } from "../types";
import { BudgetScreen } from "./BudgetScreen";

function emptyBudget(id: string): Budget {
  return {
    id,
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

describe("AC11: Categories tab lists", () => {
  it("AC11: Categories tab lists", () => {
    resetStore([emptyBudget("b1")]);
    render(<BudgetScreen budgetId="b1" />);
    fireEvent.click(screen.getByRole("button", { name: "Categories" }));
    expect(screen.getByRole("heading", { name: "Income" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Expense" })).toBeTruthy();
  });
});

describe("AC12: Light confirm when category has zero entries", () => {
  it("AC12: Light confirm when category has zero entries", () => {
    resetStore([
      {
        ...emptyBudget("b1"),
        incomeCategories: [{ id: "c1", name: "Salary" }],
      },
    ]);
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    render(<BudgetScreen budgetId="b1" />);
    fireEvent.click(screen.getByRole("button", { name: "Categories" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledWith('Delete category “Salary”?');
  });
});

describe("AC13: Heavy confirm when category has entries", () => {
  it("AC13: Heavy confirm when category has entries", () => {
    resetStore([
      {
        ...emptyBudget("b1"),
        expenseCategories: [{ id: "c1", name: "Rent" }],
        expenseEntries: [
          {
            id: "e1",
            categoryId: "c1",
            comment: "a",
            amountCents: 1,
            date: null,
          },
          {
            id: "e2",
            categoryId: "c1",
            comment: "b",
            amountCents: 1,
            date: null,
          },
          {
            id: "e3",
            categoryId: "c1",
            comment: "c",
            amountCents: 1,
            date: null,
          },
        ],
      },
    ]);
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    render(<BudgetScreen budgetId="b1" />);
    fireEvent.click(screen.getByRole("button", { name: "Categories" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledWith(
      "Delete category “Rent”? 3 entries will be deleted.",
    );
  });
});
