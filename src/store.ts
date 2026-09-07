import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { listBudgets, resetStore } from "./budgets";
import { APP_BUDGETS_FILE } from "./paths";
import { setPersist } from "./persist";
import type { Budget } from "./types";

export type StoreFile = {
  version: number;
  budgets: Budget[];
};

const EMPTY_STORE: StoreFile = { version: 1, budgets: [] };

let budgetsFilePath: string | null = null;

export function serializeStore(store: StoreFile): string {
  return JSON.stringify({ version: store.version, budgets: store.budgets });
}

export function saveStore(): void {
  if (budgetsFilePath === null) {
    return;
  }
  writeFileSync(
    budgetsFilePath,
    serializeStore({ version: 1, budgets: listBudgets() }),
  );
}

function applyLoadedStore(
  path: string,
  store: StoreFile,
): { ok: true; value: StoreFile } {
  budgetsFilePath = path;
  setPersist(saveStore);
  resetStore(store.budgets);
  return { ok: true, value: store };
}

export type LoadStoreResult =
  | { ok: true; value: StoreFile }
  | { ok: false; error: string };

function isStoreFile(data: unknown): data is StoreFile {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  if (!("version" in data) || data.version !== 1) {
    return false;
  }
  if (!("budgets" in data) || !Array.isArray(data.budgets)) {
    return false;
  }
  return true;
}

export function parseStoreJson(raw: string): LoadStoreResult {
  try {
    const data: unknown = JSON.parse(raw);
    if (!isStoreFile(data)) {
      return { ok: false, error: "Could not read budgets.json." };
    }
    return { ok: true, value: data };
  } catch {
    return { ok: false, error: "Could not read budgets.json." };
  }
}

export function loadStore(path: string = APP_BUDGETS_FILE): LoadStoreResult {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serializeStore(EMPTY_STORE));
    return applyLoadedStore(path, EMPTY_STORE);
  }
  const parsed = parseStoreJson(readFileSync(path, "utf8"));
  if (!parsed.ok) {
    return parsed;
  }
  return applyLoadedStore(path, parsed.value);
}
