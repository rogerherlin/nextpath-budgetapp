/** Ordinary env limits. Missing or non-positive-integer values use the defaults. */

export interface ResourceCaps {
  userCount: number;
  userBudgetCount: number;
  categoryCount: number;
  entryCount: number;
}

export const DEFAULT_RESOURCE_CAPS: ResourceCaps = {
  userCount: 3,
  userBudgetCount: 2,
  categoryCount: 4,
  entryCount: 4,
};

const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

function positiveInteger(raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }
  const trimmed = raw.trim();
  if (!POSITIVE_INTEGER.test(trimmed)) {
    return fallback;
  }
  return Number.parseInt(trimmed, 10);
}

export function readResourceCaps(
  env: Record<string, string | undefined> = process.env,
): ResourceCaps {
  return {
    userCount: positiveInteger(
      env.CAP_USER_COUNT,
      DEFAULT_RESOURCE_CAPS.userCount,
    ),
    userBudgetCount: positiveInteger(
      env.CAP_USER_BUDGET_COUNT,
      DEFAULT_RESOURCE_CAPS.userBudgetCount,
    ),
    categoryCount: positiveInteger(
      env.CAP_CATEGORY_COUNT,
      DEFAULT_RESOURCE_CAPS.categoryCount,
    ),
    entryCount: positiveInteger(
      env.CAP_ENTRY_COUNT,
      DEFAULT_RESOURCE_CAPS.entryCount,
    ),
  };
}

export type CappedListName =
  | "income categories"
  | "expense categories"
  | "income entries"
  | "expense entries";

export function householdFullMessage(userCount: number): string {
  return `The household is full (${userCount} users).`;
}

export function ownedBudgetLimitMessage(userBudgetCount: number): string {
  return `You can own at most ${userBudgetCount} budgets.`;
}

export function listLimitMessage(list: CappedListName, count: number): string {
  return `A budget can have at most ${count} ${list}.`;
}

export function signUpFullMessage(userCount: number): string {
  return `Sign-up is full (${userCount} users).`;
}

let clientCaps: ResourceCaps = { ...DEFAULT_RESOURCE_CAPS };

export function getClientResourceCaps(): ResourceCaps {
  return { ...clientCaps };
}

export function setClientResourceCaps(caps: ResourceCaps): void {
  clientCaps = { ...caps };
}

export function resetClientResourceCaps(): void {
  clientCaps = { ...DEFAULT_RESOURCE_CAPS };
}

function positiveClientInteger(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    return positiveInteger(value, fallback);
  }
  return fallback;
}

/** Keep each field’s default when that config value is missing or not a positive integer. */
export function clientCapsFromConfig(data: unknown): ResourceCaps {
  const record =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : {};
  return {
    userCount: positiveClientInteger(
      record.userCount,
      DEFAULT_RESOURCE_CAPS.userCount,
    ),
    userBudgetCount: positiveClientInteger(
      record.userBudgetCount,
      DEFAULT_RESOURCE_CAPS.userBudgetCount,
    ),
    categoryCount: positiveClientInteger(
      record.categoryCount,
      DEFAULT_RESOURCE_CAPS.categoryCount,
    ),
    entryCount: positiveClientInteger(
      record.entryCount,
      DEFAULT_RESOURCE_CAPS.entryCount,
    ),
  };
}
