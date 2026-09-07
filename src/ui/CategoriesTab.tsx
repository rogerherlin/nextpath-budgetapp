import { useState, type FormEvent } from "react";
import { listBudgets } from "../budgets";
import {
  addCategory,
  categoryEntryCount,
  deleteCategory,
  updateCategory,
} from "../categories";
import type { Budget, Category } from "../types";
import { useStoreRevision } from "./useStoreRevision";

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
  kind,
}: {
  categories: Category[];
  budget: Budget;
  kind: "income" | "expense";
}) {
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState("");

  function onAdd(event: FormEvent) {
    event.preventDefault();
    const result = addCategory(budget.id, kind, { name: newName });
    if (!result.ok) {
      setAddError(result.error);
      return;
    }
    setNewName("");
    setAddError("");
  }

  function onSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (editingId === null) {
      return;
    }
    const result = updateCategory(budget.id, editingId, { name: editName });
    if (!result.ok) {
      setEditError(result.error);
      return;
    }
    setEditingId(null);
    setEditError("");
  }

  return (
    <>
      <ul>
        {categories.map((category) => (
          <li key={category.id}>
            {editingId === category.id ? (
              <form onSubmit={onSaveEdit}>
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  aria-label={`Edit ${kind} category`}
                />
                {editError ? <span>{editError}</span> : null}
                <button type="submit">Save</button>
                <button type="button" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <span>{category.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(category.id);
                    setEditName(category.name);
                    setEditError("");
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        deleteCategoryConfirmMessage(
                          category.name,
                          categoryEntryCount(budget, category.id),
                        ),
                      )
                    ) {
                      deleteCategory(budget.id, category.id);
                    }
                  }}
                >
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={onAdd}>
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          aria-label={`Add ${kind} category`}
        />
        {addError ? <span>{addError}</span> : null}
        <button type="submit">Add</button>
      </form>
    </>
  );
}

export function CategoriesTab({ budgetId }: { budgetId: string }) {
  useStoreRevision();
  const budget = listBudgets().find((item) => item.id === budgetId);
  if (!budget) {
    return null;
  }
  return (
    <div className="category-columns">
      <section>
        <h2>Income</h2>
        <CategoryList
          budget={budget}
          categories={budget.incomeCategories}
          kind="income"
        />
      </section>
      <section>
        <h2>Expense</h2>
        <CategoryList
          budget={budget}
          categories={budget.expenseCategories}
          kind="expense"
        />
      </section>
    </div>
  );
}
