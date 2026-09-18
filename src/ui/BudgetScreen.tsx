import { useEffect, useState, type FormEvent } from "react";
import {
  canManageSharing,
  canUseFromText as actorCanUseFromText,
  canWrite,
} from "../acl";
import { getAuthToken } from "../authToken";
import { listBudgets, updateBudget } from "../budgets";
import { formatDate, parseDate } from "../dates";
import { formatMoney, parseOptionalMoney } from "../money";
import type {
  Actor,
  DirectoryUser,
  Grant,
  GrantRole,
  MeProfile,
  Visibility,
} from "../types";
import { CategoriesTab } from "./CategoriesTab";
import { EntriesTab } from "./EntriesTab";
import { FromTextTab } from "./FromTextTab";
import { ReportTab } from "./ReportTab";
import { useStoreRevision } from "./useStoreRevision";

const BASE_TABS = [
  { label: "Categories", id: "categories" },
  { label: "Income", id: "income" },
  { label: "Expenses", id: "expenses" },
  { label: "Report", id: "report" },
] as const;

type TabId = (typeof BASE_TABS)[number]["id"] | "from-text";

function actorFromMe(me: MeProfile): Actor {
  return {
    profile: {
      id: me.id,
      email: me.email,
      displayName: me.displayName,
      canUseFromText: me.canUseFromText,
      createdAt: me.createdAt,
    },
    isModerator: me.isModerator,
  };
}

export function BudgetScreen({
  budgetId,
  onBack,
  me,
}: {
  budgetId: string;
  onBack?: () => void;
  me?: MeProfile;
}) {
  useStoreRevision();
  const budget = listBudgets().find((item) => item.id === budgetId);
  const actor = me ? actorFromMe(me) : null;
  const readOnly = actor !== null && budget !== undefined && !canWrite(actor, budget);
  const showFromText =
    actor === null
      ? true
      : budget !== undefined &&
        actorCanUseFromText(actor) &&
        canWrite(actor, budget);
  const showSharing =
    actor !== null && budget !== undefined && canManageSharing(actor, budget);
  const tabs = showFromText
    ? [...BASE_TABS, { label: "From text", id: "from-text" as const }]
    : BASE_TABS;
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
  const [users, setUsers] = useState<DirectoryUser[]>([]);

  useEffect(() => {
    if (!showSharing) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const token = await getAuthToken();
        const headers: Record<string, string> = {};
        if (token !== null && token !== "") {
          headers.Authorization = `Bearer ${token}`;
        }
        const response = await fetch("/api/users", { headers });
        const data: unknown = await response.json();
        if (
          !cancelled &&
          response.ok &&
          typeof data === "object" &&
          data !== null &&
          "users" in data &&
          Array.isArray(data.users)
        ) {
          setUsers(data.users as DirectoryUser[]);
        }
      } catch {
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showSharing]);

  if (!budget) {
    return null;
  }

  const open = budget;

  function saveHeader(event: FormEvent) {
    event.preventDefault();
    if (readOnly) {
      return;
    }
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

  async function saveVisibility(visibility: Visibility) {
    const token = await getAuthToken();
    if (token === null || token === "") {
      return;
    }
    await fetch(`/api/budgets/${budgetId}/visibility`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ visibility }),
    });
  }

  async function saveGrants(next: Grant[]) {
    const token = await getAuthToken();
    if (token === null || token === "") {
      return;
    }
    await fetch(`/api/budgets/${budgetId}/grants`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ grants: next }),
    });
  }

  function grantValue(userId: string): GrantRole | "none" {
    const match = open.grants.find((grant) => grant.userId === userId);
    return match === undefined ? "none" : match.role;
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
            disabled={readOnly}
            onChange={(event) => setName(event.target.value)}
          />
          {nameError ? <span className="field-error">{nameError}</span> : null}
        </p>
        <p className="field">
          <label htmlFor="open-budget-description">Description</label>
          <input
            id="open-budget-description"
            value={description}
            disabled={readOnly}
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
              disabled={readOnly}
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
              disabled={readOnly}
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
            disabled={readOnly}
            onChange={(event) => setTarget(event.target.value)}
          />
          {targetError ? <span className="field-error">{targetError}</span> : null}
        </p>
        {readOnly ? null : (
          <p className="form-actions">
            <button className="button button--primary" type="submit">
              Save
            </button>
          </p>
        )}
      </form>
      {showSharing ? (
        <section>
          <p className="field">
            <label htmlFor="budget-visibility">Visibility</label>
            <select
              id="budget-visibility"
              value={budget.visibility}
              onChange={(event) => {
                const visibility = event.target.value as Visibility;
                void saveVisibility(visibility);
              }}
            >
              <option value="hidden">Hidden</option>
              <option value="public">Public</option>
            </select>
          </p>
          <h2>Sharing</h2>
          {users
            .filter((user) => user.id !== budget.ownerId)
            .map((user) => (
              <p className="field" key={user.id}>
                <label htmlFor={`grant-${user.id}`}>{user.displayName}</label>
                <select
                  id={`grant-${user.id}`}
                  value={grantValue(user.id)}
                  onChange={(event) => {
                    const value = event.target.value;
                    const others = open.grants.filter(
                      (grant) => grant.userId !== user.id,
                    );
                    const next: Grant[] =
                      value === "none" || value === ""
                        ? others
                        : [...others, { userId: user.id, role: value as GrantRole }];
                    void saveGrants(next);
                  }}
                >
                  <option value="none">None</option>
                  <option value="see">See</option>
                  <option value="browse">Browse</option>
                  <option value="edit">Edit</option>
                </select>
              </p>
            ))}
        </section>
      ) : null}
      <div className="tabs">
        {tabs.map((item) => (
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
      {tab === "categories" ? (
        <CategoriesTab budgetId={budgetId} readOnly={readOnly} />
      ) : null}
      {tab === "income" ? (
        <EntriesTab budgetId={budgetId} kind="income" readOnly={readOnly} />
      ) : null}
      {tab === "expenses" ? (
        <EntriesTab budgetId={budgetId} kind="expense" readOnly={readOnly} />
      ) : null}
      {tab === "report" ? <ReportTab budgetId={budgetId} /> : null}
      {tab === "from-text" && showFromText ? (
        <FromTextTab budgetId={budgetId} />
      ) : null}
    </>
  );
}
