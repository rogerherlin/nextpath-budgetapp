import { useState, type FormEvent } from "react";
import { listBudgets } from "../budgets";
import { formatDate, parseDate } from "../dates";
import { addEntry, deleteEntry, updateEntry } from "../entries";
import { formatMoney, parseMoney } from "../money";
import type { Entry } from "../types";
import { useStoreRevision } from "./useStoreRevision";

type EntryKind = "income" | "expense";

function EntryFormFields({
  prefix,
  categoryId,
  comment,
  amount,
  date,
  categories,
  errors,
  onCategory,
  onComment,
  onAmount,
  onDate,
}: {
  prefix: string;
  categoryId: string;
  comment: string;
  amount: string;
  date: string;
  categories: { id: string; name: string }[];
  errors: { category?: string; amount?: string; date?: string };
  onCategory: (value: string) => void;
  onComment: (value: string) => void;
  onAmount: (value: string) => void;
  onDate: (value: string) => void;
}) {
  return (
    <>
      <p>
        <label htmlFor={`${prefix}-category`}>Category</label>
        <select
          id={`${prefix}-category`}
          value={categoryId}
          onChange={(event) => onCategory(event.target.value)}
        >
          <option value="">Select a category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {errors.category ? <span>{errors.category}</span> : null}
      </p>
      <p>
        <label htmlFor={`${prefix}-comment`}>Comment</label>
        <input
          id={`${prefix}-comment`}
          value={comment}
          onChange={(event) => onComment(event.target.value)}
        />
      </p>
      <p>
        <label htmlFor={`${prefix}-amount`}>Amount</label>
        <input
          id={`${prefix}-amount`}
          value={amount}
          onChange={(event) => onAmount(event.target.value)}
        />
        <span>EUR</span>
        {errors.amount ? <span>{errors.amount}</span> : null}
      </p>
      <p>
        <label htmlFor={`${prefix}-date`}>Date</label>
        <input
          id={`${prefix}-date`}
          placeholder="dd.mm.yyyy"
          value={date}
          onChange={(event) => onDate(event.target.value)}
        />
        {errors.date ? <span>{errors.date}</span> : null}
      </p>
    </>
  );
}

export function EntriesTab({
  budgetId,
  kind,
}: {
  budgetId: string;
  kind: EntryKind;
}) {
  useStoreRevision();
  const budget = listBudgets().find((item) => item.id === budgetId);
  const [categoryId, setCategoryId] = useState("");
  const [comment, setComment] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [dateError, setDateError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editComment, setEditComment] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editCategoryError, setEditCategoryError] = useState("");
  const [editAmountError, setEditAmountError] = useState("");
  const [editDateError, setEditDateError] = useState("");

  if (!budget) {
    return null;
  }

  const categories =
    kind === "income" ? budget.incomeCategories : budget.expenseCategories;
  const entries =
    kind === "income" ? budget.incomeEntries : budget.expenseEntries;

  function validate(
    rowCategoryId: string,
    rowAmount: string,
    rowDate: string,
    setCat: (value: string) => void,
    setAmt: (value: string) => void,
    setDt: (value: string) => void,
  ):
    | { ok: true; categoryId: string; amountCents: number; date: Entry["date"] }
    | { ok: false } {
    const parsedAmount = parseMoney(rowAmount);
    const parsedDate = parseDate(rowDate);
    setCat(rowCategoryId === "" ? "Select a category." : "");
    setAmt(parsedAmount.ok ? "" : parsedAmount.error);
    setDt(parsedDate.ok ? "" : parsedDate.error);
    if (rowCategoryId === "" || !parsedAmount.ok || !parsedDate.ok) {
      return { ok: false };
    }
    return {
      ok: true,
      categoryId: rowCategoryId,
      amountCents: parsedAmount.cents,
      date: parsedDate.date,
    };
  }

  function onAdd(event: FormEvent) {
    event.preventDefault();
    const parsed = validate(
      categoryId,
      amount,
      date,
      setCategoryError,
      setAmountError,
      setDateError,
    );
    if (!parsed.ok) {
      return;
    }
    const result = addEntry(budgetId, kind, {
      categoryId: parsed.categoryId,
      comment,
      amountCents: parsed.amountCents,
      date: parsed.date,
    });
    if (!result.ok) {
      setCategoryError(result.error);
      return;
    }
    setCategoryId("");
    setComment("");
    setAmount("");
    setDate("");
    setCategoryError("");
    setAmountError("");
    setDateError("");
  }

  function onSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (editingId === null) {
      return;
    }
    const parsed = validate(
      editCategoryId,
      editAmount,
      editDate,
      setEditCategoryError,
      setEditAmountError,
      setEditDateError,
    );
    if (!parsed.ok) {
      return;
    }
    updateEntry(budgetId, editingId, {
      categoryId: parsed.categoryId,
      comment: editComment,
      amountCents: parsed.amountCents,
      date: parsed.date,
    });
    setEditingId(null);
  }

  function categoryName(id: string): string {
    return categories.find((category) => category.id === id)?.name ?? "";
  }

  return (
    <>
      <form onSubmit={onAdd}>
        <EntryFormFields
          prefix={`${kind}-add`}
          categoryId={categoryId}
          comment={comment}
          amount={amount}
          date={date}
          categories={categories}
          errors={{
            category: categoryError,
            amount: amountError,
            date: dateError,
          }}
          onCategory={setCategoryId}
          onComment={setComment}
          onAmount={setAmount}
          onDate={setDate}
        />
        <button type="submit">Add</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Comment</th>
            <th>Amount</th>
            <th>Date</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              {editingId === entry.id ? (
                <td colSpan={5}>
                  <form onSubmit={onSaveEdit}>
                    <EntryFormFields
                      prefix={`${kind}-edit`}
                      categoryId={editCategoryId}
                      comment={editComment}
                      amount={editAmount}
                      date={editDate}
                      categories={categories}
                      errors={{
                        category: editCategoryError,
                        amount: editAmountError,
                        date: editDateError,
                      }}
                      onCategory={setEditCategoryId}
                      onComment={setEditComment}
                      onAmount={setEditAmount}
                      onDate={setEditDate}
                    />
                    <button type="submit">Save</button>
                    <button type="button" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </form>
                </td>
              ) : (
                <>
                  <td>{categoryName(entry.categoryId)}</td>
                  <td>{entry.comment}</td>
                  <td>{formatMoney(entry.amountCents)}</td>
                  <td>{entry.date ? formatDate(entry.date) : ""}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(entry.id);
                        setEditCategoryId(entry.categoryId);
                        setEditComment(entry.comment);
                        setEditAmount(formatMoney(entry.amountCents));
                        setEditDate(entry.date ? formatDate(entry.date) : "");
                        setEditCategoryError("");
                        setEditAmountError("");
                        setEditDateError("");
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEntry(budgetId, entry.id)}
                    >
                      Delete
                    </button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
