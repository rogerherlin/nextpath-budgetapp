import { listBudgets } from "./budgets";
import { addCategory } from "./categories";
import { parseDate } from "./dates";
import { addEntry } from "./entries";
import { formatMoney, parseMoney } from "./money";
import { isNameTaken, normalizeName } from "./names";
import type { Budget, Category } from "./types";

export type SuggestKind = "income" | "expense";

export type SuggestItem = {
  kind: SuggestKind | null;
  categoryId: string | null;
  categoryName: string;
  comment: string;
  amountEuros: number;
  date: string | null;
};

export type ReviewRow = {
  kind: SuggestKind | null;
  categoryId: string | null;
  categoryName: string;
  comment: string;
  amountText: string;
  dateText: string;
  error: string;
};

export type ParseSuggestResult =
  | { ok: true; items: SuggestItem[] }
  | { ok: false; error: string };

const PARSE_FAIL: ParseSuggestResult = {
  ok: false,
  error: "Could not suggest entries.",
};

export function amountEurosToText(amountEuros: number): string {
  return formatMoney(Math.round(amountEuros * 100));
}

export function suggestItemToReviewRow(item: SuggestItem): ReviewRow {
  return {
    kind: item.kind,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    comment: item.comment,
    amountText: amountEurosToText(item.amountEuros),
    dateText: item.date ?? "",
    error: "",
  };
}

function isKind(value: unknown): value is SuggestKind | null {
  return value === "income" || value === "expense" || value === null;
}

function parseItem(raw: unknown): SuggestItem | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (!isKind(record.kind ?? null)) {
    return null;
  }
  if (
    record.categoryId !== null &&
    record.categoryId !== undefined &&
    typeof record.categoryId !== "string"
  ) {
    return null;
  }
  if (typeof record.categoryName !== "string") {
    return null;
  }
  if (typeof record.comment !== "string") {
    return null;
  }
  if (typeof record.amountEuros !== "number" || !Number.isFinite(record.amountEuros)) {
    return null;
  }
  if (record.date !== null && typeof record.date !== "string") {
    return null;
  }
  return {
    kind: (record.kind ?? null) as SuggestKind | null,
    categoryId:
      typeof record.categoryId === "string" ? record.categoryId : null,
    categoryName: record.categoryName,
    comment: record.comment,
    amountEuros: record.amountEuros,
    date: typeof record.date === "string" ? record.date : null,
  };
}

export function parseSuggestResponse(data: unknown): ParseSuggestResult {
  if (typeof data !== "object" || data === null) {
    return PARSE_FAIL;
  }
  if (!("items" in data) || !Array.isArray(data.items)) {
    return PARSE_FAIL;
  }
  const items: SuggestItem[] = [];
  for (const raw of data.items) {
    const item = parseItem(raw);
    if (item === null) {
      return PARSE_FAIL;
    }
    items.push(item);
  }
  return { ok: true, items };
}

function categoriesOf(budget: Budget, kind: SuggestKind): Category[] {
  return kind === "income" ? budget.incomeCategories : budget.expenseCategories;
}

function resolveOrCreateCategory(
  budgetId: string,
  kind: SuggestKind,
  categoryId: string | null,
  name: string,
): { ok: true; id: string } | { ok: false; error: string } {
  const budget = listBudgets().find((item) => item.id === budgetId);
  if (!budget) {
    return { ok: false, error: "Select a category." };
  }
  const list = categoriesOf(budget, kind);
  if (categoryId && list.some((category) => category.id === categoryId)) {
    return { ok: true, id: categoryId };
  }
  const existing = list.find((category) =>
    isNameTaken(name, [category.name]),
  );
  if (existing) {
    return { ok: true, id: existing.id };
  }
  const added = addCategory(budgetId, kind, { name });
  if (!added.ok) {
    return added;
  }
  const after = listBudgets().find((item) => item.id === budgetId);
  if (!after) {
    return { ok: false, error: "Select a category." };
  }
  const matchAfter = categoriesOf(after, kind).find((category) =>
    isNameTaken(name, [category.name]),
  );
  if (!matchAfter) {
    return { ok: false, error: "Select a category." };
  }
  return { ok: true, id: matchAfter.id };
}

export function applySuggestedItems(
  budgetId: string,
  rows: ReviewRow[],
): ReviewRow[] {
  const remaining: ReviewRow[] = [];
  for (const row of rows) {
    if (row.kind !== "income" && row.kind !== "expense") {
      remaining.push({ ...row, error: "Select income or expense." });
      continue;
    }
    const name = normalizeName(row.categoryName);
    if (name === "") {
      remaining.push({ ...row, error: "Name is required." });
      continue;
    }
    const amount = parseMoney(row.amountText);
    if (!amount.ok) {
      remaining.push({ ...row, error: amount.error });
      continue;
    }
    const date = parseDate(row.dateText);
    if (!date.ok) {
      remaining.push({ ...row, error: date.error });
      continue;
    }
    const category = resolveOrCreateCategory(
      budgetId,
      row.kind,
      row.categoryId,
      name,
    );
    if (!category.ok) {
      remaining.push({ ...row, error: category.error });
      continue;
    }
    const added = addEntry(budgetId, row.kind, {
      categoryId: category.id,
      comment: row.comment,
      amountCents: amount.cents,
      date: date.date,
    });
    if (!added.ok) {
      remaining.push({ ...row, error: added.error });
    }
  }
  return remaining;
}
