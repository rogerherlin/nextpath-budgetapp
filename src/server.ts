import { createServer, type IncomingMessage } from "node:http";
import { applyEnvFile } from "./envFile";
import {
  defaultDistDir,
  dispatchHttpRequest,
  listenPort,
} from "./httpDispatch";
import { APP_BUDGETS_FILE } from "./paths";
import { loadStore, parseStoreJson, serializeStore } from "./store";

applyEnvFile();

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

const distDir = defaultDistDir();
const port = listenPort();

const server = createServer((req, res) => {
  const pathname = (req.url ?? "/").split("?")[0] ?? "/";
  void (async () => {
    const body = await readBody(req);
    const result = await dispatchHttpRequest({
      method: req.method ?? "GET",
      pathname,
      body,
      geminiApiKey: process.env.GEMINI_API_KEY ?? "",
      distDir,
      storePath: APP_BUDGETS_FILE,
      loadStoreAt: loadStore,
      parseStoreJson,
      serializeStore,
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
