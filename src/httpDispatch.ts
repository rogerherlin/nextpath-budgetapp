import { existsSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import {
  actorFromVerifiedSession,
  canUseFromText,
  decideBudgetAccess,
  isModeratorEmail,
} from "./acl";
import { AgentMemoryStore } from "./agentMemory";
import { executeAgentRun } from "./agentTools";
import {
  AGENT_MAX_MS,
  MAX_REQUEST_BYTES,
  redactSecrets,
} from "./serverAccess";
import {
  createSdkCaller,
  handleSuggestEntries,
  type GeminiCaller,
} from "./geminiSuggest";
import type { VerifiedToken } from "./firebaseAdmin";
import {
  MAX_PROFILES,
  copyBudgetForActor,
  createBudgetForActor,
  deleteBudgetForActor,
  deleteHouseholdUser,
  directoryUser,
  getBudget,
  isValidVisibility,
  listBudgetSummaries,
  mePayload,
  saveWritableBudget,
  setGrantsForActor,
  setVisibilityForActor,
  sortProfiles,
  type AppRepo,
} from "./repo";
import type { Actor, Budget, Category, DateParts, Entry, Grant, GrantRole, UserProfile } from "./types";

export { AgentMemoryStore };

export type HttpDispatchResult = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export type HttpDispatchInput = {
  method: string;
  pathname: string;
  body: string;
  authorization?: string;
  geminiApiKey: string;
  distDir: string;
  repo: AppRepo;
  moderatorEmail: string;
  firebaseWebApiKey: string;
  firebaseWebAuthDomain: string;
  firebaseWebProjectId: string;
  firebaseAuthEmulatorHost?: string;
  verifyIdToken: (token: string) => Promise<VerifiedToken>;
  deleteUser: (uid: string) => Promise<void>;
  geminiCaller?: GeminiCaller;
  createId?: () => string;
  nowIso?: () => string;
  agentMemory?: AgentMemoryStore;
  nowMs?: () => number;
  maxAgentMs?: number;
};

const JSON_HEADERS = { "Content-Type": "application/json" };

const defaultAgentMemory = new AgentMemoryStore();

function jsonResult(status: number, body: string): HttpDispatchResult {
  return { status, headers: JSON_HEADERS, body };
}

function errorResult(status: number, error: string): HttpDispatchResult {
  return jsonResult(status, JSON.stringify({ error }));
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

function bearerToken(authorization: string | undefined): string | null {
  if (authorization === undefined) {
    return null;
  }
  if (!authorization.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (token === "") {
    return null;
  }
  return token;
}

function parseJsonBody(raw: string): unknown | undefined {
  if (raw.trim() === "") {
    return undefined;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asDateParts(value: unknown): DateParts | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const rec = asRecord(value);
  if (
    rec === null ||
    typeof rec.year !== "number" ||
    typeof rec.month !== "number" ||
    typeof rec.day !== "number"
  ) {
    return undefined;
  }
  return { year: rec.year, month: rec.month, day: rec.day };
}

function actorFrom(
  profile: UserProfile,
  isModerator: boolean,
): Actor {
  return actorFromVerifiedSession(profile, isModerator);
}

async function maybeDeleteOrphan(
  input: HttpDispatchInput,
  uid: string,
): Promise<HttpDispatchResult> {
  await input.deleteUser(uid);
  return errorResult(403, "The household is full (10 users).");
}

type Session =
  | { ok: false; result: HttpDispatchResult }
  | {
      ok: true;
      uid: string;
      email: string;
      profile: UserProfile | null;
      isModerator: boolean;
    };

async function authenticate(input: HttpDispatchInput): Promise<Session> {
  const token = bearerToken(input.authorization);
  if (token === null) {
    return { ok: false, result: errorResult(401, "Sign in required.") };
  }
  let verified: VerifiedToken;
  try {
    verified = await input.verifyIdToken(token);
  } catch {
    return { ok: false, result: errorResult(401, "Sign in required.") };
  }
  const profile = await input.repo.getProfile(verified.uid);
  const tokenEmail = (verified.email ?? "").trim();
  const profileEmail = (profile?.email ?? "").trim();
  const email = tokenEmail !== "" ? tokenEmail : profileEmail;
  const isModerator =
    isModeratorEmail(email, input.moderatorEmail) ||
    isModeratorEmail(profileEmail, input.moderatorEmail);
  return {
    ok: true,
    uid: verified.uid,
    email,
    profile,
    isModerator,
  };
}

async function requireProfile(
  input: HttpDispatchInput,
): Promise<
  | { ok: false; result: HttpDispatchResult }
  | { ok: true; actor: Actor }
> {
  const session = await authenticate(input);
  if (!session.ok) {
    return session;
  }
  if (session.profile === null) {
    const count = await input.repo.profileCount();
    if (count >= MAX_PROFILES) {
      return { ok: false, result: await maybeDeleteOrphan(input, session.uid) };
    }
    return { ok: false, result: errorResult(403, "Register first.") };
  }
  return {
    ok: true,
    actor: actorFrom(session.profile, session.isModerator),
  };
}

function createIdFrom(input: HttpDispatchInput): string {
  return input.createId === undefined
    ? crypto.randomUUID()
    : input.createId();
}

function nowIso(input: HttpDispatchInput): string {
  return input.nowIso === undefined
    ? new Date().toISOString()
    : input.nowIso();
}

function parseGrants(value: unknown): Grant[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const grants: Grant[] = [];
  for (const item of value) {
    const rec = asRecord(item);
    if (rec === null) {
      return null;
    }
    if (typeof rec.userId !== "string" || typeof rec.role !== "string") {
      return null;
    }
    grants.push({ userId: rec.userId, role: rec.role as GrantRole });
  }
  return grants;
}

async function dispatchRegister(
  input: HttpDispatchInput,
): Promise<HttpDispatchResult> {
  const session = await authenticate(input);
  if (!session.ok) {
    return session.result;
  }
  const data = asRecord(parseJsonBody(input.body));
  const rawName =
    data !== null && typeof data.displayName === "string"
      ? data.displayName
      : "";
  const displayName = rawName.trim();
  if (displayName === "") {
    return errorResult(400, "Display name is required.");
  }
  if (session.profile !== null) {
    return jsonResult(
      200,
      JSON.stringify(mePayload(session.profile, session.isModerator)),
    );
  }
  const count = await input.repo.profileCount();
  if (count >= MAX_PROFILES) {
    return maybeDeleteOrphan(input, session.uid);
  }
  const profile: UserProfile = {
    id: session.uid,
    email: session.email,
    displayName,
    canUseFromText: session.isModerator,
    createdAt: nowIso(input),
  };
  await input.repo.saveProfile(profile);
  return jsonResult(
    201,
    JSON.stringify(mePayload(profile, session.isModerator)),
  );
}

async function dispatchMe(
  input: HttpDispatchInput,
): Promise<HttpDispatchResult> {
  const session = await authenticate(input);
  if (!session.ok) {
    return session.result;
  }
  if (session.profile === null) {
    const count = await input.repo.profileCount();
    if (count >= MAX_PROFILES) {
      return maybeDeleteOrphan(input, session.uid);
    }
    return errorResult(403, "Register first.");
  }
  return jsonResult(
    200,
    JSON.stringify(mePayload(session.profile, session.isModerator)),
  );
}

async function dispatchApi(
  input: HttpDispatchInput,
): Promise<HttpDispatchResult | null> {
  if (input.pathname === "/api/store") {
    return errorResult(404, "Not found.");
  }
  if (input.pathname === "/api/health" && input.method === "GET") {
    return jsonResult(200, JSON.stringify({ ok: true }));
  }
  if (input.pathname === "/api/config" && input.method === "GET") {
    const apiKey = input.firebaseWebApiKey.trim();
    const authDomain = input.firebaseWebAuthDomain.trim();
    const projectId = input.firebaseWebProjectId.trim();
    if (apiKey === "" || authDomain === "" || projectId === "") {
      return errorResult(503, "Firebase web config is missing.");
    }
    const emulatorHost = (input.firebaseAuthEmulatorHost ?? "").trim();
    if (emulatorHost === "") {
      return jsonResult(
        200,
        JSON.stringify({ apiKey, authDomain, projectId }),
      );
    }
    const authEmulatorHost = emulatorHost.startsWith("http://") ||
      emulatorHost.startsWith("https://")
      ? emulatorHost
      : `http://${emulatorHost}`;
    return jsonResult(
      200,
      JSON.stringify({ apiKey, authDomain, projectId, authEmulatorHost }),
    );
  }
  if (!input.pathname.startsWith("/api/")) {
    return null;
  }

  if (input.pathname === "/api/register" && input.method === "POST") {
    return dispatchRegister(input);
  }
  if (input.pathname === "/api/me" && input.method === "GET") {
    return dispatchMe(input);
  }

  const gated = await requireProfile(input);
  if (!gated.ok) {
    return gated.result;
  }
  const { actor } = gated;
  const { repo } = input;

  if (input.pathname === "/api/users" && input.method === "GET") {
    const users = sortProfiles(await repo.listProfiles()).map(directoryUser);
    return jsonResult(200, JSON.stringify({ users }));
  }

  if (input.pathname === "/api/admin/users" && input.method === "GET") {
    if (!actor.isModerator) {
      return errorResult(403, "Not allowed.");
    }
    const users = sortProfiles(await repo.listProfiles());
    return jsonResult(200, JSON.stringify({ users }));
  }

  const adminUser = /^\/api\/admin\/users\/([^/]+)$/.exec(input.pathname);
  if (adminUser !== null && input.method === "DELETE") {
    const result = await deleteHouseholdUser(
      repo,
      actor,
      adminUser[1] ?? "",
      input.moderatorEmail,
      input.deleteUser,
    );
    if (!result.ok) {
      return errorResult(result.status, result.error);
    }
    return jsonResult(200, JSON.stringify({ ok: true }));
  }
  if (adminUser !== null && input.method === "PATCH") {
    if (!actor.isModerator) {
      return errorResult(403, "Not allowed.");
    }
    const id = adminUser[1] ?? "";
    const existing = await repo.getProfile(id);
    if (existing === null) {
      return errorResult(404, "Not found.");
    }
    const data = asRecord(parseJsonBody(input.body));
    if (data === null || typeof data.canUseFromText !== "boolean") {
      return errorResult(400, "Not allowed.");
    }
    const next = { ...existing, canUseFromText: data.canUseFromText };
    await repo.saveProfile(next);
    return jsonResult(200, JSON.stringify(next));
  }

  if (input.pathname === "/api/budgets" && input.method === "GET") {
    const budgets = await listBudgetSummaries(repo, actor);
    return jsonResult(200, JSON.stringify({ budgets }));
  }

  if (input.pathname === "/api/budgets" && input.method === "POST") {
    const data = asRecord(parseJsonBody(input.body));
    if (data === null || typeof data.name !== "string") {
      return errorResult(400, "Name is required.");
    }
    const result = await createBudgetForActor(
      repo,
      actor,
      {
        name: data.name,
        description:
          typeof data.description === "string" ? data.description : undefined,
        startDate: asDateParts(data.startDate),
        endDate: asDateParts(data.endDate),
        targetLeftoverCents:
          data.targetLeftoverCents === null ||
          typeof data.targetLeftoverCents === "number"
            ? data.targetLeftoverCents
            : undefined,
      },
      () => createIdFrom(input),
    );
    if (!result.ok) {
      return errorResult(400, result.error);
    }
    return jsonResult(201, JSON.stringify(result.budget));
  }

  const budgetCopy = /^\/api\/budgets\/([^/]+)\/copy$/.exec(input.pathname);
  if (budgetCopy !== null && input.method === "POST") {
    const result = await copyBudgetForActor(repo, actor, budgetCopy[1] ?? "");
    if (!result.ok) {
      const status = result.error === "Not allowed." ? 403 : 404;
      return errorResult(status, result.error);
    }
    return jsonResult(201, JSON.stringify(result.budget));
  }

  const budgetVis = /^\/api\/budgets\/([^/]+)\/visibility$/.exec(
    input.pathname,
  );
  if (budgetVis !== null && input.method === "PATCH") {
    const id = budgetVis[1] ?? "";
    const existing = await repo.getBudgetDoc(id);
    const access = decideBudgetAccess(actor, existing, "share");
    if (!access.ok) {
      return errorResult(access.status, access.error);
    }
    const data = asRecord(parseJsonBody(input.body));
    const visibility = data === null ? undefined : data.visibility;
    if (!isValidVisibility(visibility)) {
      return errorResult(400, "Invalid visibility.");
    }
    const result = await setVisibilityForActor(repo, actor, id, visibility);
    if (!result.ok) {
      return errorResult(result.status, result.error);
    }
    return jsonResult(
      200,
      JSON.stringify({ visibility: result.budget.visibility }),
    );
  }

  const budgetGrants = /^\/api\/budgets\/([^/]+)\/grants$/.exec(input.pathname);
  if (budgetGrants !== null && input.method === "PUT") {
    const id = budgetGrants[1] ?? "";
    const existing = await repo.getBudgetDoc(id);
    const share = decideBudgetAccess(actor, existing, "share");
    if (!share.ok) {
      return errorResult(share.status, share.error);
    }
    const data = asRecord(parseJsonBody(input.body));
    const grants = data === null ? null : parseGrants(data.grants);
    if (grants === null) {
      return errorResult(400, "Invalid grant.");
    }
    const result = await setGrantsForActor(repo, actor, id, grants);
    if (!result.ok) {
      return errorResult(result.status, result.error);
    }
    return jsonResult(200, JSON.stringify({ grants: result.budget.grants }));
  }

  const budgetOne = /^\/api\/budgets\/([^/]+)$/.exec(input.pathname);
  if (budgetOne !== null && input.method === "GET") {
    const result = await getBudget(repo, actor, budgetOne[1] ?? "");
    if (!result.ok) {
      return errorResult(404, result.error);
    }
    return jsonResult(200, JSON.stringify(result.value));
  }

  if (budgetOne !== null && input.method === "PUT") {
    const existing = await getBudget(repo, actor, budgetOne[1] ?? "");
    if (!existing.ok) {
      return errorResult(404, "Not found.");
    }
    const data = asRecord(parseJsonBody(input.body));
    if (data === null) {
      return errorResult(400, "Not found.");
    }
    const next: Budget = {
      ...existing.value,
      name: typeof data.name === "string" ? data.name : existing.value.name,
      description:
        typeof data.description === "string"
          ? data.description
          : existing.value.description,
      incomeCategories: Array.isArray(data.incomeCategories)
        ? (data.incomeCategories as Category[])
        : existing.value.incomeCategories,
      expenseCategories: Array.isArray(data.expenseCategories)
        ? (data.expenseCategories as Category[])
        : existing.value.expenseCategories,
      incomeEntries: Array.isArray(data.incomeEntries)
        ? (data.incomeEntries as Entry[])
        : existing.value.incomeEntries,
      expenseEntries: Array.isArray(data.expenseEntries)
        ? (data.expenseEntries as Entry[])
        : existing.value.expenseEntries,
    };
    const result = await saveWritableBudget(
      repo,
      actor,
      existing.value.id,
      next,
    );
    if (!result.ok) {
      return errorResult(result.status, result.error);
    }
    return jsonResult(200, JSON.stringify(result.budget));
  }

  if (budgetOne !== null && input.method === "DELETE") {
    const result = await deleteBudgetForActor(repo, actor, budgetOne[1] ?? "");
    if (!result.ok) {
      const status = result.error === "Not allowed." ? 403 : 404;
      return errorResult(status, result.error);
    }
    return jsonResult(200, JSON.stringify({ ok: true }));
  }

  if (input.pathname === "/api/suggest-entries") {
    if (input.method !== "POST") {
      return errorResult(404, "Not found.");
    }
    if (!canUseFromText(actor)) {
      return errorResult(403, "From text is not allowed.");
    }
    const data = asRecord(parseJsonBody(input.body));
    const budgetId =
      data !== null && typeof data.budgetId === "string" ? data.budgetId : "";
    const budget = budgetId === "" ? null : await repo.getBudgetDoc(budgetId);
    const write = decideBudgetAccess(actor, budget, "write");
    if (!write.ok) {
      return errorResult(write.status, write.error);
    }
    const result = await handleSuggestEntries(
      input.body,
      input.geminiApiKey,
      input.geminiCaller ?? createSdkCaller(),
    );
    return jsonResult(result.status, JSON.stringify(result.body));
  }

  if (input.pathname === "/api/agent/run") {
    if (input.method !== "POST") {
      return errorResult(404, "Not found.");
    }
    const data = asRecord(parseJsonBody(input.body));
    const secrets = [input.geminiApiKey].filter((item) => item !== "");
    const run = await executeAgentRun({
      actor,
      repo,
      memory: input.agentMemory ?? defaultAgentMemory,
      rawSteps: data === null ? undefined : data.steps,
      nowMs: input.nowMs ?? Date.now,
      maxMs: input.maxAgentMs ?? AGENT_MAX_MS,
      secrets,
    });
    if ("error" in run) {
      return errorResult(run.status, run.error);
    }
    return jsonResult(
      200,
      redactSecrets(JSON.stringify({ steps: run.steps }), secrets),
    );
  }

  return errorResult(404, "Not found.");
}

export async function dispatchHttpRequest(
  input: HttpDispatchInput,
): Promise<HttpDispatchResult> {
  if (Buffer.byteLength(input.body, "utf8") > MAX_REQUEST_BYTES) {
    return errorResult(413, "Request too large.");
  }
  const api = await dispatchApi(input);
  if (api !== null) {
    return api;
  }
  if (input.method !== "GET" && input.method !== "HEAD") {
    return errorResult(404, "Not found.");
  }
  if (!existsSync(input.distDir)) {
    return errorResult(503, "UI build is missing. Run npm run build.");
  }
  const filePath = safeDistFile(input.distDir, input.pathname);
  if (filePath === null || !existsSync(filePath)) {
    return errorResult(404, "Not found.");
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
