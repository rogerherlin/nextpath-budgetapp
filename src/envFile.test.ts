import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyEnvFile } from "./envFile";

const keys = ["MODERATOR_EMAIL"] as const;
const previous: Record<string, string | undefined> = {};

afterEach(() => {
  for (const key of keys) {
    const value = previous[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
    delete previous[key];
  }
});

describe("applyEnvFile", () => {
  it("fills an empty process env value from .env", () => {
    previous.MODERATOR_EMAIL = process.env.MODERATOR_EMAIL;
    process.env.MODERATOR_EMAIL = "";
    const dir = mkdtempSync(join(tmpdir(), "budgetapp-env-"));
    try {
      writeFileSync(join(dir, ".env"), "MODERATOR_EMAIL=mod@example.com\n");
      applyEnvFile(dir);
      expect(process.env.MODERATOR_EMAIL).toBe("mod@example.com");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("overwrites a previous value when overwrite is true", () => {
    previous.MODERATOR_EMAIL = process.env.MODERATOR_EMAIL;
    process.env.MODERATOR_EMAIL = "old@example.com";
    const dir = mkdtempSync(join(tmpdir(), "budgetapp-env-"));
    try {
      writeFileSync(join(dir, ".env"), "MODERATOR_EMAIL=mod@example.com\n");
      applyEnvFile(dir, { overwrite: true });
      expect(process.env.MODERATOR_EMAIL).toBe("mod@example.com");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
