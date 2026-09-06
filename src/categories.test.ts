import { describe, expect, it } from "vitest";
import { listBudgets, resetStore } from "./budgets";
import { addCategory, deleteCategory, updateCategory } from "./categories";
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

describe("AC1: Add income category", () => {
  it("AC1: Add income category", () => {
    resetStore([emptyBudget("b1")]);
    addCategory("b1", "income", { name: "Salary" });
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeCategories).toHaveLength(1);
    expect(budget?.incomeCategories[0]?.name).toBe("Salary");
    expect(budget?.incomeCategories[0]?.id).toEqual(expect.any(String));
    expect(budget?.incomeCategories[0]?.id.length).toBeGreaterThan(0);
    expect(budget?.expenseCategories).toEqual([]);
  });
});

describe("AC2: Add expense category", () => {
  it("AC2: Add expense category", () => {
    resetStore([emptyBudget("b1")]);
    addCategory("b1", "expense", { name: "Rent" });
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.expenseCategories).toHaveLength(1);
    expect(budget?.expenseCategories[0]?.name).toBe("Rent");
    expect(budget?.expenseCategories[0]?.id).toEqual(expect.any(String));
    expect(budget?.expenseCategories[0]?.id.length).toBeGreaterThan(0);
    expect(budget?.incomeCategories).toEqual([]);
  });
});

describe("AC3: Trim category name", () => {
  it("AC3: Trim category name", () => {
    resetStore([emptyBudget("b1")]);
    addCategory("b1", "income", { name: "  Salary  " });
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeCategories[0]?.name).toBe("Salary");
  });
});

describe("AC4: Reject empty category name", () => {
  it("AC4: Reject empty category name", () => {
    resetStore([emptyBudget("b1")]);
    const result = addCategory("b1", "income", { name: "" });
    expect(result).toEqual({ ok: false, error: "Name is required." });
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeCategories).toEqual([]);
  });
});

describe("AC5: Reject duplicate in the same list", () => {
  it("AC5: Reject duplicate in the same list", () => {
    resetStore([
      {
        ...emptyBudget("b1"),
        incomeCategories: [{ id: "c1", name: "Salary" }],
      },
    ]);
    const result = addCategory("b1", "income", { name: "salary" });
    expect(result).toEqual({ ok: false, error: "The name is already in use." });
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeCategories).toHaveLength(1);
  });
});

describe("AC6: Same name allowed in the other list", () => {
  it("AC6: Same name allowed in the other list", () => {
    resetStore([
      {
        ...emptyBudget("b1"),
        incomeCategories: [{ id: "c1", name: "Other" }],
      },
    ]);
    const result = addCategory("b1", "expense", { name: "Other" });
    expect(result).toEqual({ ok: true });
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeCategories).toHaveLength(1);
    expect(budget?.incomeCategories[0]?.name).toBe("Other");
    expect(budget?.expenseCategories).toHaveLength(1);
    expect(budget?.expenseCategories[0]?.name).toBe("Other");
  });
});

describe("AC7: Rename category", () => {
  it("AC7: Rename category", () => {
    resetStore([
      {
        ...emptyBudget("b1"),
        incomeCategories: [{ id: "c1", name: "Salary" }],
      },
    ]);
    updateCategory("b1", "c1", { name: "  Wages  " });
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeCategories.find((item) => item.id === "c1")?.name).toBe(
      "Wages",
    );
  });
});

describe("AC8: Rename to a taken name in the same list", () => {
  it("AC8: Rename to a taken name in the same list", () => {
    resetStore([
      {
        ...emptyBudget("b1"),
        incomeCategories: [
          { id: "c1", name: "Salary" },
          { id: "c2", name: "Bonus" },
        ],
      },
    ]);
    const result = updateCategory("b1", "c1", { name: "bonus" });
    expect(result).toEqual({ ok: false, error: "The name is already in use." });
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeCategories.find((item) => item.id === "c1")?.name).toBe(
      "Salary",
    );
  });
});

describe("AC9: Delete unused category", () => {
  it("AC9: Delete unused category", () => {
    resetStore([
      {
        ...emptyBudget("b1"),
        incomeCategories: [{ id: "c1", name: "Salary" }],
      },
    ]);
    deleteCategory("b1", "c1");
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeCategories).toEqual([]);
    expect(budget?.incomeEntries).toEqual([]);
    expect(budget?.expenseEntries).toEqual([]);
  });
});

describe("AC10: Delete category with rows cascade", () => {
  it("AC10: Delete category with rows cascade", () => {
    resetStore([
      {
        ...emptyBudget("b1"),
        expenseCategories: [
          { id: "c1", name: "Rent" },
          { id: "c2", name: "Food" },
        ],
        expenseEntries: [
          {
            id: "e1",
            categoryId: "c1",
            comment: "July",
            amountCents: 1000,
            date: null,
          },
          {
            id: "e2",
            categoryId: "c2",
            comment: "Shop",
            amountCents: 200,
            date: null,
          },
        ],
      },
    ]);
    deleteCategory("b1", "c1");
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.expenseCategories.find((item) => item.id === "c1")).toBeUndefined();
    expect(budget?.expenseEntries).toHaveLength(1);
    expect(budget?.expenseEntries[0]?.id).toBe("e2");
  });
});

describe("AC14: Categories are not shared across budgets", () => {
  it("AC14: Categories are not shared across budgets", () => {
    resetStore([
      {
        ...emptyBudget("b1"),
        incomeCategories: [{ id: "c1", name: "Salary" }],
      },
      emptyBudget("b2"),
    ]);
    addCategory("b2", "income", { name: "Salary" });
    const b1 = listBudgets().find((item) => item.id === "b1");
    const b2 = listBudgets().find((item) => item.id === "b2");
    expect(b1?.incomeCategories).toHaveLength(1);
    expect(b2?.incomeCategories).toHaveLength(1);
    expect(b2?.incomeCategories[0]?.id).not.toBe(b1?.incomeCategories[0]?.id);
  });
});
