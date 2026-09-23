import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AgentMemoryStore, dispatchHttpRequest } from "./httpDispatch";
import { MemoryRepo } from "./repo";
import type { Budget, Entry, UserProfile } from "./types";
import type { GeminiCaller } from "./geminiSuggest";

const ALICE: UserProfile = {
  id: "uid-alice",
  email: "alice@example.com",
  displayName: "Alice",
  canUseFromText: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const BOB: UserProfile = {
  id: "uid-bob",
  email: "bob@example.com",
  displayName: "Bob",
  canUseFromText: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

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

function tokens() {
  return async (token: string) => {
    if (token === "alice") {
      return { uid: "uid-alice", email: "alice@example.com" };
    }
    if (token === "bob") {
      return { uid: "uid-bob", email: "bob@example.com" };
    }
    throw new Error("invalid");
  };
}

const HACK_ENTRY: Entry = {
  id: "e1",
  categoryId: "c1",
  comment: "hack",
  amountCents: 1,
  date: null,
};

type DispatchOpts = {
  method: string;
  pathname: string;
  body?: string;
  authorization?: string;
  distDir: string;
  repo: MemoryRepo;
  agentMemory?: AgentMemoryStore;
  verifyIdToken?: (token: string) => Promise<{ uid: string; email?: string }>;
  geminiCaller?: GeminiCaller;
  geminiApiKey?: string;
  nowMs?: () => number;
  maxAgentMs?: number;
};

function dispatch(input: DispatchOpts) {
  return dispatchHttpRequest({
    method: input.method,
    pathname: input.pathname,
    body: input.body ?? "",
    authorization: input.authorization,
    geminiApiKey: input.geminiApiKey ?? "secret-gemini-value",
    distDir: input.distDir,
    repo: input.repo,
    moderatorEmail: "mod@example.com",
    firebaseWebApiKey: "k",
    firebaseWebAuthDomain: "demo.firebaseapp.com",
    firebaseWebProjectId: "demo",
    verifyIdToken: input.verifyIdToken ?? tokens(),
    deleteUser: async () => {},
    geminiCaller: input.geminiCaller,
    agentMemory: input.agentMemory,
    nowMs: input.nowMs,
    maxAgentMs: input.maxAgentMs,
  });
}

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "budgetapp-session-"));
  try {
    await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function seedAliceBudget(repo: MemoryRepo): Promise<void> {
  await repo.saveProfile(ALICE);
  await repo.saveProfile(BOB);
  await repo.saveBudget(emptyBudget("b1", "Summer", "uid-alice"));
}

describe("AC1: Anonymous cannot GET another user’s budget", () => {
  it("AC1: Anonymous cannot GET another user’s budget", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedAliceBudget(repo);
      const verifyIdToken = vi.fn(tokens());
      const result = await dispatch({
        method: "GET",
        pathname: "/api/budgets/b1",
        distDir: join(dir, "dist"),
        repo,
        verifyIdToken,
      });
      expect(result.status).toBe(401);
      expect(result.body).toBe(JSON.stringify({ error: "Sign in required." }));
      expect(verifyIdToken).not.toHaveBeenCalled();
    });
  });
});

describe("AC2: Anonymous cannot PUT that budget", () => {
  it("AC2: Anonymous cannot PUT that budget", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedAliceBudget(repo);
      const before = repo.saveBudgetCalls;
      const result = await dispatch({
        method: "PUT",
        pathname: "/api/budgets/b1",
        body: JSON.stringify({
          ...emptyBudget("b1", "Summer", "uid-alice"),
          expenseEntries: [HACK_ENTRY],
        }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(401);
      expect(result.body).toBe(JSON.stringify({ error: "Sign in required." }));
      expect((await repo.getBudgetDoc("b1"))?.expenseEntries).toEqual([]);
      expect(repo.saveBudgetCalls).toBe(before);
    });
  });
});

describe("AC3: Anonymous cannot run agent tools", () => {
  it("AC3: Anonymous cannot run agent tools", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedAliceBudget(repo);
      const result = await dispatch({
        method: "POST",
        pathname: "/api/agent/run",
        body: JSON.stringify({
          steps: [{ tool: "get_budget", arguments: { budgetId: "b1" } }],
        }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(401);
      expect(result.body).toBe(JSON.stringify({ error: "Sign in required." }));
      expect(result.body).not.toContain("Summer");
      expect(result.body).not.toContain('"value"');
    });
  });
});

describe("AC4: Bob cannot GET Alice’s hidden budget (API)", () => {
  it("AC4: Bob cannot GET Alice’s hidden budget (API)", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedAliceBudget(repo);
      const result = await dispatch({
        method: "GET",
        pathname: "/api/budgets/b1",
        authorization: "Bearer bob",
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(404);
      expect(result.body).toBe(JSON.stringify({ error: "Not found." }));
      expect(result.body).not.toContain("Summer");
      expect(result.body).not.toContain("incomeEntries");
    });
  });
});

describe("AC5: Bob cannot PUT Alice’s hidden budget (API)", () => {
  it("AC5: Bob cannot PUT Alice’s hidden budget (API)", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedAliceBudget(repo);
      const result = await dispatch({
        method: "PUT",
        pathname: "/api/budgets/b1",
        authorization: "Bearer bob",
        body: JSON.stringify({
          ...emptyBudget("b1", "Summer", "uid-alice"),
          expenseEntries: [HACK_ENTRY],
        }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(404);
      expect(result.body).toBe(JSON.stringify({ error: "Not found." }));
      expect((await repo.getBudgetDoc("b1"))?.expenseEntries).toEqual([]);
    });
  });
});

describe("AC6: Bob cannot read Alice’s budget through get_budget even if arguments claim Alice", () => {
  it("AC6: Bob cannot read Alice’s budget through get_budget even if arguments claim Alice", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedAliceBudget(repo);
      const result = await dispatch({
        method: "POST",
        pathname: "/api/agent/run",
        authorization: "Bearer bob",
        body: JSON.stringify({
          userId: "uid-alice",
          steps: [
            {
              tool: "get_budget",
              arguments: {
                budgetId: "b1",
                userId: "uid-alice",
                ownerId: "uid-alice",
              },
            },
          ],
        }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(200);
      const body = JSON.parse(result.body) as {
        steps: Array<{
          ok: boolean;
          status: number;
          error?: string;
          value?: unknown;
        }>;
      };
      expect(body.steps).toHaveLength(1);
      expect(body.steps[0]?.ok).toBe(false);
      expect(body.steps[0]?.status).toBe(404);
      expect(body.steps[0]?.error).toBe("Not found.");
      expect("value" in (body.steps[0] ?? {})).toBe(false);
      expect(result.body).not.toContain("Summer");
    });
  });
});

describe("AC7: Bob cannot change Alice’s budget through save_budget", () => {
  it("AC7: Bob cannot change Alice’s budget through save_budget", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedAliceBudget(repo);
      const result = await dispatch({
        method: "POST",
        pathname: "/api/agent/run",
        authorization: "Bearer bob",
        body: JSON.stringify({
          steps: [
            {
              tool: "save_budget",
              arguments: {
                budgetId: "b1",
                userId: "uid-alice",
                expenseEntries: [HACK_ENTRY],
              },
            },
          ],
        }),
        distDir: join(dir, "dist"),
        repo,
      });
      const body = JSON.parse(result.body) as {
        steps: Array<{ ok: boolean; status: number; error?: string }>;
      };
      expect(body.steps[0]?.ok).toBe(false);
      expect(body.steps[0]?.status).toBe(404);
      expect(body.steps[0]?.error).toBe("Not found.");
      expect((await repo.getBudgetDoc("b1"))?.expenseEntries).toEqual([]);
    });
  });
});

describe("AC8: Create ignores body ownerId", () => {
  it("AC8: Create ignores body ownerId", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await repo.saveProfile(ALICE);
      await repo.saveProfile(BOB);
      const result = await dispatch({
        method: "POST",
        pathname: "/api/budgets",
        authorization: "Bearer bob",
        body: JSON.stringify({ name: "Mine", ownerId: "uid-alice" }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(201);
      const created = JSON.parse(result.body) as Budget;
      expect(created.ownerId).toBe("uid-bob");
      const stored = await repo.getBudgetDoc(created.id);
      expect(stored?.ownerId).toBe("uid-bob");
    });
  });
});

describe("AC9: Save ignores body ownerId (no transfer)", () => {
  it("AC9: Save ignores body ownerId (no transfer)", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedAliceBudget(repo);
      const current = await repo.getBudgetDoc("b1");
      const result = await dispatch({
        method: "PUT",
        pathname: "/api/budgets/b1",
        authorization: "Bearer alice",
        body: JSON.stringify({ ...current, ownerId: "uid-bob" }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(200);
      expect((await repo.getBudgetDoc("b1"))?.ownerId).toBe("uid-alice");
    });
  });
});

describe("AC11: Invalid tool arguments", () => {
  it("AC11: Invalid tool arguments", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedAliceBudget(repo);
      const result = await dispatch({
        method: "POST",
        pathname: "/api/agent/run",
        authorization: "Bearer alice",
        body: JSON.stringify({
          steps: [{ tool: "get_budget", arguments: { budgetId: 1 } }],
        }),
        distDir: join(dir, "dist"),
        repo,
      });
      const body = JSON.parse(result.body) as {
        steps: Array<{ ok: boolean; status: number; error?: string }>;
      };
      expect(body.steps[0]?.ok).toBe(false);
      expect(body.steps[0]?.status).toBe(400);
      expect(body.steps[0]?.error).toBe("Invalid tool arguments.");
    });
  });
});

describe("AC12: Step bound", () => {
  it("AC12: Step bound", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedAliceBudget(repo);
      const before = repo.saveBudgetCalls;
      const steps = Array.from({ length: 9 }, () => ({
        tool: "get_budget",
        arguments: { budgetId: "b1" },
      }));
      const result = await dispatch({
        method: "POST",
        pathname: "/api/agent/run",
        authorization: "Bearer alice",
        body: JSON.stringify({ steps }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(400);
      expect(result.body).toBe(JSON.stringify({ error: "Too many steps." }));
      expect(repo.saveBudgetCalls).toBe(before);
    });
  });
});

describe("AC13: Time bound", () => {
  it("AC13: Time bound", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedAliceBudget(repo);
      const memory = new AgentMemoryStore();
      const times = [0, 10, 20];
      const result = await dispatch({
        method: "POST",
        pathname: "/api/agent/run",
        authorization: "Bearer alice",
        body: JSON.stringify({
          steps: [
            { tool: "remember", arguments: { key: "a", value: "one" } },
            { tool: "remember", arguments: { key: "b", value: "two" } },
          ],
        }),
        distDir: join(dir, "dist"),
        repo,
        agentMemory: memory,
        nowMs: () => times.shift() ?? 99,
        maxAgentMs: 5,
      });
      const body = JSON.parse(result.body) as {
        steps: Array<{ ok: boolean; error?: string }>;
      };
      expect(body.steps[0]?.ok).toBe(true);
      expect(body.steps[1]?.ok).toBe(false);
      expect(body.steps[1]?.error).toBe("Time limit exceeded.");
      expect(memory.recall("uid-alice", "b")).toBeNull();
    });
  });
});

describe("AC14: Request size bound", () => {
  it("AC14: Request size bound", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedAliceBudget(repo);
      const before = repo.saveBudgetCalls;
      const verifyIdToken = vi.fn(async () => {
        throw new Error("verify must not run");
      });
      const body = "x".repeat(65537);
      const result = await dispatch({
        method: "POST",
        pathname: "/api/agent/run",
        authorization: "Bearer alice",
        body,
        distDir: join(dir, "dist"),
        repo,
        verifyIdToken,
      });
      expect(result.status).toBe(413);
      expect(result.body).toBe(JSON.stringify({ error: "Request too large." }));
      expect(verifyIdToken).not.toHaveBeenCalled();
      expect(repo.saveBudgetCalls).toBe(before);
    });
  });
});

describe("AC15: Memory is per session uid", () => {
  it("AC15: Memory is per session uid", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedAliceBudget(repo);
      const memory = new AgentMemoryStore();
      const distDir = join(dir, "dist");
      const remember = await dispatch({
        method: "POST",
        pathname: "/api/agent/run",
        authorization: "Bearer alice",
        body: JSON.stringify({
          steps: [
            {
              tool: "remember",
              arguments: { key: "note", value: "alice-only" },
            },
          ],
        }),
        distDir,
        repo,
        agentMemory: memory,
      });
      expect(JSON.parse(remember.body).steps[0].ok).toBe(true);
      const bobRecall = await dispatch({
        method: "POST",
        pathname: "/api/agent/run",
        authorization: "Bearer bob",
        body: JSON.stringify({
          userId: "uid-alice",
          steps: [
            {
              tool: "recall",
              arguments: { key: "note", userId: "uid-alice" },
            },
          ],
        }),
        distDir,
        repo,
        agentMemory: memory,
      });
      const bobBody = JSON.parse(bobRecall.body) as {
        steps: Array<{ ok: boolean; status: number; error?: string }>;
      };
      expect(bobBody.steps[0]?.ok).toBe(false);
      expect(bobBody.steps[0]?.status).toBe(404);
      expect(bobBody.steps[0]?.error).toBe("Not found.");
      const aliceRecall = await dispatch({
        method: "POST",
        pathname: "/api/agent/run",
        authorization: "Bearer alice",
        body: JSON.stringify({
          steps: [{ tool: "recall", arguments: { key: "note" } }],
        }),
        distDir,
        repo,
        agentMemory: memory,
      });
      const aliceBody = JSON.parse(aliceRecall.body) as {
        steps: Array<{ ok: boolean; value?: { value: string } }>;
      };
      expect(aliceBody.steps[0]?.ok).toBe(true);
      expect(aliceBody.steps[0]?.value?.value).toBe("alice-only");
    });
  });
});

describe("AC16: Secrets stay out of agent output", () => {
  it("AC16: Secrets stay out of agent output", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedAliceBudget(repo);
      const result = await dispatch({
        method: "POST",
        pathname: "/api/agent/run",
        authorization: "Bearer alice",
        body: JSON.stringify({
          steps: [{ tool: "get_budget", arguments: { budgetId: "b1" } }],
        }),
        distDir: join(dir, "dist"),
        repo,
        geminiApiKey: "secret-gemini-value",
      });
      expect(result.status).toBe(200);
      expect(result.body).not.toContain("secret-gemini-value");
      expect(result.body).not.toContain("Bearer alice");
    });
  });
});

describe("AC17: ACL is not a model refusal", () => {
  it("AC17: ACL is not a model refusal", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedAliceBudget(repo);
      await repo.saveProfile({ ...BOB, canUseFromText: true });
      const generateJson = vi.fn(async () => "I cannot help with that.");
      const result = await dispatch({
        method: "POST",
        pathname: "/api/suggest-entries",
        authorization: "Bearer bob",
        body: JSON.stringify({
          budgetId: "b1",
          text: "paid rent 600 euros",
          incomeCategories: [{ id: "c1", name: "Salary" }],
          expenseCategories: [{ id: "c2", name: "Rent" }],
        }),
        distDir: join(dir, "dist"),
        repo,
        geminiCaller: { generateJson },
      });
      expect(result.status).toBe(404);
      expect(result.body).toBe(JSON.stringify({ error: "Not found." }));
      expect(generateJson).not.toHaveBeenCalled();
    });
  });
});

describe("resource-caps AC22: Agent save_budget uses the same category cap", () => {
  it("resource-caps AC22: Agent save_budget uses the same category cap", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await repo.saveProfile(ALICE);
      const incomeCategories = [0, 1, 2, 3].map((index) => ({
        id: `c${index}`,
        name: `Cat ${index}`,
      }));
      await repo.saveBudget(
        emptyBudget("b1", "Summer", "uid-alice", { incomeCategories }),
      );
      const result = await dispatch({
        method: "POST",
        pathname: "/api/agent/run",
        authorization: "Bearer alice",
        body: JSON.stringify({
          steps: [
            {
              tool: "save_budget",
              arguments: {
                budgetId: "b1",
                incomeCategories: [
                  ...incomeCategories,
                  { id: "c4", name: "Bonus" },
                ],
              },
            },
          ],
        }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(200);
      const body = JSON.parse(result.body) as {
        steps: Array<{
          tool: string;
          ok: boolean;
          status?: number;
          error?: string;
        }>;
      };
      expect(body.steps[0]).toEqual({
        tool: "save_budget",
        ok: false,
        status: 400,
        error: "A budget can have at most 4 income categories.",
      });
      expect((await repo.getBudgetDoc("b1"))?.incomeCategories).toHaveLength(4);
    });
  });
});
