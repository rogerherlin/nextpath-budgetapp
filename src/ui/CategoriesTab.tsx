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
      <ul className="plain-list">
        {categories.map((category) => (
          <li className="category-row" key={category.id}>
            {editingId === category.id ? (
              <form onSubmit={onSaveEdit}>
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  aria-label={`Edit ${kind} category`}
                />
                {editError ? <span className="field-error">{editError}</span> : null}
                <p className="form-actions">
                  <button className="button button--primary" type="submit">
                    Save
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </p>
              </form>
            ) : (
              <>
                <span className="category-row__name">{category.name}</span>
                <span className="category-row__actions">
                  <button
                    className="button button--secondary"
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
                    className="button button--danger"
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
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={onAdd}>
        <p className="field">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            aria-label={`Add ${kind} category`}
          />
          {addError ? <span className="field-error">{addError}</span> : null}
        </p>
        <p className="form-actions">
          <button className="button button--primary" type="submit">
            Add
          </button>
        </p>
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
