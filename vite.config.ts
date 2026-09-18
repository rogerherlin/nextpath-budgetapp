import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig, type Plugin } from "vitest/config";
import { dispatchHttpRequest } from "./src/httpDispatch";
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

function storeApiPlugin(): Plugin {
  return {
    name: "budget-store-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split("?")[0] ?? "";
        if (
          pathname !== "/api/store" &&
          pathname !== "/api/suggest-entries"
        ) {
          next();
          return;
        }
        void (async () => {
          const env = loadEnv(server.config.mode, process.cwd(), "");
          const body = await readBody(req as IncomingMessage);
          const result = await dispatchHttpRequest({
            method: req.method ?? "GET",
            pathname,
            body,
            geminiApiKey: env.GEMINI_API_KEY ?? "",
            distDir: "",
            storePath: APP_BUDGETS_FILE,
            loadStoreAt: loadStore,
            parseStoreJson,
            serializeStore,
          });
          const outgoing = res as ServerResponse;
          outgoing.statusCode = result.status;
          for (const [name, value] of Object.entries(result.headers)) {
            outgoing.setHeader(name, value);
          }
          outgoing.end(result.body);
        })();
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
