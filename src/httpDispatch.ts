import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import {
  createSdkCaller,
  handleSuggestEntries,
  type GeminiCaller,
} from "./geminiSuggest";
import type { LoadStoreResult, StoreFile } from "./store";

export type HttpDispatchResult = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export type HttpDispatchInput = {
  method: string;
  pathname: string;
  body: string;
  geminiApiKey: string;
  distDir: string;
  storePath: string;
  loadStoreAt: (path: string) => LoadStoreResult;
  parseStoreJson: (raw: string) => LoadStoreResult;
  serializeStore: (store: StoreFile) => string;
  geminiCaller?: GeminiCaller;
};

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResult(status: number, body: string): HttpDispatchResult {
  return { status, headers: JSON_HEADERS, body };
}

export function listenPort(): number {
  const raw = process.env.PORT;
  if (raw === undefined || raw.trim() === "") {
    return 8080;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 8080;
  }
  return parsed;
}

function mimeFor(filePath: string): string {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (filePath.endsWith(".svg")) {
    return "image/svg+xml";
  }
  if (filePath.endsWith(".json")) {
    return "application/json";
  }
  if (filePath.endsWith(".ico")) {
    return "image/x-icon";
  }
  return "application/octet-stream";
}

function safeDistFile(distDir: string, pathname: string): string | null {
  const distResolved = resolve(distDir);
  const relative =
    pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = resolve(distDir, relative);
  if (target !== distResolved && !target.startsWith(distResolved + sep)) {
    return null;
  }
  return target;
}

async function dispatchApi(
  input: HttpDispatchInput,
): Promise<HttpDispatchResult | null> {
  if (input.pathname === "/api/store") {
    if (input.method === "GET") {
      const result = input.loadStoreAt(input.storePath);
      if (!result.ok) {
        return jsonResult(500, JSON.stringify({ error: result.error }));
      }
      return jsonResult(200, input.serializeStore(result.value));
    }
    if (input.method === "PUT") {
      const parsed = input.parseStoreJson(input.body);
      if (!parsed.ok) {
        return jsonResult(400, JSON.stringify({ error: "Invalid store." }));
      }
      mkdirSync(dirname(input.storePath), { recursive: true });
      writeFileSync(input.storePath, input.serializeStore(parsed.value));
      return jsonResult(200, input.serializeStore(parsed.value));
    }
    return jsonResult(404, JSON.stringify({ error: "Not found." }));
  }
  if (input.pathname === "/api/suggest-entries") {
    if (input.method !== "POST") {
      return jsonResult(404, JSON.stringify({ error: "Not found." }));
    }
    const result = await handleSuggestEntries(
      input.body,
      input.geminiApiKey,
      input.geminiCaller ?? createSdkCaller(),
    );
    return jsonResult(result.status, JSON.stringify(result.body));
  }
  return null;
}

export async function dispatchHttpRequest(
  input: HttpDispatchInput,
): Promise<HttpDispatchResult> {
  const api = await dispatchApi(input);
  if (api !== null) {
    return api;
  }
  if (input.method !== "GET" && input.method !== "HEAD") {
    return jsonResult(404, JSON.stringify({ error: "Not found." }));
  }
  if (!existsSync(input.distDir)) {
    return jsonResult(
      503,
      JSON.stringify({ error: "UI build is missing. Run npm run build." }),
    );
  }
  const filePath = safeDistFile(input.distDir, input.pathname);
  if (filePath === null || !existsSync(filePath)) {
    return jsonResult(404, JSON.stringify({ error: "Not found." }));
  }
  const body = input.method === "HEAD" ? "" : readFileSync(filePath, "utf8");
  return {
    status: 200,
    headers: { "Content-Type": mimeFor(filePath) },
    body,
  };
}

export function defaultDistDir(): string {
  return join(process.cwd(), "dist");
}
