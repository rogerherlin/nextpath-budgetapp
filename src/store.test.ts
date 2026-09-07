import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";
import { copyBudget, createBudget, deleteBudget, listBudgets, resetStore } from "./budgets";
import { APP_BUDGETS_FILE } from "./paths";
import { loadStore, serializeStore } from "./store";
import type { Budget } from "./types";

function withBudgetsFile(run: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "budgetapp-"));
  const path = join(dir, "budgets.json");
  try {
    run(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function emptyBudget(id: string, name: string): Budget {
  return {
    id,
    name,
    description: "",
    startDate: null,
    endDate: null,
    targetLeftoverCents: null,
    incomeCategories: [],
    expenseCategories: [],
    incomeEntries: [],
    expenseEntries: [],
  };
}

function emptySummer(id: string): Budget {
  return emptyBudget(id, "Summer");
}

describe("AC1: File schema", () => {
  it("AC1: File schema", () => {
    const json = serializeStore({
      version: 1,
      budgets: [emptySummer("b1")],
    });
    expect(JSON.parse(json)).toEqual({
      version: 1,
      budgets: [
        {
          id: "b1",
          name: "Summer",
          description: "",
          startDate: null,
          endDate: null,
          targetLeftoverCents: null,
          incomeCategories: [],
          expenseCategories: [],
          incomeEntries: [],
          expenseEntries: [],
        },
      ],
    });
  });
});

describe("AC2: Missing file loads empty", () => {
  it("AC2: Missing file loads empty", () => {
    withBudgetsFile((path) => {
      resetStore([emptySummer("b1")]);
      expect(existsSync(path)).toBe(false);
      const result = loadStore(path);
      expect(result).toEqual({
        ok: true,
        value: { version: 1, budgets: [] },
      });
      expect(listBudgets()).toEqual([]);
      expect(readFileSync(path, "utf8")).toBe('{"version":1,"budgets":[]}');
    });
  });
});

describe("AC3: Load round-trip", () => {
  it("AC3: Load round-trip", () => {
    withBudgetsFile((path) => {
      writeFileSync(
        path,
        serializeStore({ version: 1, budgets: [emptySummer("b1")] }),
      );
      resetStore();
      loadStore(path);
      expect(listBudgets()).toHaveLength(1);
      expect(listBudgets()[0]?.name).toBe("Summer");
    });
  });
});

describe("AC4: Save after create", () => {
  it("AC4: Save after create", () => {
    withBudgetsFile((path) => {
      loadStore(path);
      const result = createBudget({ name: "Winter" });
      expect(result).toEqual({ ok: true });
      expect(JSON.parse(readFileSync(path, "utf8")).budgets).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "Winter" })]),
      );
    });
  });
});

describe("AC5: Save after delete", () => {
  it("AC5: Save after delete", () => {
    withBudgetsFile((path) => {
      writeFileSync(
        path,
        serializeStore({
          version: 1,
          budgets: [emptySummer("b1"), emptyBudget("b2", "Winter")],
        }),
      );
      loadStore(path);
      deleteBudget("b1");
      const onDisk = JSON.parse(readFileSync(path, "utf8")).budgets;
      expect(onDisk).toHaveLength(1);
      expect(onDisk[0]?.name).toBe("Winter");
    });
  });
});

describe("AC6: Save after copy", () => {
  it("AC6: Save after copy", () => {
    withBudgetsFile((path) => {
      writeFileSync(
        path,
        serializeStore({ version: 1, budgets: [emptySummer("b1")] }),
      );
      loadStore(path);
      copyBudget("b1");
      const names = JSON.parse(readFileSync(path, "utf8")).budgets.map(
        (budget: { name: string }) => budget.name,
      );
      expect(names).toHaveLength(2);
      expect(names).toEqual(expect.arrayContaining(["Summer", "Summer (copy1)"]));
    });
  });
});

describe("AC7: Corrupt file is not overwritten", () => {
  it("AC7: Corrupt file is not overwritten", () => {
    withBudgetsFile((path) => {
      writeFileSync(path, "NOT JSON");
      const result = loadStore(path);
      expect(result).toEqual({
        ok: false,
        error: "Could not read budgets.json.",
      });
      expect(readFileSync(path, "utf8")).toBe("NOT JSON");
    });
  });
});

describe("AC8: App uses the same path every time", () => {
  it("AC8: App uses the same path every time", () => {
    expect(isAbsolute(APP_BUDGETS_FILE)).toBe(true);
    expect(APP_BUDGETS_FILE.endsWith("budgets.json")).toBe(true);
    expect(APP_BUDGETS_FILE).toBe(join(process.cwd(), "data", "budgets.json"));
    withBudgetsFile((path) => {
      loadStore(path);
      expect(readdirSync(dirname(path))).toEqual(["budgets.json"]);
    });
  });
});

describe("AC9: Invalid store JSON is not overwritten", () => {
  it("AC9: Invalid store JSON is not overwritten", () => {
    withBudgetsFile((path) => {
      writeFileSync(path, "{}");
      const result = loadStore(path);
      expect(result).toEqual({
        ok: false,
        error: "Could not read budgets.json.",
      });
      expect(readFileSync(path, "utf8")).toBe("{}");
    });
  });
});
