import { existsSync, readFileSync } from "node:fs";
import { parseStoreJson } from "./store";
import type { AppRepo } from "./repo";
import type { Budget } from "./types";

function withOwner(
  budget: Budget,
  ownerId: string,
): Budget {
  return {
    ...budget,
    ownerId,
    visibility: "hidden",
    grants: [],
  };
}

export async function migrateJsonIfNeeded(
  repo: AppRepo,
  jsonPath: string,
  moderatorUid: string,
): Promise<void> {
  if (await repo.budgetCount() > 0) {
    return;
  }
  if (!existsSync(jsonPath)) {
    return;
  }
  const parsed = parseStoreJson(readFileSync(jsonPath, "utf8"));
  if (!parsed.ok) {
    return;
  }
  for (const budget of parsed.value.budgets) {
    await repo.saveBudget(withOwner(budget, moderatorUid));
  }
}
