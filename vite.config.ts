import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig, type Plugin } from "vitest/config";
import { applyEnvFile } from "./src/envFile";
import { dispatchHttpRequest } from "./src/httpDispatch";
import { isModeratorEmail } from "./src/acl";
import { migrateJsonIfNeeded } from "./src/migrate";
import { APP_BUDGETS_FILE } from "./src/paths";
import type { AppRepo } from "./src/repo";

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
  let repo: AppRepo | undefined;
  let migrated = false;
  return {
    name: "budget-store-api",
    configureServer(server) {
      applyEnvFile();
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split("?")[0] ?? "";
        if (!pathname.startsWith("/api/")) {
          next();
          return;
        }
        void (async () => {
          applyEnvFile(process.cwd(), { overwrite: true });
          const env = loadEnv(server.config.mode, process.cwd(), "");
          for (const [key, value] of Object.entries(env)) {
            if (process.env[key] === undefined || process.env[key] === "") {
              process.env[key] = value;
            }
          }
          const { createAppRepo, deleteAuthUser, verifyIdToken } = await import(
            "./src/firebaseAdmin"
          );
          if (repo === undefined) {
            repo = createAppRepo();
          }
          if (!migrated) {
            migrated = true;
            const profiles = await repo.listProfiles();
            const moderator = profiles.find((profile) =>
              isModeratorEmail(profile.email, process.env.MODERATOR_EMAIL ?? ""),
            );
            if (moderator !== undefined) {
              await migrateJsonIfNeeded(repo, APP_BUDGETS_FILE, moderator.id);
            }
          }
          const body = await readBody(req as IncomingMessage);
          const incoming = req as IncomingMessage;
          const result = await dispatchHttpRequest({
            method: req.method ?? "GET",
            pathname,
            body,
            authorization: incoming.headers.authorization,
            geminiApiKey: process.env.GEMINI_API_KEY ?? "",
            distDir: "",
            repo,
            moderatorEmail: process.env.MODERATOR_EMAIL ?? "",
            firebaseWebApiKey: process.env.FIREBASE_WEB_API_KEY ?? "",
            firebaseWebAuthDomain: process.env.FIREBASE_WEB_AUTH_DOMAIN ?? "",
            firebaseWebProjectId: process.env.FIREBASE_WEB_PROJECT_ID ?? "",
            firebaseAuthEmulatorHost:
              process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "",
            verifyIdToken,
            deleteUser: deleteAuthUser,
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
