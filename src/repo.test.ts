import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { persistAdapterName } from "./secrets";
import { migrateJsonIfNeeded } from "./migrate";
import {
  copyBudgetForActor,
  createBudgetForActor,
  deleteBudgetForActor,
  getBudget,
  listBudgetSummaries,
  MemoryRepo,
} from "./repo";
import { serializeStore } from "./store";
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

const alice = actor("uid-alice", { profile: { displayName: "Alice" } });
const bob = actor("uid-bob", { profile: { displayName: "Bob" } });
const moderator = actor("uid-mod", {
  isModerator: true,
  profile: { email: "mod@example.com", displayName: "Mod" },
});

function emptyBudget(
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

describe("AC1: Budget document fields", () => {
  it("AC1: Budget document fields", async () => {
    const repo = new MemoryRepo();
    await repo.saveProfile(alice.profile);
    const created = await createBudgetForActor(
      repo,
      alice,
      { name: "Summer" },
      () => "b1",
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(created.budget).toEqual({
      id: "b1",
      ownerId: "uid-alice",
      name: "Summer",
      description: "",
      startDate: null,
      endDate: null,
      targetLeftoverCents: null,
      visibility: "hidden",
      grants: [],
      incomeCategories: [],
      expenseCategories: [],
      incomeEntries: [],
      expenseEntries: [],
    });
  });
});

describe("AC2: Empty catalog for a new user", () => {
  it("AC2: Empty catalog for a new user", async () => {
    const repo = new MemoryRepo();
    await repo.saveProfile(alice.profile);
    expect(await listBudgetSummaries(repo, alice)).toEqual([]);
  });
});

describe("AC3: Load round-trip", () => {
  it("AC3: Load round-trip", async () => {
    const repo = new MemoryRepo();
    await repo.saveProfile(alice.profile);
    await createBudgetForActor(repo, alice, { name: "Summer" }, () => "b1");
    const loaded = await getBudget(repo, alice, "b1");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    expect(loaded.value.name).toBe("Summer");
    expect(loaded.value.ownerId).toBe("uid-alice");
  });
});

describe("AC4: Save after create is per-document", () => {
  it("AC4: Save after create is per-document", async () => {
    const repo = new MemoryRepo();
    await repo.saveProfile(alice.profile);
    await repo.saveProfile(bob.profile);
    await repo.saveBudget(emptyBudget("bob-1", "Other", "uid-bob"));
    const callsBefore = repo.saveBudgetCalls;
    await createBudgetForActor(repo, alice, { name: "Winter" }, () => "a1");
    expect(repo.saveBudgetCalls).toBe(callsBefore + 1);
    const bobDoc = await repo.getBudgetDoc("bob-1");
    expect(bobDoc?.name).toBe("Other");
    expect((await repo.getBudgetDoc("a1"))?.ownerId).toBe("uid-alice");
  });
});

describe("AC5: Save after delete", () => {
  it("AC5: Save after delete", async () => {
    const repo = new MemoryRepo();
    await repo.saveProfile(alice.profile);
    await repo.saveBudget(emptyBudget("b1", "Summer", "uid-alice"));
    await repo.saveBudget(emptyBudget("b2", "Winter", "uid-alice"));
    const result = await deleteBudgetForActor(repo, alice, "b1");
    expect(result).toEqual({ ok: true });
    const listed = await listBudgetSummaries(repo, alice);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.name).toBe("Winter");
  });
});

describe("AC6: Save after copy", () => {
  it("AC6: Save after copy", async () => {
    const repo = new MemoryRepo();
    await repo.saveProfile(alice.profile);
    await repo.saveProfile(bob.profile);
    await repo.saveBudget(
      emptyBudget("b1", "Summer", "uid-alice", {
        grants: [{ userId: "uid-bob", role: "browse" }],
        incomeCategories: [{ id: "c1", name: "Salary" }],
        incomeEntries: [
          {
            id: "e1",
            categoryId: "c1",
            comment: "June",
            amountCents: 10000,
            date: null,
          },
        ],
      }),
    );
    const copied = await copyBudgetForActor(repo, bob, "b1");
    expect(copied.ok).toBe(true);
    if (!copied.ok) {
      return;
    }
    expect(copied.budget.name).toBe("Summer (copy1)");
    expect(copied.budget.ownerId).toBe("uid-bob");
    expect(copied.budget.visibility).toBe("hidden");
    expect(copied.budget.grants).toEqual([]);
    expect(copied.budget.incomeCategories[0]?.id).not.toBe("c1");
    const aliceList = await listBudgetSummaries(repo, alice);
    expect(aliceList.filter((item) => item.ownerId === "uid-alice")).toHaveLength(
      1,
    );
  });
});

describe("AC8: Viewer cannot read a hidden budget they do not own", () => {
  it("AC8: Viewer cannot read a hidden budget they do not own", async () => {
    const repo = new MemoryRepo();
    await repo.saveProfile(alice.profile);
    await repo.saveProfile(bob.profile);
    await repo.saveBudget(emptyBudget("b1", "Summer", "uid-alice"));
    expect(await getBudget(repo, bob, "b1")).toEqual({
      ok: false,
      error: "Not found.",
    });
    const names = (await listBudgetSummaries(repo, bob)).map((item) => item.name);
    expect(names.includes("Summer")).toBe(false);
  });
});

describe("AC9: Public summary without full document", () => {
  it("AC9: Public summary without full document", async () => {
    const repo = new MemoryRepo();
    await repo.saveProfile({ ...alice.profile, displayName: "Alice" });
    await repo.saveProfile(bob.profile);
    await repo.saveBudget(
      emptyBudget("b1", "Summer", "uid-alice", { visibility: "public" }),
    );
    const listed = await listBudgetSummaries(repo, bob);
    expect(listed.some((item) => item.name === "Summer")).toBe(true);
    expect(listed.find((item) => item.name === "Summer")?.ownerDisplayName).toBe(
      "Alice",
    );
    expect(await getBudget(repo, bob, "b1")).toEqual({
      ok: false,
      error: "Not found.",
    });
  });
});

describe("AC10: Moderator reads all", () => {
  it("AC10: Moderator reads all", async () => {
    const repo = new MemoryRepo();
    await repo.saveProfile(alice.profile);
    await repo.saveProfile(moderator.profile);
    await repo.saveBudget(emptyBudget("b1", "Summer", "uid-alice"));
    const listed = await listBudgetSummaries(repo, moderator);
    expect(listed.some((item) => item.name === "Summer")).toBe(true);
    const loaded = await getBudget(repo, moderator, "b1");
    expect(loaded.ok).toBe(true);
  });
});

describe("AC11: Migration assigns JSON budgets to the moderator", () => {
  it("AC11: Migration assigns JSON budgets to the moderator", async () => {
    const dir = mkdtempSync(join(tmpdir(), "budgetapp-migrate-"));
    const jsonPath = join(dir, "budgets.json");
    try {
      writeFileSync(
        jsonPath,
        serializeStore({
          version: 1,
          budgets: [emptyBudget("legacy", "Summer", "old")],
        }),
      );
      const repo = new MemoryRepo();
      await repo.saveProfile(moderator.profile);
      await migrateJsonIfNeeded(repo, jsonPath, "uid-mod");
      await migrateJsonIfNeeded(repo, jsonPath, "uid-mod");
      expect(await repo.budgetCount()).toBe(1);
      const budget = await repo.getBudgetDoc("legacy");
      expect(budget?.name).toBe("Summer");
      expect(budget?.ownerId).toBe("uid-mod");
      expect(budget?.visibility).toBe("hidden");
      expect(budget?.grants).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("AC12: File adapter is tests-only", () => {
  it("AC12: File adapter is tests-only", () => {
    const previous = process.env.BUDGETAPP_MEMORY_REPO;
    delete process.env.BUDGETAPP_MEMORY_REPO;
    expect(persistAdapterName()).toBe("firestore");
    process.env.BUDGETAPP_MEMORY_REPO = "1";
    expect(persistAdapterName()).toBe("memory");
    if (previous === undefined) {
      delete process.env.BUDGETAPP_MEMORY_REPO;
    } else {
      process.env.BUDGETAPP_MEMORY_REPO = previous;
    }
  });
});
