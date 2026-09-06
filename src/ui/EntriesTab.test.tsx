/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { listBudgets, resetStore } from "../budgets";
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
});

describe("AC11: Income and Expenses are separate tabs", () => {
  it("AC11: Income and Expenses are separate tabs", () => {
    resetStore([emptyBudget("b1")]);
    render(<BudgetScreen budgetId="b1" />);
    expect(screen.getByRole("button", { name: "Categories" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Income" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Expenses" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Report" })).toBeTruthy();
  });
});

describe("AC12: EUR label on amount fields", () => {
  it("AC12: EUR label on amount fields", () => {
    resetStore([emptyBudget("b1")]);
    render(<BudgetScreen budgetId="b1" />);
    fireEvent.click(screen.getByRole("button", { name: "Income" }));
    const amount = screen.getByLabelText("Amount") as HTMLInputElement;
    expect(screen.getByText("EUR")).toBeTruthy();
    expect(amount.value.includes("EUR")).toBe(false);
  });
});

describe("AC13: Invalid amount on the form uses parseMoney error", () => {
  it("AC13: Invalid amount on the form uses parseMoney error", () => {
    resetStore([emptyBudget("b1")]);
    render(<BudgetScreen budgetId="b1" />);
    fireEvent.click(screen.getByRole("button", { name: "Income" }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("Enter a valid amount.")).toBeTruthy();
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeEntries).toEqual([]);
  });
});
