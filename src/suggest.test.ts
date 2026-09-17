import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { listBudgets, resetStore } from "./budgets";
import * as categories from "./categories";
import * as entries from "./entries";
import {
  applySuggestedItems,
  parseSuggestResponse,
  suggestItemToReviewRow,
  type ReviewRow,
} from "./suggest";
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

function row(partial: Partial<ReviewRow> & Pick<ReviewRow, "kind" | "categoryName" | "amountText">): ReviewRow {
  return {
    categoryId: null,
    comment: "",
    dateText: "",
    error: "",
    ...partial,
  };
}

describe("AC7: Apply uses existing category", () => {
  it("AC7: Apply uses existing category", () => {
    resetStore([
      {
        ...emptyBudget("b1"),
        expenseCategories: [{ id: "c2", name: "Rent" }],
      },
    ]);
    const remaining = applySuggestedItems("b1", [
      row({
        kind: "expense",
        categoryId: "c2",
        categoryName: "Rent",
        comment: "rent",
        amountText: "600,00",
      }),
    ]);
    expect(remaining).toEqual([]);
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.expenseCategories).toHaveLength(1);
    expect(budget?.expenseEntries).toHaveLength(1);
    expect(budget?.expenseEntries[0]?.categoryId).toBe("c2");
    expect(budget?.expenseEntries[0]?.comment).toBe("rent");
    expect(budget?.expenseEntries[0]?.amountCents).toBe(60000);
    expect(budget?.expenseEntries[0]?.date).toBeNull();
    expect(budget?.expenseEntries[0]?.id.length).toBeGreaterThan(0);
    expect(budget?.incomeEntries).toEqual([]);
  });
});

describe("AC8: Apply creates a missing category", () => {
  it("AC8: Apply creates a missing category", () => {
    resetStore([emptyBudget("b1")]);
    applySuggestedItems("b1", [
      row({
        kind: "expense",
        categoryName: "Movies",
        comment: "tickets",
        amountText: "20,00",
      }),
    ]);
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.expenseCategories).toHaveLength(1);
    expect(budget?.expenseCategories[0]?.name).toBe("Movies");
    expect(budget?.expenseCategories[0]?.id.length).toBeGreaterThan(0);
    expect(budget?.expenseEntries).toHaveLength(1);
    expect(budget?.expenseEntries[0]?.categoryId).toBe(
      budget?.expenseCategories[0]?.id,
    );
    expect(budget?.expenseEntries[0]?.comment).toBe("tickets");
    expect(budget?.expenseEntries[0]?.amountCents).toBe(2000);
    expect(budget?.expenseEntries[0]?.date).toBeNull();
  });
});

describe("AC9: New category matches existing name (case-insensitive)", () => {
  it("AC9: New category matches existing name (case-insensitive)", () => {
    resetStore([
      {
        ...emptyBudget("b1"),
        expenseCategories: [{ id: "c2", name: "Rent" }],
      },
    ]);
    applySuggestedItems("b1", [
      row({
        kind: "expense",
        categoryName: "rent",
        comment: "July",
        amountText: "600,00",
      }),
    ]);
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.expenseCategories).toHaveLength(1);
    expect(budget?.expenseEntries[0]?.categoryId).toBe("c2");
  });
});

describe("AC10: User can change income vs expense before apply", () => {
  it("AC10: User can change income vs expense before apply", () => {
    resetStore([emptyBudget("b1")]);
    applySuggestedItems("b1", [
      row({
        kind: "expense",
        categoryName: "Loan",
        comment: "friend",
        amountText: "100,00",
      }),
    ]);
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.expenseCategories.map((item) => item.name)).toEqual(["Loan"]);
    expect(budget?.expenseEntries).toHaveLength(1);
    expect(budget?.expenseEntries[0]?.amountCents).toBe(10000);
    expect(budget?.incomeCategories).toEqual([]);
    expect(budget?.incomeEntries).toEqual([]);
  });
});

describe("AC11: Null kind must be chosen", () => {
  it("AC11: Null kind must be chosen", () => {
    resetStore([emptyBudget("b1")]);
    const remaining = applySuggestedItems("b1", [
      row({
        kind: null,
        categoryName: "Loan",
        amountText: "100,00",
      }),
    ]);
    expect(remaining[0]?.error).toBe("Select income or expense.");
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeCategories).toEqual([]);
    expect(budget?.expenseCategories).toEqual([]);
    expect(budget?.incomeEntries).toEqual([]);
    expect(budget?.expenseEntries).toEqual([]);
  });
});

describe("AC12: Partial apply", () => {
  it("AC12: Partial apply", () => {
    resetStore([
      {
        ...emptyBudget("b1"),
        incomeCategories: [{ id: "c1", name: "Salary" }],
      },
    ]);
    const remaining = applySuggestedItems("b1", [
      row({
        kind: "income",
        categoryId: "c1",
        categoryName: "Salary",
        comment: "pay",
        amountText: "4 000,00",
      }),
      row({
        kind: "expense",
        categoryName: "",
        comment: "x",
        amountText: "50,00",
      }),
    ]);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.error).toBe("Name is required.");
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeEntries).toHaveLength(1);
    expect(budget?.incomeEntries[0]?.amountCents).toBe(400000);
    expect(budget?.expenseCategories).toEqual([]);
    expect(budget?.expenseEntries).toEqual([]);
  });
});

describe("AC13: Invalid amount on a review row is skipped", () => {
  it("AC13: Invalid amount on a review row is skipped", () => {
    resetStore([emptyBudget("b1")]);
    const remaining = applySuggestedItems("b1", [
      row({
        kind: "expense",
        categoryName: "Food",
        amountText: "abc",
      }),
    ]);
    expect(remaining[0]?.error).toBe("Enter a valid amount.");
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.expenseEntries).toEqual([]);
  });
});

describe("AC14: Date parsed or left empty", () => {
  it("AC14: Date parsed or left empty", () => {
    resetStore([
      {
        ...emptyBudget("b1"),
        expenseCategories: [{ id: "c2", name: "Rent" }],
      },
    ]);
    applySuggestedItems("b1", [
      row({
        kind: "expense",
        categoryId: "c2",
        categoryName: "Rent",
        amountText: "1,00",
        dateText: "15.03.2026",
      }),
      row({
        kind: "expense",
        categoryId: "c2",
        categoryName: "Rent",
        amountText: "2,00",
        dateText: "",
      }),
    ]);
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.expenseEntries[0]?.date).toEqual({
      year: 2026,
      month: 3,
      day: 15,
    });
    expect(budget?.expenseEntries[1]?.date).toBeNull();
  });
});

describe("AC15: Invalid date on a review row is skipped", () => {
  it("AC15: Invalid date on a review row is skipped", () => {
    resetStore([emptyBudget("b1")]);
    const remaining = applySuggestedItems("b1", [
      row({
        kind: "expense",
        categoryName: "Rent",
        amountText: "1,00",
        dateText: "2026-03-15",
      }),
    ]);
    expect(remaining[0]?.error).toBe("Enter a date as dd.mm.yyyy.");
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.expenseEntries).toEqual([]);
  });
});

describe("AC17: Delete-shaped Gemini fields never delete", () => {
  it("AC17: Delete-shaped Gemini fields never delete", () => {
    resetStore([
      {
        ...emptyBudget("b1"),
        expenseCategories: [{ id: "c2", name: "Rent" }],
        expenseEntries: [
          {
            id: "e1",
            categoryId: "c2",
            comment: "July",
            amountCents: 1000,
            date: null,
          },
        ],
      },
    ]);
    const parsed = parseSuggestResponse({
      items: [],
      deleteCategoryIds: ["c2"],
      deleteEntryIds: ["e1"],
    });
    expect(parsed.ok).toBe(true);
    const deleteCategory = vi.spyOn(categories, "deleteCategory");
    const deleteEntry = vi.spyOn(entries, "deleteEntry");
    if (parsed.ok) {
      applySuggestedItems(
        "b1",
        parsed.items.map((item) => suggestItemToReviewRow(item)),
      );
    }
    expect(deleteCategory).not.toHaveBeenCalled();
    expect(deleteEntry).not.toHaveBeenCalled();
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.expenseCategories.some((item) => item.id === "c2")).toBe(true);
    expect(budget?.expenseEntries.some((item) => item.id === "e1")).toBe(true);
    deleteCategory.mockRestore();
    deleteEntry.mockRestore();
  });
});

describe("AC18: Wrong-list category id is not used", () => {
  it("AC18: Wrong-list category id is not used", () => {
    resetStore([
      {
        ...emptyBudget("b1"),
        incomeCategories: [{ id: "c1", name: "Salary" }],
      },
    ]);
    applySuggestedItems("b1", [
      row({
        kind: "expense",
        categoryId: "c1",
        categoryName: "Salary",
        comment: "x",
        amountText: "1,00",
      }),
    ]);
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.expenseCategories).toHaveLength(1);
    expect(budget?.expenseCategories[0]?.name).toBe("Salary");
    expect(budget?.expenseCategories[0]?.id).not.toBe("c1");
    expect(budget?.expenseEntries[0]?.categoryId).toBe(
      budget?.expenseCategories[0]?.id,
    );
    expect(budget?.incomeEntries).toEqual([]);
  });
});

describe("AC19: Batch ids are unique", () => {
  it("AC19: Batch ids are unique", () => {
    resetStore([emptyBudget("b1")]);
    applySuggestedItems("b1", [
      row({ kind: "expense", categoryName: "A", amountText: "1,00" }),
      row({ kind: "expense", categoryName: "B", amountText: "2,00" }),
      row({ kind: "expense", categoryName: "C", amountText: "3,00" }),
    ]);
    const budget = listBudgets().find((item) => item.id === "b1");
    const entryIds = (budget?.expenseEntries ?? []).map((item) => item.id);
    expect(new Set(entryIds).size).toBe(3);
    const categoryIds = (budget?.expenseCategories ?? []).map((item) => item.id);
    expect(new Set(categoryIds).size).toBe(3);
  });
});

describe("AC20: Currency words do not change the amount", () => {
  it("AC20: Currency words do not change the amount", () => {
    const review = suggestItemToReviewRow({
      kind: "expense",
      categoryId: null,
      categoryName: "Food",
      comment: "shop",
      amountEuros: 50,
      date: null,
    });
    expect(review.amountText).toBe("50,00");
  });
});

describe("AC23: Key never uses VITE_ prefix", () => {
  it("AC23: Key never uses VITE_ prefix", () => {
    const files = [
      "src/ui/FromTextTab.tsx",
      "src/ui/BudgetScreen.tsx",
      "src/suggest.ts",
      "src/geminiSuggest.ts",
      "src/clientStore.ts",
      "vite.config.ts",
    ];
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    for (const file of files) {
      const text = readFileSync(join(root, file), "utf8");
      expect(text).not.toMatch(/VITE_GEMINI/);
      expect(text).not.toMatch(/import\.meta\.env\.VITE_.*GEMINI/);
    }
  });
});

describe("AC24: .env is gitignored", () => {
  it("AC24: .env is gitignored", () => {
    const gitignore = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", ".gitignore"),
      "utf8",
    );
    expect(gitignore.split(/\r?\n/)).toContain(".env");
  });
});

describe("AC25: New category name keeps the model’s wording", () => {
  it("AC25: New category name keeps the model’s wording", () => {
    resetStore([emptyBudget("b1")]);
    applySuggestedItems("b1", [
      row({
        kind: "expense",
        categoryName: "elokuvat",
        comment: "liput",
        amountText: "20,00",
      }),
    ]);
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.expenseCategories).toHaveLength(1);
    expect(budget?.expenseCategories[0]?.name).toBe("elokuvat");
    expect(budget?.expenseEntries[0]?.categoryId).toBe(
      budget?.expenseCategories[0]?.id,
    );
  });
});
