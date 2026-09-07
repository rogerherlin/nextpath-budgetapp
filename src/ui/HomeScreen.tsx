import { useState, type FormEvent } from "react";
import {
  copyBudget,
  createBudget,
  deleteBudget,
  listBudgets,
} from "../budgets";
import { parseDate } from "../dates";
import { parseOptionalMoney } from "../money";
import { useStoreRevision } from "./useStoreRevision";

export function deleteBudgetConfirmMessage(name: string): string {
  return `Delete budget “${name}”? This cannot be undone.`;
}

export function HomeScreen({
  onOpen,
}: {
  onOpen?: (budgetId: string) => void;
}) {
  useStoreRevision();
  const budgets = listBudgets();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [target, setTarget] = useState("");
  const [nameError, setNameError] = useState("");
  const [startError, setStartError] = useState("");
  const [endError, setEndError] = useState("");
  const [targetError, setTargetError] = useState("");

  function resetForm() {
    setName("");
    setDescription("");
    setStart("");
    setEnd("");
    setTarget("");
    setNameError("");
    setStartError("");
    setEndError("");
    setTargetError("");
    setShowForm(false);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const startParsed = parseDate(start);
    const endParsed = parseDate(end);
    const targetParsed = parseOptionalMoney(target);
    setStartError(startParsed.ok ? "" : startParsed.error);
    setEndError(endParsed.ok ? "" : endParsed.error);
    setTargetError(targetParsed.ok ? "" : targetParsed.error);
    if (!startParsed.ok || !endParsed.ok || !targetParsed.ok) {
      return;
    }
    const result = createBudget({
      name,
      description,
      startDate: startParsed.date,
      endDate: endParsed.date,
      targetLeftoverCents: targetParsed.cents,
    });
    if (!result.ok) {
      setNameError(result.error);
      return;
    }
    resetForm();
  }

  return (
    <>
      {budgets.length === 0 ? <p>No budgets yet.</p> : null}
      {budgets.length > 0 ? (
        <ul>
          {budgets.map((budget) => (
            <li key={budget.id}>
              <span>{budget.name}</span>
              <button type="button" onClick={() => onOpen?.(budget.id)}>
                Open
              </button>
              <button type="button" onClick={() => copyBudget(budget.id)}>
                Copy
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(deleteBudgetConfirmMessage(budget.name))) {
                    deleteBudget(budget.id);
                  }
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {showForm ? (
        <form onSubmit={onSubmit}>
          <p>
            <label htmlFor="budget-name">Name</label>
            <input
              id="budget-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {nameError ? <span>{nameError}</span> : null}
          </p>
          <p>
            <label htmlFor="budget-description">Description</label>
            <input
              id="budget-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </p>
          <p>
            <label htmlFor="budget-start">Start</label>
            <input
              id="budget-start"
              placeholder="dd.mm.yyyy"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
            {startError ? <span>{startError}</span> : null}
          </p>
          <p>
            <label htmlFor="budget-end">End</label>
            <input
              id="budget-end"
              placeholder="dd.mm.yyyy"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
            {endError ? <span>{endError}</span> : null}
          </p>
          <p>
            <label htmlFor="budget-target">Target leftover (EUR)</label>
            <input
              id="budget-target"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            />
            {targetError ? <span>{targetError}</span> : null}
          </p>
          <button type="submit">Save</button>
          <button type="button" onClick={resetForm}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setShowForm(true)}>
          New budget
        </button>
      )}
    </>
  );
}
