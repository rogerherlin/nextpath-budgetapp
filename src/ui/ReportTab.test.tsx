/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { resetStore } from "../budgets";
import type { Budget } from "../types";
import { BudgetScreen } from "./BudgetScreen";

function fixtureBudget(): Budget {
  return {
    id: "b1",
    name: "Summer",
    description: "",
    startDate: null,
    endDate: null,
    targetLeftoverCents: 20000,
    incomeCategories: [
      { id: "c1", name: "Salary" },
      { id: "c2", name: "Other" },
    ],
    expenseCategories: [
      { id: "c3", name: "Rent" },
      { id: "c4", name: "Food" },
    ],
    incomeEntries: [
      {
        id: "e1",
        categoryId: "c1",
        comment: "",
        amountCents: 100000,
        date: null,
      },
      {
        id: "e2",
        categoryId: "c1",
        comment: "",
        amountCents: 50000,
        date: null,
      },
      {
        id: "e3",
        categoryId: "c2",
        comment: "",
        amountCents: 1000,
        date: null,
      },
    ],
    expenseEntries: [
      {
        id: "e4",
        categoryId: "c3",
        comment: "",
        amountCents: 30000,
        date: null,
      },
    ],
  };
}

afterEach(() => {
  cleanup();
});

describe("AC7: Report tab formatted totals", () => {
  it("AC7: Report tab formatted totals", () => {
    resetStore([fixtureBudget()]);
    render(<BudgetScreen budgetId="b1" />);
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(screen.getByText("Salary")).toBeTruthy();
    expect(screen.getByText("1 500,00")).toBeTruthy();
    expect(screen.getByText("Other")).toBeTruthy();
    expect(screen.getByText("10,00")).toBeTruthy();
    expect(screen.getByText("Rent")).toBeTruthy();
    expect(screen.getByText("300,00")).toBeTruthy();
    expect(screen.getByText("Food")).toBeTruthy();
    expect(screen.getByText("0,00")).toBeTruthy();
    expect(screen.getByText("Actual balance")).toBeTruthy();
    expect(screen.getByText("1 210,00")).toBeTruthy();
    expect(screen.getByText("Target leftover")).toBeTruthy();
    expect(screen.getByText("200,00")).toBeTruthy();
  });
});

describe("AC8: Hide target leftover when unset", () => {
  it("AC8: Hide target leftover when unset", () => {
    resetStore([{ ...fixtureBudget(), targetLeftoverCents: null }]);
    render(<BudgetScreen budgetId="b1" />);
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(screen.getByText("Actual balance")).toBeTruthy();
    expect(screen.getByText("1 210,00")).toBeTruthy();
    expect(screen.queryByText("Target leftover")).toBeNull();
  });
});
