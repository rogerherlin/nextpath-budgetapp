import { decideBudgetAccess } from "./acl";
import { AgentMemoryStore } from "./agentMemory";
import {
  AGENT_MAX_MS,
  AGENT_MAX_STEPS,
  redactSecrets,
} from "./serverAccess";
import { getBudget, saveWritableBudget, type AppRepo } from "./repo";
import type { Actor, Budget, Category, DateParts, Entry } from "./types";

export type AgentStepResult =
  | { tool: string; ok: true; value?: unknown }
  | { tool: string; ok: false; status: number; error: string };

export type AgentRunResult =
  | { status: 200; steps: AgentStepResult[] }
  | { status: 400; error: string };

const TOOLS = new Set(["get_budget", "save_budget", "remember", "recall"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asDateParts(value: unknown): DateParts | null | undefined {
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

function parseEntries(value: unknown): Entry[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const entries: Entry[] = [];
  for (const item of value) {
    const rec = asRecord(item);
    if (
      rec === null ||
      typeof rec.id !== "string" ||
      typeof rec.categoryId !== "string" ||
      typeof rec.comment !== "string" ||
      typeof rec.amountCents !== "number"
    ) {
      return null;
    }
    const date = rec.date === undefined ? null : asDateParts(rec.date);
    if (date === undefined) {
      return null;
    }
    entries.push({
      id: rec.id,
      categoryId: rec.categoryId,
      comment: rec.comment,
      amountCents: rec.amountCents,
      date,
    });
  }
  return entries;
}

function parseCategories(value: unknown): Category[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const list: Category[] = [];
  for (const item of value) {
    const rec = asRecord(item);
    if (rec === null || typeof rec.id !== "string" || typeof rec.name !== "string") {
      return null;
    }
    list.push({ id: rec.id, name: rec.name });
  }
  return list;
}

function deny(
  tool: string,
  status: number,
  error: string,
): AgentStepResult {
  return { tool, ok: false, status, error };
}

async function runGetBudget(
  actor: Actor,
  repo: AppRepo,
  args: Record<string, unknown>,
): Promise<AgentStepResult> {
  if (typeof args.budgetId !== "string") {
    return deny("get_budget", 400, "Invalid tool arguments.");
  }
  const result = await getBudget(repo, actor, args.budgetId);
  if (!result.ok) {
    return deny("get_budget", 404, result.error);
  }
  return { tool: "get_budget", ok: true, value: result.value };
}

async function runSaveBudget(
  actor: Actor,
  repo: AppRepo,
  args: Record<string, unknown>,
): Promise<AgentStepResult> {
  if (typeof args.budgetId !== "string") {
    return deny("save_budget", 400, "Invalid tool arguments.");
  }
  const existing = await repo.getBudgetDoc(args.budgetId);
  const access = decideBudgetAccess(actor, existing, "write");
  if (!access.ok) {
    return deny("save_budget", access.status, access.error);
  }
  if (existing === null) {
    return deny("save_budget", 404, "Not found.");
  }
  let next: Budget = existing;
  if (args.name !== undefined) {
    if (typeof args.name !== "string") {
      return deny("save_budget", 400, "Invalid tool arguments.");
    }
    next = { ...next, name: args.name };
  }
  if (args.description !== undefined) {
    if (typeof args.description !== "string") {
      return deny("save_budget", 400, "Invalid tool arguments.");
    }
    next = { ...next, description: args.description };
  }
  if (args.expenseEntries !== undefined) {
    const entries = parseEntries(args.expenseEntries);
    if (entries === null) {
      return deny("save_budget", 400, "Invalid tool arguments.");
    }
    next = { ...next, expenseEntries: entries };
  }
  if (args.incomeEntries !== undefined) {
    const entries = parseEntries(args.incomeEntries);
    if (entries === null) {
      return deny("save_budget", 400, "Invalid tool arguments.");
    }
    next = { ...next, incomeEntries: entries };
  }
  if (args.incomeCategories !== undefined) {
    const cats = parseCategories(args.incomeCategories);
    if (cats === null) {
      return deny("save_budget", 400, "Invalid tool arguments.");
    }
    next = { ...next, incomeCategories: cats };
  }
  if (args.expenseCategories !== undefined) {
    const cats = parseCategories(args.expenseCategories);
    if (cats === null) {
      return deny("save_budget", 400, "Invalid tool arguments.");
    }
    next = { ...next, expenseCategories: cats };
  }
  const saved = await saveWritableBudget(repo, actor, existing.id, next);
  if (!saved.ok) {
    return deny("save_budget", saved.status, saved.error);
  }
  return { tool: "save_budget", ok: true, value: saved.budget };
}

function runRemember(
  actor: Actor,
  memory: AgentMemoryStore,
  args: Record<string, unknown>,
): AgentStepResult {
  if (typeof args.key !== "string" || typeof args.value !== "string") {
    return deny("remember", 400, "Invalid tool arguments.");
  }
  if (args.key.length === 0 || args.key.length > 64 || args.value.length > 1024) {
    return deny("remember", 400, "Invalid tool arguments.");
  }
  memory.remember(actor.profile.id, args.key, args.value);
  return { tool: "remember", ok: true };
}

function runRecall(
  actor: Actor,
  memory: AgentMemoryStore,
  args: Record<string, unknown>,
): AgentStepResult {
  if (typeof args.key !== "string") {
    return deny("recall", 400, "Invalid tool arguments.");
  }
  const value = memory.recall(actor.profile.id, args.key);
  if (value === null) {
    return deny("recall", 404, "Not found.");
  }
  return { tool: "recall", ok: true, value: { value } };
}

async function executeTool(
  actor: Actor,
  repo: AppRepo,
  memory: AgentMemoryStore,
  tool: string,
  args: Record<string, unknown>,
): Promise<AgentStepResult> {
  if (tool === "get_budget") {
    return runGetBudget(actor, repo, args);
  }
  if (tool === "save_budget") {
    return runSaveBudget(actor, repo, args);
  }
  if (tool === "remember") {
    return runRemember(actor, memory, args);
  }
  return runRecall(actor, memory, args);
}

export async function executeAgentRun(input: {
  actor: Actor;
  repo: AppRepo;
  memory: AgentMemoryStore;
  rawSteps: unknown;
  nowMs: () => number;
  maxMs?: number;
  maxSteps?: number;
  secrets?: readonly string[];
}): Promise<AgentRunResult> {
  const maxSteps = input.maxSteps ?? AGENT_MAX_STEPS;
  const maxMs = input.maxMs ?? AGENT_MAX_MS;
  if (!Array.isArray(input.rawSteps)) {
    return { status: 400, error: "Invalid tool arguments." };
  }
  if (input.rawSteps.length > maxSteps) {
    return { status: 400, error: "Too many steps." };
  }
  const startedAt = input.nowMs();
  const steps: AgentStepResult[] = [];
  for (let i = 0; i < input.rawSteps.length; i += 1) {
    const raw = asRecord(input.rawSteps[i]);
    const tool =
      raw !== null && typeof raw.tool === "string" ? raw.tool : "";
    if (i > 0 && input.nowMs() - startedAt > maxMs) {
      steps.push(deny(tool === "" ? "unknown" : tool, 400, "Time limit exceeded."));
      continue;
    }
    if (raw === null || !TOOLS.has(tool)) {
      steps.push(deny(tool === "" ? "unknown" : tool, 400, "Invalid tool."));
      continue;
    }
    const args = asRecord(raw.arguments) ?? {};
    steps.push(await executeTool(input.actor, input.repo, input.memory, tool, args));
  }
  const secrets = input.secrets ?? [];
  const encoded = redactSecrets(JSON.stringify(steps), secrets);
  return { status: 200, steps: JSON.parse(encoded) as AgentStepResult[] };
}
