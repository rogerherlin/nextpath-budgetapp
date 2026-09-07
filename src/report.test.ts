import { describe, expect, it } from "vitest";
import { buildReport } from "./report";
import type { Budget } from "./types";

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

describe("AC1: Income category totals", () => {
  it("AC1: Income category totals", () => {
    expect(buildReport(fixtureBudget()).income).toEqual([
      { name: "Salary", totalCents: 150000 },
      { name: "Other", totalCents: 1000 },
    ]);
  });
});

describe("AC2: Expense category totals including zero", () => {
  it("AC2: Expense category totals including zero", () => {
    expect(buildReport(fixtureBudget()).expense).toEqual([
      { name: "Rent", totalCents: 30000 },
      { name: "Food", totalCents: 0 },
    ]);
  });
});

describe("AC3: Actual leftover is income minus expenses", () => {
  it("AC3: Actual leftover is income minus expenses", () => {
    expect(buildReport(fixtureBudget()).actualCents).toBe(121000);
  });
});

describe("AC4: Target leftover is passed through", () => {
  it("AC4: Target leftover is passed through", () => {
    expect(buildReport(fixtureBudget()).targetCents).toBe(20000);
  });
});

describe("AC5: Missing target is null", () => {
  it("AC5: Missing target is null", () => {
    const report = buildReport({ ...fixtureBudget(), targetLeftoverCents: null });
    expect(report.targetCents).toBe(null);
    expect(report.actualCents).toBe(121000);
  });
});

describe("AC6: Report has no entry comments or row ids", () => {
  it("AC6: Report has no entry comments or row ids", () => {
    expect(Object.keys(buildReport(fixtureBudget())).sort()).toEqual([
      "actualCents",
      "expense",
      "income",
      "targetCents",
    ]);
  });
});

describe("AC9: Empty budget report", () => {
  it("AC9: Empty budget report", () => {
    expect(
      buildReport({
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
      }),
    ).toEqual({
      income: [],
      expense: [],
      actualCents: 0,
      targetCents: null,
    });
  });
});
