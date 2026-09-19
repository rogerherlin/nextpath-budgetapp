import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchHttpRequest, listenPort } from "./httpDispatch";
import { canWrite } from "./acl";
import { MemoryRepo } from "./repo";
import type { Actor, Budget, UserProfile } from "./types";
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

const MOD: UserProfile = {
  id: "uid-mod",
  email: "mod@example.com",
  displayName: "Mod",
  canUseFromText: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const CAROL: UserProfile = {
  id: "uid-carol",
  email: "carol@example.com",
  displayName: "Carol",
  canUseFromText: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const DAVE: UserProfile = {
  id: "uid-dave",
  email: "dave@example.com",
  displayName: "Dave",
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

function actorOf(profile: UserProfile, isModerator = false): Actor {
  return { profile, isModerator };
}

function tokens(uid: string, email: string) {
  return async (token: string) => {
    if (token === "bad") {
      throw new Error("invalid");
    }
    const map: Record<string, { uid: string; email: string }> = {
      alice: { uid: "uid-alice", email: "alice@example.com" },
      bob: { uid: "uid-bob", email: "bob@example.com" },
      mod: { uid: "uid-mod", email: "Mod@example.com" },
      orphan: { uid: "uid-orphan", email: "orphan@example.com" },
      newuser: { uid: "uid-new", email: "new@example.com" },
    };
    const found = map[token];
    if (found === undefined) {
      if (token === uid) {
        return { uid, email };
      }
      throw new Error("invalid");
    }
    return found;
  };
}

type DispatchOpts = {
  method: string;
  pathname: string;
  body?: string;
  authorization?: string;
  geminiApiKey?: string;
  distDir: string;
  repo: MemoryRepo;
  deleteUser?: (uid: string) => Promise<void>;
  geminiCaller?: GeminiCaller;
  firebaseWebApiKey?: string;
  firebaseAuthEmulatorHost?: string;
  nowIso?: () => string;
  createId?: () => string;
  verifyIdToken?: (token: string) => Promise<{ uid: string; email?: string }>;
};

function dispatch(input: DispatchOpts) {
  return dispatchHttpRequest({
    method: input.method,
    pathname: input.pathname,
    body: input.body ?? "",
    authorization: input.authorization,
    geminiApiKey: input.geminiApiKey ?? "test-key",
    distDir: input.distDir,
    repo: input.repo,
    moderatorEmail: "mod@example.com",
    firebaseWebApiKey: input.firebaseWebApiKey ?? "k",
    firebaseWebAuthDomain: "demo.firebaseapp.com",
    firebaseWebProjectId: "demo",
    firebaseAuthEmulatorHost: input.firebaseAuthEmulatorHost,
    verifyIdToken: input.verifyIdToken ?? tokens("uid-alice", "alice@example.com"),
    deleteUser: input.deleteUser ?? (async () => {}),
    geminiCaller: input.geminiCaller,
    nowIso: input.nowIso,
    createId: input.createId,
  });
}

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "budgetapp-http-"));
  try {
    await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("AC1: Public config", () => {
  it("AC1: Public config", async () => {
    await withTempDir(async (dir) => {
      const result = await dispatch({
        method: "GET",
        pathname: "/api/config",
        distDir: join(dir, "dist"),
        repo: new MemoryRepo(),
      });
      expect(result.status).toBe(200);
      expect(result.body).toBe(
        JSON.stringify({
          apiKey: "k",
          authDomain: "demo.firebaseapp.com",
          projectId: "demo",
        }),
      );
    });
  });
});

describe("AC65: Config includes Auth emulator origin locally", () => {
  it("AC65: Config includes Auth emulator origin locally", async () => {
    await withTempDir(async (dir) => {
      const result = await dispatch({
        method: "GET",
        pathname: "/api/config",
        distDir: join(dir, "dist"),
        repo: new MemoryRepo(),
        firebaseAuthEmulatorHost: "127.0.0.1:9099",
      });
      expect(result.status).toBe(200);
      expect(result.body).toBe(
        JSON.stringify({
          apiKey: "k",
          authDomain: "demo.firebaseapp.com",
          projectId: "demo",
          authEmulatorHost: "http://127.0.0.1:9099",
        }),
      );
    });
  });
});

describe("AC2: Config missing", () => {
  it("AC2: Config missing", async () => {
    await withTempDir(async (dir) => {
      const result = await dispatch({
        method: "GET",
        pathname: "/api/config",
        distDir: join(dir, "dist"),
        repo: new MemoryRepo(),
        firebaseWebApiKey: "",
      });
      expect(result.status).toBe(503);
      expect(result.body).toBe(
        JSON.stringify({ error: "Firebase web config is missing." }),
      );
    });
  });
});

describe("AC3: Health is public", () => {
  it("AC3: Health is public", async () => {
    await withTempDir(async (dir) => {
      const result = await dispatch({
        method: "GET",
        pathname: "/api/health",
        distDir: join(dir, "dist"),
        repo: new MemoryRepo(),
      });
      expect(result.status).toBe(200);
      expect(result.body).toBe(JSON.stringify({ ok: true }));
    });
  });
});

describe("AC4: API requires Bearer token", () => {
  it("AC4: API requires Bearer token", async () => {
    await withTempDir(async (dir) => {
      const result = await dispatch({
        method: "GET",
        pathname: "/api/me",
        distDir: join(dir, "dist"),
        repo: new MemoryRepo(),
      });
      expect(result.status).toBe(401);
      expect(result.body).toBe(JSON.stringify({ error: "Sign in required." }));
    });
  });
});

describe("AC5: Invalid token", () => {
  it("AC5: Invalid token", async () => {
    await withTempDir(async (dir) => {
      const result = await dispatch({
        method: "GET",
        pathname: "/api/me",
        authorization: "Bearer bad",
        distDir: join(dir, "dist"),
        repo: new MemoryRepo(),
      });
      expect(result.status).toBe(401);
      expect(result.body).toBe(JSON.stringify({ error: "Sign in required." }));
    });
  });
});

describe("AC6: Register creates profile under the cap", () => {
  it("AC6: Register creates profile under the cap", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      const result = await dispatch({
        method: "POST",
        pathname: "/api/register",
        authorization: "Bearer alice",
        body: JSON.stringify({ displayName: "  Alice  " }),
        distDir: join(dir, "dist"),
        repo,
        nowIso: () => "2026-09-18T00:00:00.000Z",
      });
      expect(result.status).toBe(201);
      const body = JSON.parse(result.body) as UserProfile & {
        isModerator: boolean;
      };
      expect(body.id).toBe("uid-alice");
      expect(body.email).toBe("alice@example.com");
      expect(body.displayName).toBe("Alice");
      expect(body.canUseFromText).toBe(false);
      expect(body.isModerator).toBe(false);
      expect(body.createdAt).toBe("2026-09-18T00:00:00.000Z");
      expect(await repo.profileCount()).toBe(1);
    });
  });
});

describe("AC7: Register rejects empty display name", () => {
  it("AC7: Register rejects empty display name", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      const result = await dispatch({
        method: "POST",
        pathname: "/api/register",
        authorization: "Bearer alice",
        body: JSON.stringify({ displayName: "   " }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(400);
      expect(result.body).toBe(
        JSON.stringify({ error: "Display name is required." }),
      );
      expect(await repo.profileCount()).toBe(0);
    });
  });
});

describe("AC8: Eleventh register is rejected and Auth user is deleted", () => {
  it("AC8: Eleventh register is rejected and Auth user is deleted", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      for (let i = 0; i < 10; i += 1) {
        await repo.saveProfile({
          id: `uid-${i}`,
          email: `u${i}@example.com`,
          displayName: `U${i}`,
          canUseFromText: false,
          createdAt: "2026-01-01T00:00:00.000Z",
        });
      }
      const deleteUser = vi.fn(async () => {});
      const result = await dispatch({
        method: "POST",
        pathname: "/api/register",
        authorization: "Bearer newuser",
        body: JSON.stringify({ displayName: "New" }),
        distDir: join(dir, "dist"),
        repo,
        deleteUser,
      });
      expect(result.status).toBe(403);
      expect(result.body).toBe(
        JSON.stringify({ error: "The household is full (10 users)." }),
      );
      expect(await repo.profileCount()).toBe(10);
      expect(deleteUser).toHaveBeenCalledTimes(1);
      expect(deleteUser).toHaveBeenCalledWith("uid-new");
    });
  });
});

describe("AC9: Re-register is idempotent", () => {
  it("AC9: Re-register is idempotent", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await repo.saveProfile(ALICE);
      const result = await dispatch({
        method: "POST",
        pathname: "/api/register",
        authorization: "Bearer alice",
        body: JSON.stringify({ displayName: "Other" }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(200);
      const body = JSON.parse(result.body) as UserProfile;
      expect(body.displayName).toBe("Alice");
      expect(body.canUseFromText).toBe(false);
    });
  });
});

describe("AC10b: Moderator flag uses profile email when token omits email", () => {
  it("AC10b: Moderator flag uses profile email when token omits email", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await repo.saveProfile(MOD);
      const result = await dispatch({
        method: "GET",
        pathname: "/api/me",
        authorization: "Bearer no-email",
        distDir: join(dir, "dist"),
        repo,
        verifyIdToken: async () => ({ uid: "uid-mod" }),
      });
      expect(result.status).toBe(200);
      const body = JSON.parse(result.body) as UserProfile & {
        isModerator: boolean;
      };
      expect(body.isModerator).toBe(true);
      expect(body.canUseFromText).toBe(true);
    });
  });
});

describe("AC10: Moderator occupies a slot and is flagged", () => {
  it("AC10: Moderator occupies a slot and is flagged", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      const result = await dispatch({
        method: "POST",
        pathname: "/api/register",
        authorization: "Bearer mod",
        body: JSON.stringify({ displayName: "Mod" }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(201);
      const body = JSON.parse(result.body) as UserProfile & {
        isModerator: boolean;
      };
      expect(body.isModerator).toBe(true);
      expect(body.canUseFromText).toBe(true);
      expect(await repo.profileCount()).toBe(1);
    });
  });
});

describe("AC11: GET /api/me after register", () => {
  it("AC11: GET /api/me after register", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await repo.saveProfile(ALICE);
      const result = await dispatch({
        method: "GET",
        pathname: "/api/me",
        authorization: "Bearer alice",
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(200);
      const body = JSON.parse(result.body) as UserProfile & {
        isModerator: boolean;
      };
      expect(body.id).toBe("uid-alice");
      expect(body.isModerator).toBe(false);
    });
  });
});

describe("AC12: GET /api/me without profile", () => {
  it("AC12: GET /api/me without profile", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      const result = await dispatch({
        method: "GET",
        pathname: "/api/me",
        authorization: "Bearer bob",
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(403);
      expect(result.body).toBe(JSON.stringify({ error: "Register first." }));
      expect(await repo.profileCount()).toBe(0);
    });
  });
});

describe("AC13: Orphan Auth user at cap is deleted on /api/me", () => {
  it("AC13: Orphan Auth user at cap is deleted on /api/me", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      for (let i = 0; i < 10; i += 1) {
        await repo.saveProfile({
          id: `uid-${i}`,
          email: `u${i}@example.com`,
          displayName: `U${i}`,
          canUseFromText: false,
          createdAt: "2026-01-01T00:00:00.000Z",
        });
      }
      const deleteUser = vi.fn(async () => {});
      const result = await dispatch({
        method: "GET",
        pathname: "/api/me",
        authorization: "Bearer orphan",
        distDir: join(dir, "dist"),
        repo,
        deleteUser,
      });
      expect(result.status).toBe(403);
      expect(result.body).toBe(
        JSON.stringify({ error: "The household is full (10 users)." }),
      );
      expect(deleteUser).toHaveBeenCalledTimes(1);
      expect(deleteUser).toHaveBeenCalledWith("uid-orphan");
    });
  });
});

describe("AC62: Store dump gone", () => {
  it("AC62: Store dump gone", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await repo.saveProfile(ALICE);
      const getNoToken = await dispatch({
        method: "GET",
        pathname: "/api/store",
        distDir: join(dir, "dist"),
        repo,
      });
      const putNoToken = await dispatch({
        method: "PUT",
        pathname: "/api/store",
        body: "{}",
        distDir: join(dir, "dist"),
        repo,
      });
      const getToken = await dispatch({
        method: "GET",
        pathname: "/api/store",
        authorization: "Bearer alice",
        distDir: join(dir, "dist"),
        repo,
      });
      expect(getNoToken.status).toBe(404);
      expect(getNoToken.body).toBe(JSON.stringify({ error: "Not found." }));
      expect(putNoToken.status).toBe(404);
      expect(getToken.status).toBe(404);
      expect(repo.saveBudgetCalls).toBe(0);
    });
  });
});

describe("AC6: Serve index.html for GET /", () => {
  it("AC6: Serve index.html for GET /", async () => {
    await withTempDir(async (dir) => {
      const distDir = join(dir, "dist");
      mkdirSync(distDir);
      writeFileSync(join(distDir, "index.html"), "<!doctype html>ok");
      const result = await dispatch({
        method: "GET",
        pathname: "/",
        distDir,
        repo: new MemoryRepo(),
      });
      expect(result.status).toBe(200);
      expect(result.headers["Content-Type"]).toBe("text/html; charset=utf-8");
      expect(result.body).toBe("<!doctype html>ok");
    });
  });
});

describe("AC7: Missing UI build", () => {
  it("AC7: Missing UI build", async () => {
    await withTempDir(async (dir) => {
      const result = await dispatch({
        method: "GET",
        pathname: "/",
        distDir: join(dir, "dist"),
        repo: new MemoryRepo(),
      });
      expect(result.status).toBe(503);
      expect(result.body).toBe(
        JSON.stringify({ error: "UI build is missing. Run npm run build." }),
      );
    });
  });
});

describe("AC8: Reject path traversal", () => {
  it("AC8: Reject path traversal", async () => {
    await withTempDir(async (dir) => {
      const distDir = join(dir, "dist");
      mkdirSync(distDir);
      writeFileSync(join(distDir, "index.html"), "<!doctype html>ok");
      const result = await dispatch({
        method: "GET",
        pathname: "/../package.json",
        distDir,
        repo: new MemoryRepo(),
      });
      expect(result.status).toBe(404);
      expect(result.body).toBe(JSON.stringify({ error: "Not found." }));
    });
  });
});

describe("AC9: Default listen port", () => {
  const previous = process.env.PORT;
  afterEach(() => {
    if (previous === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = previous;
    }
  });

  it("AC9: Default listen port", () => {
    delete process.env.PORT;
    expect(listenPort()).toBe(8080);
  });
});

describe("AC10: PORT env", () => {
  const previous = process.env.PORT;
  afterEach(() => {
    if (previous === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = previous;
    }
  });

  it("AC10: PORT env", () => {
    process.env.PORT = "3000";
    expect(listenPort()).toBe(3000);
  });
});

async function seedHousehold(repo: MemoryRepo): Promise<void> {
  await repo.saveProfile(ALICE);
  await repo.saveProfile(BOB);
  await repo.saveProfile(MOD);
  await repo.saveProfile(CAROL);
  await repo.saveProfile(DAVE);
}

describe("AC30: GET /api/budgets filters by canListSummary", () => {
  it("AC30: GET /api/budgets filters by canListSummary", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveBudget(emptyBudget("b-mine", "Mine", "uid-alice"));
      await repo.saveBudget(
        emptyBudget("b-pub", "PublicOne", "uid-bob", { visibility: "public" }),
      );
      await repo.saveBudget(emptyBudget("b-secret", "Secret", "uid-carol"));
      await repo.saveBudget(
        emptyBudget("b-see", "SharedSee", "uid-dave", {
          grants: [{ userId: "uid-alice", role: "see" }],
        }),
      );
      const result = await dispatch({
        method: "GET",
        pathname: "/api/budgets",
        authorization: "Bearer alice",
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(200);
      const body = JSON.parse(result.body) as {
        budgets: Array<Record<string, unknown>>;
      };
      expect(body.budgets.map((item) => item.name)).toEqual([
        "Mine",
        "PublicOne",
        "SharedSee",
      ]);
      expect(body.budgets.find((item) => item.name === "PublicOne")?.viewerRelation).toBe(
        "public",
      );
      expect(body.budgets.find((item) => item.name === "SharedSee")?.viewerRelation).toBe(
        "see",
      );
      expect(body.budgets.find((item) => item.name === "Mine")?.viewerRelation).toBe(
        "owner",
      );
      for (const item of body.budgets) {
        expect("incomeEntries" in item).toBe(false);
        expect("grants" in item).toBe(false);
      }
    });
  });
});

describe("AC31: GET full budget forbidden for see and public", () => {
  it("AC31: GET full budget forbidden for see and public", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveBudget(
        emptyBudget("b-see", "See", "uid-bob", {
          grants: [{ userId: "uid-alice", role: "see" }],
        }),
      );
      await repo.saveBudget(
        emptyBudget("b-pub", "Pub", "uid-bob", { visibility: "public" }),
      );
      const see = await dispatch({
        method: "GET",
        pathname: "/api/budgets/b-see",
        authorization: "Bearer alice",
        distDir: join(dir, "dist"),
        repo,
      });
      const pub = await dispatch({
        method: "GET",
        pathname: "/api/budgets/b-pub",
        authorization: "Bearer alice",
        distDir: join(dir, "dist"),
        repo,
      });
      expect(see.status).toBe(404);
      expect(see.body).toBe(JSON.stringify({ error: "Not found." }));
      expect(pub.status).toBe(404);
      expect(pub.body).toBe(JSON.stringify({ error: "Not found." }));
    });
  });
});

describe("AC32: GET full budget allowed for browse", () => {
  it("AC32: GET full budget allowed for browse", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveBudget(
        emptyBudget("b1", "B", "uid-bob", {
          grants: [{ userId: "uid-alice", role: "browse" }],
          incomeCategories: [{ id: "c1", name: "Salary" }],
        }),
      );
      const result = await dispatch({
        method: "GET",
        pathname: "/api/budgets/b1",
        authorization: "Bearer alice",
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(200);
      const body = JSON.parse(result.body) as Budget;
      expect(body.id).toBe("b1");
      expect(Array.isArray(body.incomeCategories)).toBe(true);
    });
  });
});

describe("AC33: Owner sets visibility public", () => {
  it("AC33: Owner sets visibility public", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveBudget(emptyBudget("b1", "b1", "uid-alice"));
      const patch = await dispatch({
        method: "PATCH",
        pathname: "/api/budgets/b1/visibility",
        authorization: "Bearer alice",
        body: JSON.stringify({ visibility: "public" }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(patch.status).toBe(200);
      expect((await repo.getBudgetDoc("b1"))?.visibility).toBe("public");
      const list = await dispatch({
        method: "GET",
        pathname: "/api/budgets",
        authorization: "Bearer bob",
        distDir: join(dir, "dist"),
        repo,
      });
      const body = JSON.parse(list.body) as {
        budgets: Array<{ name: string; viewerRelation: string }>;
      };
      expect(body.budgets.some((item) => item.name === "b1" && item.viewerRelation === "public")).toBe(
        true,
      );
    });
  });
});

describe("AC34: Owner hides again", () => {
  it("AC34: Owner hides again", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveBudget(
        emptyBudget("b1", "b1", "uid-alice", { visibility: "public" }),
      );
      const patch = await dispatch({
        method: "PATCH",
        pathname: "/api/budgets/b1/visibility",
        authorization: "Bearer alice",
        body: JSON.stringify({ visibility: "hidden" }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(patch.status).toBe(200);
      const list = await dispatch({
        method: "GET",
        pathname: "/api/budgets",
        authorization: "Bearer bob",
        distDir: join(dir, "dist"),
        repo,
      });
      const body = JSON.parse(list.body) as { budgets: Array<{ name: string }> };
      expect(body.budgets.some((item) => item.name === "b1")).toBe(false);
    });
  });
});

describe("AC35: Invalid visibility", () => {
  it("AC35: Invalid visibility", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveBudget(emptyBudget("b1", "b1", "uid-alice"));
      const result = await dispatch({
        method: "PATCH",
        pathname: "/api/budgets/b1/visibility",
        authorization: "Bearer alice",
        body: JSON.stringify({ visibility: "secret" }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(400);
      expect(result.body).toBe(JSON.stringify({ error: "Invalid visibility." }));
      expect((await repo.getBudgetDoc("b1"))?.visibility).toBe("hidden");
    });
  });
});

describe("AC36: Edit grant cannot change visibility", () => {
  it("AC36: Edit grant cannot change visibility", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveBudget(
        emptyBudget("b1", "b1", "uid-alice", {
          grants: [{ userId: "uid-bob", role: "edit" }],
        }),
      );
      const result = await dispatch({
        method: "PATCH",
        pathname: "/api/budgets/b1/visibility",
        authorization: "Bearer bob",
        body: JSON.stringify({ visibility: "public" }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(403);
      expect(result.body).toBe(JSON.stringify({ error: "Not allowed." }));
      expect((await repo.getBudgetDoc("b1"))?.visibility).toBe("hidden");
    });
  });
});

describe("AC37: Stranger cannot change visibility (no leak)", () => {
  it("AC37: Stranger cannot change visibility (no leak)", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveBudget(emptyBudget("b1", "b1", "uid-alice"));
      const result = await dispatch({
        method: "PATCH",
        pathname: "/api/budgets/b1/visibility",
        authorization: "Bearer bob",
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(404);
      expect(result.body).toBe(JSON.stringify({ error: "Not found." }));
    });
  });
});

describe("AC38: Owner grants see without making public", () => {
  it("AC38: Owner grants see without making public", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveBudget(emptyBudget("b1", "b1", "uid-alice"));
      const put = await dispatch({
        method: "PUT",
        pathname: "/api/budgets/b1/grants",
        authorization: "Bearer alice",
        body: JSON.stringify({
          grants: [{ userId: "uid-bob", role: "see" }],
        }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(put.status).toBe(200);
      const stored = await repo.getBudgetDoc("b1");
      expect(stored?.grants).toEqual([{ userId: "uid-bob", role: "see" }]);
      expect(stored?.visibility).toBe("hidden");
      const list = await dispatch({
        method: "GET",
        pathname: "/api/budgets",
        authorization: "Bearer bob",
        distDir: join(dir, "dist"),
        repo,
      });
      const listed = JSON.parse(list.body) as {
        budgets: Array<{ name: string; viewerRelation: string }>;
      };
      expect(
        listed.budgets.some(
          (item) => item.name === "b1" && item.viewerRelation === "see",
        ),
      ).toBe(true);
      const get = await dispatch({
        method: "GET",
        pathname: "/api/budgets/b1",
        authorization: "Bearer bob",
        distDir: join(dir, "dist"),
        repo,
      });
      expect(get.status).toBe(404);
      expect(get.body).toBe(JSON.stringify({ error: "Not found." }));
    });
  });
});

describe("AC39: Grant browse then edit", () => {
  it("AC39: Grant browse then edit", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveBudget(emptyBudget("b1", "b1", "uid-alice"));
      const first = await dispatch({
        method: "PUT",
        pathname: "/api/budgets/b1/grants",
        authorization: "Bearer alice",
        body: JSON.stringify({
          grants: [{ userId: "uid-bob", role: "browse" }],
        }),
        distDir: join(dir, "dist"),
        repo,
      });
      const second = await dispatch({
        method: "PUT",
        pathname: "/api/budgets/b1/grants",
        authorization: "Bearer alice",
        body: JSON.stringify({
          grants: [{ userId: "uid-bob", role: "edit" }],
        }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      const stored = await repo.getBudgetDoc("b1");
      expect(stored?.grants).toEqual([{ userId: "uid-bob", role: "edit" }]);
      expect(canWrite(actorOf(BOB), stored as Budget)).toBe(true);
    });
  });
});

describe("AC40: Clear grants", () => {
  it("AC40: Clear grants", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveBudget(
        emptyBudget("b1", "b1", "uid-alice", {
          grants: [{ userId: "uid-bob", role: "edit" }],
        }),
      );
      const result = await dispatch({
        method: "PUT",
        pathname: "/api/budgets/b1/grants",
        authorization: "Bearer alice",
        body: JSON.stringify({ grants: [] }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(200);
      const list = await dispatch({
        method: "GET",
        pathname: "/api/budgets",
        authorization: "Bearer bob",
        distDir: join(dir, "dist"),
        repo,
      });
      const body = JSON.parse(list.body) as { budgets: Array<{ name: string }> };
      expect(body.budgets.some((item) => item.name === "b1")).toBe(false);
    });
  });
});

describe("AC41: Reject grant to owner", () => {
  it("AC41: Reject grant to owner", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveBudget(emptyBudget("b1", "b1", "uid-alice"));
      const result = await dispatch({
        method: "PUT",
        pathname: "/api/budgets/b1/grants",
        authorization: "Bearer alice",
        body: JSON.stringify({
          grants: [{ userId: "uid-alice", role: "edit" }],
        }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(400);
      expect(result.body).toBe(JSON.stringify({ error: "Invalid grant." }));
      expect((await repo.getBudgetDoc("b1"))?.grants).toEqual([]);
    });
  });
});

describe("AC42: Reject grant to unknown user", () => {
  it("AC42: Reject grant to unknown user", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveBudget(emptyBudget("b1", "b1", "uid-alice"));
      const result = await dispatch({
        method: "PUT",
        pathname: "/api/budgets/b1/grants",
        authorization: "Bearer alice",
        body: JSON.stringify({
          grants: [{ userId: "uid-nobody", role: "see" }],
        }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(400);
      expect(result.body).toBe(JSON.stringify({ error: "Invalid grant." }));
    });
  });
});

describe("AC43: Reject duplicate userId in grants", () => {
  it("AC43: Reject duplicate userId in grants", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveBudget(emptyBudget("b1", "b1", "uid-alice"));
      const result = await dispatch({
        method: "PUT",
        pathname: "/api/budgets/b1/grants",
        authorization: "Bearer alice",
        body: JSON.stringify({
          grants: [
            { userId: "uid-bob", role: "see" },
            { userId: "uid-bob", role: "edit" },
          ],
        }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(400);
      expect(result.body).toBe(JSON.stringify({ error: "Invalid grant." }));
    });
  });
});

describe("AC44: Reject invalid role", () => {
  it("AC44: Reject invalid role", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveBudget(emptyBudget("b1", "b1", "uid-alice"));
      const result = await dispatch({
        method: "PUT",
        pathname: "/api/budgets/b1/grants",
        authorization: "Bearer alice",
        body: JSON.stringify({
          grants: [{ userId: "uid-bob", role: "owner" }],
        }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(400);
      expect(result.body).toBe(JSON.stringify({ error: "Invalid grant." }));
    });
  });
});

describe("AC45: Edit cannot PUT grants", () => {
  it("AC45: Edit cannot PUT grants", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      const grants = [{ userId: "uid-bob", role: "edit" as const }];
      await repo.saveBudget(emptyBudget("b1", "b1", "uid-alice", { grants }));
      const result = await dispatch({
        method: "PUT",
        pathname: "/api/budgets/b1/grants",
        authorization: "Bearer bob",
        body: JSON.stringify({ grants: [] }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(403);
      expect(result.body).toBe(JSON.stringify({ error: "Not allowed." }));
      expect((await repo.getBudgetDoc("b1"))?.grants).toEqual(grants);
    });
  });
});

describe("AC46: Moderator can set grants and visibility on another’s budget", () => {
  it("AC46: Moderator can set grants and visibility on another’s budget", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveBudget(emptyBudget("b1", "b1", "uid-alice"));
      const vis = await dispatch({
        method: "PATCH",
        pathname: "/api/budgets/b1/visibility",
        authorization: "Bearer mod",
        body: JSON.stringify({ visibility: "public" }),
        distDir: join(dir, "dist"),
        repo,
      });
      const grants = await dispatch({
        method: "PUT",
        pathname: "/api/budgets/b1/grants",
        authorization: "Bearer mod",
        body: JSON.stringify({
          grants: [{ userId: "uid-bob", role: "see" }],
        }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(vis.status).toBe(200);
      expect(grants.status).toBe(200);
      const stored = await repo.getBudgetDoc("b1");
      expect(stored?.visibility).toBe("public");
      expect(stored?.grants).toEqual([{ userId: "uid-bob", role: "see" }]);
    });
  });
});

describe("AC47: Moderator lists users", () => {
  it("AC47: Moderator lists users", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await repo.saveProfile(ALICE);
      await repo.saveProfile({ ...MOD, email: "mod@example.com" });
      const result = await dispatch({
        method: "GET",
        pathname: "/api/admin/users",
        authorization: "Bearer mod",
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(200);
      const body = JSON.parse(result.body) as { users: UserProfile[] };
      expect(body.users).toHaveLength(2);
      for (const user of body.users) {
        expect("canUseFromText" in user).toBe(true);
        expect("email" in user).toBe(true);
      }
    });
  });
});

describe("AC48: Non-moderator cannot list admin users", () => {
  it("AC48: Non-moderator cannot list admin users", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await repo.saveProfile(ALICE);
      const result = await dispatch({
        method: "GET",
        pathname: "/api/admin/users",
        authorization: "Bearer alice",
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(403);
      expect(result.body).toBe(JSON.stringify({ error: "Not allowed." }));
    });
  });
});

describe("AC49: Moderator toggles From-text flag", () => {
  it("AC49: Moderator toggles From-text flag", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      const result = await dispatch({
        method: "PATCH",
        pathname: "/api/admin/users/uid-alice",
        authorization: "Bearer mod",
        body: JSON.stringify({ canUseFromText: true }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(200);
      expect((await repo.getProfile("uid-alice"))?.canUseFromText).toBe(true);
    });
  });
});

describe("AC50: Alice cannot toggle her own From-text flag", () => {
  it("AC50: Alice cannot toggle her own From-text flag", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      const result = await dispatch({
        method: "PATCH",
        pathname: "/api/admin/users/uid-alice",
        authorization: "Bearer alice",
        body: JSON.stringify({ canUseFromText: true }),
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(403);
      expect(result.body).toBe(JSON.stringify({ error: "Not allowed." }));
      expect((await repo.getProfile("uid-alice"))?.canUseFromText).toBe(false);
    });
  });
});

describe("AC67: Moderator deletes another user and their budgets", () => {
  it("AC67: Moderator deletes another user and their budgets", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveBudget(emptyBudget("b1", "Summer", "uid-alice"));
      await repo.saveBudget(emptyBudget("b2", "Winter", "uid-alice"));
      await repo.saveBudget(emptyBudget("b3", "BobBud", "uid-bob"));
      const deleteUser = vi.fn(async () => {});
      const result = await dispatch({
        method: "DELETE",
        pathname: "/api/admin/users/uid-alice",
        authorization: "Bearer mod",
        distDir: join(dir, "dist"),
        repo,
        deleteUser,
      });
      expect(result.status).toBe(200);
      expect(result.body).toBe(JSON.stringify({ ok: true }));
      expect(await repo.getProfile("uid-alice")).toBeNull();
      expect(await repo.getBudgetDoc("b1")).toBeNull();
      expect(await repo.getBudgetDoc("b2")).toBeNull();
      expect((await repo.getBudgetDoc("b3"))?.name).toBe("BobBud");
      expect(deleteUser).toHaveBeenCalledTimes(1);
      expect(deleteUser).toHaveBeenCalledWith("uid-alice");
    });
  });
});

describe("AC68: Deleting a user strips their grants", () => {
  it("AC68: Deleting a user strips their grants", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveBudget(
        emptyBudget("b3", "BobBud", "uid-bob", {
          grants: [{ userId: "uid-alice", role: "edit" }],
        }),
      );
      const result = await dispatch({
        method: "DELETE",
        pathname: "/api/admin/users/uid-alice",
        authorization: "Bearer mod",
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(200);
      expect((await repo.getBudgetDoc("b3"))?.grants).toEqual([]);
    });
  });
});

describe("AC69: Non-moderator cannot delete a user", () => {
  it("AC69: Non-moderator cannot delete a user", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      const result = await dispatch({
        method: "DELETE",
        pathname: "/api/admin/users/uid-bob",
        authorization: "Bearer alice",
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(403);
      expect(result.body).toBe(JSON.stringify({ error: "Not allowed." }));
      expect(await repo.getProfile("uid-bob")).not.toBeNull();
    });
  });
});

describe("AC70: Moderator cannot delete themself", () => {
  it("AC70: Moderator cannot delete themself", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      const deleteUser = vi.fn(async () => {});
      const result = await dispatch({
        method: "DELETE",
        pathname: "/api/admin/users/uid-mod",
        authorization: "Bearer mod",
        distDir: join(dir, "dist"),
        repo,
        deleteUser,
      });
      expect(result.status).toBe(403);
      expect(result.body).toBe(JSON.stringify({ error: "Not allowed." }));
      expect(await repo.getProfile("uid-mod")).not.toBeNull();
      expect(deleteUser).not.toHaveBeenCalled();
    });
  });
});

describe("AC71: Delete unknown user", () => {
  it("AC71: Delete unknown user", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      const result = await dispatch({
        method: "DELETE",
        pathname: "/api/admin/users/uid-missing",
        authorization: "Bearer mod",
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(404);
      expect(result.body).toBe(JSON.stringify({ error: "Not found." }));
    });
  });
});

const suggestBody = JSON.stringify({
  budgetId: "b1",
  text: "paid rent 600 euros",
  incomeCategories: [{ id: "c1", name: "Salary" }],
  expenseCategories: [{ id: "c2", name: "Rent" }],
});

describe("AC51: Suggest rejected without From-text flag", () => {
  it("AC51: Suggest rejected without From-text flag", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveBudget(emptyBudget("b1", "b1", "uid-alice"));
      const generateJson = vi.fn(async () => JSON.stringify({ items: [] }));
      const result = await dispatch({
        method: "POST",
        pathname: "/api/suggest-entries",
        authorization: "Bearer alice",
        body: suggestBody,
        distDir: join(dir, "dist"),
        repo,
        geminiCaller: { generateJson },
      });
      expect(result.status).toBe(403);
      expect(result.body).toBe(
        JSON.stringify({ error: "From text is not allowed." }),
      );
      expect(generateJson).not.toHaveBeenCalled();
    });
  });
});

describe("AC52: Suggest rejected without write even with flag", () => {
  it("AC52: Suggest rejected without write even with flag", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveProfile({ ...BOB, canUseFromText: true });
      await repo.saveBudget(
        emptyBudget("b1", "b1", "uid-alice", {
          grants: [{ userId: "uid-bob", role: "browse" }],
        }),
      );
      const generateJson = vi.fn(async () => JSON.stringify({ items: [] }));
      const result = await dispatch({
        method: "POST",
        pathname: "/api/suggest-entries",
        authorization: "Bearer bob",
        body: suggestBody,
        distDir: join(dir, "dist"),
        repo,
        geminiCaller: { generateJson },
      });
      expect(result.status).toBe(403);
      expect(result.body).toBe(JSON.stringify({ error: "Not allowed." }));
      expect(generateJson).not.toHaveBeenCalled();
    });
  });
});

describe("AC53: Suggest rejected as see (no leak vs write)", () => {
  it("AC53: Suggest rejected as see (no leak vs write)", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveProfile({ ...BOB, canUseFromText: true });
      await repo.saveBudget(
        emptyBudget("b1", "b1", "uid-alice", {
          grants: [{ userId: "uid-bob", role: "see" }],
        }),
      );
      const result = await dispatch({
        method: "POST",
        pathname: "/api/suggest-entries",
        authorization: "Bearer bob",
        body: suggestBody,
        distDir: join(dir, "dist"),
        repo,
        geminiCaller: { generateJson: async () => JSON.stringify({ items: [] }) },
      });
      expect(result.status).toBe(404);
      expect(result.body).toBe(JSON.stringify({ error: "Not found." }));
    });
  });
});

describe("AC54: Suggest allowed for editor with flag", () => {
  it("AC54: Suggest allowed for editor with flag", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveProfile({ ...BOB, canUseFromText: true });
      await repo.saveBudget(
        emptyBudget("b1", "b1", "uid-alice", {
          grants: [{ userId: "uid-bob", role: "edit" }],
        }),
      );
      const generateJson = vi.fn(async () => JSON.stringify({ items: [] }));
      const result = await dispatch({
        method: "POST",
        pathname: "/api/suggest-entries",
        authorization: "Bearer bob",
        body: suggestBody,
        distDir: join(dir, "dist"),
        repo,
        geminiCaller: { generateJson },
      });
      expect(result.status).toBe(200);
      expect(generateJson).toHaveBeenCalledTimes(1);
    });
  });
});

describe("AC55: Suggest allowed for moderator without stored flag", () => {
  it("AC55: Suggest allowed for moderator without stored flag", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveBudget(emptyBudget("b1", "b1", "uid-alice"));
      const generateJson = vi.fn(async () => JSON.stringify({ items: [] }));
      const result = await dispatch({
        method: "POST",
        pathname: "/api/suggest-entries",
        authorization: "Bearer mod",
        body: suggestBody,
        distDir: join(dir, "dist"),
        repo,
        geminiCaller: { generateJson },
      });
      expect(result.status).toBe(200);
      expect(generateJson).toHaveBeenCalledTimes(1);
    });
  });
});

describe("AC63: GET /api/users for picker", () => {
  it("AC63: GET /api/users for picker", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await repo.saveProfile(ALICE);
      await repo.saveProfile(BOB);
      const result = await dispatch({
        method: "GET",
        pathname: "/api/users",
        authorization: "Bearer alice",
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(200);
      const body = JSON.parse(result.body) as { users: Array<Record<string, unknown>> };
      expect(body.users).toEqual([
        {
          id: "uid-alice",
          email: "alice@example.com",
          displayName: "Alice",
        },
        {
          id: "uid-bob",
          email: "bob@example.com",
          displayName: "Bob",
        },
      ]);
      for (const user of body.users) {
        expect("canUseFromText" in user).toBe(false);
      }
    });
  });
});

describe("node-http AC5: POST /api/suggest-entries missing key", () => {
  it("AC5: POST /api/suggest-entries missing key", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await seedHousehold(repo);
      await repo.saveProfile({ ...ALICE, canUseFromText: true });
      await repo.saveBudget(emptyBudget("b1", "b1", "uid-alice"));
      const result = await dispatch({
        method: "POST",
        pathname: "/api/suggest-entries",
        authorization: "Bearer alice",
        body: suggestBody,
        geminiApiKey: "",
        distDir: join(dir, "dist"),
        repo,
      });
      expect(result.status).toBe(503);
      expect(result.body).toBe(
        JSON.stringify({ error: "Gemini API key is missing." }),
      );
    });
  });
});

describe("POST /api/budgets creates as owner", () => {
  it("POST /api/budgets creates as owner", async () => {
    await withTempDir(async (dir) => {
      const repo = new MemoryRepo();
      await repo.saveProfile(ALICE);
      const result = await dispatch({
        method: "POST",
        pathname: "/api/budgets",
        authorization: "Bearer alice",
        body: JSON.stringify({ name: "Summer" }),
        distDir: join(dir, "dist"),
        repo,
        createId: () => "b-new",
      });
      expect(result.status).toBe(201);
      const body = JSON.parse(result.body) as Budget;
      expect(body.id).toBe("b-new");
      expect(body.ownerId).toBe("uid-alice");
      expect(body.visibility).toBe("hidden");
      expect(body.grants).toEqual([]);
      expect(body.name).toBe("Summer");
    });
  });
});
