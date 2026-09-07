import { isNameTaken, nextCopyName, normalizeName } from "./names";
import { notify, persist } from "./persist";
import type { Budget, Category, DateParts, Entry } from "./types";

export type CreateBudgetResult =
  | { ok: true }
  | { ok: false; error: string };

export type CreateBudgetInput = {
  name: string;
  description?: string;
  startDate?: DateParts | null;
  endDate?: DateParts | null;
  targetLeftoverCents?: number | null;
};

let budgets: Budget[] = [];

export function resetStore(initial: Budget[] = []): void {
  budgets = initial;
  notify();
}

export function mapBudget(
  id: string,
  mapper: (budget: Budget) => Budget,
): void {
  budgets = budgets.map((budget) => (budget.id === id ? mapper(budget) : budget));
  persist();
}

export function deleteBudget(id: string): void {
  budgets = budgets.filter((budget) => budget.id !== id);
  persist();
}

export type UpdateBudgetInput = {
  name: string;
  description?: string;
  startDate?: DateParts | null;
  endDate?: DateParts | null;
  targetLeftoverCents?: number | null;
};

export function updateBudget(
  id: string,
  input: UpdateBudgetInput,
): CreateBudgetResult {
  const name = normalizeName(input.name);
  if (name === "") {
    return { ok: false, error: "Name is required." };
  }
  const otherNames = budgets
    .filter((budget) => budget.id !== id)
    .map((budget) => budget.name);
  if (isNameTaken(name, otherNames)) {
    return { ok: false, error: "The name is already in use." };
  }
  budgets = budgets.map((budget) =>
    budget.id === id
      ? {
          ...budget,
          name,
          description: input.description ?? budget.description,
          startDate:
            input.startDate !== undefined ? input.startDate : budget.startDate,
          endDate: input.endDate !== undefined ? input.endDate : budget.endDate,
          targetLeftoverCents:
            input.targetLeftoverCents !== undefined
              ? input.targetLeftoverCents
              : budget.targetLeftoverCents,
        }
      : budget,
  );
  persist();
  return { ok: true };
}

export function copyBudget(id: string): void {
  const source = budgets.find((budget) => budget.id === id);
  if (!source) {
    return;
  }
  let seq = 0;
  const nextId = (prefix: string): string => {
    seq += 1;
    return `${prefix}-${seq}`;
  };
  const categoryIdByOld = new Map<string, string>();
  const cloneCategories = (categories: Category[]): Category[] =>
    categories.map((category) => {
      const newId = nextId("c");
      categoryIdByOld.set(category.id, newId);
      return { id: newId, name: category.name };
    });
  const incomeCategories = cloneCategories(source.incomeCategories);
  const expenseCategories = cloneCategories(source.expenseCategories);
  const remapEntry = (entry: Entry): Entry => ({
    id: nextId("e"),
    categoryId: categoryIdByOld.get(entry.categoryId) ?? entry.categoryId,
    comment: entry.comment,
    amountCents: entry.amountCents,
    date: entry.date,
  });
  budgets = [
    ...budgets,
    {
      id: nextId("b"),
      name: nextCopyName(
        source.name,
        budgets.map((budget) => budget.name),
      ),
      description: source.description,
      startDate: source.startDate,
      endDate: source.endDate,
      targetLeftoverCents: source.targetLeftoverCents,
      incomeCategories,
      expenseCategories,
      incomeEntries: source.incomeEntries.map(remapEntry),
      expenseEntries: source.expenseEntries.map(remapEntry),
    },
  ];
  persist();
}

export function createBudget(input: CreateBudgetInput): CreateBudgetResult {
  const name = normalizeName(input.name);
  if (name === "") {
    return { ok: false, error: "Name is required." };
  }
  if (isNameTaken(name, budgets.map((budget) => budget.name))) {
    return { ok: false, error: "The name is already in use." };
  }
  budgets = [
    ...budgets,
    {
      id: `${Date.now()}-${budgets.length}`,
      name,
      description: input.description ?? "",
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      targetLeftoverCents: input.targetLeftoverCents ?? null,
      incomeCategories: [],
      expenseCategories: [],
      incomeEntries: [],
      expenseEntries: [],
    },
  ];
  persist();
  return { ok: true };
}

export function listBudgets(): Budget[] {
  return [...budgets];
}
