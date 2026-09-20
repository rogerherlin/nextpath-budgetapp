import { createServer, type IncomingMessage } from "node:http";
import { AgentMemoryStore } from "./agentMemory";
import { applyEnvFile } from "./envFile";
import {
  createAppRepo,
  deleteAuthUser,
  verifyIdToken,
} from "./firebaseAdmin";
import {
  defaultDistDir,
  dispatchHttpRequest,
  listenPort,
} from "./httpDispatch";
import { MAX_REQUEST_BYTES } from "./serverAccess";
import { isModeratorEmail } from "./acl";
import { migrateJsonIfNeeded } from "./migrate";
import { APP_BUDGETS_FILE } from "./paths";
import {
  readFirebaseAuthEmulatorHost,
  readFirebaseWebConfig,
  readGeminiApiKey,
  readModeratorEmail,
} from "./secrets";

applyEnvFile();

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        if (!settled) {
          settled = true;
          resolve("x".repeat(MAX_REQUEST_BYTES + 1));
        }
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(chunks).toString("utf8"));
      }
    });
    req.on("error", reject);
  });
}

const distDir = defaultDistDir();
const port = listenPort();
const repo = createAppRepo();
const agentMemory = new AgentMemoryStore();
const web = readFirebaseWebConfig();
const moderatorEmail = readModeratorEmail();

void (async () => {
  const profiles = await repo.listProfiles();
  const moderator = profiles.find((profile) =>
    isModeratorEmail(profile.email, moderatorEmail),
  );
  if (moderator !== undefined) {
    await migrateJsonIfNeeded(repo, APP_BUDGETS_FILE, moderator.id);
  }
})();

const server = createServer((req, res) => {
  const pathname = (req.url ?? "/").split("?")[0] ?? "/";
  void (async () => {
    const body = await readBody(req);
    const result = await dispatchHttpRequest({
      method: req.method ?? "GET",
      pathname,
      body,
      authorization: req.headers.authorization,
      geminiApiKey: readGeminiApiKey(),
      distDir,
      repo,
      moderatorEmail,
      firebaseWebApiKey: web.apiKey,
      firebaseWebAuthDomain: web.authDomain,
      firebaseWebProjectId: web.projectId,
      firebaseAuthEmulatorHost: readFirebaseAuthEmulatorHost(),
      verifyIdToken,
      deleteUser: deleteAuthUser,
      agentMemory,
    });
    res.writeHead(result.status, result.headers);
    res.end(result.body);
  })();
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    process.stderr.write(
      `Port ${port} is already in use. Stop the other process or run PORT=8081 npm run serve.\n`,
    );
    process.exit(1);
  }
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`BudgetApp listening on http://127.0.0.1:${port}\n`);
});
