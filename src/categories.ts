import { listBudgets, mapBudget, type CreateBudgetResult } from "./budgets";
import { isNameTaken, normalizeName } from "./names";
import type { Budget, Category, Entry } from "./types";

type CategoryKind = "income" | "expense";

function categoriesOf(budget: Budget, kind: CategoryKind): Category[] {
  return kind === "income" ? budget.incomeCategories : budget.expenseCategories;
}

export function addCategory(
  budgetId: string,
  kind: CategoryKind,
  input: { name: string },
): CreateBudgetResult {
  const name = normalizeName(input.name);
  if (name === "") {
    return { ok: false, error: "Name is required." };
  }
  const budget = listBudgets().find((item) => item.id === budgetId);
  if (budget && isNameTaken(name, categoriesOf(budget, kind).map((item) => item.name))) {
    return { ok: false, error: "The name is already in use." };
  }
  const category = { id: `c-${Date.now()}`, name };
  mapBudget(budgetId, (current) =>
    kind === "income"
      ? {
          ...current,
          incomeCategories: [...current.incomeCategories, category],
        }
      : {
          ...current,
          expenseCategories: [...current.expenseCategories, category],
        },
  );
  return { ok: true };
}

function listContaining(budget: Budget, categoryId: string): Category[] {
  if (budget.incomeCategories.some((category) => category.id === categoryId)) {
    return budget.incomeCategories;
  }
  return budget.expenseCategories;
}

function renameCategoryInList(
  categories: Category[],
  categoryId: string,
  name: string,
): Category[] {
  return categories.map((category) =>
    category.id === categoryId ? { ...category, name } : category,
  );
}

export function updateCategory(
  budgetId: string,
  categoryId: string,
  input: { name: string },
): CreateBudgetResult {
  const name = normalizeName(input.name);
  const budget = listBudgets().find((item) => item.id === budgetId);
  const otherNames = budget
    ? listContaining(budget, categoryId)
        .filter((category) => category.id !== categoryId)
        .map((category) => category.name)
    : [];
  if (isNameTaken(name, otherNames)) {
    return { ok: false, error: "The name is already in use." };
  }
  mapBudget(budgetId, (current) => ({
    ...current,
    incomeCategories: renameCategoryInList(
      current.incomeCategories,
      categoryId,
      name,
    ),
    expenseCategories: renameCategoryInList(
      current.expenseCategories,
      categoryId,
      name,
    ),
  }));
  return { ok: true };
}

function withoutCategory(
  categories: Category[],
  categoryId: string,
): Category[] {
  return categories.filter((category) => category.id !== categoryId);
}

function withoutEntriesFor(entries: Entry[], categoryId: string): Entry[] {
  return entries.filter((entry) => entry.categoryId !== categoryId);
}

export function deleteCategory(budgetId: string, categoryId: string): void {
  mapBudget(budgetId, (current) => ({
    ...current,
    incomeCategories: withoutCategory(current.incomeCategories, categoryId),
    expenseCategories: withoutCategory(current.expenseCategories, categoryId),
    incomeEntries: withoutEntriesFor(current.incomeEntries, categoryId),
    expenseEntries: withoutEntriesFor(current.expenseEntries, categoryId),
  }));
}

export function categoryEntryCount(budget: Budget, categoryId: string): number {
  return [...budget.incomeEntries, ...budget.expenseEntries].filter(
    (entry) => entry.categoryId === categoryId,
  ).length;
}
