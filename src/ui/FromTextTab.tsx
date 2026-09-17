import { useState, type FormEvent } from "react";
import { listBudgets } from "../budgets";
import {
  applySuggestedItems,
  parseSuggestResponse,
  suggestItemToReviewRow,
  type ReviewRow,
  type SuggestKind,
} from "../suggest";
import { useStoreRevision } from "./useStoreRevision";

export function FromTextTab({ budgetId }: { budgetId: string }) {
  useStoreRevision();
  const budget = listBudgets().find((item) => item.id === budgetId);
  const [text, setText] = useState("");
  const [textError, setTextError] = useState("");
  const [rows, setRows] = useState<ReviewRow[] | null>(null);

  if (!budget) {
    return null;
  }

  const openBudget = budget;

  async function suggest() {
    if (text === "") {
      setTextError("Enter a description.");
      return;
    }
    setTextError("");
    try {
      const response = await fetch("/api/suggest-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          incomeCategories: openBudget.incomeCategories.map((item) => ({
            id: item.id,
            name: item.name,
          })),
          expenseCategories: openBudget.expenseCategories.map((item) => ({
            id: item.id,
            name: item.name,
          })),
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          data.error === "Gemini API key is missing."
            ? "Gemini API key is missing."
            : "Could not suggest entries.";
        setTextError(message);
        return;
      }
      const parsed = parseSuggestResponse(data);
      if (!parsed.ok) {
        setTextError(parsed.error);
        return;
      }
      setRows(
        parsed.items.length === 0
          ? null
          : parsed.items.map((item) => suggestItemToReviewRow(item)),
      );
    } catch {
      setTextError("Could not suggest entries.");
    }
  }

  function updateRow(index: number, patch: Partial<ReviewRow>) {
    setRows((current) =>
      current
        ? current.map((row, rowIndex) =>
            rowIndex === index ? { ...row, ...patch } : row,
          )
        : current,
    );
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    if (!rows) {
      return;
    }
    const remaining = applySuggestedItems(budgetId, rows);
    setRows(remaining.length === 0 ? null : remaining);
  }

  return (
    <section>
      <h2>{`Describe entries for “${budget.name}”`}</h2>
      <p className="field">
        <label htmlFor="from-text-description">What happened</label>
        <textarea
          id="from-text-description"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        {textError ? <span className="field-error">{textError}</span> : null}
      </p>
      <p className="form-actions">
        <button className="button button--primary" type="button" onClick={() => void suggest()}>
          Suggest
        </button>
      </p>
      {rows ? (
        <form onSubmit={apply}>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Category</th>
                <th>Comment</th>
                <th>Amount</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  <td>
                    <p className="field">
                      <label htmlFor={`review-${index}-type`}>Type</label>
                      <select
                        id={`review-${index}-type`}
                        value={row.kind ?? ""}
                        onChange={(event) =>
                          updateRow(index, {
                            kind:
                              event.target.value === "income" ||
                              event.target.value === "expense"
                                ? (event.target.value as SuggestKind)
                                : null,
                          })
                        }
                      >
                        <option value="">Select…</option>
                        <option value="income">Income</option>
                        <option value="expense">Expense</option>
                      </select>
                      {row.error ? (
                        <span className="field-error">{row.error}</span>
                      ) : null}
                    </p>
                  </td>
                  <td>
                    <p className="field">
                      <label htmlFor={`review-${index}-category`}>Category</label>
                      <input
                        id={`review-${index}-category`}
                        value={row.categoryName}
                        onChange={(event) =>
                          updateRow(index, { categoryName: event.target.value })
                        }
                      />
                    </p>
                  </td>
                  <td>
                    <p className="field">
                      <label htmlFor={`review-${index}-comment`}>Comment</label>
                      <input
                        id={`review-${index}-comment`}
                        value={row.comment}
                        onChange={(event) =>
                          updateRow(index, { comment: event.target.value })
                        }
                      />
                    </p>
                  </td>
                  <td>
                    <p className="field">
                      <label htmlFor={`review-${index}-amount`}>Amount</label>
                      <span className="amount-input">
                        <input
                          id={`review-${index}-amount`}
                          className="money"
                          value={row.amountText}
                          onChange={(event) =>
                            updateRow(index, { amountText: event.target.value })
                          }
                        />
                        <span className="currency">EUR</span>
                      </span>
                    </p>
                  </td>
                  <td>
                    <p className="field">
                      <label htmlFor={`review-${index}-date`}>Date</label>
                      <input
                        id={`review-${index}-date`}
                        placeholder="dd.mm.yyyy"
                        value={row.dateText}
                        onChange={(event) =>
                          updateRow(index, { dateText: event.target.value })
                        }
                      />
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.map((row, index) =>
            row.error ? (
              <span className="field-error" key={`err-${index}`}>
                {row.error}
              </span>
            ) : null,
          )}
          <p className="form-actions">
            <button className="button button--primary" type="submit">
              Apply
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setRows(null)}
            >
              Cancel
            </button>
          </p>
        </form>
      ) : null}
    </section>
  );
}
