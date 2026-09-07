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

export function loadStore(path: string = APP_BUDGETS_FILE): LoadStoreResult {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serializeStore(EMPTY_STORE));
    return applyLoadedStore(path, EMPTY_STORE);
  }
  try {
    const store = JSON.parse(readFileSync(path, "utf8")) as StoreFile;
    return applyLoadedStore(path, store);
  } catch {
    return { ok: false, error: "Could not read budgets.json." };
  }
}
