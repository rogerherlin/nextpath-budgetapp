import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dispatchHttpRequest, listenPort } from "./httpDispatch";
import { loadStore, parseStoreJson, serializeStore } from "./store";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "budgetapp-http-"));
  try {
    await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const emptyStoreJson = '{"version":1,"budgets":[]}';

const validSuggestBody = JSON.stringify({
  text: "milk 4 euros",
  incomeCategories: [],
  expenseCategories: [],
});

function dispatch(input: {
  method: string;
  pathname: string;
  body?: string;
  geminiApiKey?: string;
  distDir: string;
  storePath: string;
}) {
  return dispatchHttpRequest({
    method: input.method,
    pathname: input.pathname,
    body: input.body ?? "",
    geminiApiKey: input.geminiApiKey ?? "test-key",
    distDir: input.distDir,
    storePath: input.storePath,
    loadStoreAt: loadStore,
    parseStoreJson,
    serializeStore,
  });
}

describe("AC1: GET /api/store", () => {
  it("AC1: GET /api/store", async () => {
    await withTempDir(async (dir) => {
      const storePath = join(dir, "budgets.json");
      writeFileSync(storePath, emptyStoreJson);
      const result = await dispatch({
        method: "GET",
        pathname: "/api/store",
        distDir: join(dir, "dist"),
        storePath,
      });
      expect(result.status).toBe(200);
      expect(result.headers["Content-Type"]).toBe("application/json");
      expect(result.body).toBe(emptyStoreJson);
    });
  });
});

describe("AC2: GET /api/store load failure", () => {
  it("AC2: GET /api/store load failure", async () => {
    await withTempDir(async (dir) => {
      const storePath = join(dir, "budgets.json");
      writeFileSync(storePath, "NOT JSON");
      const result = await dispatch({
        method: "GET",
        pathname: "/api/store",
        distDir: join(dir, "dist"),
        storePath,
      });
      expect(result.status).toBe(500);
      expect(result.body).toBe(
        JSON.stringify({ error: "Could not read budgets.json." }),
      );
    });
  });
});

describe("AC3: PUT /api/store valid", () => {
  it("AC3: PUT /api/store valid", async () => {
    await withTempDir(async (dir) => {
      const storePath = join(dir, "nested", "budgets.json");
      const result = await dispatch({
        method: "PUT",
        pathname: "/api/store",
        body: emptyStoreJson,
        distDir: join(dir, "dist"),
        storePath,
      });
      expect(result.status).toBe(200);
      expect(result.body).toBe(emptyStoreJson);
      expect(readFileSync(storePath, "utf8")).toBe(emptyStoreJson);
    });
  });
});

describe("AC4: PUT /api/store invalid", () => {
  it("AC4: PUT /api/store invalid", async () => {
    await withTempDir(async (dir) => {
      const storePath = join(dir, "budgets.json");
      const result = await dispatch({
        method: "PUT",
        pathname: "/api/store",
        body: "{}",
        distDir: join(dir, "dist"),
        storePath,
      });
      expect(result.status).toBe(400);
      expect(result.body).toBe(JSON.stringify({ error: "Invalid store." }));
      expect(existsSync(storePath)).toBe(false);
    });
  });
});

describe("AC5: POST /api/suggest-entries missing key", () => {
  it("AC5: POST /api/suggest-entries missing key", async () => {
    await withTempDir(async (dir) => {
      const result = await dispatch({
        method: "POST",
        pathname: "/api/suggest-entries",
        body: validSuggestBody,
        geminiApiKey: "",
        distDir: join(dir, "dist"),
        storePath: join(dir, "budgets.json"),
      });
      expect(result.status).toBe(503);
      expect(result.body).toBe(
        JSON.stringify({ error: "Gemini API key is missing." }),
      );
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
        storePath: join(dir, "budgets.json"),
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
        storePath: join(dir, "budgets.json"),
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
        storePath: join(dir, "budgets.json"),
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
