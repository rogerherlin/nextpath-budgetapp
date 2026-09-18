import { describe, expect, it } from "vitest";
import { parseStoreJson, serializeStore } from "./store";
import type { Budget } from "./types";

function emptySummer(id: string): Budget {
  return {
    id,
    name: "Summer",
    ownerId: "uid-alice",
    visibility: "hidden",
    grants: [],
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

describe("legacy JSON parse for migration", () => {
  it("parses version 1 store files", () => {
    const json = serializeStore({
      version: 1,
      budgets: [emptySummer("b1")],
    });
    expect(parseStoreJson(json)).toEqual({
      ok: true,
      value: {
        version: 1,
        budgets: [emptySummer("b1")],
      },
    });
  });

  it("rejects corrupt JSON without throwing", () => {
    expect(parseStoreJson("NOT JSON")).toEqual({
      ok: false,
      error: "Could not read budgets.json.",
    });
  });

  it("rejects invalid store JSON", () => {
    expect(parseStoreJson("{}")).toEqual({
      ok: false,
      error: "Could not read budgets.json.",
    });
  });
});
