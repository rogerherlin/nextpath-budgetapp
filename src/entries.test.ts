import { describe, expect, it } from "vitest";
import { listBudgets, resetStore } from "./budgets";
import { addEntry, deleteEntry, updateEntry } from "./entries";
import type { Budget } from "./types";

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

function budgetWithIncomeSalary(id: string): Budget {
  return {
    ...emptyBudget(id),
    incomeCategories: [{ id: "c1", name: "Salary" }],
  };
}

describe("AC1: Add income entry", () => {
  it("AC1: Add income entry", () => {
    resetStore([budgetWithIncomeSalary("b1")]);
    addEntry("b1", "income", {
      categoryId: "c1",
      comment: "June",
      amountCents: 100000,
      date: { year: 2026, month: 6, day: 1 },
    });
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeEntries).toHaveLength(1);
    expect(budget?.incomeEntries[0]?.categoryId).toBe("c1");
    expect(budget?.incomeEntries[0]?.comment).toBe("June");
    expect(budget?.incomeEntries[0]?.amountCents).toBe(100000);
    expect(budget?.incomeEntries[0]?.date).toEqual({
      year: 2026,
      month: 6,
      day: 1,
    });
    expect(budget?.expenseEntries).toEqual([]);
  });
});

describe("AC2: Add expense entry", () => {
  it("AC2: Add expense entry", () => {
    resetStore([
      {
        ...emptyBudget("b1"),
        expenseCategories: [{ id: "c2", name: "Rent" }],
      },
    ]);
    addEntry("b1", "expense", {
      categoryId: "c2",
      comment: "Flat",
      amountCents: 30000,
      date: null,
    });
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.expenseEntries).toHaveLength(1);
    expect(budget?.expenseEntries[0]?.categoryId).toBe("c2");
    expect(budget?.expenseEntries[0]?.comment).toBe("Flat");
    expect(budget?.expenseEntries[0]?.amountCents).toBe(30000);
    expect(budget?.expenseEntries[0]?.date).toBeNull();
    expect(budget?.incomeEntries).toEqual([]);
  });
});

describe("AC3: Allow empty comment", () => {
  it("AC3: Allow empty comment", () => {
    resetStore([budgetWithIncomeSalary("b1")]);
    addEntry("b1", "income", {
      categoryId: "c1",
      comment: "",
      amountCents: 1,
      date: null,
    });
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeEntries[0]?.comment).toBe("");
  });
});

describe("AC4: Allow zero amount", () => {
  it("AC4: Allow zero amount", () => {
    resetStore([budgetWithIncomeSalary("b1")]);
    addEntry("b1", "income", {
      categoryId: "c1",
      comment: "x",
      amountCents: 0,
      date: null,
    });
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeEntries[0]?.amountCents).toBe(0);
  });
});

describe("AC5: Allow negative amount", () => {
  it("AC5: Allow negative amount", () => {
    resetStore([budgetWithIncomeSalary("b1")]);
    addEntry("b1", "income", {
      categoryId: "c1",
      comment: "x",
      amountCents: -500,
      date: null,
    });
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeEntries[0]?.amountCents).toBe(-500);
  });
});

describe("AC6: Reject missing category", () => {
  it("AC6: Reject missing category", () => {
    resetStore([emptyBudget("b1")]);
    const result = addEntry("b1", "income", {
      categoryId: "",
      comment: "x",
      amountCents: 100,
      date: null,
    });
    expect(result).toEqual({ ok: false, error: "Select a category." });
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeEntries).toEqual([]);
  });
});

describe("AC7: Reject income entry with expense category", () => {
  it("AC7: Reject income entry with expense category", () => {
    resetStore([
      {
        ...emptyBudget("b1"),
        expenseCategories: [{ id: "c2", name: "Rent" }],
      },
    ]);
    const result = addEntry("b1", "income", {
      categoryId: "c2",
      comment: "x",
      amountCents: 100,
      date: null,
    });
    expect(result).toEqual({ ok: false, error: "Select a category." });
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeEntries).toEqual([]);
  });
});

describe("AC8: Entry date may fall outside budget range", () => {
  it("AC8: Entry date may fall outside budget range", () => {
    resetStore([
      {
        ...budgetWithIncomeSalary("b1"),
        startDate: { year: 2026, month: 6, day: 1 },
        endDate: { year: 2026, month: 6, day: 30 },
      },
    ]);
    const result = addEntry("b1", "income", {
      categoryId: "c1",
      comment: "x",
      amountCents: 100,
      date: { year: 2020, month: 1, day: 1 },
    });
    expect(result).toEqual({ ok: true });
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeEntries[0]?.date).toEqual({
      year: 2020,
      month: 1,
      day: 1,
    });
  });
});

describe("AC9: Update entry", () => {
  it("AC9: Update entry", () => {
    resetStore([
      {
        ...budgetWithIncomeSalary("b1"),
        incomeEntries: [
          {
            id: "e1",
            categoryId: "c1",
            comment: "June",
            amountCents: 100,
            date: null,
          },
        ],
      },
    ]);
    updateEntry("b1", "e1", {
      comment: "July",
      amountCents: 200,
      categoryId: "c1",
      date: null,
    });
    const budget = listBudgets().find((item) => item.id === "b1");
    const updated = budget?.incomeEntries.find((item) => item.id === "e1");
    expect(updated?.comment).toBe("July");
    expect(updated?.amountCents).toBe(200);
  });
});

describe("AC10: Delete entry", () => {
  it("AC10: Delete entry", () => {
    resetStore([
      {
        ...budgetWithIncomeSalary("b1"),
        incomeEntries: [
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
            amountCents: 2,
            date: null,
          },
        ],
      },
    ]);
    deleteEntry("b1", "e1");
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeEntries).toHaveLength(1);
    expect(budget?.incomeEntries[0]?.id).toBe("e2");
  });
});

describe("AC14: Entries are not shared across budgets", () => {
  it("AC14: Entries are not shared across budgets", () => {
    resetStore([
      {
        ...budgetWithIncomeSalary("b1"),
        incomeEntries: [
          {
            id: "e1",
            categoryId: "c1",
            comment: "June",
            amountCents: 100,
            date: null,
          },
        ],
      },
      {
        ...emptyBudget("b2"),
        name: "Winter",
        incomeCategories: [{ id: "c2", name: "Salary" }],
      },
    ]);
    addEntry("b2", "income", {
      categoryId: "c2",
      comment: "x",
      amountCents: 1,
      date: null,
    });
    const b1 = listBudgets().find((item) => item.id === "b1");
    const b2 = listBudgets().find((item) => item.id === "b2");
    expect(b1?.incomeEntries).toHaveLength(1);
    expect(b2?.incomeEntries).toHaveLength(1);
    expect(b2?.incomeEntries[0]?.id).not.toBe(b1?.incomeEntries[0]?.id);
  });
});
