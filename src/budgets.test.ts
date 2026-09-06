import { describe, expect, it } from "vitest";
import {
  copyBudget,
  createBudget,
  deleteBudget,
  listBudgets,
  resetStore,
  updateBudget,
} from "./budgets";
import type { Budget } from "./types";

function summerBudgetFromAc10(): Budget {
  return {
    id: "b1",
    name: "Summer",
    description: "",
    startDate: null,
    endDate: null,
    targetLeftoverCents: null,
    incomeCategories: [{ id: "c1", name: "Salary" }],
    expenseCategories: [],
    incomeEntries: [
      {
        id: "e1",
        categoryId: "c1",
        comment: "June",
        amountCents: 10000,
        date: null,
      },
    ],
    expenseEntries: [],
  };
}

describe("AC1: Create budget with unique name", () => {
  it("AC1: Create budget with unique name", () => {
    resetStore();
    createBudget({ name: "Summer" });
    expect(listBudgets()).toHaveLength(1);
    expect(listBudgets()[0]).toMatchObject({
      name: "Summer",
      description: "",
      startDate: null,
      endDate: null,
      targetLeftoverCents: null,
      incomeCategories: [],
      expenseCategories: [],
      incomeEntries: [],
      expenseEntries: [],
    });
  });
});

describe("AC2: Trim name on create", () => {
  it("AC2: Trim name on create", () => {
    resetStore();
    createBudget({ name: "  Summer  " });
    expect(listBudgets()[0]?.name).toBe("Summer");
  });
});

describe("AC3: Reject empty name", () => {
  it("AC3: Reject empty name", () => {
    resetStore();
    const result = createBudget({ name: "" });
    expect(result).toEqual({ ok: false, error: "Name is required." });
    expect(listBudgets()).toHaveLength(0);
  });
});

describe("AC4: Reject whitespace-only name", () => {
  it("AC4: Reject whitespace-only name", () => {
    resetStore();
    const result = createBudget({ name: "   " });
    expect(result).toEqual({ ok: false, error: "Name is required." });
    expect(listBudgets()).toHaveLength(0);
  });
});

describe("AC5: Reject duplicate name case-insensitively", () => {
  it("AC5: Reject duplicate name case-insensitively", () => {
    resetStore();
    createBudget({ name: "Summer" });
    const result = createBudget({ name: "summer" });
    expect(result).toEqual({ ok: false, error: "The name is already in use." });
    expect(listBudgets()).toHaveLength(1);
  });
});

describe("AC6: Create with optional fields set", () => {
  it("AC6: Create with optional fields set", () => {
    resetStore();
    createBudget({
      name: "Summer",
      description: "Holiday",
      startDate: { year: 2026, month: 6, day: 1 },
      endDate: { year: 2026, month: 6, day: 30 },
      targetLeftoverCents: 20000,
    });
    expect(listBudgets()[0]).toMatchObject({
      description: "Holiday",
      startDate: { year: 2026, month: 6, day: 1 },
      endDate: { year: 2026, month: 6, day: 30 },
      targetLeftoverCents: 20000,
    });
  });
});

describe("AC10: Copy clones data with a new id and copy name", () => {
  it("AC10: Copy clones data with a new id and copy name", () => {
    resetStore([summerBudgetFromAc10()]);
    copyBudget("b1");
    const listed = listBudgets();
    expect(listed).toHaveLength(2);
    const copy = listed.find((budget) => budget.id !== "b1");
    expect(copy?.name).toBe("Summer (copy1)");
    expect(copy?.id).not.toBe("b1");
    expect(copy?.incomeCategories).toHaveLength(1);
    expect(copy?.incomeCategories[0]?.name).toBe("Salary");
    expect(copy?.incomeCategories[0]?.id).not.toBe("c1");
    expect(copy?.incomeEntries).toHaveLength(1);
    expect(copy?.incomeEntries[0]?.comment).toBe("June");
    expect(copy?.incomeEntries[0]?.amountCents).toBe(10000);
    expect(copy?.incomeEntries[0]?.date).toBeNull();
    expect(copy?.incomeEntries[0]?.id).not.toBe("e1");
    expect(copy?.incomeEntries[0]?.categoryId).toBe(
      copy?.incomeCategories[0]?.id,
    );
  });
});

describe("AC11: Copy does not share data with the source", () => {
  it("AC11: Copy does not share data with the source", () => {
    resetStore([summerBudgetFromAc10()]);
    copyBudget("b1");
    const source = listBudgets().find((budget) => budget.id === "b1");
    if (source?.incomeCategories[0]) {
      source.incomeCategories[0].name = "Wages";
    }
    const copy = listBudgets().find((budget) => budget.id !== "b1");
    expect(copy?.incomeCategories[0]?.name).toBe("Salary");
  });
});

describe("AC12: Delete budget by id", () => {
  it("AC12: Delete budget by id", () => {
    resetStore([
      { ...summerBudgetFromAc10(), id: "b1", name: "Summer" },
      { ...summerBudgetFromAc10(), id: "b2", name: "Winter" },
    ]);
    deleteBudget("b1");
    const listed = listBudgets();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.name).toBe("Winter");
  });
});

describe("AC13: Delete the last budget", () => {
  it("AC13: Delete the last budget", () => {
    resetStore([summerBudgetFromAc10()]);
    deleteBudget("b1");
    expect(listBudgets()).toEqual([]);
  });
});

describe("AC14: Rename to a taken name is rejected", () => {
  it("AC14: Rename to a taken name is rejected", () => {
    resetStore([
      { ...summerBudgetFromAc10(), id: "b1", name: "Summer" },
      { ...summerBudgetFromAc10(), id: "b2", name: "Winter" },
    ]);
    const result = updateBudget("b1", { name: " winter " });
    expect(result).toEqual({ ok: false, error: "The name is already in use." });
    expect(listBudgets().find((budget) => budget.id === "b1")?.name).toBe(
      "Summer",
    );
  });
});

describe("AC15: Rename with trim succeeds", () => {
  it("AC15: Rename with trim succeeds", () => {
    resetStore([summerBudgetFromAc10()]);
    updateBudget("b1", { name: "  Autumn  " });
    expect(listBudgets().find((budget) => budget.id === "b1")?.name).toBe(
      "Autumn",
    );
  });
});
