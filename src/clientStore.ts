import { listBudgets, resetStore } from "./budgets";
import { setPersist } from "./persist";
import type { Budget, BudgetSummary } from "./types";

function errorFromBody(data: unknown): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }
  return "Sign in required.";
}

async function persistBudgets(
  getIdToken: () => Promise<string | null>,
): Promise<void> {
  const token = await getIdToken();
  if (token === null || token === "") {
    return;
  }
  for (const budget of listBudgets()) {
    await fetch(`/api/budgets/${budget.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(budget),
    });
  }
}

export async function hydrateFromServer(
  getIdToken?: () => Promise<string | null>,
): Promise<
  { ok: true; summaries: BudgetSummary[] } | { ok: false; error: string }
> {
  const token = getIdToken === undefined ? null : await getIdToken();
  if (token === null || token === "") {
    return { ok: false, error: "Sign in required." };
  }
  let data: unknown;
  try {
    const response = await fetch("/api/budgets", {
      headers: { Authorization: `Bearer ${token}` },
    });
    data = await response.json();
    if (!response.ok) {
      return { ok: false, error: errorFromBody(data) };
    }
  } catch {
    return { ok: false, error: "Sign in required." };
  }
  if (
    typeof data !== "object" ||
    data === null ||
    !("budgets" in data) ||
    !Array.isArray(data.budgets)
  ) {
    return { ok: false, error: "Sign in required." };
  }
  const summaries = data.budgets as BudgetSummary[];
  const readable = summaries.filter((item) =>
    ["owner", "moderator", "edit", "browse"].includes(item.viewerRelation),
  );
  const budgets: Budget[] = [];
  for (const item of readable) {
    const response = await fetch(`/api/budgets/${item.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      continue;
    }
    const budget = (await response.json()) as Budget;
    budgets.push(budget);
  }
  resetStore(budgets);
  if (getIdToken !== undefined) {
    setPersist(() => {
      void persistBudgets(getIdToken);
    });
  } else {
    setPersist(() => {});
  }
  return { ok: true, summaries };
}
