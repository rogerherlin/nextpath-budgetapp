import { canDelete, canListSummary, canRead, canWrite } from "./acl";
import { isNameTaken, namesForOwner, nextCopyName, normalizeName } from "./names";
import { notify, persist } from "./persist";
import type { Actor, Budget, Category, DateParts, Entry } from "./types";

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

const FALLBACK_ACTOR: Actor = {
  profile: {
    id: "local",
    email: "local@localhost",
    displayName: "Local",
    canUseFromText: true,
    createdAt: "1970-01-01T00:00:00.000Z",
  },
  isModerator: true,
};

function isActor(value: unknown): value is Actor {
  return (
    typeof value === "object" &&
    value !== null &&
    "profile" in value &&
    "isModerator" in value
  );
}

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

export type MutationResult =
  | { ok: true }
  | { ok: false; error: string };

export function deleteBudget(id: string): MutationResult;
export function deleteBudget(actor: Actor, id: string): MutationResult;
export function deleteBudget(
  actorOrId: Actor | string,
  maybeId?: string,
): MutationResult {
  const actor = maybeId === undefined ? FALLBACK_ACTOR : (actorOrId as Actor);
  const id = maybeId === undefined ? (actorOrId as string) : maybeId;
  const existing = budgets.find((budget) => budget.id === id);
  if (!existing || !canRead(actor, existing)) {
    return { ok: false, error: "Not found." };
  }
  if (!canDelete(actor, existing)) {
    return { ok: false, error: "Not allowed." };
  }
  budgets = budgets.filter((budget) => budget.id !== id);
  persist();
  return { ok: true };
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
): CreateBudgetResult;
export function updateBudget(
  actor: Actor,
  id: string,
  input: UpdateBudgetInput,
): CreateBudgetResult;
export function updateBudget(
  actorOrId: Actor | string,
  idOrInput: string | UpdateBudgetInput,
  maybeInput?: UpdateBudgetInput,
): CreateBudgetResult {
  const actor = isActor(actorOrId) ? actorOrId : FALLBACK_ACTOR;
  const id = isActor(actorOrId) ? (idOrInput as string) : actorOrId;
  const input = isActor(actorOrId)
    ? (maybeInput as UpdateBudgetInput)
    : (idOrInput as UpdateBudgetInput);
  const existing = budgets.find((budget) => budget.id === id);
  if (!existing || !canWrite(actor, existing)) {
    return { ok: false, error: "Not found." };
  }
  const name = normalizeName(input.name);
  if (name === "") {
    return { ok: false, error: "Name is required." };
  }
  const otherNames = namesForOwner(
    budgets.filter((budget) => budget.id !== id),
    existing.ownerId,
  );
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

export function copyBudget(id: string): MutationResult;
export function copyBudget(actor: Actor, id: string): MutationResult;
export function copyBudget(
  actorOrId: Actor | string,
  maybeId?: string,
): MutationResult {
  const actor = maybeId === undefined ? FALLBACK_ACTOR : (actorOrId as Actor);
  const id = maybeId === undefined ? (actorOrId as string) : maybeId;
  const source = budgets.find((budget) => budget.id === id);
  if (!source || !canRead(actor, source)) {
    return { ok: false, error: "Not found." };
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
  const copierId = actor.profile.id;
  budgets = [
    ...budgets,
    {
      id: nextId("b"),
      name: nextCopyName(source.name, namesForOwner(budgets, copierId)),
      ownerId: copierId,
      visibility: "hidden",
      grants: [],
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
  return { ok: true };
}

export function createBudget(input: CreateBudgetInput): CreateBudgetResult;
export function createBudget(
  actor: Actor,
  input: CreateBudgetInput,
): CreateBudgetResult;
export function createBudget(
  actorOrInput: Actor | CreateBudgetInput,
  maybeInput?: CreateBudgetInput,
): CreateBudgetResult {
  const actor = maybeInput === undefined ? FALLBACK_ACTOR : (actorOrInput as Actor);
  const input =
    maybeInput === undefined
      ? (actorOrInput as CreateBudgetInput)
      : maybeInput;
  const name = normalizeName(input.name);
  if (name === "") {
    return { ok: false, error: "Name is required." };
  }
  const ownerId = actor.profile.id;
  if (isNameTaken(name, namesForOwner(budgets, ownerId))) {
    return { ok: false, error: "The name is already in use." };
  }
  budgets = [
    ...budgets,
    {
      id: `${Date.now()}-${budgets.length}`,
      name,
      ownerId,
      visibility: "hidden",
      grants: [],
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

export function listBudgetSummaries(actor: Actor): Budget[] {
  return listBudgets().filter((budget) => canListSummary(actor, budget));
}
