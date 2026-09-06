import { listBudgets } from "../budgets";
import { categoryEntryCount } from "../categories";
import type { Budget, Category } from "../types";

export function deleteCategoryConfirmMessage(
  name: string,
  entryCount: number,
): string {
  const base = `Delete category “${name}”?`;
  if (entryCount === 0) {
    return base;
  }
  return `${base} ${entryCount} entries will be deleted.`;
}

function CategoryList({
  categories,
  budget,
}: {
  categories: Category[];
  budget: Budget;
}) {
  return (
    <ul>
      {categories.map((category) => (
        <li key={category.id}>
          <span>{category.name}</span>
          <button
            type="button"
            onClick={() => {
              window.confirm(
                deleteCategoryConfirmMessage(
                  category.name,
                  categoryEntryCount(budget, category.id),
                ),
              );
            }}
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}

export function CategoriesTab({ budgetId }: { budgetId: string }) {
  const budget = listBudgets().find((item) => item.id === budgetId);
  if (!budget) {
    return null;
  }
  return (
    <>
      <h2>Income</h2>
      <CategoryList budget={budget} categories={budget.incomeCategories} />
      <h2>Expense</h2>
      <CategoryList budget={budget} categories={budget.expenseCategories} />
    </>
  );
}
