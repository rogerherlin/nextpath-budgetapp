import { listBudgets, mapBudget, type CreateBudgetResult } from "./budgets";
import type { Entry } from "./types";

type EntryKind = "income" | "expense";

export function addEntry(
  budgetId: string,
  kind: EntryKind,
  input: Omit<Entry, "id">,
): CreateBudgetResult {
  const budget = listBudgets().find((item) => item.id === budgetId);
  const incomeCategoryMissing =
    kind === "income" &&
    !!budget &&
    !budget.incomeCategories.some((category) => category.id === input.categoryId);
  if (input.categoryId === "" || incomeCategoryMissing) {
    return { ok: false, error: "Select a category." };
  }
  const entry: Entry = {
    id: `e-${Date.now()}`,
    categoryId: input.categoryId,
    comment: input.comment,
    amountCents: input.amountCents,
    date: input.date,
  };
  mapBudget(budgetId, (current) =>
    kind === "income"
      ? { ...current, incomeEntries: [...current.incomeEntries, entry] }
      : { ...current, expenseEntries: [...current.expenseEntries, entry] },
  );
  return { ok: true };
}

function patchEntry(
  entries: Entry[],
  entryId: string,
  input: Omit<Entry, "id">,
): Entry[] {
  return entries.map((entry) =>
    entry.id === entryId ? { ...entry, ...input } : entry,
  );
}

export function updateEntry(
  budgetId: string,
  entryId: string,
  input: Omit<Entry, "id">,
): void {
  mapBudget(budgetId, (current) => ({
    ...current,
    incomeEntries: patchEntry(current.incomeEntries, entryId, input),
    expenseEntries: patchEntry(current.expenseEntries, entryId, input),
  }));
}

function withoutEntry(entries: Entry[], entryId: string): Entry[] {
  return entries.filter((entry) => entry.id !== entryId);
}

export function deleteEntry(budgetId: string, entryId: string): void {
  mapBudget(budgetId, (current) => ({
    ...current,
    incomeEntries: withoutEntry(current.incomeEntries, entryId),
    expenseEntries: withoutEntry(current.expenseEntries, entryId),
  }));
}
