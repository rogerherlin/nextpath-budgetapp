import { mkdirSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vitest/config";
import { APP_BUDGETS_FILE } from "./src/paths";
import { loadStore, parseStoreJson, serializeStore } from "./src/store";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: string): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(body);
}

function storeApiPlugin(): Plugin {
  return {
    name: "budget-store-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path !== "/api/store") {
          next();
          return;
        }
        if (req.method === "GET") {
          const result = loadStore();
          if (!result.ok) {
            sendJson(res, 500, JSON.stringify({ error: result.error }));
            return;
          }
          sendJson(res, 200, serializeStore(result.value));
          return;
        }
        if (req.method === "PUT") {
          void readBody(req).then((raw) => {
            const parsed = parseStoreJson(raw);
            if (!parsed.ok) {
              sendJson(res, 400, JSON.stringify({ error: "Invalid store." }));
              return;
            }
            mkdirSync(dirname(APP_BUDGETS_FILE), { recursive: true });
            writeFileSync(APP_BUDGETS_FILE, serializeStore(parsed.value));
            sendJson(res, 200, serializeStore(parsed.value));
          });
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), storeApiPlugin()],
  test: {
    passWithNoTests: true,
    pool: "forks",
  },
});
