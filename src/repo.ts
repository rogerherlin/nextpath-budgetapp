import {
  canDelete,
  canListSummary,
  canManageSharing,
  canRead,
  canWrite,
  isModeratorEmail,
  viewerRelation,
} from "./acl";
import {
  copyBudget,
  createBudget,
  deleteBudget,
  listBudgets,
  resetStore,
  type CreateBudgetInput,
} from "./budgets";
import { setPersist } from "./persist";
import type {
  Actor,
  Budget,
  BudgetSummary,
  Grant,
  GrantRole,
  UserProfile,
  Visibility,
} from "./types";

export const MAX_PROFILES = 10;

export type RepoGetResult =
  | { ok: true; value: Budget }
  | { ok: false; error: "Not found." };

export interface AppRepo {
  profileCount(): Promise<number>;
  getProfile(id: string): Promise<UserProfile | null>;
  saveProfile(profile: UserProfile): Promise<void>;
  listProfiles(): Promise<UserProfile[]>;
  removeProfile(id: string): Promise<void>;
  budgetCount(): Promise<number>;
  getBudgetDoc(id: string): Promise<Budget | null>;
  saveBudget(budget: Budget): Promise<void>;
  removeBudget(id: string): Promise<void>;
  listBudgetDocs(): Promise<Budget[]>;
}

function cloneBudget(budget: Budget): Budget {
  return structuredClone(budget);
}

function cloneProfile(profile: UserProfile): UserProfile {
  return { ...profile };
}

export class MemoryRepo implements AppRepo {
  private readonly profiles = new Map<string, UserProfile>();
  private readonly budgets = new Map<string, Budget>();
  saveBudgetCalls = 0;

  async profileCount(): Promise<number> {
    return this.profiles.size;
  }

  async getProfile(id: string): Promise<UserProfile | null> {
    const found = this.profiles.get(id);
    return found === undefined ? null : cloneProfile(found);
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    this.profiles.set(profile.id, cloneProfile(profile));
  }

  async listProfiles(): Promise<UserProfile[]> {
    return [...this.profiles.values()].map(cloneProfile);
  }

  async removeProfile(id: string): Promise<void> {
    this.profiles.delete(id);
  }

  async budgetCount(): Promise<number> {
    return this.budgets.size;
  }

  async getBudgetDoc(id: string): Promise<Budget | null> {
    const found = this.budgets.get(id);
    return found === undefined ? null : cloneBudget(found);
  }

  async saveBudget(budget: Budget): Promise<void> {
    this.saveBudgetCalls += 1;
    this.budgets.set(budget.id, cloneBudget(budget));
  }

  async removeBudget(id: string): Promise<void> {
    this.budgets.delete(id);
  }

  async listBudgetDocs(): Promise<Budget[]> {
    return [...this.budgets.values()].map(cloneBudget);
  }
}

export function sortProfiles<T extends { displayName: string; id: string }>(
  profiles: T[],
): T[] {
  return [...profiles].sort((a, b) => {
    const nameCmp = a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: "base",
    });
    if (nameCmp !== 0) {
      return nameCmp;
    }
    return a.id.localeCompare(b.id);
  });
}

function ownerDisplayName(
  ownerId: string,
  profiles: Map<string, string>,
): string {
  return profiles.get(ownerId) ?? "";
}

export async function listBudgetSummaries(
  repo: AppRepo,
  actor: Actor,
): Promise<BudgetSummary[]> {
  const [budgets, profiles] = await Promise.all([
    repo.listBudgetDocs(),
    repo.listProfiles(),
  ]);
  const names = new Map(
    profiles.map((profile) => [profile.id, profile.displayName]),
  );
  const visible = budgets.filter((budget) => canListSummary(actor, budget));
  visible.sort((a, b) => {
    const nameCmp = a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
    });
    if (nameCmp !== 0) {
      return nameCmp;
    }
    return a.id.localeCompare(b.id);
  });
  return visible.map((budget) => ({
    id: budget.id,
    name: budget.name,
    ownerId: budget.ownerId,
    ownerDisplayName: ownerDisplayName(budget.ownerId, names),
    visibility: budget.visibility,
    startDate: budget.startDate,
    endDate: budget.endDate,
    viewerRelation: viewerRelation(actor, budget),
  }));
}

export async function getBudget(
  repo: AppRepo,
  actor: Actor,
  id: string,
): Promise<RepoGetResult> {
  const budget = await repo.getBudgetDoc(id);
  if (budget === null || !canRead(actor, budget)) {
    return { ok: false, error: "Not found." };
  }
  return { ok: true, value: budget };
}

export type NamedIdFactory = () => string;

export async function createBudgetForActor(
  repo: AppRepo,
  actor: Actor,
  input: CreateBudgetInput,
  createId: NamedIdFactory,
): Promise<{ ok: true; budget: Budget } | { ok: false; error: string }> {
  const existing = await repo.listBudgetDocs();
  resetStore(existing);
  setPersist(() => {});
  const before = new Set(existing.map((budget) => budget.id));
  const created = createBudget(actor, input);
  if (!created.ok) {
    return created;
  }
  const fresh = listBudgets().find((budget) => !before.has(budget.id));
  if (fresh === undefined) {
    return { ok: false, error: "Name is required." };
  }
  const budget = { ...fresh, id: createId() };
  await repo.saveBudget(budget);
  return { ok: true, budget };
}

export async function deleteBudgetForActor(
  repo: AppRepo,
  actor: Actor,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await repo.getBudgetDoc(id);
  if (existing === null || !canRead(actor, existing)) {
    return { ok: false, error: "Not found." };
  }
  if (!canDelete(actor, existing)) {
    return { ok: false, error: "Not allowed." };
  }
  const all = await repo.listBudgetDocs();
  resetStore(all);
  setPersist(() => {});
  const result = deleteBudget(actor, id);
  if (!result.ok) {
    return result;
  }
  await repo.removeBudget(id);
  return { ok: true };
}

export async function copyBudgetForActor(
  repo: AppRepo,
  actor: Actor,
  id: string,
): Promise<{ ok: true; budget: Budget } | { ok: false; error: string }> {
  const source = await repo.getBudgetDoc(id);
  if (source === null || !canRead(actor, source)) {
    return { ok: false, error: "Not found." };
  }
  const all = await repo.listBudgetDocs();
  resetStore(all);
  setPersist(() => {});
  const before = new Set(all.map((budget) => budget.id));
  const result = copyBudget(actor, id);
  if (!result.ok) {
    return result;
  }
  const copy = listBudgets().find((budget) => !before.has(budget.id));
  if (copy === undefined) {
    return { ok: false, error: "Not found." };
  }
  await repo.saveBudget(copy);
  return { ok: true, budget: copy };
}

const GRANT_ROLES: readonly GrantRole[] = ["see", "browse", "edit"];

export function isValidVisibility(value: unknown): value is Visibility {
  return value === "public" || value === "hidden";
}

export async function setVisibilityForActor(
  repo: AppRepo,
  actor: Actor,
  id: string,
  visibility: Visibility,
): Promise<{ ok: true; budget: Budget } | { ok: false; error: string; status: number }> {
  const budget = await repo.getBudgetDoc(id);
  if (budget === null) {
    return { ok: false, error: "Not found.", status: 404 };
  }
  if (canManageSharing(actor, budget)) {
    const next = { ...budget, visibility };
    await repo.saveBudget(next);
    return { ok: true, budget: next };
  }
  if (canRead(actor, budget)) {
    return { ok: false, error: "Not allowed.", status: 403 };
  }
  return { ok: false, error: "Not found.", status: 404 };
}

export async function setGrantsForActor(
  repo: AppRepo,
  actor: Actor,
  id: string,
  grants: Grant[],
): Promise<{ ok: true; budget: Budget } | { ok: false; error: string; status: number }> {
  const budget = await repo.getBudgetDoc(id);
  if (budget === null) {
    return { ok: false, error: "Not found.", status: 404 };
  }
  if (!canManageSharing(actor, budget)) {
    if (canRead(actor, budget)) {
      return { ok: false, error: "Not allowed.", status: 403 };
    }
    return { ok: false, error: "Not found.", status: 404 };
  }
  const profiles = await repo.listProfiles();
  const ids = new Set(profiles.map((profile) => profile.id));
  const seen = new Set<string>();
  for (const grant of grants) {
    if (!GRANT_ROLES.includes(grant.role)) {
      return { ok: false, error: "Invalid grant.", status: 400 };
    }
    if (grant.userId.trim() === "" || !ids.has(grant.userId)) {
      return { ok: false, error: "Invalid grant.", status: 400 };
    }
    if (grant.userId === budget.ownerId) {
      return { ok: false, error: "Invalid grant.", status: 400 };
    }
    if (seen.has(grant.userId)) {
      return { ok: false, error: "Invalid grant.", status: 400 };
    }
    seen.add(grant.userId);
  }
  const next = { ...budget, grants: grants.map((grant) => ({ ...grant })) };
  await repo.saveBudget(next);
  return { ok: true, budget: next };
}

export async function saveWritableBudget(
  repo: AppRepo,
  actor: Actor,
  id: string,
  budget: Budget,
): Promise<{ ok: true; budget: Budget } | { ok: false; error: string; status: number }> {
  const existing = await repo.getBudgetDoc(id);
  if (existing === null || !canRead(actor, existing)) {
    return { ok: false, error: "Not found.", status: 404 };
  }
  if (!canWrite(actor, existing)) {
    return { ok: false, error: "Not allowed.", status: 403 };
  }
  const next: Budget = {
    ...budget,
    id: existing.id,
    ownerId: existing.ownerId,
    visibility: existing.visibility,
    grants: existing.grants,
  };
  await repo.saveBudget(next);
  return { ok: true, budget: next };
}

export async function deleteHouseholdUser(
  repo: AppRepo,
  actor: Actor,
  id: string,
  moderatorEmail: string,
  deleteAuthUser: (uid: string) => Promise<void>,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!actor.isModerator) {
    return { ok: false, error: "Not allowed.", status: 403 };
  }
  const existing = await repo.getProfile(id);
  if (existing === null) {
    return { ok: false, error: "Not found.", status: 404 };
  }
  if (
    id === actor.profile.id ||
    isModeratorEmail(existing.email, moderatorEmail)
  ) {
    return { ok: false, error: "Not allowed.", status: 403 };
  }
  const budgets = await repo.listBudgetDocs();
  for (const budget of budgets) {
    if (budget.ownerId === id) {
      await repo.removeBudget(budget.id);
      continue;
    }
    const grants = budget.grants.filter((grant) => grant.userId !== id);
    if (grants.length !== budget.grants.length) {
      await repo.saveBudget({ ...budget, grants });
    }
  }
  await repo.removeProfile(id);
  await deleteAuthUser(id);
  return { ok: true };
}

export function directoryUser(profile: UserProfile): {
  id: string;
  email: string;
  displayName: string;
} {
  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName,
  };
}

export function mePayload(
  profile: UserProfile,
  isModerator: boolean,
): UserProfile & { isModerator: boolean; canUseFromText: boolean } {
  return {
    ...profile,
    isModerator,
    canUseFromText: isModerator || profile.canUseFromText,
  };
}
