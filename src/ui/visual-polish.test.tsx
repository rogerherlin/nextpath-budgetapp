/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { resetStore } from "../budgets";
import type { Budget } from "../types";
import { BudgetScreen } from "./BudgetScreen";
import { HomeScreen } from "./HomeScreen";

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

function reportFixture(targetLeftoverCents: number | null): Budget {
  return {
    id: "b1",
    name: "Summer",
    description: "",
    startDate: null,
    endDate: null,
    targetLeftoverCents,
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

function classList(el: HTMLElement): string[] {
  return [...el.classList];
}

afterEach(() => {
  cleanup();
});

describe("AC1: Home budget rows are list items with a row class", () => {
  it("AC1: Home budget rows are list items with a row class", () => {
    resetStore([
      emptyBudget("b1"),
      { ...emptyBudget("b2"), name: "Winter" },
    ]);
    render(<HomeScreen />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(classList(row)).toContain("budget-row");
      expect(within(row).getByRole("button", { name: "Open" })).toBeTruthy();
      expect(within(row).getByRole("button", { name: "Copy" })).toBeTruthy();
      expect(within(row).getByRole("button", { name: "Delete" })).toBeTruthy();
    }
  });
});

describe("AC2: Button roles on Home", () => {
  it("AC2: Button roles on Home", () => {
    resetStore([emptyBudget("b1")]);
    render(<HomeScreen />);
    const neu = screen.getByRole("button", { name: "New budget" });
    expect(classList(neu)).toEqual(expect.arrayContaining(["button", "button--primary"]));
    const row = screen.getByRole("listitem");
    expect(classList(within(row).getByRole("button", { name: "Open" }))).toEqual(
      expect.arrayContaining(["button", "button--primary"]),
    );
    expect(classList(within(row).getByRole("button", { name: "Copy" }))).toEqual(
      expect.arrayContaining(["button", "button--secondary"]),
    );
    expect(classList(within(row).getByRole("button", { name: "Delete" }))).toEqual(
      expect.arrayContaining(["button", "button--danger"]),
    );
  });
});

describe("AC3: Selected tab class", () => {
  it("AC3: Selected tab class", () => {
    resetStore([emptyBudget("b1")]);
    render(<BudgetScreen budgetId="b1" />);
    const categories = screen.getByRole("button", { name: "Categories" });
    const income = screen.getByRole("button", { name: "Income" });
    const expenses = screen.getByRole("button", { name: "Expenses" });
    const report = screen.getByRole("button", { name: "Report" });
    expect(classList(categories)).toEqual(expect.arrayContaining(["tab", "tab--active"]));
    expect(classList(income)).toContain("tab");
    expect(classList(income)).not.toContain("tab--active");
    expect(classList(expenses)).toContain("tab");
    expect(classList(expenses)).not.toContain("tab--active");
    expect(classList(report)).toContain("tab");
    expect(classList(report)).not.toContain("tab--active");
    fireEvent.click(report);
    expect(classList(screen.getByRole("button", { name: "Report" }))).toContain(
      "tab--active",
    );
    expect(classList(screen.getByRole("button", { name: "Categories" }))).not.toContain(
      "tab--active",
    );
  });
});

describe("AC4: Field errors use field-error", () => {
  it("AC4: Field errors use field-error", () => {
    resetStore([emptyBudget("b1")]);
    render(<BudgetScreen budgetId="b1" />);
    fireEvent.click(screen.getByRole("button", { name: "Income" }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(classList(screen.getByText("Enter a valid amount."))).toContain("field-error");
  });
});

describe("AC5: Report groups and summary", () => {
  it("AC5: Report groups and summary", () => {
    resetStore([reportFixture(20000)]);
    render(<BudgetScreen budgetId="b1" />);
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    const blocks = document.querySelectorAll(".report-block");
    expect(blocks).toHaveLength(2);
    expect(within(blocks[0] as HTMLElement).getByText("Salary")).toBeTruthy();
    expect(within(blocks[0] as HTMLElement).getByText("1 500,00")).toBeTruthy();
    expect(within(blocks[1] as HTMLElement).getByText("Rent")).toBeTruthy();
    expect(within(blocks[1] as HTMLElement).getByText("300,00")).toBeTruthy();
    const summary = document.querySelector(".report-summary");
    expect(summary).toBeTruthy();
    expect(within(summary as HTMLElement).getByText("Actual balance")).toBeTruthy();
    expect(within(summary as HTMLElement).getByText("Target leftover")).toBeTruthy();
  });
});

describe("AC6: Actual vs target tone", () => {
  it("AC6: Actual vs target tone", () => {
    resetStore([reportFixture(20000)]);
    const { unmount } = render(<BudgetScreen budgetId="b1" />);
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(classList(screen.getByText("1 210,00"))).toEqual(
      expect.arrayContaining(["money", "money--ahead"]),
    );
    unmount();

    resetStore([reportFixture(200000)]);
    const second = render(<BudgetScreen budgetId="b1" />);
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(classList(screen.getByText("1 210,00"))).toEqual(
      expect.arrayContaining(["money", "money--short"]),
    );
    second.unmount();

    resetStore([reportFixture(null)]);
    render(<BudgetScreen budgetId="b1" />);
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    const classes = classList(screen.getByText("1 210,00"));
    expect(classes).toContain("money");
    expect(classes).not.toContain("money--ahead");
    expect(classes).not.toContain("money--short");
  });
});

describe("AC7: Entry amounts use money", () => {
  it("AC7: Entry amounts use money", () => {
    resetStore([
      {
        ...emptyBudget("b1"),
        incomeCategories: [{ id: "c1", name: "Salary" }],
        incomeEntries: [
          {
            id: "e1",
            categoryId: "c1",
            comment: "pay",
            amountCents: 10000,
            date: null,
          },
        ],
      },
    ]);
    render(<BudgetScreen budgetId="b1" />);
    fireEvent.click(screen.getByRole("button", { name: "Income" }));
    expect(classList(screen.getByText("100,00"))).toContain("money");
  });
});
