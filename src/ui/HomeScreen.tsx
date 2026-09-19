import { useState, type FormEvent } from "react";
import {
  copyBudgetRemote,
  createBudgetRemote,
  deleteBudgetRemote,
} from "../clientStore";
import {
  copyBudget,
  createBudget,
  deleteBudget,
  listBudgets,
} from "../budgets";
import { parseDate } from "../dates";
import { parseOptionalMoney } from "../money";
import type {
  Actor,
  BudgetSummary,
  MeProfile,
  UserProfile,
  ViewerRelation,
} from "../types";
import { useStoreRevision } from "./useStoreRevision";

export function deleteBudgetConfirmMessage(name: string): string {
  return `Delete budget “${name}”? This cannot be undone.`;
}

export function deleteUserConfirmMessage(email: string): string {
  return `Delete user “${email}”? Their budgets will also be deleted.`;
}

function badgeLabel(relation: ViewerRelation): string {
  if (relation === "owner" || relation === "moderator") {
    return "Yours";
  }
  if (relation === "public") {
    return "Public";
  }
  return "Shared";
}

function canOpen(relation: ViewerRelation): boolean {
  return (
    relation === "owner" ||
    relation === "moderator" ||
    relation === "edit" ||
    relation === "browse"
  );
}

function canCopy(relation: ViewerRelation): boolean {
  return canOpen(relation);
}

function canDelete(relation: ViewerRelation): boolean {
  return relation === "owner" || relation === "moderator";
}

export function HomeScreen({
  onOpen,
  actor,
  summaries,
  household,
  onToggleFromText,
  onDeleteUser,
  getIdToken,
  onSummariesChange,
}: {
  onOpen?: (budgetId: string) => void;
  actor?: Actor;
  summaries?: BudgetSummary[];
  household?: UserProfile[];
  onToggleFromText?: (userId: string, canUseFromText: boolean) => void;
  onDeleteUser?: (userId: string) => void;
  getIdToken?: () => Promise<string | null>;
  onSummariesChange?: (next: BudgetSummary[]) => void;
}) {
  useStoreRevision();
  const listed: Array<{
    id: string;
    name: string;
    viewerRelation: ViewerRelation;
  }> =
    summaries ??
    listBudgets().map((budget) => ({
      id: budget.id,
      name: budget.name,
      viewerRelation: "owner",
    }));
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
    const input = {
      name,
      description,
      startDate: startParsed.date,
      endDate: endParsed.date,
      targetLeftoverCents: targetParsed.cents,
    };
    if (getIdToken !== undefined) {
      void (async () => {
        const remote = await createBudgetRemote(getIdToken, input);
        if (!remote.ok) {
          setNameError(remote.error);
          return;
        }
        onSummariesChange?.(remote.summaries);
        resetForm();
      })();
      return;
    }
    const result = actor ? createBudget(actor, input) : createBudget(input);
    if (!result.ok) {
      setNameError(result.error);
      return;
    }
    resetForm();
  }

  const me: MeProfile | undefined = actor
    ? { ...actor.profile, isModerator: actor.isModerator }
    : undefined;

  return (
    <>
      {listed.length === 0 ? <p className="empty-note">No budgets yet.</p> : null}
      {listed.length > 0 ? (
        <ul className="budget-list">
          {listed.map((budget) => (
            <li className="budget-row" key={budget.id}>
              <span className="budget-row__name">{budget.name}</span>
              {summaries ? (
                <span className="budget-row__badge">
                  {badgeLabel(budget.viewerRelation)}
                </span>
              ) : null}
              <span className="budget-row__actions">
                {canOpen(budget.viewerRelation) ? (
                  <button
                    className="button button--primary"
                    type="button"
                    onClick={() => onOpen?.(budget.id)}
                  >
                    Open
                  </button>
                ) : null}
                {canCopy(budget.viewerRelation) ? (
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => {
                      if (getIdToken !== undefined) {
                        void (async () => {
                          const remote = await copyBudgetRemote(
                            getIdToken,
                            budget.id,
                          );
                          if (remote.ok) {
                            onSummariesChange?.(remote.summaries);
                          }
                        })();
                        return;
                      }
                      if (actor) {
                        copyBudget(actor, budget.id);
                      } else {
                        copyBudget(budget.id);
                      }
                    }}
                  >
                    Copy
                  </button>
                ) : null}
                {canDelete(budget.viewerRelation) ? (
                  <button
                    className="button button--danger"
                    type="button"
                    onClick={() => {
                      if (window.confirm(deleteBudgetConfirmMessage(budget.name))) {
                        if (getIdToken !== undefined) {
                          void (async () => {
                            const remote = await deleteBudgetRemote(
                              getIdToken,
                              budget.id,
                            );
                            if (remote.ok) {
                              onSummariesChange?.(remote.summaries);
                            }
                          })();
                          return;
                        }
                        if (actor) {
                          deleteBudget(actor, budget.id);
                        } else {
                          deleteBudget(budget.id);
                        }
                      }
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {showForm ? (
        <form onSubmit={onSubmit}>
          <p className="field">
            <label htmlFor="budget-name">Name</label>
            <input
              id="budget-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {nameError ? <span className="field-error">{nameError}</span> : null}
          </p>
          <p className="field">
            <label htmlFor="budget-description">Description</label>
            <input
              id="budget-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </p>
          <div className="field-row">
            <p className="field">
              <label htmlFor="budget-start">Start</label>
              <input
                id="budget-start"
                placeholder="dd.mm.yyyy"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
              {startError ? <span className="field-error">{startError}</span> : null}
            </p>
            <p className="field">
              <label htmlFor="budget-end">End</label>
              <input
                id="budget-end"
                placeholder="dd.mm.yyyy"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
              {endError ? <span className="field-error">{endError}</span> : null}
            </p>
          </div>
          <p className="field">
            <label htmlFor="budget-target">Target leftover (EUR)</label>
            <input
              id="budget-target"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            />
            {targetError ? <span className="field-error">{targetError}</span> : null}
          </p>
          <p className="form-actions">
            <button className="button button--primary" type="submit">
              Save
            </button>
            <button className="button button--secondary" type="button" onClick={resetForm}>
              Cancel
            </button>
          </p>
        </form>
      ) : (
        <button
          className="button button--primary"
          type="button"
          onClick={() => setShowForm(true)}
        >
          New budget
        </button>
      )}
      {me?.isModerator ? (
        <section>
          <h2>Household</h2>
          <ul className="plain-list">
            {(household ?? []).map((user) => (
              <li key={user.id}>
                <span>{user.email}</span>
                <label>
                  From text
                  <input
                    type="checkbox"
                    checked={user.canUseFromText}
                    onChange={(event) =>
                      onToggleFromText?.(user.id, event.target.checked)
                    }
                  />
                </label>
                {user.id !== actor?.profile.id ? (
                  <button
                    className="button button--danger"
                    type="button"
                    onClick={() => {
                      if (window.confirm(deleteUserConfirmMessage(user.email))) {
                        onDeleteUser?.(user.id);
                      }
                    }}
                  >
                    Delete user
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {(household ?? []).length >= 10 ? (
            <p>Sign-up is full (10 users).</p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
