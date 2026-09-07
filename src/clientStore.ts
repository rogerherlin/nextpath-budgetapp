import { listBudgets, resetStore } from "./budgets";
import { setPersist } from "./persist";
import type { Budget } from "./types";

function errorFromBody(data: unknown): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }
  return "Could not read budgets.json.";
}

export async function hydrateFromServer(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  let data: unknown;
  try {
    const response = await fetch("/api/store");
    data = await response.json();
    if (!response.ok) {
      return { ok: false, error: errorFromBody(data) };
    }
  } catch {
    return { ok: false, error: "Could not read budgets.json." };
  }
  if (
    typeof data !== "object" ||
    data === null ||
    !("budgets" in data) ||
    !Array.isArray(data.budgets)
  ) {
    return { ok: false, error: "Could not read budgets.json." };
  }
  resetStore(data.budgets as Budget[]);
  setPersist(() => {
    void fetch("/api/store", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, budgets: listBudgets() }),
    });
  });
  return { ok: true };
}
