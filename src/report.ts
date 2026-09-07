import type { Budget, Category, Entry } from "./types";

export type ReportLine = {
  name: string;
  totalCents: number;
};

export type Report = {
  income: ReportLine[];
  expense: ReportLine[];
  actualCents: number;
  targetCents: number | null;
};

function categoryTotals(categories: Category[], entries: Entry[]): ReportLine[] {
  return categories.map((category) => ({
    name: category.name,
    totalCents: entries
      .filter((entry) => entry.categoryId === category.id)
      .reduce((sum, entry) => sum + entry.amountCents, 0),
  }));
}

function sumCents(lines: ReportLine[]): number {
  return lines.reduce((sum, line) => sum + line.totalCents, 0);
}

export function buildReport(budget: Budget): Report {
  const income = categoryTotals(budget.incomeCategories, budget.incomeEntries);
  const expense = categoryTotals(budget.expenseCategories, budget.expenseEntries);
  return {
    income,
    expense,
    actualCents: sumCents(income) - sumCents(expense),
    targetCents: budget.targetLeftoverCents,
  };
}
