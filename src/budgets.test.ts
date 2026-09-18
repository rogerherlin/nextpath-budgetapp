import { describe, expect, it } from "vitest";
import {
  copyBudget,
  createBudget,
  deleteBudget,
  listBudgetSummaries,
  listBudgets,
  resetStore,
  updateBudget,
} from "./budgets";
import type { Actor, Budget, UserProfile } from "./types";

function profile(
  id: string,
  overrides: Partial<UserProfile> = {},
): UserProfile {
  return {
    id,
    email: `${id}@example.com`,
    displayName: id,
    canUseFromText: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function actor(
  id: string,
  overrides: { isModerator?: boolean; profile?: Partial<UserProfile> } = {},
): Actor {
  return {
    profile: profile(id, overrides.profile),
    isModerator: overrides.isModerator ?? false,
  };
}

const alice = actor("uid-alice");
const bob = actor("uid-bob");
const moderator = actor("uid-mod", {
  isModerator: true,
  profile: { email: "mod@example.com" },
});

function summerBudgetFromAc10(): Budget {
  return {
    id: "b1",
    name: "Summer",
    ownerId: "uid-alice",
    visibility: "hidden",
    grants: [{ userId: "uid-bob", role: "browse" }],
    description: "",
    startDate: null,
    endDate: null,
    targetLeftoverCents: null,
    incomeCategories: [{ id: "c1", name: "Salary" }],
    expenseCategories: [],
    incomeEntries: [
      {
        id: "e1",
        categoryId: "c1",
        comment: "June",
        amountCents: 10000,
        date: null,
      },
    ],
    expenseEntries: [],
  };
}

function emptyOwned(
  id: string,
  name: string,
  ownerId: string,
  overrides: Partial<Budget> = {},
): Budget {
  return {
    id,
    name,
    ownerId,
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
    ...overrides,
  };
}

describe("AC1: Create budget with unique name for owner", () => {
  it("AC1: Create budget with unique name for owner", () => {
    resetStore();
    createBudget(alice, { name: "Summer" });
    expect(listBudgets()).toHaveLength(1);
    expect(listBudgets()[0]).toMatchObject({
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
    });
  });
});

describe("AC2: Trim name on create", () => {
  it("AC2: Trim name on create", () => {
    resetStore();
    createBudget(alice, { name: "  Summer  " });
    expect(listBudgets()[0]?.name).toBe("Summer");
  });
});

describe("AC3: Reject empty name", () => {
  it("AC3: Reject empty name", () => {
    resetStore();
    const result = createBudget(alice, { name: "" });
    expect(result).toEqual({ ok: false, error: "Name is required." });
    expect(listBudgets()).toHaveLength(0);
  });
});

describe("AC4: Reject whitespace-only name", () => {
  it("AC4: Reject whitespace-only name", () => {
    resetStore();
    const result = createBudget(alice, { name: "   " });
    expect(result).toEqual({ ok: false, error: "Name is required." });
    expect(listBudgets()).toHaveLength(0);
  });
});

describe("AC5: Reject duplicate name for the same owner case-insensitively", () => {
  it("AC5: Reject duplicate name for the same owner case-insensitively", () => {
    resetStore();
    createBudget(alice, { name: "Summer" });
    const result = createBudget(alice, { name: "summer" });
    expect(result).toEqual({ ok: false, error: "The name is already in use." });
    expect(listBudgets()).toHaveLength(1);
  });
});

describe("AC5b: Same name allowed for a different owner", () => {
  it("AC5b: Same name allowed for a different owner", () => {
    resetStore();
    createBudget(alice, { name: "Summer" });
    const result = createBudget(bob, { name: "Summer" });
    expect(result).toEqual({ ok: true });
    const aliceSummer = listBudgets().filter(
      (budget) => budget.ownerId === "uid-alice" && budget.name === "Summer",
    );
    const bobSummer = listBudgets().filter(
      (budget) => budget.ownerId === "uid-bob" && budget.name === "Summer",
    );
    expect(aliceSummer).toHaveLength(1);
    expect(bobSummer).toHaveLength(1);
  });
});

describe("AC6: Create with optional fields set", () => {
  it("AC6: Create with optional fields set", () => {
    resetStore();
    createBudget(alice, {
      name: "Summer",
      description: "Holiday",
      startDate: { year: 2026, month: 6, day: 1 },
      endDate: { year: 2026, month: 6, day: 30 },
      targetLeftoverCents: 20000,
    });
    expect(listBudgets()[0]).toMatchObject({
      description: "Holiday",
      startDate: { year: 2026, month: 6, day: 1 },
      endDate: { year: 2026, month: 6, day: 30 },
      targetLeftoverCents: 20000,
    });
  });
});

describe("AC10: Copy clones data with a new id, copy name, and copier as owner", () => {
  it("AC10: Copy clones data with a new id, copy name, and copier as owner", () => {
    resetStore([summerBudgetFromAc10()]);
    copyBudget(bob, "b1");
    const listed = listBudgets();
    expect(listed).toHaveLength(2);
    const copy = listed.find((budget) => budget.id !== "b1");
    expect(copy?.name).toBe("Summer (copy1)");
    expect(copy?.id).not.toBe("b1");
    expect(copy?.ownerId).toBe("uid-bob");
    expect(copy?.visibility).toBe("hidden");
    expect(copy?.grants).toEqual([]);
    expect(copy?.incomeCategories).toHaveLength(1);
    expect(copy?.incomeCategories[0]?.name).toBe("Salary");
    expect(copy?.incomeCategories[0]?.id).not.toBe("c1");
    expect(copy?.incomeEntries).toHaveLength(1);
    expect(copy?.incomeEntries[0]?.comment).toBe("June");
    expect(copy?.incomeEntries[0]?.amountCents).toBe(10000);
    expect(copy?.incomeEntries[0]?.date).toBeNull();
    expect(copy?.incomeEntries[0]?.id).not.toBe("e1");
    expect(copy?.incomeEntries[0]?.categoryId).toBe(
      copy?.incomeCategories[0]?.id,
    );
  });
});

describe("AC11: Copy does not share data with the source", () => {
  it("AC11: Copy does not share data with the source", () => {
    resetStore([summerBudgetFromAc10()]);
    copyBudget(bob, "b1");
    const source = listBudgets().find((budget) => budget.id === "b1");
    if (source?.incomeCategories[0]) {
      source.incomeCategories[0].name = "Wages";
    }
    const copy = listBudgets().find((budget) => budget.id !== "b1");
    expect(copy?.incomeCategories[0]?.name).toBe("Salary");
  });
});

describe("AC11b: See-only cannot copy", () => {
  it("AC11b: See-only cannot copy", () => {
    resetStore([
      emptyOwned("b1", "Summer", "uid-alice", {
        grants: [{ userId: "uid-bob", role: "see" }],
      }),
    ]);
    const result = copyBudget(bob, "b1");
    expect(result).toEqual({ ok: false, error: "Not found." });
    expect(listBudgets()).toHaveLength(1);
  });
});

describe("AC12: Owner deletes budget by id", () => {
  it("AC12: Owner deletes budget by id", () => {
    resetStore([
      emptyOwned("b1", "Summer", "uid-alice"),
      emptyOwned("b2", "Winter", "uid-alice"),
    ]);
    deleteBudget(alice, "b1");
    const listed = listBudgetSummaries(alice);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.name).toBe("Winter");
  });
});

describe("AC13: Delete the last owned budget", () => {
  it("AC13: Delete the last owned budget", () => {
    resetStore([emptyOwned("b1", "Summer", "uid-alice")]);
    deleteBudget(alice, "b1");
    expect(listBudgetSummaries(alice)).toEqual([]);
  });
});

describe("AC13b: Edit grant cannot delete", () => {
  it("AC13b: Edit grant cannot delete", () => {
    resetStore([
      emptyOwned("b1", "Summer", "uid-alice", {
        grants: [{ userId: "uid-bob", role: "edit" }],
      }),
    ]);
    const result = deleteBudget(bob, "b1");
    expect(result).toEqual({ ok: false, error: "Not allowed." });
    expect(listBudgets().some((budget) => budget.id === "b1")).toBe(true);
  });
});

describe("AC13c: Moderator can delete another user’s budget", () => {
  it("AC13c: Moderator can delete another user’s budget", () => {
    resetStore([emptyOwned("b1", "Summer", "uid-alice")]);
    deleteBudget(moderator, "b1");
    expect(listBudgets().some((budget) => budget.id === "b1")).toBe(false);
  });
});

describe("AC14: Rename to a taken name for that owner is rejected", () => {
  it("AC14: Rename to a taken name for that owner is rejected", () => {
    resetStore([
      emptyOwned("b1", "Summer", "uid-alice"),
      emptyOwned("b2", "Winter", "uid-alice"),
    ]);
    const result = updateBudget(alice, "b1", { name: " winter " });
    expect(result).toEqual({ ok: false, error: "The name is already in use." });
    expect(listBudgets().find((budget) => budget.id === "b1")?.name).toBe(
      "Summer",
    );
  });
});

describe("AC14b: Rename to another owner’s name is allowed", () => {
  it("AC14b: Rename to another owner’s name is allowed", () => {
    resetStore([
      emptyOwned("b1", "Summer", "uid-alice"),
      emptyOwned("b2", "Winter", "uid-bob"),
    ]);
    const result = updateBudget(alice, "b1", { name: "Winter" });
    expect(result).toEqual({ ok: true });
    expect(listBudgets().find((budget) => budget.id === "b1")?.name).toBe(
      "Winter",
    );
  });
});

describe("AC15: Rename with trim succeeds", () => {
  it("AC15: Rename with trim succeeds", () => {
    resetStore([emptyOwned("b1", "Summer", "uid-alice")]);
    updateBudget(alice, "b1", { name: "  Autumn  " });
    expect(listBudgets().find((budget) => budget.id === "b1")?.name).toBe(
      "Autumn",
    );
  });
});
