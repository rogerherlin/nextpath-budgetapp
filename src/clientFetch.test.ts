import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const clientHttpFiles = [
  "src/App.tsx",
  "src/authClient.ts",
  "src/clientStore.ts",
  "src/ui/LoginScreen.tsx",
  "src/ui/BudgetScreen.tsx",
  "src/ui/FromTextTab.tsx",
];

describe("AC6: Browser HTTP goes through clientFetch", () => {
  it("AC6: Browser HTTP goes through clientFetch", () => {
    const root = process.cwd();
    for (const file of clientHttpFiles) {
      const text = readFileSync(join(root, file), "utf8");
      expect(text, file).not.toContain("fetch(");
      expect(text, file).toMatch(/clientFetch/);
    }
  });
});
