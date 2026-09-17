import { useState, type FormEvent } from "react";
import { listBudgets, updateBudget } from "../budgets";
import { formatDate, parseDate } from "../dates";
import { formatMoney, parseOptionalMoney } from "../money";
import { CategoriesTab } from "./CategoriesTab";
import { EntriesTab } from "./EntriesTab";
import { FromTextTab } from "./FromTextTab";
import { ReportTab } from "./ReportTab";
import { useStoreRevision } from "./useStoreRevision";

const TABS = [
  { label: "Categories", id: "categories" },
  { label: "Income", id: "income" },
  { label: "Expenses", id: "expenses" },
  { label: "Report", id: "report" },
  { label: "From text", id: "from-text" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function BudgetScreen({
  budgetId,
  onBack,
}: {
  budgetId: string;
  onBack?: () => void;
}) {
  useStoreRevision();
  const budget = listBudgets().find((item) => item.id === budgetId);
  const [tab, setTab] = useState<TabId>("categories");
  const [name, setName] = useState(budget?.name ?? "");
  const [description, setDescription] = useState(budget?.description ?? "");
  const [start, setStart] = useState(
    budget?.startDate ? formatDate(budget.startDate) : "",
  );
  const [end, setEnd] = useState(
    budget?.endDate ? formatDate(budget.endDate) : "",
  );
  const [target, setTarget] = useState(
    budget?.targetLeftoverCents !== null && budget?.targetLeftoverCents !== undefined
      ? formatMoney(budget.targetLeftoverCents)
      : "",
  );
  const [nameError, setNameError] = useState("");
  const [startError, setStartError] = useState("");
  const [endError, setEndError] = useState("");
  const [targetError, setTargetError] = useState("");

  if (!budget) {
    return null;
  }

  function saveHeader(event: FormEvent) {
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
    const result = updateBudget(budgetId, {
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
    setNameError("");
  }

  return (
    <>
      <p className="form-actions">
        <button className="button button--secondary" type="button" onClick={() => onBack?.()}>
          Back to budgets
        </button>
      </p>
      <form className="header-form" onSubmit={saveHeader}>
        <p className="field">
          <label htmlFor="open-budget-name">Name</label>
          <input
            id="open-budget-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {nameError ? <span className="field-error">{nameError}</span> : null}
        </p>
        <p className="field">
          <label htmlFor="open-budget-description">Description</label>
          <input
            id="open-budget-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </p>
        <div className="field-row">
          <p className="field">
            <label htmlFor="open-budget-start">Start</label>
            <input
              id="open-budget-start"
              placeholder="dd.mm.yyyy"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
            {startError ? <span className="field-error">{startError}</span> : null}
          </p>
          <p className="field">
            <label htmlFor="open-budget-end">End</label>
            <input
              id="open-budget-end"
              placeholder="dd.mm.yyyy"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
            {endError ? <span className="field-error">{endError}</span> : null}
          </p>
        </div>
        <p className="field">
          <label htmlFor="open-budget-target">Target leftover (EUR)</label>
          <input
            id="open-budget-target"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          />
          {targetError ? <span className="field-error">{targetError}</span> : null}
        </p>
        <p className="form-actions">
          <button className="button button--primary" type="submit">
            Save
          </button>
        </p>
      </form>
      <div className="tabs">
        {TABS.map((item) => (
          <button
            className={tab === item.id ? "tab tab--active" : "tab"}
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "categories" ? <CategoriesTab budgetId={budgetId} /> : null}
      {tab === "income" ? (
        <EntriesTab budgetId={budgetId} kind="income" />
      ) : null}
      {tab === "expenses" ? (
        <EntriesTab budgetId={budgetId} kind="expense" />
      ) : null}
      {tab === "report" ? <ReportTab budgetId={budgetId} /> : null}
      {tab === "from-text" ? <FromTextTab budgetId={budgetId} /> : null}
    </>
  );
}
