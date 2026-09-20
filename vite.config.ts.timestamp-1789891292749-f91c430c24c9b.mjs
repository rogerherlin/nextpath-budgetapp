var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/acl.ts
function isModeratorEmail(email, moderatorEmail) {
  const configured = (moderatorEmail ?? "").trim();
  if (configured === "") {
    return false;
  }
  return email.trim().toLowerCase() === configured.toLowerCase();
}
function grantRoleFor(actor, budget) {
  const match = budget.grants.find((grant) => grant.userId === actor.profile.id);
  if (!match) {
    return void 0;
  }
  if (GRANT_ROLES.includes(match.role)) {
    return match.role;
  }
  return void 0;
}
function isOwner(actor, budget) {
  return budget.ownerId === actor.profile.id;
}
function canListSummary(actor, budget) {
  if (actor.isModerator || isOwner(actor, budget)) {
    return true;
  }
  const role = grantRoleFor(actor, budget);
  if (role === "see" || role === "browse" || role === "edit") {
    return true;
  }
  return budget.visibility === "public";
}
function canRead(actor, budget) {
  if (actor.isModerator || isOwner(actor, budget)) {
    return true;
  }
  const role = grantRoleFor(actor, budget);
  return role === "browse" || role === "edit";
}
function canWrite(actor, budget) {
  if (actor.isModerator || isOwner(actor, budget)) {
    return true;
  }
  return grantRoleFor(actor, budget) === "edit";
}
function canManageSharing(actor, budget) {
  return actor.isModerator || isOwner(actor, budget);
}
function canDelete(actor, budget) {
  return canManageSharing(actor, budget);
}
function canUseFromText(actor) {
  return actor.isModerator || actor.profile.canUseFromText === true;
}
function viewerRelation(actor, budget) {
  if (isOwner(actor, budget)) {
    return "owner";
  }
  if (actor.isModerator) {
    return "moderator";
  }
  const role = grantRoleFor(actor, budget);
  if (role !== void 0) {
    return role;
  }
  return "public";
}
function actorFromVerifiedSession(profile, isModerator) {
  return { profile, isModerator };
}
function decideBudgetAccess(actor, budget, action) {
  if (budget === null) {
    return { ok: false, status: 404, error: "Not found." };
  }
  if (action === "read") {
    if (canRead(actor, budget)) {
      return { ok: true };
    }
    return { ok: false, status: 404, error: "Not found." };
  }
  if (!canRead(actor, budget)) {
    return { ok: false, status: 404, error: "Not found." };
  }
  const allowed = action === "write" ? canWrite(actor, budget) : action === "delete" ? canDelete(actor, budget) : canManageSharing(actor, budget);
  if (!allowed) {
    return { ok: false, status: 403, error: "Not allowed." };
  }
  return { ok: true };
}
var GRANT_ROLES;
var init_acl = __esm({
  "src/acl.ts"() {
    "use strict";
    GRANT_ROLES = ["see", "browse", "edit"];
  }
});

// src/names.ts
function normalizeName(name) {
  return name.trim();
}
function namesForOwner(budgets2, ownerId) {
  return budgets2.filter((budget) => budget.ownerId === ownerId).map((budget) => budget.name);
}
function isNameTaken(name, existingNames) {
  const needle = name.toLowerCase();
  return existingNames.some((existing) => existing.toLowerCase() === needle);
}
function nextCopyName(sourceName, existingNames) {
  let n = 1;
  let candidate = `${sourceName} (copy${n})`;
  while (isNameTaken(candidate, existingNames)) {
    n += 1;
    candidate = `${sourceName} (copy${n})`;
  }
  return candidate;
}
var init_names = __esm({
  "src/names.ts"() {
    "use strict";
  }
});

// src/persist.ts
function setPersist(fn) {
  persistFn = fn;
}
function persist() {
  persistFn();
  notify();
}
function notify() {
  revision += 1;
  for (const listener of listeners) {
    listener();
  }
}
var persistFn, revision, listeners;
var init_persist = __esm({
  "src/persist.ts"() {
    "use strict";
    persistFn = () => {
    };
    revision = 0;
    listeners = /* @__PURE__ */ new Set();
  }
});

// src/budgets.ts
function resetStore(initial = []) {
  budgets = initial;
  notify();
}
function deleteBudget(actorOrId, maybeId) {
  const actor = maybeId === void 0 ? FALLBACK_ACTOR : actorOrId;
  const id = maybeId === void 0 ? actorOrId : maybeId;
  const existing = budgets.find((budget) => budget.id === id);
  if (!existing || !canRead(actor, existing)) {
    return { ok: false, error: "Not found." };
  }
  if (!canDelete(actor, existing)) {
    return { ok: false, error: "Not allowed." };
  }
  budgets = budgets.filter((budget) => budget.id !== id);
  persist();
  return { ok: true };
}
function copyBudget(actorOrId, maybeId) {
  const actor = maybeId === void 0 ? FALLBACK_ACTOR : actorOrId;
  const id = maybeId === void 0 ? actorOrId : maybeId;
  const source = budgets.find((budget) => budget.id === id);
  if (!source || !canRead(actor, source)) {
    return { ok: false, error: "Not found." };
  }
  let seq = 0;
  const nextId = (prefix) => {
    seq += 1;
    return `${prefix}-${seq}`;
  };
  const categoryIdByOld = /* @__PURE__ */ new Map();
  const cloneCategories = (categories) => categories.map((category) => {
    const newId = nextId("c");
    categoryIdByOld.set(category.id, newId);
    return { id: newId, name: category.name };
  });
  const incomeCategories = cloneCategories(source.incomeCategories);
  const expenseCategories = cloneCategories(source.expenseCategories);
  const remapEntry = (entry) => ({
    id: nextId("e"),
    categoryId: categoryIdByOld.get(entry.categoryId) ?? entry.categoryId,
    comment: entry.comment,
    amountCents: entry.amountCents,
    date: entry.date
  });
  const copierId = actor.profile.id;
  budgets = [
    ...budgets,
    {
      id: nextId("b"),
      name: nextCopyName(source.name, namesForOwner(budgets, copierId)),
      ownerId: copierId,
      visibility: "hidden",
      grants: [],
      description: source.description,
      startDate: source.startDate,
      endDate: source.endDate,
      targetLeftoverCents: source.targetLeftoverCents,
      incomeCategories,
      expenseCategories,
      incomeEntries: source.incomeEntries.map(remapEntry),
      expenseEntries: source.expenseEntries.map(remapEntry)
    }
  ];
  persist();
  return { ok: true };
}
function createBudget(actorOrInput, maybeInput) {
  const actor = maybeInput === void 0 ? FALLBACK_ACTOR : actorOrInput;
  const input = maybeInput === void 0 ? actorOrInput : maybeInput;
  const name = normalizeName(input.name);
  if (name === "") {
    return { ok: false, error: "Name is required." };
  }
  const ownerId = actor.profile.id;
  if (isNameTaken(name, namesForOwner(budgets, ownerId))) {
    return { ok: false, error: "The name is already in use." };
  }
  budgets = [
    ...budgets,
    {
      id: `${Date.now()}-${budgets.length}`,
      name,
      ownerId,
      visibility: "hidden",
      grants: [],
      description: input.description ?? "",
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      targetLeftoverCents: input.targetLeftoverCents ?? null,
      incomeCategories: [],
      expenseCategories: [],
      incomeEntries: [],
      expenseEntries: []
    }
  ];
  persist();
  return { ok: true };
}
function listBudgets() {
  return [...budgets];
}
var FALLBACK_ACTOR, budgets;
var init_budgets = __esm({
  "src/budgets.ts"() {
    "use strict";
    init_acl();
    init_names();
    init_persist();
    FALLBACK_ACTOR = {
      profile: {
        id: "local",
        email: "local@localhost",
        displayName: "Local",
        canUseFromText: true,
        createdAt: "1970-01-01T00:00:00.000Z"
      },
      isModerator: true
    };
    budgets = [];
  }
});

// src/repo.ts
function cloneBudget(budget) {
  return structuredClone(budget);
}
function cloneProfile(profile) {
  return { ...profile };
}
function sortProfiles(profiles) {
  return [...profiles].sort((a, b) => {
    const nameCmp = a.displayName.localeCompare(b.displayName, void 0, {
      sensitivity: "base"
    });
    if (nameCmp !== 0) {
      return nameCmp;
    }
    return a.id.localeCompare(b.id);
  });
}
function ownerDisplayName(ownerId, profiles) {
  return profiles.get(ownerId) ?? "";
}
async function listBudgetSummaries(repo, actor) {
  const [budgets2, profiles] = await Promise.all([
    repo.listBudgetDocs(),
    repo.listProfiles()
  ]);
  const names = new Map(
    profiles.map((profile) => [profile.id, profile.displayName])
  );
  const visible = budgets2.filter((budget) => canListSummary(actor, budget));
  visible.sort((a, b) => {
    const nameCmp = a.name.localeCompare(b.name, void 0, {
      sensitivity: "base"
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
    viewerRelation: viewerRelation(actor, budget)
  }));
}
async function getBudget(repo, actor, id) {
  const budget = await repo.getBudgetDoc(id);
  const access = decideBudgetAccess(actor, budget, "read");
  if (!access.ok || budget === null) {
    return { ok: false, error: "Not found." };
  }
  return { ok: true, value: budget };
}
async function createBudgetForActor(repo, actor, input, createId) {
  const existing = await repo.listBudgetDocs();
  resetStore(existing);
  setPersist(() => {
  });
  const before = new Set(existing.map((budget2) => budget2.id));
  const created = createBudget(actor, input);
  if (!created.ok) {
    return created;
  }
  const fresh = listBudgets().find((budget2) => !before.has(budget2.id));
  if (fresh === void 0) {
    return { ok: false, error: "Name is required." };
  }
  const budget = { ...fresh, id: createId() };
  await repo.saveBudget(budget);
  return { ok: true, budget };
}
async function deleteBudgetForActor(repo, actor, id) {
  const existing = await repo.getBudgetDoc(id);
  const access = decideBudgetAccess(actor, existing, "delete");
  if (!access.ok) {
    return { ok: false, error: access.error };
  }
  const all = await repo.listBudgetDocs();
  resetStore(all);
  setPersist(() => {
  });
  const result = deleteBudget(actor, id);
  if (!result.ok) {
    return result;
  }
  await repo.removeBudget(id);
  return { ok: true };
}
async function copyBudgetForActor(repo, actor, id) {
  const source = await repo.getBudgetDoc(id);
  const readable = decideBudgetAccess(actor, source, "read");
  if (!readable.ok) {
    return { ok: false, error: readable.error };
  }
  const all = await repo.listBudgetDocs();
  resetStore(all);
  setPersist(() => {
  });
  const before = new Set(all.map((budget) => budget.id));
  const result = copyBudget(actor, id);
  if (!result.ok) {
    return result;
  }
  const copy = listBudgets().find((budget) => !before.has(budget.id));
  if (copy === void 0) {
    return { ok: false, error: "Not found." };
  }
  await repo.saveBudget(copy);
  return { ok: true, budget: copy };
}
function isValidVisibility(value) {
  return value === "public" || value === "hidden";
}
async function setVisibilityForActor(repo, actor, id, visibility) {
  const budget = await repo.getBudgetDoc(id);
  const access = decideBudgetAccess(actor, budget, "share");
  if (!access.ok || budget === null) {
    return {
      ok: false,
      error: access.ok ? "Not found." : access.error,
      status: access.ok ? 404 : access.status
    };
  }
  const next = { ...budget, visibility };
  await repo.saveBudget(next);
  return { ok: true, budget: next };
}
async function setGrantsForActor(repo, actor, id, grants) {
  const budget = await repo.getBudgetDoc(id);
  const access = decideBudgetAccess(actor, budget, "share");
  if (!access.ok || budget === null) {
    return {
      ok: false,
      error: access.ok ? "Not found." : access.error,
      status: access.ok ? 404 : access.status
    };
  }
  const profiles = await repo.listProfiles();
  const ids = new Set(profiles.map((profile) => profile.id));
  const seen = /* @__PURE__ */ new Set();
  for (const grant of grants) {
    if (!GRANT_ROLES2.includes(grant.role)) {
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
async function saveWritableBudget(repo, actor, id, budget) {
  const existing = await repo.getBudgetDoc(id);
  const access = decideBudgetAccess(actor, existing, "write");
  if (!access.ok || existing === null) {
    return {
      ok: false,
      error: access.ok ? "Not found." : access.error,
      status: access.ok ? 404 : access.status
    };
  }
  const next = {
    ...budget,
    id: existing.id,
    ownerId: existing.ownerId,
    visibility: existing.visibility,
    grants: existing.grants
  };
  await repo.saveBudget(next);
  return { ok: true, budget: next };
}
async function deleteHouseholdUser(repo, actor, id, moderatorEmail, deleteAuthUser2) {
  if (!actor.isModerator) {
    return { ok: false, error: "Not allowed.", status: 403 };
  }
  const existing = await repo.getProfile(id);
  if (existing === null) {
    return { ok: false, error: "Not found.", status: 404 };
  }
  if (id === actor.profile.id || isModeratorEmail(existing.email, moderatorEmail)) {
    return { ok: false, error: "Not allowed.", status: 403 };
  }
  const budgets2 = await repo.listBudgetDocs();
  for (const budget of budgets2) {
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
  await deleteAuthUser2(id);
  return { ok: true };
}
function directoryUser(profile) {
  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName
  };
}
function mePayload(profile, isModerator) {
  return {
    ...profile,
    isModerator,
    canUseFromText: isModerator || profile.canUseFromText
  };
}
var MAX_PROFILES, MemoryRepo, GRANT_ROLES2;
var init_repo = __esm({
  "src/repo.ts"() {
    "use strict";
    init_acl();
    init_budgets();
    init_persist();
    MAX_PROFILES = 10;
    MemoryRepo = class {
      profiles = /* @__PURE__ */ new Map();
      budgets = /* @__PURE__ */ new Map();
      saveBudgetCalls = 0;
      async profileCount() {
        return this.profiles.size;
      }
      async getProfile(id) {
        const found = this.profiles.get(id);
        return found === void 0 ? null : cloneProfile(found);
      }
      async saveProfile(profile) {
        this.profiles.set(profile.id, cloneProfile(profile));
      }
      async listProfiles() {
        return [...this.profiles.values()].map(cloneProfile);
      }
      async removeProfile(id) {
        this.profiles.delete(id);
      }
      async budgetCount() {
        return this.budgets.size;
      }
      async getBudgetDoc(id) {
        const found = this.budgets.get(id);
        return found === void 0 ? null : cloneBudget(found);
      }
      async saveBudget(budget) {
        this.saveBudgetCalls += 1;
        this.budgets.set(budget.id, cloneBudget(budget));
      }
      async removeBudget(id) {
        this.budgets.delete(id);
      }
      async listBudgetDocs() {
        return [...this.budgets.values()].map(cloneBudget);
      }
    };
    GRANT_ROLES2 = ["see", "browse", "edit"];
  }
});

// src/firestoreRepo.ts
var FirestoreRepo;
var init_firestoreRepo = __esm({
  "src/firestoreRepo.ts"() {
    "use strict";
    FirestoreRepo = class {
      constructor(db) {
        this.db = db;
      }
      users() {
        return this.db.collection("users");
      }
      budgetsCol() {
        return this.db.collection("budgets");
      }
      async profileCount() {
        const snap = await this.users().count().get();
        return snap.data().count;
      }
      async getProfile(id) {
        const snap = await this.users().doc(id).get();
        if (!snap.exists) {
          return null;
        }
        return snap.data();
      }
      async saveProfile(profile) {
        await this.users().doc(profile.id).set(profile);
      }
      async listProfiles() {
        const snap = await this.users().get();
        return snap.docs.map((doc) => doc.data());
      }
      async removeProfile(id) {
        await this.users().doc(id).delete();
      }
      async budgetCount() {
        const snap = await this.budgetsCol().count().get();
        return snap.data().count;
      }
      async getBudgetDoc(id) {
        const snap = await this.budgetsCol().doc(id).get();
        if (!snap.exists) {
          return null;
        }
        return snap.data();
      }
      async saveBudget(budget) {
        await this.budgetsCol().doc(budget.id).set(budget);
      }
      async removeBudget(id) {
        await this.budgetsCol().doc(id).delete();
      }
      async listBudgetDocs() {
        const snap = await this.budgetsCol().get();
        return snap.docs.map((doc) => doc.data());
      }
    };
  }
});

// src/secrets.ts
function persistAdapterName() {
  return process.env.BUDGETAPP_MEMORY_REPO === "1" ? "memory" : "firestore";
}
var init_secrets = __esm({
  "src/secrets.ts"() {
    "use strict";
  }
});

// src/firebaseAdmin.ts
var firebaseAdmin_exports = {};
__export(firebaseAdmin_exports, {
  createAppRepo: () => createAppRepo,
  deleteAuthUser: () => deleteAuthUser,
  firebaseProjectId: () => firebaseProjectId,
  initFirebaseAdmin: () => initFirebaseAdmin,
  verifyIdToken: () => verifyIdToken
});
import { applicationDefault, getApps, initializeApp } from "file:///home/roger/GitHub/nextpath-budgetapp/node_modules/firebase-admin/lib/esm/app/index.js";
import { getAuth } from "file:///home/roger/GitHub/nextpath-budgetapp/node_modules/firebase-admin/lib/esm/auth/index.js";
import { getFirestore } from "file:///home/roger/GitHub/nextpath-budgetapp/node_modules/firebase-admin/lib/esm/firestore/index.js";
function firebaseProjectId() {
  return process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID ?? process.env.FIREBASE_WEB_PROJECT_ID ?? "budgetapp-local";
}
function initFirebaseAdmin() {
  if (getApps().length > 0) {
    return;
  }
  const projectId = firebaseProjectId();
  if (process.env.FIRESTORE_EMULATOR_HOST !== void 0 && process.env.FIRESTORE_EMULATOR_HOST !== "") {
    initializeApp({ projectId });
    return;
  }
  initializeApp({
    projectId,
    credential: applicationDefault()
  });
}
async function verifyIdToken(token) {
  initFirebaseAdmin();
  const decoded = await getAuth().verifyIdToken(token);
  return { uid: decoded.uid, email: decoded.email };
}
async function deleteAuthUser(uid) {
  initFirebaseAdmin();
  await getAuth().deleteUser(uid);
}
function createAppRepo() {
  if (persistAdapterName() === "memory") {
    return new MemoryRepo();
  }
  initFirebaseAdmin();
  return new FirestoreRepo(getFirestore());
}
var init_firebaseAdmin = __esm({
  "src/firebaseAdmin.ts"() {
    "use strict";
    init_firestoreRepo();
    init_repo();
    init_secrets();
  }
});

// vite.config.ts
import react from "file:///home/roger/GitHub/nextpath-budgetapp/node_modules/@vitejs/plugin-react/dist/index.js";
import { loadEnv } from "file:///home/roger/GitHub/nextpath-budgetapp/node_modules/vite/dist/node/index.js";
import { defineConfig } from "file:///home/roger/GitHub/nextpath-budgetapp/node_modules/vitest/dist/config.js";

// src/envFile.ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
function applyEnvFile(cwd = process.cwd(), options = {}) {
  const path = join(cwd, ".env");
  if (!existsSync(path)) {
    return;
  }
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (options.overwrite === true || process.env[key] === void 0 || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

// src/agentMemory.ts
var AgentMemoryStore = class {
  byUser = /* @__PURE__ */ new Map();
  remember(uid, key, value) {
    let map = this.byUser.get(uid);
    if (map === void 0) {
      map = /* @__PURE__ */ new Map();
      this.byUser.set(uid, map);
    }
    map.set(key, value);
  }
  recall(uid, key) {
    const map = this.byUser.get(uid);
    if (map === void 0) {
      return null;
    }
    const found = map.get(key);
    return found === void 0 ? null : found;
  }
};

// src/httpDispatch.ts
init_acl();
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { join as join2, resolve, sep } from "node:path";

// src/agentTools.ts
init_acl();

// src/serverAccess.ts
var MAX_REQUEST_BYTES = 65536;
var AGENT_MAX_STEPS = 8;
var AGENT_MAX_MS = 5e3;
function redactSecrets(text, secrets) {
  let out = text;
  for (const secret of secrets) {
    if (secret.length < 8) {
      continue;
    }
    out = out.split(secret).join("[redacted]");
  }
  return out;
}

// src/agentTools.ts
init_repo();
var TOOLS = /* @__PURE__ */ new Set(["get_budget", "save_budget", "remember", "recall"]);
function asRecord(value) {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return value;
}
function asDateParts(value) {
  if (value === null) {
    return null;
  }
  const rec = asRecord(value);
  if (rec === null || typeof rec.year !== "number" || typeof rec.month !== "number" || typeof rec.day !== "number") {
    return void 0;
  }
  return { year: rec.year, month: rec.month, day: rec.day };
}
function parseEntries(value) {
  if (!Array.isArray(value)) {
    return null;
  }
  const entries = [];
  for (const item of value) {
    const rec = asRecord(item);
    if (rec === null || typeof rec.id !== "string" || typeof rec.categoryId !== "string" || typeof rec.comment !== "string" || typeof rec.amountCents !== "number") {
      return null;
    }
    const date = rec.date === void 0 ? null : asDateParts(rec.date);
    if (date === void 0) {
      return null;
    }
    entries.push({
      id: rec.id,
      categoryId: rec.categoryId,
      comment: rec.comment,
      amountCents: rec.amountCents,
      date
    });
  }
  return entries;
}
function parseCategories(value) {
  if (!Array.isArray(value)) {
    return null;
  }
  const list = [];
  for (const item of value) {
    const rec = asRecord(item);
    if (rec === null || typeof rec.id !== "string" || typeof rec.name !== "string") {
      return null;
    }
    list.push({ id: rec.id, name: rec.name });
  }
  return list;
}
function deny(tool, status, error) {
  return { tool, ok: false, status, error };
}
async function runGetBudget(actor, repo, args) {
  if (typeof args.budgetId !== "string") {
    return deny("get_budget", 400, "Invalid tool arguments.");
  }
  const result = await getBudget(repo, actor, args.budgetId);
  if (!result.ok) {
    return deny("get_budget", 404, result.error);
  }
  return { tool: "get_budget", ok: true, value: result.value };
}
async function runSaveBudget(actor, repo, args) {
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
  let next = existing;
  if (args.name !== void 0) {
    if (typeof args.name !== "string") {
      return deny("save_budget", 400, "Invalid tool arguments.");
    }
    next = { ...next, name: args.name };
  }
  if (args.description !== void 0) {
    if (typeof args.description !== "string") {
      return deny("save_budget", 400, "Invalid tool arguments.");
    }
    next = { ...next, description: args.description };
  }
  if (args.expenseEntries !== void 0) {
    const entries = parseEntries(args.expenseEntries);
    if (entries === null) {
      return deny("save_budget", 400, "Invalid tool arguments.");
    }
    next = { ...next, expenseEntries: entries };
  }
  if (args.incomeEntries !== void 0) {
    const entries = parseEntries(args.incomeEntries);
    if (entries === null) {
      return deny("save_budget", 400, "Invalid tool arguments.");
    }
    next = { ...next, incomeEntries: entries };
  }
  if (args.incomeCategories !== void 0) {
    const cats = parseCategories(args.incomeCategories);
    if (cats === null) {
      return deny("save_budget", 400, "Invalid tool arguments.");
    }
    next = { ...next, incomeCategories: cats };
  }
  if (args.expenseCategories !== void 0) {
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
function runRemember(actor, memory, args) {
  if (typeof args.key !== "string" || typeof args.value !== "string") {
    return deny("remember", 400, "Invalid tool arguments.");
  }
  if (args.key.length === 0 || args.key.length > 64 || args.value.length > 1024) {
    return deny("remember", 400, "Invalid tool arguments.");
  }
  memory.remember(actor.profile.id, args.key, args.value);
  return { tool: "remember", ok: true };
}
function runRecall(actor, memory, args) {
  if (typeof args.key !== "string") {
    return deny("recall", 400, "Invalid tool arguments.");
  }
  const value = memory.recall(actor.profile.id, args.key);
  if (value === null) {
    return deny("recall", 404, "Not found.");
  }
  return { tool: "recall", ok: true, value: { value } };
}
async function executeTool(actor, repo, memory, tool, args) {
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
async function executeAgentRun(input) {
  const maxSteps = input.maxSteps ?? AGENT_MAX_STEPS;
  const maxMs = input.maxMs ?? AGENT_MAX_MS;
  if (!Array.isArray(input.rawSteps)) {
    return { status: 400, error: "Invalid tool arguments." };
  }
  if (input.rawSteps.length > maxSteps) {
    return { status: 400, error: "Too many steps." };
  }
  const startedAt = input.nowMs();
  const steps = [];
  for (let i = 0; i < input.rawSteps.length; i += 1) {
    const raw = asRecord(input.rawSteps[i]);
    const tool = raw !== null && typeof raw.tool === "string" ? raw.tool : "";
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
  return { status: 200, steps: JSON.parse(encoded) };
}

// src/geminiSuggest.ts
import { GoogleGenerativeAI } from "file:///home/roger/GitHub/nextpath-budgetapp/node_modules/@google/generative-ai/dist/index.mjs";

// src/suggest.ts
init_budgets();

// src/categories.ts
init_budgets();
init_names();

// src/entries.ts
init_budgets();

// src/suggest.ts
init_names();
var PARSE_FAIL = {
  ok: false,
  error: "Could not suggest entries."
};
function isKind(value) {
  return value === "income" || value === "expense" || value === null;
}
function parseItem(raw) {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const record = raw;
  if (!isKind(record.kind ?? null)) {
    return null;
  }
  if (record.categoryId !== null && record.categoryId !== void 0 && typeof record.categoryId !== "string") {
    return null;
  }
  if (typeof record.categoryName !== "string") {
    return null;
  }
  if (typeof record.comment !== "string") {
    return null;
  }
  if (typeof record.amountEuros !== "number" || !Number.isFinite(record.amountEuros)) {
    return null;
  }
  if (record.date !== null && typeof record.date !== "string") {
    return null;
  }
  return {
    kind: record.kind ?? null,
    categoryId: typeof record.categoryId === "string" ? record.categoryId : null,
    categoryName: record.categoryName,
    comment: record.comment,
    amountEuros: record.amountEuros,
    date: typeof record.date === "string" ? record.date : null
  };
}
function parseSuggestResponse(data) {
  if (typeof data !== "object" || data === null) {
    return PARSE_FAIL;
  }
  if (!("items" in data) || !Array.isArray(data.items)) {
    return PARSE_FAIL;
  }
  const items = [];
  for (const raw of data.items) {
    const item = parseItem(raw);
    if (item === null) {
      return PARSE_FAIL;
    }
    items.push(item);
  }
  return { ok: true, items };
}

// src/geminiSuggest.ts
var GEMINI_MODEL_ID = "gemini-3.6-flash";
var GEMINI_JSON_MIME = "application/json";
function createSdkCaller() {
  return {
    async generateJson(input) {
      const genAI = new GoogleGenerativeAI(input.apiKey);
      const model = genAI.getGenerativeModel({
        model: input.model,
        generationConfig: { responseMimeType: input.responseMimeType }
      });
      const result = await model.generateContent(input.prompt);
      return result.response.text();
    }
  };
}
function isCategoryRef(value) {
  return typeof value === "object" && value !== null && "id" in value && "name" in value && typeof value.id === "string" && typeof value.name === "string";
}
function parseCategoryList(value) {
  if (!Array.isArray(value)) {
    return null;
  }
  const list = [];
  for (const item of value) {
    if (!isCategoryRef(item)) {
      return null;
    }
    list.push(item);
  }
  return list;
}
function parseSuggestRequestBody(data) {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  if (!("text" in data) || typeof data.text !== "string") {
    return null;
  }
  const incomeCategories = parseCategoryList(
    "incomeCategories" in data ? data.incomeCategories : void 0
  );
  const expenseCategories = parseCategoryList(
    "expenseCategories" in data ? data.expenseCategories : void 0
  );
  if (incomeCategories === null || expenseCategories === null) {
    return null;
  }
  return {
    text: data.text,
    incomeCategories,
    expenseCategories
  };
}
function buildSuggestPrompt(request) {
  return [
    "Extract income and expense items from the user's free text.",
    "Return JSON with an items array only.",
    "Each item: kind (income, expense, or null if unclear), categoryId (existing id or null), categoryName, comment, amountEuros (number only), date (dd.mm.yyyy or null).",
    "categoryName must be a general category people reuse in a budget (for example food, groceries, rent, salary, clothes), not the specific item.",
    "Do not use the specific item as categoryName: milk is not a category; new shoes is not a category.",
    "Put the specific item in comment (for example milk, new shoes).",
    'Example: user text "milk 4 euros" -> categoryName like food or groceries, comment milk, not categoryName milk.',
    "Reuse an existing category id when the item belongs in that general category.",
    "If no category fits, propose a new general categoryName in the user's language (do not translate) and set categoryId to null.",
    "Never suggest deleting, renaming, or editing existing data.",
    "Ignore currency words and symbols (euro, euros, EUR, \u20AC, and others); keep only the numeric amount.",
    "Existing income categories:",
    JSON.stringify(request.incomeCategories),
    "Existing expense categories:",
    JSON.stringify(request.expenseCategories),
    "User text:",
    request.text
  ].join("\n");
}
async function handleSuggestEntries(rawBody, apiKey, caller) {
  if (apiKey.trim() === "") {
    return { status: 503, body: { error: "Gemini API key is missing." } };
  }
  let parsedJson;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "Could not suggest entries." } };
  }
  const request = parseSuggestRequestBody(parsedJson);
  if (request === null) {
    return { status: 400, body: { error: "Could not suggest entries." } };
  }
  const prompt = buildSuggestPrompt(request);
  let raw;
  try {
    raw = await caller.generateJson({
      apiKey,
      model: GEMINI_MODEL_ID,
      responseMimeType: GEMINI_JSON_MIME,
      prompt
    });
  } catch {
    return { status: 502, body: { error: "Could not suggest entries." } };
  }
  let modelJson;
  try {
    modelJson = JSON.parse(raw);
  } catch {
    return { status: 502, body: { error: "Could not suggest entries." } };
  }
  const parsed = parseSuggestResponse(modelJson);
  if (!parsed.ok) {
    return { status: 502, body: { error: parsed.error } };
  }
  return { status: 200, body: { items: parsed.items } };
}

// src/httpDispatch.ts
init_repo();
var JSON_HEADERS = { "Content-Type": "application/json" };
var defaultAgentMemory = new AgentMemoryStore();
function jsonResult(status, body) {
  return { status, headers: JSON_HEADERS, body };
}
function errorResult(status, error) {
  return jsonResult(status, JSON.stringify({ error }));
}
function mimeFor(filePath) {
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
function safeDistFile(distDir, pathname) {
  const distResolved = resolve(distDir);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = resolve(distDir, relative);
  if (target !== distResolved && !target.startsWith(distResolved + sep)) {
    return null;
  }
  return target;
}
function bearerToken(authorization) {
  if (authorization === void 0) {
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
function parseJsonBody(raw) {
  if (raw.trim() === "") {
    return void 0;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return void 0;
  }
}
function asRecord2(value) {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return value;
}
function asDateParts2(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  const rec = asRecord2(value);
  if (rec === null || typeof rec.year !== "number" || typeof rec.month !== "number" || typeof rec.day !== "number") {
    return void 0;
  }
  return { year: rec.year, month: rec.month, day: rec.day };
}
function actorFrom(profile, isModerator) {
  return actorFromVerifiedSession(profile, isModerator);
}
async function maybeDeleteOrphan(input, uid) {
  await input.deleteUser(uid);
  return errorResult(403, "The household is full (10 users).");
}
async function authenticate(input) {
  const token = bearerToken(input.authorization);
  if (token === null) {
    return { ok: false, result: errorResult(401, "Sign in required.") };
  }
  let verified;
  try {
    verified = await input.verifyIdToken(token);
  } catch {
    return { ok: false, result: errorResult(401, "Sign in required.") };
  }
  const profile = await input.repo.getProfile(verified.uid);
  const tokenEmail = (verified.email ?? "").trim();
  const profileEmail = (profile?.email ?? "").trim();
  const email = tokenEmail !== "" ? tokenEmail : profileEmail;
  const isModerator = isModeratorEmail(email, input.moderatorEmail) || isModeratorEmail(profileEmail, input.moderatorEmail);
  return {
    ok: true,
    uid: verified.uid,
    email,
    profile,
    isModerator
  };
}
async function requireProfile(input) {
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
    actor: actorFrom(session.profile, session.isModerator)
  };
}
function createIdFrom(input) {
  return input.createId === void 0 ? crypto.randomUUID() : input.createId();
}
function nowIso(input) {
  return input.nowIso === void 0 ? (/* @__PURE__ */ new Date()).toISOString() : input.nowIso();
}
function parseGrants(value) {
  if (!Array.isArray(value)) {
    return null;
  }
  const grants = [];
  for (const item of value) {
    const rec = asRecord2(item);
    if (rec === null) {
      return null;
    }
    if (typeof rec.userId !== "string" || typeof rec.role !== "string") {
      return null;
    }
    grants.push({ userId: rec.userId, role: rec.role });
  }
  return grants;
}
async function dispatchRegister(input) {
  const session = await authenticate(input);
  if (!session.ok) {
    return session.result;
  }
  const data = asRecord2(parseJsonBody(input.body));
  const rawName = data !== null && typeof data.displayName === "string" ? data.displayName : "";
  const displayName = rawName.trim();
  if (displayName === "") {
    return errorResult(400, "Display name is required.");
  }
  if (session.profile !== null) {
    return jsonResult(
      200,
      JSON.stringify(mePayload(session.profile, session.isModerator))
    );
  }
  const count = await input.repo.profileCount();
  if (count >= MAX_PROFILES) {
    return maybeDeleteOrphan(input, session.uid);
  }
  const profile = {
    id: session.uid,
    email: session.email,
    displayName,
    canUseFromText: session.isModerator,
    createdAt: nowIso(input)
  };
  await input.repo.saveProfile(profile);
  return jsonResult(
    201,
    JSON.stringify(mePayload(profile, session.isModerator))
  );
}
async function dispatchMe(input) {
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
    JSON.stringify(mePayload(session.profile, session.isModerator))
  );
}
async function dispatchApi(input) {
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
        JSON.stringify({ apiKey, authDomain, projectId })
      );
    }
    const authEmulatorHost = emulatorHost.startsWith("http://") || emulatorHost.startsWith("https://") ? emulatorHost : `http://${emulatorHost}`;
    return jsonResult(
      200,
      JSON.stringify({ apiKey, authDomain, projectId, authEmulatorHost })
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
      input.deleteUser
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
    const data = asRecord2(parseJsonBody(input.body));
    if (data === null || typeof data.canUseFromText !== "boolean") {
      return errorResult(400, "Not allowed.");
    }
    const next = { ...existing, canUseFromText: data.canUseFromText };
    await repo.saveProfile(next);
    return jsonResult(200, JSON.stringify(next));
  }
  if (input.pathname === "/api/budgets" && input.method === "GET") {
    const budgets2 = await listBudgetSummaries(repo, actor);
    return jsonResult(200, JSON.stringify({ budgets: budgets2 }));
  }
  if (input.pathname === "/api/budgets" && input.method === "POST") {
    const data = asRecord2(parseJsonBody(input.body));
    if (data === null || typeof data.name !== "string") {
      return errorResult(400, "Name is required.");
    }
    const result = await createBudgetForActor(
      repo,
      actor,
      {
        name: data.name,
        description: typeof data.description === "string" ? data.description : void 0,
        startDate: asDateParts2(data.startDate),
        endDate: asDateParts2(data.endDate),
        targetLeftoverCents: data.targetLeftoverCents === null || typeof data.targetLeftoverCents === "number" ? data.targetLeftoverCents : void 0
      },
      () => createIdFrom(input)
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
    input.pathname
  );
  if (budgetVis !== null && input.method === "PATCH") {
    const id = budgetVis[1] ?? "";
    const existing = await repo.getBudgetDoc(id);
    const access = decideBudgetAccess(actor, existing, "share");
    if (!access.ok) {
      return errorResult(access.status, access.error);
    }
    const data = asRecord2(parseJsonBody(input.body));
    const visibility = data === null ? void 0 : data.visibility;
    if (!isValidVisibility(visibility)) {
      return errorResult(400, "Invalid visibility.");
    }
    const result = await setVisibilityForActor(repo, actor, id, visibility);
    if (!result.ok) {
      return errorResult(result.status, result.error);
    }
    return jsonResult(
      200,
      JSON.stringify({ visibility: result.budget.visibility })
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
    const data = asRecord2(parseJsonBody(input.body));
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
    const data = asRecord2(parseJsonBody(input.body));
    if (data === null) {
      return errorResult(400, "Not found.");
    }
    const next = {
      ...existing.value,
      name: typeof data.name === "string" ? data.name : existing.value.name,
      description: typeof data.description === "string" ? data.description : existing.value.description,
      incomeCategories: Array.isArray(data.incomeCategories) ? data.incomeCategories : existing.value.incomeCategories,
      expenseCategories: Array.isArray(data.expenseCategories) ? data.expenseCategories : existing.value.expenseCategories,
      incomeEntries: Array.isArray(data.incomeEntries) ? data.incomeEntries : existing.value.incomeEntries,
      expenseEntries: Array.isArray(data.expenseEntries) ? data.expenseEntries : existing.value.expenseEntries
    };
    const result = await saveWritableBudget(
      repo,
      actor,
      existing.value.id,
      next
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
    const data = asRecord2(parseJsonBody(input.body));
    const budgetId = data !== null && typeof data.budgetId === "string" ? data.budgetId : "";
    const budget = budgetId === "" ? null : await repo.getBudgetDoc(budgetId);
    const write = decideBudgetAccess(actor, budget, "write");
    if (!write.ok) {
      return errorResult(write.status, write.error);
    }
    const result = await handleSuggestEntries(
      input.body,
      input.geminiApiKey,
      input.geminiCaller ?? createSdkCaller()
    );
    return jsonResult(result.status, JSON.stringify(result.body));
  }
  if (input.pathname === "/api/agent/run") {
    if (input.method !== "POST") {
      return errorResult(404, "Not found.");
    }
    const data = asRecord2(parseJsonBody(input.body));
    const secrets = [input.geminiApiKey].filter((item) => item !== "");
    const run = await executeAgentRun({
      actor,
      repo,
      memory: input.agentMemory ?? defaultAgentMemory,
      rawSteps: data === null ? void 0 : data.steps,
      nowMs: input.nowMs ?? Date.now,
      maxMs: input.maxAgentMs ?? AGENT_MAX_MS,
      secrets
    });
    if ("error" in run) {
      return errorResult(run.status, run.error);
    }
    return jsonResult(
      200,
      redactSecrets(JSON.stringify({ steps: run.steps }), secrets)
    );
  }
  return errorResult(404, "Not found.");
}
async function dispatchHttpRequest(input) {
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
  if (!existsSync2(input.distDir)) {
    return errorResult(503, "UI build is missing. Run npm run build.");
  }
  const filePath = safeDistFile(input.distDir, input.pathname);
  if (filePath === null || !existsSync2(filePath)) {
    return errorResult(404, "Not found.");
  }
  const body = input.method === "HEAD" ? "" : readFileSync2(filePath, "utf8");
  return {
    status: 200,
    headers: { "Content-Type": mimeFor(filePath) },
    body
  };
}

// vite.config.ts
init_acl();

// src/migrate.ts
import { existsSync as existsSync3, readFileSync as readFileSync3 } from "node:fs";

// src/store.ts
init_budgets();

// src/paths.ts
import { join as join3 } from "node:path";
var APP_BUDGETS_FILE = join3(process.cwd(), "data", "budgets.json");

// src/store.ts
init_persist();
function isStoreFile(data) {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  if (!("version" in data) || data.version !== 1) {
    return false;
  }
  if (!("budgets" in data) || !Array.isArray(data.budgets)) {
    return false;
  }
  return true;
}
function parseStoreJson(raw) {
  try {
    const data = JSON.parse(raw);
    if (!isStoreFile(data)) {
      return { ok: false, error: "Could not read budgets.json." };
    }
    return { ok: true, value: data };
  } catch {
    return { ok: false, error: "Could not read budgets.json." };
  }
}

// src/migrate.ts
function withOwner(budget, ownerId) {
  return {
    ...budget,
    ownerId,
    visibility: "hidden",
    grants: []
  };
}
async function migrateJsonIfNeeded(repo, jsonPath, moderatorUid) {
  if (await repo.budgetCount() > 0) {
    return;
  }
  if (!existsSync3(jsonPath)) {
    return;
  }
  const parsed = parseStoreJson(readFileSync3(jsonPath, "utf8"));
  if (!parsed.ok) {
    return;
  }
  for (const budget of parsed.value.budgets) {
    await repo.saveBudget(withOwner(budget, moderatorUid));
  }
}

// vite.config.ts
function readBody(req) {
  return new Promise((resolve2, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        if (!settled) {
          settled = true;
          resolve2("x".repeat(MAX_REQUEST_BYTES + 1));
        }
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!settled) {
        settled = true;
        resolve2(Buffer.concat(chunks).toString("utf8"));
      }
    });
    req.on("error", reject);
  });
}
function storeApiPlugin() {
  let repo;
  const agentMemory = new AgentMemoryStore();
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
            if (process.env[key] === void 0 || process.env[key] === "") {
              process.env[key] = value;
            }
          }
          const { createAppRepo: createAppRepo2, deleteAuthUser: deleteAuthUser2, verifyIdToken: verifyIdToken2 } = await Promise.resolve().then(() => (init_firebaseAdmin(), firebaseAdmin_exports));
          if (repo === void 0) {
            repo = createAppRepo2();
          }
          if (!migrated) {
            migrated = true;
            const profiles = await repo.listProfiles();
            const moderator = profiles.find(
              (profile) => isModeratorEmail(profile.email, process.env.MODERATOR_EMAIL ?? "")
            );
            if (moderator !== void 0) {
              await migrateJsonIfNeeded(repo, APP_BUDGETS_FILE, moderator.id);
            }
          }
          const body = await readBody(req);
          const incoming = req;
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
            firebaseAuthEmulatorHost: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "",
            verifyIdToken: verifyIdToken2,
            deleteUser: deleteAuthUser2,
            agentMemory
          });
          const outgoing = res;
          outgoing.statusCode = result.status;
          for (const [name, value] of Object.entries(result.headers)) {
            outgoing.setHeader(name, value);
          }
          outgoing.end(result.body);
        })();
      });
    }
  };
}
var vite_config_default = defineConfig({
  plugins: [react(), storeApiPlugin()],
  test: {
    passWithNoTests: true,
    pool: "forks"
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2FjbC50cyIsICJzcmMvbmFtZXMudHMiLCAic3JjL3BlcnNpc3QudHMiLCAic3JjL2J1ZGdldHMudHMiLCAic3JjL3JlcG8udHMiLCAic3JjL2ZpcmVzdG9yZVJlcG8udHMiLCAic3JjL3NlY3JldHMudHMiLCAic3JjL2ZpcmViYXNlQWRtaW4udHMiLCAidml0ZS5jb25maWcudHMiLCAic3JjL2VudkZpbGUudHMiLCAic3JjL2FnZW50TWVtb3J5LnRzIiwgInNyYy9odHRwRGlzcGF0Y2gudHMiLCAic3JjL2FnZW50VG9vbHMudHMiLCAic3JjL3NlcnZlckFjY2Vzcy50cyIsICJzcmMvZ2VtaW5pU3VnZ2VzdC50cyIsICJzcmMvc3VnZ2VzdC50cyIsICJzcmMvY2F0ZWdvcmllcy50cyIsICJzcmMvZW50cmllcy50cyIsICJzcmMvbWlncmF0ZS50cyIsICJzcmMvc3RvcmUudHMiLCAic3JjL3BhdGhzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL2hvbWUvcm9nZXIvR2l0SHViL25leHRwYXRoLWJ1ZGdldGFwcC9zcmNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjL2FjbC50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyYy9hY2wudHNcIjtpbXBvcnQgdHlwZSB7IEFjdG9yLCBCdWRnZXQsIEdyYW50Um9sZSwgVXNlclByb2ZpbGUsIFZpZXdlclJlbGF0aW9uIH0gZnJvbSBcIi4vdHlwZXNcIjtcblxuY29uc3QgR1JBTlRfUk9MRVM6IHJlYWRvbmx5IEdyYW50Um9sZVtdID0gW1wic2VlXCIsIFwiYnJvd3NlXCIsIFwiZWRpdFwiXTtcblxuZXhwb3J0IGZ1bmN0aW9uIGlzTW9kZXJhdG9yRW1haWwoXG4gIGVtYWlsOiBzdHJpbmcsXG4gIG1vZGVyYXRvckVtYWlsOiBzdHJpbmcgfCB1bmRlZmluZWQsXG4pOiBib29sZWFuIHtcbiAgY29uc3QgY29uZmlndXJlZCA9IChtb2RlcmF0b3JFbWFpbCA/PyBcIlwiKS50cmltKCk7XG4gIGlmIChjb25maWd1cmVkID09PSBcIlwiKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiBlbWFpbC50cmltKCkudG9Mb3dlckNhc2UoKSA9PT0gY29uZmlndXJlZC50b0xvd2VyQ2FzZSgpO1xufVxuXG5mdW5jdGlvbiBncmFudFJvbGVGb3IoYWN0b3I6IEFjdG9yLCBidWRnZXQ6IEJ1ZGdldCk6IEdyYW50Um9sZSB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IG1hdGNoID0gYnVkZ2V0LmdyYW50cy5maW5kKChncmFudCkgPT4gZ3JhbnQudXNlcklkID09PSBhY3Rvci5wcm9maWxlLmlkKTtcbiAgaWYgKCFtYXRjaCkge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbiAgaWYgKEdSQU5UX1JPTEVTLmluY2x1ZGVzKG1hdGNoLnJvbGUpKSB7XG4gICAgcmV0dXJuIG1hdGNoLnJvbGU7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gaXNPd25lcihhY3RvcjogQWN0b3IsIGJ1ZGdldDogQnVkZ2V0KTogYm9vbGVhbiB7XG4gIHJldHVybiBidWRnZXQub3duZXJJZCA9PT0gYWN0b3IucHJvZmlsZS5pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNhbkxpc3RTdW1tYXJ5KGFjdG9yOiBBY3RvciwgYnVkZ2V0OiBCdWRnZXQpOiBib29sZWFuIHtcbiAgaWYgKGFjdG9yLmlzTW9kZXJhdG9yIHx8IGlzT3duZXIoYWN0b3IsIGJ1ZGdldCkpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICBjb25zdCByb2xlID0gZ3JhbnRSb2xlRm9yKGFjdG9yLCBidWRnZXQpO1xuICBpZiAocm9sZSA9PT0gXCJzZWVcIiB8fCByb2xlID09PSBcImJyb3dzZVwiIHx8IHJvbGUgPT09IFwiZWRpdFwiKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGJ1ZGdldC52aXNpYmlsaXR5ID09PSBcInB1YmxpY1wiO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2FuUmVhZChhY3RvcjogQWN0b3IsIGJ1ZGdldDogQnVkZ2V0KTogYm9vbGVhbiB7XG4gIGlmIChhY3Rvci5pc01vZGVyYXRvciB8fCBpc093bmVyKGFjdG9yLCBidWRnZXQpKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgY29uc3Qgcm9sZSA9IGdyYW50Um9sZUZvcihhY3RvciwgYnVkZ2V0KTtcbiAgcmV0dXJuIHJvbGUgPT09IFwiYnJvd3NlXCIgfHwgcm9sZSA9PT0gXCJlZGl0XCI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjYW5Xcml0ZShhY3RvcjogQWN0b3IsIGJ1ZGdldDogQnVkZ2V0KTogYm9vbGVhbiB7XG4gIGlmIChhY3Rvci5pc01vZGVyYXRvciB8fCBpc093bmVyKGFjdG9yLCBidWRnZXQpKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGdyYW50Um9sZUZvcihhY3RvciwgYnVkZ2V0KSA9PT0gXCJlZGl0XCI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjYW5NYW5hZ2VTaGFyaW5nKGFjdG9yOiBBY3RvciwgYnVkZ2V0OiBCdWRnZXQpOiBib29sZWFuIHtcbiAgcmV0dXJuIGFjdG9yLmlzTW9kZXJhdG9yIHx8IGlzT3duZXIoYWN0b3IsIGJ1ZGdldCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjYW5EZWxldGUoYWN0b3I6IEFjdG9yLCBidWRnZXQ6IEJ1ZGdldCk6IGJvb2xlYW4ge1xuICByZXR1cm4gY2FuTWFuYWdlU2hhcmluZyhhY3RvciwgYnVkZ2V0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNhblVzZUZyb21UZXh0KGFjdG9yOiBBY3Rvcik6IGJvb2xlYW4ge1xuICByZXR1cm4gYWN0b3IuaXNNb2RlcmF0b3IgfHwgYWN0b3IucHJvZmlsZS5jYW5Vc2VGcm9tVGV4dCA9PT0gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHZpZXdlclJlbGF0aW9uKGFjdG9yOiBBY3RvciwgYnVkZ2V0OiBCdWRnZXQpOiBWaWV3ZXJSZWxhdGlvbiB7XG4gIGlmIChpc093bmVyKGFjdG9yLCBidWRnZXQpKSB7XG4gICAgcmV0dXJuIFwib3duZXJcIjtcbiAgfVxuICBpZiAoYWN0b3IuaXNNb2RlcmF0b3IpIHtcbiAgICByZXR1cm4gXCJtb2RlcmF0b3JcIjtcbiAgfVxuICBjb25zdCByb2xlID0gZ3JhbnRSb2xlRm9yKGFjdG9yLCBidWRnZXQpO1xuICBpZiAocm9sZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIHJvbGU7XG4gIH1cbiAgcmV0dXJuIFwicHVibGljXCI7XG59XG5cbmV4cG9ydCB0eXBlIEJ1ZGdldEFjdGlvbiA9IFwicmVhZFwiIHwgXCJ3cml0ZVwiIHwgXCJkZWxldGVcIiB8IFwic2hhcmVcIjtcblxuZXhwb3J0IHR5cGUgQWNjZXNzRGVjaXNpb24gPVxuICB8IHsgb2s6IHRydWUgfVxuICB8IHsgb2s6IGZhbHNlOyBzdGF0dXM6IDQwMyB8IDQwNDsgZXJyb3I6IFwiTm90IGZvdW5kLlwiIHwgXCJOb3QgYWxsb3dlZC5cIiB9O1xuXG5leHBvcnQgZnVuY3Rpb24gYWN0b3JGcm9tVmVyaWZpZWRTZXNzaW9uKFxuICBwcm9maWxlOiBVc2VyUHJvZmlsZSxcbiAgaXNNb2RlcmF0b3I6IGJvb2xlYW4sXG4pOiBBY3RvciB7XG4gIHJldHVybiB7IHByb2ZpbGUsIGlzTW9kZXJhdG9yIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWNpZGVCdWRnZXRBY2Nlc3MoXG4gIGFjdG9yOiBBY3RvcixcbiAgYnVkZ2V0OiBCdWRnZXQgfCBudWxsLFxuICBhY3Rpb246IEJ1ZGdldEFjdGlvbixcbik6IEFjY2Vzc0RlY2lzaW9uIHtcbiAgaWYgKGJ1ZGdldCA9PT0gbnVsbCkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgc3RhdHVzOiA0MDQsIGVycm9yOiBcIk5vdCBmb3VuZC5cIiB9O1xuICB9XG4gIGlmIChhY3Rpb24gPT09IFwicmVhZFwiKSB7XG4gICAgaWYgKGNhblJlYWQoYWN0b3IsIGJ1ZGdldCkpIHtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgfVxuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgc3RhdHVzOiA0MDQsIGVycm9yOiBcIk5vdCBmb3VuZC5cIiB9O1xuICB9XG4gIGlmICghY2FuUmVhZChhY3RvciwgYnVkZ2V0KSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgc3RhdHVzOiA0MDQsIGVycm9yOiBcIk5vdCBmb3VuZC5cIiB9O1xuICB9XG4gIGNvbnN0IGFsbG93ZWQgPVxuICAgIGFjdGlvbiA9PT0gXCJ3cml0ZVwiXG4gICAgICA/IGNhbldyaXRlKGFjdG9yLCBidWRnZXQpXG4gICAgICA6IGFjdGlvbiA9PT0gXCJkZWxldGVcIlxuICAgICAgICA/IGNhbkRlbGV0ZShhY3RvciwgYnVkZ2V0KVxuICAgICAgICA6IGNhbk1hbmFnZVNoYXJpbmcoYWN0b3IsIGJ1ZGdldCk7XG4gIGlmICghYWxsb3dlZCkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgc3RhdHVzOiA0MDMsIGVycm9yOiBcIk5vdCBhbGxvd2VkLlwiIH07XG4gIH1cbiAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbn1cbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL2hvbWUvcm9nZXIvR2l0SHViL25leHRwYXRoLWJ1ZGdldGFwcC9zcmNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjL25hbWVzLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjL25hbWVzLnRzXCI7ZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZU5hbWUobmFtZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIG5hbWUudHJpbSgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbmFtZXNGb3JPd25lcihcbiAgYnVkZ2V0czogcmVhZG9ubHkgeyBvd25lcklkOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB9W10sXG4gIG93bmVySWQ6IHN0cmluZyxcbik6IHN0cmluZ1tdIHtcbiAgcmV0dXJuIGJ1ZGdldHNcbiAgICAuZmlsdGVyKChidWRnZXQpID0+IGJ1ZGdldC5vd25lcklkID09PSBvd25lcklkKVxuICAgIC5tYXAoKGJ1ZGdldCkgPT4gYnVkZ2V0Lm5hbWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNOYW1lVGFrZW4obmFtZTogc3RyaW5nLCBleGlzdGluZ05hbWVzOiBzdHJpbmdbXSk6IGJvb2xlYW4ge1xuICBjb25zdCBuZWVkbGUgPSBuYW1lLnRvTG93ZXJDYXNlKCk7XG4gIHJldHVybiBleGlzdGluZ05hbWVzLnNvbWUoKGV4aXN0aW5nKSA9PiBleGlzdGluZy50b0xvd2VyQ2FzZSgpID09PSBuZWVkbGUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbmV4dENvcHlOYW1lKHNvdXJjZU5hbWU6IHN0cmluZywgZXhpc3RpbmdOYW1lczogc3RyaW5nW10pOiBzdHJpbmcge1xuICBsZXQgbiA9IDE7XG4gIGxldCBjYW5kaWRhdGUgPSBgJHtzb3VyY2VOYW1lfSAoY29weSR7bn0pYDtcbiAgd2hpbGUgKGlzTmFtZVRha2VuKGNhbmRpZGF0ZSwgZXhpc3RpbmdOYW1lcykpIHtcbiAgICBuICs9IDE7XG4gICAgY2FuZGlkYXRlID0gYCR7c291cmNlTmFtZX0gKGNvcHkke259KWA7XG4gIH1cbiAgcmV0dXJuIGNhbmRpZGF0ZTtcbn1cbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL2hvbWUvcm9nZXIvR2l0SHViL25leHRwYXRoLWJ1ZGdldGFwcC9zcmNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjL3BlcnNpc3QudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL2hvbWUvcm9nZXIvR2l0SHViL25leHRwYXRoLWJ1ZGdldGFwcC9zcmMvcGVyc2lzdC50c1wiO2xldCBwZXJzaXN0Rm46ICgpID0+IHZvaWQgPSAoKSA9PiB7fTtcbmxldCByZXZpc2lvbiA9IDA7XG5jb25zdCBsaXN0ZW5lcnMgPSBuZXcgU2V0PCgpID0+IHZvaWQ+KCk7XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRQZXJzaXN0KGZuOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gIHBlcnNpc3RGbiA9IGZuO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGVyc2lzdCgpOiB2b2lkIHtcbiAgcGVyc2lzdEZuKCk7XG4gIG5vdGlmeSgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbm90aWZ5KCk6IHZvaWQge1xuICByZXZpc2lvbiArPSAxO1xuICBmb3IgKGNvbnN0IGxpc3RlbmVyIG9mIGxpc3RlbmVycykge1xuICAgIGxpc3RlbmVyKCk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN1YnNjcmliZShsaXN0ZW5lcjogKCkgPT4gdm9pZCk6ICgpID0+IHZvaWQge1xuICBsaXN0ZW5lcnMuYWRkKGxpc3RlbmVyKTtcbiAgcmV0dXJuICgpID0+IHtcbiAgICBsaXN0ZW5lcnMuZGVsZXRlKGxpc3RlbmVyKTtcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJldmlzaW9uKCk6IG51bWJlciB7XG4gIHJldHVybiByZXZpc2lvbjtcbn1cbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL2hvbWUvcm9nZXIvR2l0SHViL25leHRwYXRoLWJ1ZGdldGFwcC9zcmNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjL2J1ZGdldHMudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL2hvbWUvcm9nZXIvR2l0SHViL25leHRwYXRoLWJ1ZGdldGFwcC9zcmMvYnVkZ2V0cy50c1wiO2ltcG9ydCB7IGNhbkRlbGV0ZSwgY2FuTGlzdFN1bW1hcnksIGNhblJlYWQsIGNhbldyaXRlIH0gZnJvbSBcIi4vYWNsXCI7XG5pbXBvcnQgeyBpc05hbWVUYWtlbiwgbmFtZXNGb3JPd25lciwgbmV4dENvcHlOYW1lLCBub3JtYWxpemVOYW1lIH0gZnJvbSBcIi4vbmFtZXNcIjtcbmltcG9ydCB7IG5vdGlmeSwgcGVyc2lzdCB9IGZyb20gXCIuL3BlcnNpc3RcIjtcbmltcG9ydCB0eXBlIHsgQWN0b3IsIEJ1ZGdldCwgQ2F0ZWdvcnksIERhdGVQYXJ0cywgRW50cnkgfSBmcm9tIFwiLi90eXBlc1wiO1xuXG5leHBvcnQgdHlwZSBDcmVhdGVCdWRnZXRSZXN1bHQgPVxuICB8IHsgb2s6IHRydWUgfVxuICB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH07XG5cbmV4cG9ydCB0eXBlIENyZWF0ZUJ1ZGdldElucHV0ID0ge1xuICBuYW1lOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuICBzdGFydERhdGU/OiBEYXRlUGFydHMgfCBudWxsO1xuICBlbmREYXRlPzogRGF0ZVBhcnRzIHwgbnVsbDtcbiAgdGFyZ2V0TGVmdG92ZXJDZW50cz86IG51bWJlciB8IG51bGw7XG59O1xuXG5jb25zdCBGQUxMQkFDS19BQ1RPUjogQWN0b3IgPSB7XG4gIHByb2ZpbGU6IHtcbiAgICBpZDogXCJsb2NhbFwiLFxuICAgIGVtYWlsOiBcImxvY2FsQGxvY2FsaG9zdFwiLFxuICAgIGRpc3BsYXlOYW1lOiBcIkxvY2FsXCIsXG4gICAgY2FuVXNlRnJvbVRleHQ6IHRydWUsXG4gICAgY3JlYXRlZEF0OiBcIjE5NzAtMDEtMDFUMDA6MDA6MDAuMDAwWlwiLFxuICB9LFxuICBpc01vZGVyYXRvcjogdHJ1ZSxcbn07XG5cbmZ1bmN0aW9uIGlzQWN0b3IodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBBY3RvciB7XG4gIHJldHVybiAoXG4gICAgdHlwZW9mIHZhbHVlID09PSBcIm9iamVjdFwiICYmXG4gICAgdmFsdWUgIT09IG51bGwgJiZcbiAgICBcInByb2ZpbGVcIiBpbiB2YWx1ZSAmJlxuICAgIFwiaXNNb2RlcmF0b3JcIiBpbiB2YWx1ZVxuICApO1xufVxuXG5sZXQgYnVkZ2V0czogQnVkZ2V0W10gPSBbXTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlc2V0U3RvcmUoaW5pdGlhbDogQnVkZ2V0W10gPSBbXSk6IHZvaWQge1xuICBidWRnZXRzID0gaW5pdGlhbDtcbiAgbm90aWZ5KCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXBCdWRnZXQoXG4gIGlkOiBzdHJpbmcsXG4gIG1hcHBlcjogKGJ1ZGdldDogQnVkZ2V0KSA9PiBCdWRnZXQsXG4pOiB2b2lkIHtcbiAgYnVkZ2V0cyA9IGJ1ZGdldHMubWFwKChidWRnZXQpID0+IChidWRnZXQuaWQgPT09IGlkID8gbWFwcGVyKGJ1ZGdldCkgOiBidWRnZXQpKTtcbiAgcGVyc2lzdCgpO1xufVxuXG5leHBvcnQgdHlwZSBNdXRhdGlvblJlc3VsdCA9XG4gIHwgeyBvazogdHJ1ZSB9XG4gIHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfTtcblxuZXhwb3J0IGZ1bmN0aW9uIGRlbGV0ZUJ1ZGdldChpZDogc3RyaW5nKTogTXV0YXRpb25SZXN1bHQ7XG5leHBvcnQgZnVuY3Rpb24gZGVsZXRlQnVkZ2V0KGFjdG9yOiBBY3RvciwgaWQ6IHN0cmluZyk6IE11dGF0aW9uUmVzdWx0O1xuZXhwb3J0IGZ1bmN0aW9uIGRlbGV0ZUJ1ZGdldChcbiAgYWN0b3JPcklkOiBBY3RvciB8IHN0cmluZyxcbiAgbWF5YmVJZD86IHN0cmluZyxcbik6IE11dGF0aW9uUmVzdWx0IHtcbiAgY29uc3QgYWN0b3IgPSBtYXliZUlkID09PSB1bmRlZmluZWQgPyBGQUxMQkFDS19BQ1RPUiA6IChhY3Rvck9ySWQgYXMgQWN0b3IpO1xuICBjb25zdCBpZCA9IG1heWJlSWQgPT09IHVuZGVmaW5lZCA/IChhY3Rvck9ySWQgYXMgc3RyaW5nKSA6IG1heWJlSWQ7XG4gIGNvbnN0IGV4aXN0aW5nID0gYnVkZ2V0cy5maW5kKChidWRnZXQpID0+IGJ1ZGdldC5pZCA9PT0gaWQpO1xuICBpZiAoIWV4aXN0aW5nIHx8ICFjYW5SZWFkKGFjdG9yLCBleGlzdGluZykpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIk5vdCBmb3VuZC5cIiB9O1xuICB9XG4gIGlmICghY2FuRGVsZXRlKGFjdG9yLCBleGlzdGluZykpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIk5vdCBhbGxvd2VkLlwiIH07XG4gIH1cbiAgYnVkZ2V0cyA9IGJ1ZGdldHMuZmlsdGVyKChidWRnZXQpID0+IGJ1ZGdldC5pZCAhPT0gaWQpO1xuICBwZXJzaXN0KCk7XG4gIHJldHVybiB7IG9rOiB0cnVlIH07XG59XG5cbmV4cG9ydCB0eXBlIFVwZGF0ZUJ1ZGdldElucHV0ID0ge1xuICBuYW1lOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuICBzdGFydERhdGU/OiBEYXRlUGFydHMgfCBudWxsO1xuICBlbmREYXRlPzogRGF0ZVBhcnRzIHwgbnVsbDtcbiAgdGFyZ2V0TGVmdG92ZXJDZW50cz86IG51bWJlciB8IG51bGw7XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlQnVkZ2V0KFxuICBpZDogc3RyaW5nLFxuICBpbnB1dDogVXBkYXRlQnVkZ2V0SW5wdXQsXG4pOiBDcmVhdGVCdWRnZXRSZXN1bHQ7XG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlQnVkZ2V0KFxuICBhY3RvcjogQWN0b3IsXG4gIGlkOiBzdHJpbmcsXG4gIGlucHV0OiBVcGRhdGVCdWRnZXRJbnB1dCxcbik6IENyZWF0ZUJ1ZGdldFJlc3VsdDtcbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVCdWRnZXQoXG4gIGFjdG9yT3JJZDogQWN0b3IgfCBzdHJpbmcsXG4gIGlkT3JJbnB1dDogc3RyaW5nIHwgVXBkYXRlQnVkZ2V0SW5wdXQsXG4gIG1heWJlSW5wdXQ/OiBVcGRhdGVCdWRnZXRJbnB1dCxcbik6IENyZWF0ZUJ1ZGdldFJlc3VsdCB7XG4gIGNvbnN0IGFjdG9yID0gaXNBY3RvcihhY3Rvck9ySWQpID8gYWN0b3JPcklkIDogRkFMTEJBQ0tfQUNUT1I7XG4gIGNvbnN0IGlkID0gaXNBY3RvcihhY3Rvck9ySWQpID8gKGlkT3JJbnB1dCBhcyBzdHJpbmcpIDogYWN0b3JPcklkO1xuICBjb25zdCBpbnB1dCA9IGlzQWN0b3IoYWN0b3JPcklkKVxuICAgID8gKG1heWJlSW5wdXQgYXMgVXBkYXRlQnVkZ2V0SW5wdXQpXG4gICAgOiAoaWRPcklucHV0IGFzIFVwZGF0ZUJ1ZGdldElucHV0KTtcbiAgY29uc3QgZXhpc3RpbmcgPSBidWRnZXRzLmZpbmQoKGJ1ZGdldCkgPT4gYnVkZ2V0LmlkID09PSBpZCk7XG4gIGlmICghZXhpc3RpbmcgfHwgIWNhbldyaXRlKGFjdG9yLCBleGlzdGluZykpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIk5vdCBmb3VuZC5cIiB9O1xuICB9XG4gIGNvbnN0IG5hbWUgPSBub3JtYWxpemVOYW1lKGlucHV0Lm5hbWUpO1xuICBpZiAobmFtZSA9PT0gXCJcIikge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiTmFtZSBpcyByZXF1aXJlZC5cIiB9O1xuICB9XG4gIGNvbnN0IG90aGVyTmFtZXMgPSBuYW1lc0Zvck93bmVyKFxuICAgIGJ1ZGdldHMuZmlsdGVyKChidWRnZXQpID0+IGJ1ZGdldC5pZCAhPT0gaWQpLFxuICAgIGV4aXN0aW5nLm93bmVySWQsXG4gICk7XG4gIGlmIChpc05hbWVUYWtlbihuYW1lLCBvdGhlck5hbWVzKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiVGhlIG5hbWUgaXMgYWxyZWFkeSBpbiB1c2UuXCIgfTtcbiAgfVxuICBidWRnZXRzID0gYnVkZ2V0cy5tYXAoKGJ1ZGdldCkgPT5cbiAgICBidWRnZXQuaWQgPT09IGlkXG4gICAgICA/IHtcbiAgICAgICAgICAuLi5idWRnZXQsXG4gICAgICAgICAgbmFtZSxcbiAgICAgICAgICBkZXNjcmlwdGlvbjogaW5wdXQuZGVzY3JpcHRpb24gPz8gYnVkZ2V0LmRlc2NyaXB0aW9uLFxuICAgICAgICAgIHN0YXJ0RGF0ZTpcbiAgICAgICAgICAgIGlucHV0LnN0YXJ0RGF0ZSAhPT0gdW5kZWZpbmVkID8gaW5wdXQuc3RhcnREYXRlIDogYnVkZ2V0LnN0YXJ0RGF0ZSxcbiAgICAgICAgICBlbmREYXRlOiBpbnB1dC5lbmREYXRlICE9PSB1bmRlZmluZWQgPyBpbnB1dC5lbmREYXRlIDogYnVkZ2V0LmVuZERhdGUsXG4gICAgICAgICAgdGFyZ2V0TGVmdG92ZXJDZW50czpcbiAgICAgICAgICAgIGlucHV0LnRhcmdldExlZnRvdmVyQ2VudHMgIT09IHVuZGVmaW5lZFxuICAgICAgICAgICAgICA/IGlucHV0LnRhcmdldExlZnRvdmVyQ2VudHNcbiAgICAgICAgICAgICAgOiBidWRnZXQudGFyZ2V0TGVmdG92ZXJDZW50cyxcbiAgICAgICAgfVxuICAgICAgOiBidWRnZXQsXG4gICk7XG4gIHBlcnNpc3QoKTtcbiAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvcHlCdWRnZXQoaWQ6IHN0cmluZyk6IE11dGF0aW9uUmVzdWx0O1xuZXhwb3J0IGZ1bmN0aW9uIGNvcHlCdWRnZXQoYWN0b3I6IEFjdG9yLCBpZDogc3RyaW5nKTogTXV0YXRpb25SZXN1bHQ7XG5leHBvcnQgZnVuY3Rpb24gY29weUJ1ZGdldChcbiAgYWN0b3JPcklkOiBBY3RvciB8IHN0cmluZyxcbiAgbWF5YmVJZD86IHN0cmluZyxcbik6IE11dGF0aW9uUmVzdWx0IHtcbiAgY29uc3QgYWN0b3IgPSBtYXliZUlkID09PSB1bmRlZmluZWQgPyBGQUxMQkFDS19BQ1RPUiA6IChhY3Rvck9ySWQgYXMgQWN0b3IpO1xuICBjb25zdCBpZCA9IG1heWJlSWQgPT09IHVuZGVmaW5lZCA/IChhY3Rvck9ySWQgYXMgc3RyaW5nKSA6IG1heWJlSWQ7XG4gIGNvbnN0IHNvdXJjZSA9IGJ1ZGdldHMuZmluZCgoYnVkZ2V0KSA9PiBidWRnZXQuaWQgPT09IGlkKTtcbiAgaWYgKCFzb3VyY2UgfHwgIWNhblJlYWQoYWN0b3IsIHNvdXJjZSkpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIk5vdCBmb3VuZC5cIiB9O1xuICB9XG4gIGxldCBzZXEgPSAwO1xuICBjb25zdCBuZXh0SWQgPSAocHJlZml4OiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIHNlcSArPSAxO1xuICAgIHJldHVybiBgJHtwcmVmaXh9LSR7c2VxfWA7XG4gIH07XG4gIGNvbnN0IGNhdGVnb3J5SWRCeU9sZCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gIGNvbnN0IGNsb25lQ2F0ZWdvcmllcyA9IChjYXRlZ29yaWVzOiBDYXRlZ29yeVtdKTogQ2F0ZWdvcnlbXSA9PlxuICAgIGNhdGVnb3JpZXMubWFwKChjYXRlZ29yeSkgPT4ge1xuICAgICAgY29uc3QgbmV3SWQgPSBuZXh0SWQoXCJjXCIpO1xuICAgICAgY2F0ZWdvcnlJZEJ5T2xkLnNldChjYXRlZ29yeS5pZCwgbmV3SWQpO1xuICAgICAgcmV0dXJuIHsgaWQ6IG5ld0lkLCBuYW1lOiBjYXRlZ29yeS5uYW1lIH07XG4gICAgfSk7XG4gIGNvbnN0IGluY29tZUNhdGVnb3JpZXMgPSBjbG9uZUNhdGVnb3JpZXMoc291cmNlLmluY29tZUNhdGVnb3JpZXMpO1xuICBjb25zdCBleHBlbnNlQ2F0ZWdvcmllcyA9IGNsb25lQ2F0ZWdvcmllcyhzb3VyY2UuZXhwZW5zZUNhdGVnb3JpZXMpO1xuICBjb25zdCByZW1hcEVudHJ5ID0gKGVudHJ5OiBFbnRyeSk6IEVudHJ5ID0+ICh7XG4gICAgaWQ6IG5leHRJZChcImVcIiksXG4gICAgY2F0ZWdvcnlJZDogY2F0ZWdvcnlJZEJ5T2xkLmdldChlbnRyeS5jYXRlZ29yeUlkKSA/PyBlbnRyeS5jYXRlZ29yeUlkLFxuICAgIGNvbW1lbnQ6IGVudHJ5LmNvbW1lbnQsXG4gICAgYW1vdW50Q2VudHM6IGVudHJ5LmFtb3VudENlbnRzLFxuICAgIGRhdGU6IGVudHJ5LmRhdGUsXG4gIH0pO1xuICBjb25zdCBjb3BpZXJJZCA9IGFjdG9yLnByb2ZpbGUuaWQ7XG4gIGJ1ZGdldHMgPSBbXG4gICAgLi4uYnVkZ2V0cyxcbiAgICB7XG4gICAgICBpZDogbmV4dElkKFwiYlwiKSxcbiAgICAgIG5hbWU6IG5leHRDb3B5TmFtZShzb3VyY2UubmFtZSwgbmFtZXNGb3JPd25lcihidWRnZXRzLCBjb3BpZXJJZCkpLFxuICAgICAgb3duZXJJZDogY29waWVySWQsXG4gICAgICB2aXNpYmlsaXR5OiBcImhpZGRlblwiLFxuICAgICAgZ3JhbnRzOiBbXSxcbiAgICAgIGRlc2NyaXB0aW9uOiBzb3VyY2UuZGVzY3JpcHRpb24sXG4gICAgICBzdGFydERhdGU6IHNvdXJjZS5zdGFydERhdGUsXG4gICAgICBlbmREYXRlOiBzb3VyY2UuZW5kRGF0ZSxcbiAgICAgIHRhcmdldExlZnRvdmVyQ2VudHM6IHNvdXJjZS50YXJnZXRMZWZ0b3ZlckNlbnRzLFxuICAgICAgaW5jb21lQ2F0ZWdvcmllcyxcbiAgICAgIGV4cGVuc2VDYXRlZ29yaWVzLFxuICAgICAgaW5jb21lRW50cmllczogc291cmNlLmluY29tZUVudHJpZXMubWFwKHJlbWFwRW50cnkpLFxuICAgICAgZXhwZW5zZUVudHJpZXM6IHNvdXJjZS5leHBlbnNlRW50cmllcy5tYXAocmVtYXBFbnRyeSksXG4gICAgfSxcbiAgXTtcbiAgcGVyc2lzdCgpO1xuICByZXR1cm4geyBvazogdHJ1ZSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQnVkZ2V0KGlucHV0OiBDcmVhdGVCdWRnZXRJbnB1dCk6IENyZWF0ZUJ1ZGdldFJlc3VsdDtcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVCdWRnZXQoXG4gIGFjdG9yOiBBY3RvcixcbiAgaW5wdXQ6IENyZWF0ZUJ1ZGdldElucHV0LFxuKTogQ3JlYXRlQnVkZ2V0UmVzdWx0O1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUJ1ZGdldChcbiAgYWN0b3JPcklucHV0OiBBY3RvciB8IENyZWF0ZUJ1ZGdldElucHV0LFxuICBtYXliZUlucHV0PzogQ3JlYXRlQnVkZ2V0SW5wdXQsXG4pOiBDcmVhdGVCdWRnZXRSZXN1bHQge1xuICBjb25zdCBhY3RvciA9IG1heWJlSW5wdXQgPT09IHVuZGVmaW5lZCA/IEZBTExCQUNLX0FDVE9SIDogKGFjdG9yT3JJbnB1dCBhcyBBY3Rvcik7XG4gIGNvbnN0IGlucHV0ID1cbiAgICBtYXliZUlucHV0ID09PSB1bmRlZmluZWRcbiAgICAgID8gKGFjdG9yT3JJbnB1dCBhcyBDcmVhdGVCdWRnZXRJbnB1dClcbiAgICAgIDogbWF5YmVJbnB1dDtcbiAgY29uc3QgbmFtZSA9IG5vcm1hbGl6ZU5hbWUoaW5wdXQubmFtZSk7XG4gIGlmIChuYW1lID09PSBcIlwiKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJOYW1lIGlzIHJlcXVpcmVkLlwiIH07XG4gIH1cbiAgY29uc3Qgb3duZXJJZCA9IGFjdG9yLnByb2ZpbGUuaWQ7XG4gIGlmIChpc05hbWVUYWtlbihuYW1lLCBuYW1lc0Zvck93bmVyKGJ1ZGdldHMsIG93bmVySWQpKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiVGhlIG5hbWUgaXMgYWxyZWFkeSBpbiB1c2UuXCIgfTtcbiAgfVxuICBidWRnZXRzID0gW1xuICAgIC4uLmJ1ZGdldHMsXG4gICAge1xuICAgICAgaWQ6IGAke0RhdGUubm93KCl9LSR7YnVkZ2V0cy5sZW5ndGh9YCxcbiAgICAgIG5hbWUsXG4gICAgICBvd25lcklkLFxuICAgICAgdmlzaWJpbGl0eTogXCJoaWRkZW5cIixcbiAgICAgIGdyYW50czogW10sXG4gICAgICBkZXNjcmlwdGlvbjogaW5wdXQuZGVzY3JpcHRpb24gPz8gXCJcIixcbiAgICAgIHN0YXJ0RGF0ZTogaW5wdXQuc3RhcnREYXRlID8/IG51bGwsXG4gICAgICBlbmREYXRlOiBpbnB1dC5lbmREYXRlID8/IG51bGwsXG4gICAgICB0YXJnZXRMZWZ0b3ZlckNlbnRzOiBpbnB1dC50YXJnZXRMZWZ0b3ZlckNlbnRzID8/IG51bGwsXG4gICAgICBpbmNvbWVDYXRlZ29yaWVzOiBbXSxcbiAgICAgIGV4cGVuc2VDYXRlZ29yaWVzOiBbXSxcbiAgICAgIGluY29tZUVudHJpZXM6IFtdLFxuICAgICAgZXhwZW5zZUVudHJpZXM6IFtdLFxuICAgIH0sXG4gIF07XG4gIHBlcnNpc3QoKTtcbiAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxpc3RCdWRnZXRzKCk6IEJ1ZGdldFtdIHtcbiAgcmV0dXJuIFsuLi5idWRnZXRzXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxpc3RCdWRnZXRTdW1tYXJpZXMoYWN0b3I6IEFjdG9yKTogQnVkZ2V0W10ge1xuICByZXR1cm4gbGlzdEJ1ZGdldHMoKS5maWx0ZXIoKGJ1ZGdldCkgPT4gY2FuTGlzdFN1bW1hcnkoYWN0b3IsIGJ1ZGdldCkpO1xufVxuIiwgImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyY1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL2hvbWUvcm9nZXIvR2l0SHViL25leHRwYXRoLWJ1ZGdldGFwcC9zcmMvcmVwby50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyYy9yZXBvLnRzXCI7aW1wb3J0IHsgY2FuTGlzdFN1bW1hcnksIGRlY2lkZUJ1ZGdldEFjY2VzcywgaXNNb2RlcmF0b3JFbWFpbCwgdmlld2VyUmVsYXRpb24gfSBmcm9tIFwiLi9hY2xcIjtcbmltcG9ydCB7XG4gIGNvcHlCdWRnZXQsXG4gIGNyZWF0ZUJ1ZGdldCxcbiAgZGVsZXRlQnVkZ2V0LFxuICBsaXN0QnVkZ2V0cyxcbiAgcmVzZXRTdG9yZSxcbiAgdHlwZSBDcmVhdGVCdWRnZXRJbnB1dCxcbn0gZnJvbSBcIi4vYnVkZ2V0c1wiO1xuaW1wb3J0IHsgc2V0UGVyc2lzdCB9IGZyb20gXCIuL3BlcnNpc3RcIjtcbmltcG9ydCB0eXBlIHtcbiAgQWN0b3IsXG4gIEJ1ZGdldCxcbiAgQnVkZ2V0U3VtbWFyeSxcbiAgR3JhbnQsXG4gIEdyYW50Um9sZSxcbiAgVXNlclByb2ZpbGUsXG4gIFZpc2liaWxpdHksXG59IGZyb20gXCIuL3R5cGVzXCI7XG5cbmV4cG9ydCBjb25zdCBNQVhfUFJPRklMRVMgPSAxMDtcblxuZXhwb3J0IHR5cGUgUmVwb0dldFJlc3VsdCA9XG4gIHwgeyBvazogdHJ1ZTsgdmFsdWU6IEJ1ZGdldCB9XG4gIHwgeyBvazogZmFsc2U7IGVycm9yOiBcIk5vdCBmb3VuZC5cIiB9O1xuXG5leHBvcnQgaW50ZXJmYWNlIEFwcFJlcG8ge1xuICBwcm9maWxlQ291bnQoKTogUHJvbWlzZTxudW1iZXI+O1xuICBnZXRQcm9maWxlKGlkOiBzdHJpbmcpOiBQcm9taXNlPFVzZXJQcm9maWxlIHwgbnVsbD47XG4gIHNhdmVQcm9maWxlKHByb2ZpbGU6IFVzZXJQcm9maWxlKTogUHJvbWlzZTx2b2lkPjtcbiAgbGlzdFByb2ZpbGVzKCk6IFByb21pc2U8VXNlclByb2ZpbGVbXT47XG4gIHJlbW92ZVByb2ZpbGUoaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG4gIGJ1ZGdldENvdW50KCk6IFByb21pc2U8bnVtYmVyPjtcbiAgZ2V0QnVkZ2V0RG9jKGlkOiBzdHJpbmcpOiBQcm9taXNlPEJ1ZGdldCB8IG51bGw+O1xuICBzYXZlQnVkZ2V0KGJ1ZGdldDogQnVkZ2V0KTogUHJvbWlzZTx2b2lkPjtcbiAgcmVtb3ZlQnVkZ2V0KGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuICBsaXN0QnVkZ2V0RG9jcygpOiBQcm9taXNlPEJ1ZGdldFtdPjtcbn1cblxuZnVuY3Rpb24gY2xvbmVCdWRnZXQoYnVkZ2V0OiBCdWRnZXQpOiBCdWRnZXQge1xuICByZXR1cm4gc3RydWN0dXJlZENsb25lKGJ1ZGdldCk7XG59XG5cbmZ1bmN0aW9uIGNsb25lUHJvZmlsZShwcm9maWxlOiBVc2VyUHJvZmlsZSk6IFVzZXJQcm9maWxlIHtcbiAgcmV0dXJuIHsgLi4ucHJvZmlsZSB9O1xufVxuXG5leHBvcnQgY2xhc3MgTWVtb3J5UmVwbyBpbXBsZW1lbnRzIEFwcFJlcG8ge1xuICBwcml2YXRlIHJlYWRvbmx5IHByb2ZpbGVzID0gbmV3IE1hcDxzdHJpbmcsIFVzZXJQcm9maWxlPigpO1xuICBwcml2YXRlIHJlYWRvbmx5IGJ1ZGdldHMgPSBuZXcgTWFwPHN0cmluZywgQnVkZ2V0PigpO1xuICBzYXZlQnVkZ2V0Q2FsbHMgPSAwO1xuXG4gIGFzeW5jIHByb2ZpbGVDb3VudCgpOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIHJldHVybiB0aGlzLnByb2ZpbGVzLnNpemU7XG4gIH1cblxuICBhc3luYyBnZXRQcm9maWxlKGlkOiBzdHJpbmcpOiBQcm9taXNlPFVzZXJQcm9maWxlIHwgbnVsbD4ge1xuICAgIGNvbnN0IGZvdW5kID0gdGhpcy5wcm9maWxlcy5nZXQoaWQpO1xuICAgIHJldHVybiBmb3VuZCA9PT0gdW5kZWZpbmVkID8gbnVsbCA6IGNsb25lUHJvZmlsZShmb3VuZCk7XG4gIH1cblxuICBhc3luYyBzYXZlUHJvZmlsZShwcm9maWxlOiBVc2VyUHJvZmlsZSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMucHJvZmlsZXMuc2V0KHByb2ZpbGUuaWQsIGNsb25lUHJvZmlsZShwcm9maWxlKSk7XG4gIH1cblxuICBhc3luYyBsaXN0UHJvZmlsZXMoKTogUHJvbWlzZTxVc2VyUHJvZmlsZVtdPiB7XG4gICAgcmV0dXJuIFsuLi50aGlzLnByb2ZpbGVzLnZhbHVlcygpXS5tYXAoY2xvbmVQcm9maWxlKTtcbiAgfVxuXG4gIGFzeW5jIHJlbW92ZVByb2ZpbGUoaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMucHJvZmlsZXMuZGVsZXRlKGlkKTtcbiAgfVxuXG4gIGFzeW5jIGJ1ZGdldENvdW50KCk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgcmV0dXJuIHRoaXMuYnVkZ2V0cy5zaXplO1xuICB9XG5cbiAgYXN5bmMgZ2V0QnVkZ2V0RG9jKGlkOiBzdHJpbmcpOiBQcm9taXNlPEJ1ZGdldCB8IG51bGw+IHtcbiAgICBjb25zdCBmb3VuZCA9IHRoaXMuYnVkZ2V0cy5nZXQoaWQpO1xuICAgIHJldHVybiBmb3VuZCA9PT0gdW5kZWZpbmVkID8gbnVsbCA6IGNsb25lQnVkZ2V0KGZvdW5kKTtcbiAgfVxuXG4gIGFzeW5jIHNhdmVCdWRnZXQoYnVkZ2V0OiBCdWRnZXQpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0aGlzLnNhdmVCdWRnZXRDYWxscyArPSAxO1xuICAgIHRoaXMuYnVkZ2V0cy5zZXQoYnVkZ2V0LmlkLCBjbG9uZUJ1ZGdldChidWRnZXQpKTtcbiAgfVxuXG4gIGFzeW5jIHJlbW92ZUJ1ZGdldChpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy5idWRnZXRzLmRlbGV0ZShpZCk7XG4gIH1cblxuICBhc3luYyBsaXN0QnVkZ2V0RG9jcygpOiBQcm9taXNlPEJ1ZGdldFtdPiB7XG4gICAgcmV0dXJuIFsuLi50aGlzLmJ1ZGdldHMudmFsdWVzKCldLm1hcChjbG9uZUJ1ZGdldCk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNvcnRQcm9maWxlczxUIGV4dGVuZHMgeyBkaXNwbGF5TmFtZTogc3RyaW5nOyBpZDogc3RyaW5nIH0+KFxuICBwcm9maWxlczogVFtdLFxuKTogVFtdIHtcbiAgcmV0dXJuIFsuLi5wcm9maWxlc10uc29ydCgoYSwgYikgPT4ge1xuICAgIGNvbnN0IG5hbWVDbXAgPSBhLmRpc3BsYXlOYW1lLmxvY2FsZUNvbXBhcmUoYi5kaXNwbGF5TmFtZSwgdW5kZWZpbmVkLCB7XG4gICAgICBzZW5zaXRpdml0eTogXCJiYXNlXCIsXG4gICAgfSk7XG4gICAgaWYgKG5hbWVDbXAgIT09IDApIHtcbiAgICAgIHJldHVybiBuYW1lQ21wO1xuICAgIH1cbiAgICByZXR1cm4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gb3duZXJEaXNwbGF5TmFtZShcbiAgb3duZXJJZDogc3RyaW5nLFxuICBwcm9maWxlczogTWFwPHN0cmluZywgc3RyaW5nPixcbik6IHN0cmluZyB7XG4gIHJldHVybiBwcm9maWxlcy5nZXQob3duZXJJZCkgPz8gXCJcIjtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxpc3RCdWRnZXRTdW1tYXJpZXMoXG4gIHJlcG86IEFwcFJlcG8sXG4gIGFjdG9yOiBBY3Rvcixcbik6IFByb21pc2U8QnVkZ2V0U3VtbWFyeVtdPiB7XG4gIGNvbnN0IFtidWRnZXRzLCBwcm9maWxlc10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgcmVwby5saXN0QnVkZ2V0RG9jcygpLFxuICAgIHJlcG8ubGlzdFByb2ZpbGVzKCksXG4gIF0pO1xuICBjb25zdCBuYW1lcyA9IG5ldyBNYXAoXG4gICAgcHJvZmlsZXMubWFwKChwcm9maWxlKSA9PiBbcHJvZmlsZS5pZCwgcHJvZmlsZS5kaXNwbGF5TmFtZV0pLFxuICApO1xuICBjb25zdCB2aXNpYmxlID0gYnVkZ2V0cy5maWx0ZXIoKGJ1ZGdldCkgPT4gY2FuTGlzdFN1bW1hcnkoYWN0b3IsIGJ1ZGdldCkpO1xuICB2aXNpYmxlLnNvcnQoKGEsIGIpID0+IHtcbiAgICBjb25zdCBuYW1lQ21wID0gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lLCB1bmRlZmluZWQsIHtcbiAgICAgIHNlbnNpdGl2aXR5OiBcImJhc2VcIixcbiAgICB9KTtcbiAgICBpZiAobmFtZUNtcCAhPT0gMCkge1xuICAgICAgcmV0dXJuIG5hbWVDbXA7XG4gICAgfVxuICAgIHJldHVybiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCk7XG4gIH0pO1xuICByZXR1cm4gdmlzaWJsZS5tYXAoKGJ1ZGdldCkgPT4gKHtcbiAgICBpZDogYnVkZ2V0LmlkLFxuICAgIG5hbWU6IGJ1ZGdldC5uYW1lLFxuICAgIG93bmVySWQ6IGJ1ZGdldC5vd25lcklkLFxuICAgIG93bmVyRGlzcGxheU5hbWU6IG93bmVyRGlzcGxheU5hbWUoYnVkZ2V0Lm93bmVySWQsIG5hbWVzKSxcbiAgICB2aXNpYmlsaXR5OiBidWRnZXQudmlzaWJpbGl0eSxcbiAgICBzdGFydERhdGU6IGJ1ZGdldC5zdGFydERhdGUsXG4gICAgZW5kRGF0ZTogYnVkZ2V0LmVuZERhdGUsXG4gICAgdmlld2VyUmVsYXRpb246IHZpZXdlclJlbGF0aW9uKGFjdG9yLCBidWRnZXQpLFxuICB9KSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRCdWRnZXQoXG4gIHJlcG86IEFwcFJlcG8sXG4gIGFjdG9yOiBBY3RvcixcbiAgaWQ6IHN0cmluZyxcbik6IFByb21pc2U8UmVwb0dldFJlc3VsdD4ge1xuICBjb25zdCBidWRnZXQgPSBhd2FpdCByZXBvLmdldEJ1ZGdldERvYyhpZCk7XG4gIGNvbnN0IGFjY2VzcyA9IGRlY2lkZUJ1ZGdldEFjY2VzcyhhY3RvciwgYnVkZ2V0LCBcInJlYWRcIik7XG4gIGlmICghYWNjZXNzLm9rIHx8IGJ1ZGdldCA9PT0gbnVsbCkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiTm90IGZvdW5kLlwiIH07XG4gIH1cbiAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiBidWRnZXQgfTtcbn1cblxuZXhwb3J0IHR5cGUgTmFtZWRJZEZhY3RvcnkgPSAoKSA9PiBzdHJpbmc7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjcmVhdGVCdWRnZXRGb3JBY3RvcihcbiAgcmVwbzogQXBwUmVwbyxcbiAgYWN0b3I6IEFjdG9yLFxuICBpbnB1dDogQ3JlYXRlQnVkZ2V0SW5wdXQsXG4gIGNyZWF0ZUlkOiBOYW1lZElkRmFjdG9yeSxcbik6IFByb21pc2U8eyBvazogdHJ1ZTsgYnVkZ2V0OiBCdWRnZXQgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0+IHtcbiAgY29uc3QgZXhpc3RpbmcgPSBhd2FpdCByZXBvLmxpc3RCdWRnZXREb2NzKCk7XG4gIHJlc2V0U3RvcmUoZXhpc3RpbmcpO1xuICBzZXRQZXJzaXN0KCgpID0+IHt9KTtcbiAgY29uc3QgYmVmb3JlID0gbmV3IFNldChleGlzdGluZy5tYXAoKGJ1ZGdldCkgPT4gYnVkZ2V0LmlkKSk7XG4gIGNvbnN0IGNyZWF0ZWQgPSBjcmVhdGVCdWRnZXQoYWN0b3IsIGlucHV0KTtcbiAgaWYgKCFjcmVhdGVkLm9rKSB7XG4gICAgcmV0dXJuIGNyZWF0ZWQ7XG4gIH1cbiAgY29uc3QgZnJlc2ggPSBsaXN0QnVkZ2V0cygpLmZpbmQoKGJ1ZGdldCkgPT4gIWJlZm9yZS5oYXMoYnVkZ2V0LmlkKSk7XG4gIGlmIChmcmVzaCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJOYW1lIGlzIHJlcXVpcmVkLlwiIH07XG4gIH1cbiAgY29uc3QgYnVkZ2V0ID0geyAuLi5mcmVzaCwgaWQ6IGNyZWF0ZUlkKCkgfTtcbiAgYXdhaXQgcmVwby5zYXZlQnVkZ2V0KGJ1ZGdldCk7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBidWRnZXQgfTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRlbGV0ZUJ1ZGdldEZvckFjdG9yKFxuICByZXBvOiBBcHBSZXBvLFxuICBhY3RvcjogQWN0b3IsXG4gIGlkOiBzdHJpbmcsXG4pOiBQcm9taXNlPHsgb2s6IHRydWUgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0+IHtcbiAgY29uc3QgZXhpc3RpbmcgPSBhd2FpdCByZXBvLmdldEJ1ZGdldERvYyhpZCk7XG4gIGNvbnN0IGFjY2VzcyA9IGRlY2lkZUJ1ZGdldEFjY2VzcyhhY3RvciwgZXhpc3RpbmcsIFwiZGVsZXRlXCIpO1xuICBpZiAoIWFjY2Vzcy5vaykge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGFjY2Vzcy5lcnJvciB9O1xuICB9XG4gIGNvbnN0IGFsbCA9IGF3YWl0IHJlcG8ubGlzdEJ1ZGdldERvY3MoKTtcbiAgcmVzZXRTdG9yZShhbGwpO1xuICBzZXRQZXJzaXN0KCgpID0+IHt9KTtcbiAgY29uc3QgcmVzdWx0ID0gZGVsZXRlQnVkZ2V0KGFjdG9yLCBpZCk7XG4gIGlmICghcmVzdWx0Lm9rKSB7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuICBhd2FpdCByZXBvLnJlbW92ZUJ1ZGdldChpZCk7XG4gIHJldHVybiB7IG9rOiB0cnVlIH07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb3B5QnVkZ2V0Rm9yQWN0b3IoXG4gIHJlcG86IEFwcFJlcG8sXG4gIGFjdG9yOiBBY3RvcixcbiAgaWQ6IHN0cmluZyxcbik6IFByb21pc2U8eyBvazogdHJ1ZTsgYnVkZ2V0OiBCdWRnZXQgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0+IHtcbiAgY29uc3Qgc291cmNlID0gYXdhaXQgcmVwby5nZXRCdWRnZXREb2MoaWQpO1xuICBjb25zdCByZWFkYWJsZSA9IGRlY2lkZUJ1ZGdldEFjY2VzcyhhY3Rvciwgc291cmNlLCBcInJlYWRcIik7XG4gIGlmICghcmVhZGFibGUub2spIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiByZWFkYWJsZS5lcnJvciB9O1xuICB9XG4gIGNvbnN0IGFsbCA9IGF3YWl0IHJlcG8ubGlzdEJ1ZGdldERvY3MoKTtcbiAgcmVzZXRTdG9yZShhbGwpO1xuICBzZXRQZXJzaXN0KCgpID0+IHt9KTtcbiAgY29uc3QgYmVmb3JlID0gbmV3IFNldChhbGwubWFwKChidWRnZXQpID0+IGJ1ZGdldC5pZCkpO1xuICBjb25zdCByZXN1bHQgPSBjb3B5QnVkZ2V0KGFjdG9yLCBpZCk7XG4gIGlmICghcmVzdWx0Lm9rKSB7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuICBjb25zdCBjb3B5ID0gbGlzdEJ1ZGdldHMoKS5maW5kKChidWRnZXQpID0+ICFiZWZvcmUuaGFzKGJ1ZGdldC5pZCkpO1xuICBpZiAoY29weSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJOb3QgZm91bmQuXCIgfTtcbiAgfVxuICBhd2FpdCByZXBvLnNhdmVCdWRnZXQoY29weSk7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBidWRnZXQ6IGNvcHkgfTtcbn1cblxuY29uc3QgR1JBTlRfUk9MRVM6IHJlYWRvbmx5IEdyYW50Um9sZVtdID0gW1wic2VlXCIsIFwiYnJvd3NlXCIsIFwiZWRpdFwiXTtcblxuZXhwb3J0IGZ1bmN0aW9uIGlzVmFsaWRWaXNpYmlsaXR5KHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgVmlzaWJpbGl0eSB7XG4gIHJldHVybiB2YWx1ZSA9PT0gXCJwdWJsaWNcIiB8fCB2YWx1ZSA9PT0gXCJoaWRkZW5cIjtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldFZpc2liaWxpdHlGb3JBY3RvcihcbiAgcmVwbzogQXBwUmVwbyxcbiAgYWN0b3I6IEFjdG9yLFxuICBpZDogc3RyaW5nLFxuICB2aXNpYmlsaXR5OiBWaXNpYmlsaXR5LFxuKTogUHJvbWlzZTx7IG9rOiB0cnVlOyBidWRnZXQ6IEJ1ZGdldCB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmc7IHN0YXR1czogbnVtYmVyIH0+IHtcbiAgY29uc3QgYnVkZ2V0ID0gYXdhaXQgcmVwby5nZXRCdWRnZXREb2MoaWQpO1xuICBjb25zdCBhY2Nlc3MgPSBkZWNpZGVCdWRnZXRBY2Nlc3MoYWN0b3IsIGJ1ZGdldCwgXCJzaGFyZVwiKTtcbiAgaWYgKCFhY2Nlc3Mub2sgfHwgYnVkZ2V0ID09PSBudWxsKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIGVycm9yOiBhY2Nlc3Mub2sgPyBcIk5vdCBmb3VuZC5cIiA6IGFjY2Vzcy5lcnJvcixcbiAgICAgIHN0YXR1czogYWNjZXNzLm9rID8gNDA0IDogYWNjZXNzLnN0YXR1cyxcbiAgICB9O1xuICB9XG4gIGNvbnN0IG5leHQgPSB7IC4uLmJ1ZGdldCwgdmlzaWJpbGl0eSB9O1xuICBhd2FpdCByZXBvLnNhdmVCdWRnZXQobmV4dCk7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBidWRnZXQ6IG5leHQgfTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldEdyYW50c0ZvckFjdG9yKFxuICByZXBvOiBBcHBSZXBvLFxuICBhY3RvcjogQWN0b3IsXG4gIGlkOiBzdHJpbmcsXG4gIGdyYW50czogR3JhbnRbXSxcbik6IFByb21pc2U8eyBvazogdHJ1ZTsgYnVkZ2V0OiBCdWRnZXQgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nOyBzdGF0dXM6IG51bWJlciB9PiB7XG4gIGNvbnN0IGJ1ZGdldCA9IGF3YWl0IHJlcG8uZ2V0QnVkZ2V0RG9jKGlkKTtcbiAgY29uc3QgYWNjZXNzID0gZGVjaWRlQnVkZ2V0QWNjZXNzKGFjdG9yLCBidWRnZXQsIFwic2hhcmVcIik7XG4gIGlmICghYWNjZXNzLm9rIHx8IGJ1ZGdldCA9PT0gbnVsbCkge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICBlcnJvcjogYWNjZXNzLm9rID8gXCJOb3QgZm91bmQuXCIgOiBhY2Nlc3MuZXJyb3IsXG4gICAgICBzdGF0dXM6IGFjY2Vzcy5vayA/IDQwNCA6IGFjY2Vzcy5zdGF0dXMsXG4gICAgfTtcbiAgfVxuICBjb25zdCBwcm9maWxlcyA9IGF3YWl0IHJlcG8ubGlzdFByb2ZpbGVzKCk7XG4gIGNvbnN0IGlkcyA9IG5ldyBTZXQocHJvZmlsZXMubWFwKChwcm9maWxlKSA9PiBwcm9maWxlLmlkKSk7XG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCBncmFudCBvZiBncmFudHMpIHtcbiAgICBpZiAoIUdSQU5UX1JPTEVTLmluY2x1ZGVzKGdyYW50LnJvbGUpKSB7XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgZ3JhbnQuXCIsIHN0YXR1czogNDAwIH07XG4gICAgfVxuICAgIGlmIChncmFudC51c2VySWQudHJpbSgpID09PSBcIlwiIHx8ICFpZHMuaGFzKGdyYW50LnVzZXJJZCkpIHtcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBncmFudC5cIiwgc3RhdHVzOiA0MDAgfTtcbiAgICB9XG4gICAgaWYgKGdyYW50LnVzZXJJZCA9PT0gYnVkZ2V0Lm93bmVySWQpIHtcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBncmFudC5cIiwgc3RhdHVzOiA0MDAgfTtcbiAgICB9XG4gICAgaWYgKHNlZW4uaGFzKGdyYW50LnVzZXJJZCkpIHtcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBncmFudC5cIiwgc3RhdHVzOiA0MDAgfTtcbiAgICB9XG4gICAgc2Vlbi5hZGQoZ3JhbnQudXNlcklkKTtcbiAgfVxuICBjb25zdCBuZXh0ID0geyAuLi5idWRnZXQsIGdyYW50czogZ3JhbnRzLm1hcCgoZ3JhbnQpID0+ICh7IC4uLmdyYW50IH0pKSB9O1xuICBhd2FpdCByZXBvLnNhdmVCdWRnZXQobmV4dCk7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBidWRnZXQ6IG5leHQgfTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNhdmVXcml0YWJsZUJ1ZGdldChcbiAgcmVwbzogQXBwUmVwbyxcbiAgYWN0b3I6IEFjdG9yLFxuICBpZDogc3RyaW5nLFxuICBidWRnZXQ6IEJ1ZGdldCxcbik6IFByb21pc2U8eyBvazogdHJ1ZTsgYnVkZ2V0OiBCdWRnZXQgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nOyBzdGF0dXM6IG51bWJlciB9PiB7XG4gIGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgcmVwby5nZXRCdWRnZXREb2MoaWQpO1xuICBjb25zdCBhY2Nlc3MgPSBkZWNpZGVCdWRnZXRBY2Nlc3MoYWN0b3IsIGV4aXN0aW5nLCBcIndyaXRlXCIpO1xuICBpZiAoIWFjY2Vzcy5vayB8fCBleGlzdGluZyA9PT0gbnVsbCkge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICBlcnJvcjogYWNjZXNzLm9rID8gXCJOb3QgZm91bmQuXCIgOiBhY2Nlc3MuZXJyb3IsXG4gICAgICBzdGF0dXM6IGFjY2Vzcy5vayA/IDQwNCA6IGFjY2Vzcy5zdGF0dXMsXG4gICAgfTtcbiAgfVxuICBjb25zdCBuZXh0OiBCdWRnZXQgPSB7XG4gICAgLi4uYnVkZ2V0LFxuICAgIGlkOiBleGlzdGluZy5pZCxcbiAgICBvd25lcklkOiBleGlzdGluZy5vd25lcklkLFxuICAgIHZpc2liaWxpdHk6IGV4aXN0aW5nLnZpc2liaWxpdHksXG4gICAgZ3JhbnRzOiBleGlzdGluZy5ncmFudHMsXG4gIH07XG4gIGF3YWl0IHJlcG8uc2F2ZUJ1ZGdldChuZXh0KTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIGJ1ZGdldDogbmV4dCB9O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZGVsZXRlSG91c2Vob2xkVXNlcihcbiAgcmVwbzogQXBwUmVwbyxcbiAgYWN0b3I6IEFjdG9yLFxuICBpZDogc3RyaW5nLFxuICBtb2RlcmF0b3JFbWFpbDogc3RyaW5nLFxuICBkZWxldGVBdXRoVXNlcjogKHVpZDogc3RyaW5nKSA9PiBQcm9taXNlPHZvaWQ+LFxuKTogUHJvbWlzZTx7IG9rOiB0cnVlIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZzsgc3RhdHVzOiBudW1iZXIgfT4ge1xuICBpZiAoIWFjdG9yLmlzTW9kZXJhdG9yKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJOb3QgYWxsb3dlZC5cIiwgc3RhdHVzOiA0MDMgfTtcbiAgfVxuICBjb25zdCBleGlzdGluZyA9IGF3YWl0IHJlcG8uZ2V0UHJvZmlsZShpZCk7XG4gIGlmIChleGlzdGluZyA9PT0gbnVsbCkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiTm90IGZvdW5kLlwiLCBzdGF0dXM6IDQwNCB9O1xuICB9XG4gIGlmIChcbiAgICBpZCA9PT0gYWN0b3IucHJvZmlsZS5pZCB8fFxuICAgIGlzTW9kZXJhdG9yRW1haWwoZXhpc3RpbmcuZW1haWwsIG1vZGVyYXRvckVtYWlsKVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIk5vdCBhbGxvd2VkLlwiLCBzdGF0dXM6IDQwMyB9O1xuICB9XG4gIGNvbnN0IGJ1ZGdldHMgPSBhd2FpdCByZXBvLmxpc3RCdWRnZXREb2NzKCk7XG4gIGZvciAoY29uc3QgYnVkZ2V0IG9mIGJ1ZGdldHMpIHtcbiAgICBpZiAoYnVkZ2V0Lm93bmVySWQgPT09IGlkKSB7XG4gICAgICBhd2FpdCByZXBvLnJlbW92ZUJ1ZGdldChidWRnZXQuaWQpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IGdyYW50cyA9IGJ1ZGdldC5ncmFudHMuZmlsdGVyKChncmFudCkgPT4gZ3JhbnQudXNlcklkICE9PSBpZCk7XG4gICAgaWYgKGdyYW50cy5sZW5ndGggIT09IGJ1ZGdldC5ncmFudHMubGVuZ3RoKSB7XG4gICAgICBhd2FpdCByZXBvLnNhdmVCdWRnZXQoeyAuLi5idWRnZXQsIGdyYW50cyB9KTtcbiAgICB9XG4gIH1cbiAgYXdhaXQgcmVwby5yZW1vdmVQcm9maWxlKGlkKTtcbiAgYXdhaXQgZGVsZXRlQXV0aFVzZXIoaWQpO1xuICByZXR1cm4geyBvazogdHJ1ZSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGlyZWN0b3J5VXNlcihwcm9maWxlOiBVc2VyUHJvZmlsZSk6IHtcbiAgaWQ6IHN0cmluZztcbiAgZW1haWw6IHN0cmluZztcbiAgZGlzcGxheU5hbWU6IHN0cmluZztcbn0ge1xuICByZXR1cm4ge1xuICAgIGlkOiBwcm9maWxlLmlkLFxuICAgIGVtYWlsOiBwcm9maWxlLmVtYWlsLFxuICAgIGRpc3BsYXlOYW1lOiBwcm9maWxlLmRpc3BsYXlOYW1lLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWVQYXlsb2FkKFxuICBwcm9maWxlOiBVc2VyUHJvZmlsZSxcbiAgaXNNb2RlcmF0b3I6IGJvb2xlYW4sXG4pOiBVc2VyUHJvZmlsZSAmIHsgaXNNb2RlcmF0b3I6IGJvb2xlYW47IGNhblVzZUZyb21UZXh0OiBib29sZWFuIH0ge1xuICByZXR1cm4ge1xuICAgIC4uLnByb2ZpbGUsXG4gICAgaXNNb2RlcmF0b3IsXG4gICAgY2FuVXNlRnJvbVRleHQ6IGlzTW9kZXJhdG9yIHx8IHByb2ZpbGUuY2FuVXNlRnJvbVRleHQsXG4gIH07XG59XG4iLCAiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyYy9maXJlc3RvcmVSZXBvLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjL2ZpcmVzdG9yZVJlcG8udHNcIjtpbXBvcnQgdHlwZSB7IEZpcmVzdG9yZSB9IGZyb20gXCJmaXJlYmFzZS1hZG1pbi9maXJlc3RvcmVcIjtcbmltcG9ydCB0eXBlIHsgQXBwUmVwbyB9IGZyb20gXCIuL3JlcG9cIjtcbmltcG9ydCB0eXBlIHsgQnVkZ2V0LCBVc2VyUHJvZmlsZSB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbmV4cG9ydCBjbGFzcyBGaXJlc3RvcmVSZXBvIGltcGxlbWVudHMgQXBwUmVwbyB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgZGI6IEZpcmVzdG9yZSkge31cblxuICBwcml2YXRlIHVzZXJzKCkge1xuICAgIHJldHVybiB0aGlzLmRiLmNvbGxlY3Rpb24oXCJ1c2Vyc1wiKTtcbiAgfVxuXG4gIHByaXZhdGUgYnVkZ2V0c0NvbCgpIHtcbiAgICByZXR1cm4gdGhpcy5kYi5jb2xsZWN0aW9uKFwiYnVkZ2V0c1wiKTtcbiAgfVxuXG4gIGFzeW5jIHByb2ZpbGVDb3VudCgpOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIGNvbnN0IHNuYXAgPSBhd2FpdCB0aGlzLnVzZXJzKCkuY291bnQoKS5nZXQoKTtcbiAgICByZXR1cm4gc25hcC5kYXRhKCkuY291bnQ7XG4gIH1cblxuICBhc3luYyBnZXRQcm9maWxlKGlkOiBzdHJpbmcpOiBQcm9taXNlPFVzZXJQcm9maWxlIHwgbnVsbD4ge1xuICAgIGNvbnN0IHNuYXAgPSBhd2FpdCB0aGlzLnVzZXJzKCkuZG9jKGlkKS5nZXQoKTtcbiAgICBpZiAoIXNuYXAuZXhpc3RzKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIHNuYXAuZGF0YSgpIGFzIFVzZXJQcm9maWxlO1xuICB9XG5cbiAgYXN5bmMgc2F2ZVByb2ZpbGUocHJvZmlsZTogVXNlclByb2ZpbGUpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCB0aGlzLnVzZXJzKCkuZG9jKHByb2ZpbGUuaWQpLnNldChwcm9maWxlKTtcbiAgfVxuXG4gIGFzeW5jIGxpc3RQcm9maWxlcygpOiBQcm9taXNlPFVzZXJQcm9maWxlW10+IHtcbiAgICBjb25zdCBzbmFwID0gYXdhaXQgdGhpcy51c2VycygpLmdldCgpO1xuICAgIHJldHVybiBzbmFwLmRvY3MubWFwKChkb2MpID0+IGRvYy5kYXRhKCkgYXMgVXNlclByb2ZpbGUpO1xuICB9XG5cbiAgYXN5bmMgcmVtb3ZlUHJvZmlsZShpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy51c2VycygpLmRvYyhpZCkuZGVsZXRlKCk7XG4gIH1cblxuICBhc3luYyBidWRnZXRDb3VudCgpOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIGNvbnN0IHNuYXAgPSBhd2FpdCB0aGlzLmJ1ZGdldHNDb2woKS5jb3VudCgpLmdldCgpO1xuICAgIHJldHVybiBzbmFwLmRhdGEoKS5jb3VudDtcbiAgfVxuXG4gIGFzeW5jIGdldEJ1ZGdldERvYyhpZDogc3RyaW5nKTogUHJvbWlzZTxCdWRnZXQgfCBudWxsPiB7XG4gICAgY29uc3Qgc25hcCA9IGF3YWl0IHRoaXMuYnVkZ2V0c0NvbCgpLmRvYyhpZCkuZ2V0KCk7XG4gICAgaWYgKCFzbmFwLmV4aXN0cykge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiBzbmFwLmRhdGEoKSBhcyBCdWRnZXQ7XG4gIH1cblxuICBhc3luYyBzYXZlQnVkZ2V0KGJ1ZGdldDogQnVkZ2V0KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5idWRnZXRzQ29sKCkuZG9jKGJ1ZGdldC5pZCkuc2V0KGJ1ZGdldCk7XG4gIH1cblxuICBhc3luYyByZW1vdmVCdWRnZXQoaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMuYnVkZ2V0c0NvbCgpLmRvYyhpZCkuZGVsZXRlKCk7XG4gIH1cblxuICBhc3luYyBsaXN0QnVkZ2V0RG9jcygpOiBQcm9taXNlPEJ1ZGdldFtdPiB7XG4gICAgY29uc3Qgc25hcCA9IGF3YWl0IHRoaXMuYnVkZ2V0c0NvbCgpLmdldCgpO1xuICAgIHJldHVybiBzbmFwLmRvY3MubWFwKChkb2MpID0+IGRvYy5kYXRhKCkgYXMgQnVkZ2V0KTtcbiAgfVxufVxuIiwgImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyY1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL2hvbWUvcm9nZXIvR2l0SHViL25leHRwYXRoLWJ1ZGdldGFwcC9zcmMvc2VjcmV0cy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyYy9zZWNyZXRzLnRzXCI7LyoqIExvY2FsIGAuZW52YCBvciBDbG91ZCBSdW4gU2VjcmV0IE1hbmFnZXIgXHUyMTkyIHByb2Nlc3MgZW52LiBOZXZlciBiYWtlIGludG8gdGhlIGltYWdlLiAqL1xuXG5leHBvcnQgZnVuY3Rpb24gcmVhZEdlbWluaUFwaUtleSgpOiBzdHJpbmcge1xuICByZXR1cm4gcHJvY2Vzcy5lbnYuR0VNSU5JX0FQSV9LRVkgPz8gXCJcIjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlYWRNb2RlcmF0b3JFbWFpbCgpOiBzdHJpbmcge1xuICByZXR1cm4gcHJvY2Vzcy5lbnYuTU9ERVJBVE9SX0VNQUlMID8/IFwiXCI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkRmlyZWJhc2VXZWJDb25maWcoKToge1xuICBhcGlLZXk6IHN0cmluZztcbiAgYXV0aERvbWFpbjogc3RyaW5nO1xuICBwcm9qZWN0SWQ6IHN0cmluZztcbn0ge1xuICByZXR1cm4ge1xuICAgIGFwaUtleTogcHJvY2Vzcy5lbnYuRklSRUJBU0VfV0VCX0FQSV9LRVkgPz8gXCJcIixcbiAgICBhdXRoRG9tYWluOiBwcm9jZXNzLmVudi5GSVJFQkFTRV9XRUJfQVVUSF9ET01BSU4gPz8gXCJcIixcbiAgICBwcm9qZWN0SWQ6IHByb2Nlc3MuZW52LkZJUkVCQVNFX1dFQl9QUk9KRUNUX0lEID8/IFwiXCIsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkRmlyZWJhc2VBdXRoRW11bGF0b3JIb3N0KCk6IHN0cmluZyB7XG4gIHJldHVybiBwcm9jZXNzLmVudi5GSVJFQkFTRV9BVVRIX0VNVUxBVE9SX0hPU1QgPz8gXCJcIjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBlcnNpc3RBZGFwdGVyTmFtZSgpOiBcImZpcmVzdG9yZVwiIHwgXCJtZW1vcnlcIiB7XG4gIHJldHVybiBwcm9jZXNzLmVudi5CVURHRVRBUFBfTUVNT1JZX1JFUE8gPT09IFwiMVwiID8gXCJtZW1vcnlcIiA6IFwiZmlyZXN0b3JlXCI7XG59XG4iLCAiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyYy9maXJlYmFzZUFkbWluLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjL2ZpcmViYXNlQWRtaW4udHNcIjtpbXBvcnQgeyBhcHBsaWNhdGlvbkRlZmF1bHQsIGdldEFwcHMsIGluaXRpYWxpemVBcHAgfSBmcm9tIFwiZmlyZWJhc2UtYWRtaW4vYXBwXCI7XG5pbXBvcnQgeyBnZXRBdXRoIH0gZnJvbSBcImZpcmViYXNlLWFkbWluL2F1dGhcIjtcbmltcG9ydCB7IGdldEZpcmVzdG9yZSB9IGZyb20gXCJmaXJlYmFzZS1hZG1pbi9maXJlc3RvcmVcIjtcbmltcG9ydCB7IEZpcmVzdG9yZVJlcG8gfSBmcm9tIFwiLi9maXJlc3RvcmVSZXBvXCI7XG5pbXBvcnQgeyBNZW1vcnlSZXBvLCB0eXBlIEFwcFJlcG8gfSBmcm9tIFwiLi9yZXBvXCI7XG5pbXBvcnQgeyBwZXJzaXN0QWRhcHRlck5hbWUgfSBmcm9tIFwiLi9zZWNyZXRzXCI7XG5cbmV4cG9ydCB0eXBlIFZlcmlmaWVkVG9rZW4gPSB7IHVpZDogc3RyaW5nOyBlbWFpbD86IHN0cmluZyB9O1xuXG5leHBvcnQgZnVuY3Rpb24gZmlyZWJhc2VQcm9qZWN0SWQoKTogc3RyaW5nIHtcbiAgcmV0dXJuIChcbiAgICBwcm9jZXNzLmVudi5HQ0xPVURfUFJPSkVDVCA/P1xuICAgIHByb2Nlc3MuZW52LkdPT0dMRV9DTE9VRF9QUk9KRUNUID8/XG4gICAgcHJvY2Vzcy5lbnYuRklSRUJBU0VfUFJPSkVDVF9JRCA/P1xuICAgIHByb2Nlc3MuZW52LkZJUkVCQVNFX1dFQl9QUk9KRUNUX0lEID8/XG4gICAgXCJidWRnZXRhcHAtbG9jYWxcIlxuICApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdEZpcmViYXNlQWRtaW4oKTogdm9pZCB7XG4gIGlmIChnZXRBcHBzKCkubGVuZ3RoID4gMCkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBwcm9qZWN0SWQgPSBmaXJlYmFzZVByb2plY3RJZCgpO1xuICBpZiAoXG4gICAgcHJvY2Vzcy5lbnYuRklSRVNUT1JFX0VNVUxBVE9SX0hPU1QgIT09IHVuZGVmaW5lZCAmJlxuICAgIHByb2Nlc3MuZW52LkZJUkVTVE9SRV9FTVVMQVRPUl9IT1NUICE9PSBcIlwiXG4gICkge1xuICAgIGluaXRpYWxpemVBcHAoeyBwcm9qZWN0SWQgfSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGluaXRpYWxpemVBcHAoe1xuICAgIHByb2plY3RJZCxcbiAgICBjcmVkZW50aWFsOiBhcHBsaWNhdGlvbkRlZmF1bHQoKSxcbiAgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB2ZXJpZnlJZFRva2VuKHRva2VuOiBzdHJpbmcpOiBQcm9taXNlPFZlcmlmaWVkVG9rZW4+IHtcbiAgaW5pdEZpcmViYXNlQWRtaW4oKTtcbiAgY29uc3QgZGVjb2RlZCA9IGF3YWl0IGdldEF1dGgoKS52ZXJpZnlJZFRva2VuKHRva2VuKTtcbiAgcmV0dXJuIHsgdWlkOiBkZWNvZGVkLnVpZCwgZW1haWw6IGRlY29kZWQuZW1haWwgfTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRlbGV0ZUF1dGhVc2VyKHVpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gIGluaXRGaXJlYmFzZUFkbWluKCk7XG4gIGF3YWl0IGdldEF1dGgoKS5kZWxldGVVc2VyKHVpZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBcHBSZXBvKCk6IEFwcFJlcG8ge1xuICBpZiAocGVyc2lzdEFkYXB0ZXJOYW1lKCkgPT09IFwibWVtb3J5XCIpIHtcbiAgICByZXR1cm4gbmV3IE1lbW9yeVJlcG8oKTtcbiAgfVxuICBpbml0RmlyZWJhc2VBZG1pbigpO1xuICByZXR1cm4gbmV3IEZpcmVzdG9yZVJlcG8oZ2V0RmlyZXN0b3JlKCkpO1xufVxuIiwgImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgdHlwZSB7IEluY29taW5nTWVzc2FnZSwgU2VydmVyUmVzcG9uc2UgfSBmcm9tIFwibm9kZTpodHRwXCI7XG5pbXBvcnQgcmVhY3QgZnJvbSBcIkB2aXRlanMvcGx1Z2luLXJlYWN0XCI7XG5pbXBvcnQgeyBsb2FkRW52IH0gZnJvbSBcInZpdGVcIjtcbmltcG9ydCB7IGRlZmluZUNvbmZpZywgdHlwZSBQbHVnaW4gfSBmcm9tIFwidml0ZXN0L2NvbmZpZ1wiO1xuaW1wb3J0IHsgYXBwbHlFbnZGaWxlIH0gZnJvbSBcIi4vc3JjL2VudkZpbGVcIjtcbmltcG9ydCB7IEFnZW50TWVtb3J5U3RvcmUgfSBmcm9tIFwiLi9zcmMvYWdlbnRNZW1vcnlcIjtcbmltcG9ydCB7IGRpc3BhdGNoSHR0cFJlcXVlc3QgfSBmcm9tIFwiLi9zcmMvaHR0cERpc3BhdGNoXCI7XG5pbXBvcnQgeyBNQVhfUkVRVUVTVF9CWVRFUyB9IGZyb20gXCIuL3NyYy9zZXJ2ZXJBY2Nlc3NcIjtcbmltcG9ydCB7IGlzTW9kZXJhdG9yRW1haWwgfSBmcm9tIFwiLi9zcmMvYWNsXCI7XG5pbXBvcnQgeyBtaWdyYXRlSnNvbklmTmVlZGVkIH0gZnJvbSBcIi4vc3JjL21pZ3JhdGVcIjtcbmltcG9ydCB7IEFQUF9CVURHRVRTX0ZJTEUgfSBmcm9tIFwiLi9zcmMvcGF0aHNcIjtcbmltcG9ydCB0eXBlIHsgQXBwUmVwbyB9IGZyb20gXCIuL3NyYy9yZXBvXCI7XG5cbmZ1bmN0aW9uIHJlYWRCb2R5KHJlcTogSW5jb21pbmdNZXNzYWdlKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCBjaHVua3M6IEJ1ZmZlcltdID0gW107XG4gICAgbGV0IHNpemUgPSAwO1xuICAgIGxldCBzZXR0bGVkID0gZmFsc2U7XG4gICAgcmVxLm9uKFwiZGF0YVwiLCAoY2h1bms6IEJ1ZmZlcikgPT4ge1xuICAgICAgc2l6ZSArPSBjaHVuay5sZW5ndGg7XG4gICAgICBpZiAoc2l6ZSA+IE1BWF9SRVFVRVNUX0JZVEVTKSB7XG4gICAgICAgIGlmICghc2V0dGxlZCkge1xuICAgICAgICAgIHNldHRsZWQgPSB0cnVlO1xuICAgICAgICAgIHJlc29sdmUoXCJ4XCIucmVwZWF0KE1BWF9SRVFVRVNUX0JZVEVTICsgMSkpO1xuICAgICAgICB9XG4gICAgICAgIHJlcS5yZXN1bWUoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY2h1bmtzLnB1c2goY2h1bmspO1xuICAgIH0pO1xuICAgIHJlcS5vbihcImVuZFwiLCAoKSA9PiB7XG4gICAgICBpZiAoIXNldHRsZWQpIHtcbiAgICAgICAgc2V0dGxlZCA9IHRydWU7XG4gICAgICAgIHJlc29sdmUoQnVmZmVyLmNvbmNhdChjaHVua3MpLnRvU3RyaW5nKFwidXRmOFwiKSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmVxLm9uKFwiZXJyb3JcIiwgcmVqZWN0KTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHN0b3JlQXBpUGx1Z2luKCk6IFBsdWdpbiB7XG4gIGxldCByZXBvOiBBcHBSZXBvIHwgdW5kZWZpbmVkO1xuICBjb25zdCBhZ2VudE1lbW9yeSA9IG5ldyBBZ2VudE1lbW9yeVN0b3JlKCk7XG4gIGxldCBtaWdyYXRlZCA9IGZhbHNlO1xuICByZXR1cm4ge1xuICAgIG5hbWU6IFwiYnVkZ2V0LXN0b3JlLWFwaVwiLFxuICAgIGNvbmZpZ3VyZVNlcnZlcihzZXJ2ZXIpIHtcbiAgICAgIGFwcGx5RW52RmlsZSgpO1xuICAgICAgc2VydmVyLm1pZGRsZXdhcmVzLnVzZSgocmVxLCByZXMsIG5leHQpID0+IHtcbiAgICAgICAgY29uc3QgcGF0aG5hbWUgPSByZXEudXJsPy5zcGxpdChcIj9cIilbMF0gPz8gXCJcIjtcbiAgICAgICAgaWYgKCFwYXRobmFtZS5zdGFydHNXaXRoKFwiL2FwaS9cIikpIHtcbiAgICAgICAgICBuZXh0KCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZvaWQgKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBhcHBseUVudkZpbGUocHJvY2Vzcy5jd2QoKSwgeyBvdmVyd3JpdGU6IHRydWUgfSk7XG4gICAgICAgICAgY29uc3QgZW52ID0gbG9hZEVudihzZXJ2ZXIuY29uZmlnLm1vZGUsIHByb2Nlc3MuY3dkKCksIFwiXCIpO1xuICAgICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGVudikpIHtcbiAgICAgICAgICAgIGlmIChwcm9jZXNzLmVudltrZXldID09PSB1bmRlZmluZWQgfHwgcHJvY2Vzcy5lbnZba2V5XSA9PT0gXCJcIikge1xuICAgICAgICAgICAgICBwcm9jZXNzLmVudltrZXldID0gdmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHsgY3JlYXRlQXBwUmVwbywgZGVsZXRlQXV0aFVzZXIsIHZlcmlmeUlkVG9rZW4gfSA9IGF3YWl0IGltcG9ydChcbiAgICAgICAgICAgIFwiLi9zcmMvZmlyZWJhc2VBZG1pblwiXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAocmVwbyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXBvID0gY3JlYXRlQXBwUmVwbygpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIW1pZ3JhdGVkKSB7XG4gICAgICAgICAgICBtaWdyYXRlZCA9IHRydWU7XG4gICAgICAgICAgICBjb25zdCBwcm9maWxlcyA9IGF3YWl0IHJlcG8ubGlzdFByb2ZpbGVzKCk7XG4gICAgICAgICAgICBjb25zdCBtb2RlcmF0b3IgPSBwcm9maWxlcy5maW5kKChwcm9maWxlKSA9PlxuICAgICAgICAgICAgICBpc01vZGVyYXRvckVtYWlsKHByb2ZpbGUuZW1haWwsIHByb2Nlc3MuZW52Lk1PREVSQVRPUl9FTUFJTCA/PyBcIlwiKSxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAobW9kZXJhdG9yICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgYXdhaXQgbWlncmF0ZUpzb25JZk5lZWRlZChyZXBvLCBBUFBfQlVER0VUU19GSUxFLCBtb2RlcmF0b3IuaWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBib2R5ID0gYXdhaXQgcmVhZEJvZHkocmVxIGFzIEluY29taW5nTWVzc2FnZSk7XG4gICAgICAgICAgY29uc3QgaW5jb21pbmcgPSByZXEgYXMgSW5jb21pbmdNZXNzYWdlO1xuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRpc3BhdGNoSHR0cFJlcXVlc3Qoe1xuICAgICAgICAgICAgbWV0aG9kOiByZXEubWV0aG9kID8/IFwiR0VUXCIsXG4gICAgICAgICAgICBwYXRobmFtZSxcbiAgICAgICAgICAgIGJvZHksXG4gICAgICAgICAgICBhdXRob3JpemF0aW9uOiBpbmNvbWluZy5oZWFkZXJzLmF1dGhvcml6YXRpb24sXG4gICAgICAgICAgICBnZW1pbmlBcGlLZXk6IHByb2Nlc3MuZW52LkdFTUlOSV9BUElfS0VZID8/IFwiXCIsXG4gICAgICAgICAgICBkaXN0RGlyOiBcIlwiLFxuICAgICAgICAgICAgcmVwbyxcbiAgICAgICAgICAgIG1vZGVyYXRvckVtYWlsOiBwcm9jZXNzLmVudi5NT0RFUkFUT1JfRU1BSUwgPz8gXCJcIixcbiAgICAgICAgICAgIGZpcmViYXNlV2ViQXBpS2V5OiBwcm9jZXNzLmVudi5GSVJFQkFTRV9XRUJfQVBJX0tFWSA/PyBcIlwiLFxuICAgICAgICAgICAgZmlyZWJhc2VXZWJBdXRoRG9tYWluOiBwcm9jZXNzLmVudi5GSVJFQkFTRV9XRUJfQVVUSF9ET01BSU4gPz8gXCJcIixcbiAgICAgICAgICAgIGZpcmViYXNlV2ViUHJvamVjdElkOiBwcm9jZXNzLmVudi5GSVJFQkFTRV9XRUJfUFJPSkVDVF9JRCA/PyBcIlwiLFxuICAgICAgICAgICAgZmlyZWJhc2VBdXRoRW11bGF0b3JIb3N0OlxuICAgICAgICAgICAgICBwcm9jZXNzLmVudi5GSVJFQkFTRV9BVVRIX0VNVUxBVE9SX0hPU1QgPz8gXCJcIixcbiAgICAgICAgICAgIHZlcmlmeUlkVG9rZW4sXG4gICAgICAgICAgICBkZWxldGVVc2VyOiBkZWxldGVBdXRoVXNlcixcbiAgICAgICAgICAgIGFnZW50TWVtb3J5LFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGNvbnN0IG91dGdvaW5nID0gcmVzIGFzIFNlcnZlclJlc3BvbnNlO1xuICAgICAgICAgIG91dGdvaW5nLnN0YXR1c0NvZGUgPSByZXN1bHQuc3RhdHVzO1xuICAgICAgICAgIGZvciAoY29uc3QgW25hbWUsIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhyZXN1bHQuaGVhZGVycykpIHtcbiAgICAgICAgICAgIG91dGdvaW5nLnNldEhlYWRlcihuYW1lLCB2YWx1ZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG91dGdvaW5nLmVuZChyZXN1bHQuYm9keSk7XG4gICAgICAgIH0pKCk7XG4gICAgICB9KTtcbiAgICB9LFxuICB9O1xufVxuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbcmVhY3QoKSwgc3RvcmVBcGlQbHVnaW4oKV0sXG4gIHRlc3Q6IHtcbiAgICBwYXNzV2l0aE5vVGVzdHM6IHRydWUsXG4gICAgcG9vbDogXCJmb3Jrc1wiLFxuICB9LFxufSk7XG4iLCAiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyYy9lbnZGaWxlLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjL2VudkZpbGUudHNcIjtpbXBvcnQgeyBleGlzdHNTeW5jLCByZWFkRmlsZVN5bmMgfSBmcm9tIFwibm9kZTpmc1wiO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gXCJub2RlOnBhdGhcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5RW52RmlsZShcbiAgY3dkOiBzdHJpbmcgPSBwcm9jZXNzLmN3ZCgpLFxuICBvcHRpb25zOiB7IG92ZXJ3cml0ZT86IGJvb2xlYW4gfSA9IHt9LFxuKTogdm9pZCB7XG4gIGNvbnN0IHBhdGggPSBqb2luKGN3ZCwgXCIuZW52XCIpO1xuICBpZiAoIWV4aXN0c1N5bmMocGF0aCkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgcmF3ID0gcmVhZEZpbGVTeW5jKHBhdGgsIFwidXRmOFwiKTtcbiAgZm9yIChjb25zdCBsaW5lIG9mIHJhdy5zcGxpdChcIlxcblwiKSkge1xuICAgIGNvbnN0IHRyaW1tZWQgPSBsaW5lLnRyaW0oKTtcbiAgICBpZiAodHJpbW1lZCA9PT0gXCJcIiB8fCB0cmltbWVkLnN0YXJ0c1dpdGgoXCIjXCIpKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3QgZXEgPSB0cmltbWVkLmluZGV4T2YoXCI9XCIpO1xuICAgIGlmIChlcSA8PSAwKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3Qga2V5ID0gdHJpbW1lZC5zbGljZSgwLCBlcSkudHJpbSgpO1xuICAgIGxldCB2YWx1ZSA9IHRyaW1tZWQuc2xpY2UoZXEgKyAxKS50cmltKCk7XG4gICAgaWYgKFxuICAgICAgKHZhbHVlLnN0YXJ0c1dpdGgoJ1wiJykgJiYgdmFsdWUuZW5kc1dpdGgoJ1wiJykpIHx8XG4gICAgICAodmFsdWUuc3RhcnRzV2l0aChcIidcIikgJiYgdmFsdWUuZW5kc1dpdGgoXCInXCIpKVxuICAgICkge1xuICAgICAgdmFsdWUgPSB2YWx1ZS5zbGljZSgxLCAtMSk7XG4gICAgfVxuICAgIGlmIChcbiAgICAgIG9wdGlvbnMub3ZlcndyaXRlID09PSB0cnVlIHx8XG4gICAgICBwcm9jZXNzLmVudltrZXldID09PSB1bmRlZmluZWQgfHxcbiAgICAgIHByb2Nlc3MuZW52W2tleV0gPT09IFwiXCJcbiAgICApIHtcbiAgICAgIHByb2Nlc3MuZW52W2tleV0gPSB2YWx1ZTtcbiAgICB9XG4gIH1cbn1cbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL2hvbWUvcm9nZXIvR2l0SHViL25leHRwYXRoLWJ1ZGdldGFwcC9zcmNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjL2FnZW50TWVtb3J5LnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjL2FnZW50TWVtb3J5LnRzXCI7ZXhwb3J0IGNsYXNzIEFnZW50TWVtb3J5U3RvcmUge1xuICBwcml2YXRlIHJlYWRvbmx5IGJ5VXNlciA9IG5ldyBNYXA8c3RyaW5nLCBNYXA8c3RyaW5nLCBzdHJpbmc+PigpO1xuXG4gIHJlbWVtYmVyKHVpZDogc3RyaW5nLCBrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IHZvaWQge1xuICAgIGxldCBtYXAgPSB0aGlzLmJ5VXNlci5nZXQodWlkKTtcbiAgICBpZiAobWFwID09PSB1bmRlZmluZWQpIHtcbiAgICAgIG1hcCA9IG5ldyBNYXAoKTtcbiAgICAgIHRoaXMuYnlVc2VyLnNldCh1aWQsIG1hcCk7XG4gICAgfVxuICAgIG1hcC5zZXQoa2V5LCB2YWx1ZSk7XG4gIH1cblxuICByZWNhbGwodWlkOiBzdHJpbmcsIGtleTogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgY29uc3QgbWFwID0gdGhpcy5ieVVzZXIuZ2V0KHVpZCk7XG4gICAgaWYgKG1hcCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgY29uc3QgZm91bmQgPSBtYXAuZ2V0KGtleSk7XG4gICAgcmV0dXJuIGZvdW5kID09PSB1bmRlZmluZWQgPyBudWxsIDogZm91bmQ7XG4gIH1cbn1cbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL2hvbWUvcm9nZXIvR2l0SHViL25leHRwYXRoLWJ1ZGdldGFwcC9zcmNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjL2h0dHBEaXNwYXRjaC50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyYy9odHRwRGlzcGF0Y2gudHNcIjtpbXBvcnQgeyBleGlzdHNTeW5jLCByZWFkRmlsZVN5bmMgfSBmcm9tIFwibm9kZTpmc1wiO1xuaW1wb3J0IHsgam9pbiwgcmVzb2x2ZSwgc2VwIH0gZnJvbSBcIm5vZGU6cGF0aFwiO1xuaW1wb3J0IHtcbiAgYWN0b3JGcm9tVmVyaWZpZWRTZXNzaW9uLFxuICBjYW5Vc2VGcm9tVGV4dCxcbiAgZGVjaWRlQnVkZ2V0QWNjZXNzLFxuICBpc01vZGVyYXRvckVtYWlsLFxufSBmcm9tIFwiLi9hY2xcIjtcbmltcG9ydCB7IEFnZW50TWVtb3J5U3RvcmUgfSBmcm9tIFwiLi9hZ2VudE1lbW9yeVwiO1xuaW1wb3J0IHsgZXhlY3V0ZUFnZW50UnVuIH0gZnJvbSBcIi4vYWdlbnRUb29sc1wiO1xuaW1wb3J0IHtcbiAgQUdFTlRfTUFYX01TLFxuICBNQVhfUkVRVUVTVF9CWVRFUyxcbiAgcmVkYWN0U2VjcmV0cyxcbn0gZnJvbSBcIi4vc2VydmVyQWNjZXNzXCI7XG5pbXBvcnQge1xuICBjcmVhdGVTZGtDYWxsZXIsXG4gIGhhbmRsZVN1Z2dlc3RFbnRyaWVzLFxuICB0eXBlIEdlbWluaUNhbGxlcixcbn0gZnJvbSBcIi4vZ2VtaW5pU3VnZ2VzdFwiO1xuaW1wb3J0IHR5cGUgeyBWZXJpZmllZFRva2VuIH0gZnJvbSBcIi4vZmlyZWJhc2VBZG1pblwiO1xuaW1wb3J0IHtcbiAgTUFYX1BST0ZJTEVTLFxuICBjb3B5QnVkZ2V0Rm9yQWN0b3IsXG4gIGNyZWF0ZUJ1ZGdldEZvckFjdG9yLFxuICBkZWxldGVCdWRnZXRGb3JBY3RvcixcbiAgZGVsZXRlSG91c2Vob2xkVXNlcixcbiAgZGlyZWN0b3J5VXNlcixcbiAgZ2V0QnVkZ2V0LFxuICBpc1ZhbGlkVmlzaWJpbGl0eSxcbiAgbGlzdEJ1ZGdldFN1bW1hcmllcyxcbiAgbWVQYXlsb2FkLFxuICBzYXZlV3JpdGFibGVCdWRnZXQsXG4gIHNldEdyYW50c0ZvckFjdG9yLFxuICBzZXRWaXNpYmlsaXR5Rm9yQWN0b3IsXG4gIHNvcnRQcm9maWxlcyxcbiAgdHlwZSBBcHBSZXBvLFxufSBmcm9tIFwiLi9yZXBvXCI7XG5pbXBvcnQgdHlwZSB7IEFjdG9yLCBCdWRnZXQsIENhdGVnb3J5LCBEYXRlUGFydHMsIEVudHJ5LCBHcmFudCwgR3JhbnRSb2xlLCBVc2VyUHJvZmlsZSB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbmV4cG9ydCB7IEFnZW50TWVtb3J5U3RvcmUgfTtcblxuZXhwb3J0IHR5cGUgSHR0cERpc3BhdGNoUmVzdWx0ID0ge1xuICBzdGF0dXM6IG51bWJlcjtcbiAgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgYm9keTogc3RyaW5nO1xufTtcblxuZXhwb3J0IHR5cGUgSHR0cERpc3BhdGNoSW5wdXQgPSB7XG4gIG1ldGhvZDogc3RyaW5nO1xuICBwYXRobmFtZTogc3RyaW5nO1xuICBib2R5OiBzdHJpbmc7XG4gIGF1dGhvcml6YXRpb24/OiBzdHJpbmc7XG4gIGdlbWluaUFwaUtleTogc3RyaW5nO1xuICBkaXN0RGlyOiBzdHJpbmc7XG4gIHJlcG86IEFwcFJlcG87XG4gIG1vZGVyYXRvckVtYWlsOiBzdHJpbmc7XG4gIGZpcmViYXNlV2ViQXBpS2V5OiBzdHJpbmc7XG4gIGZpcmViYXNlV2ViQXV0aERvbWFpbjogc3RyaW5nO1xuICBmaXJlYmFzZVdlYlByb2plY3RJZDogc3RyaW5nO1xuICBmaXJlYmFzZUF1dGhFbXVsYXRvckhvc3Q/OiBzdHJpbmc7XG4gIHZlcmlmeUlkVG9rZW46ICh0b2tlbjogc3RyaW5nKSA9PiBQcm9taXNlPFZlcmlmaWVkVG9rZW4+O1xuICBkZWxldGVVc2VyOiAodWlkOiBzdHJpbmcpID0+IFByb21pc2U8dm9pZD47XG4gIGdlbWluaUNhbGxlcj86IEdlbWluaUNhbGxlcjtcbiAgY3JlYXRlSWQ/OiAoKSA9PiBzdHJpbmc7XG4gIG5vd0lzbz86ICgpID0+IHN0cmluZztcbiAgYWdlbnRNZW1vcnk/OiBBZ2VudE1lbW9yeVN0b3JlO1xuICBub3dNcz86ICgpID0+IG51bWJlcjtcbiAgbWF4QWdlbnRNcz86IG51bWJlcjtcbn07XG5cbmNvbnN0IEpTT05fSEVBREVSUyA9IHsgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfTtcblxuY29uc3QgZGVmYXVsdEFnZW50TWVtb3J5ID0gbmV3IEFnZW50TWVtb3J5U3RvcmUoKTtcblxuZnVuY3Rpb24ganNvblJlc3VsdChzdGF0dXM6IG51bWJlciwgYm9keTogc3RyaW5nKTogSHR0cERpc3BhdGNoUmVzdWx0IHtcbiAgcmV0dXJuIHsgc3RhdHVzLCBoZWFkZXJzOiBKU09OX0hFQURFUlMsIGJvZHkgfTtcbn1cblxuZnVuY3Rpb24gZXJyb3JSZXN1bHQoc3RhdHVzOiBudW1iZXIsIGVycm9yOiBzdHJpbmcpOiBIdHRwRGlzcGF0Y2hSZXN1bHQge1xuICByZXR1cm4ganNvblJlc3VsdChzdGF0dXMsIEpTT04uc3RyaW5naWZ5KHsgZXJyb3IgfSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGlzdGVuUG9ydCgpOiBudW1iZXIge1xuICBjb25zdCByYXcgPSBwcm9jZXNzLmVudi5QT1JUO1xuICBpZiAocmF3ID09PSB1bmRlZmluZWQgfHwgcmF3LnRyaW0oKSA9PT0gXCJcIikge1xuICAgIHJldHVybiA4MDgwO1xuICB9XG4gIGNvbnN0IHBhcnNlZCA9IE51bWJlci5wYXJzZUludChyYXcsIDEwKTtcbiAgaWYgKCFOdW1iZXIuaXNGaW5pdGUocGFyc2VkKSB8fCBwYXJzZWQgPD0gMCkge1xuICAgIHJldHVybiA4MDgwO1xuICB9XG4gIHJldHVybiBwYXJzZWQ7XG59XG5cbmZ1bmN0aW9uIG1pbWVGb3IoZmlsZVBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmIChmaWxlUGF0aC5lbmRzV2l0aChcIi5odG1sXCIpKSB7XG4gICAgcmV0dXJuIFwidGV4dC9odG1sOyBjaGFyc2V0PXV0Zi04XCI7XG4gIH1cbiAgaWYgKGZpbGVQYXRoLmVuZHNXaXRoKFwiLmpzXCIpKSB7XG4gICAgcmV0dXJuIFwidGV4dC9qYXZhc2NyaXB0OyBjaGFyc2V0PXV0Zi04XCI7XG4gIH1cbiAgaWYgKGZpbGVQYXRoLmVuZHNXaXRoKFwiLmNzc1wiKSkge1xuICAgIHJldHVybiBcInRleHQvY3NzOyBjaGFyc2V0PXV0Zi04XCI7XG4gIH1cbiAgaWYgKGZpbGVQYXRoLmVuZHNXaXRoKFwiLnN2Z1wiKSkge1xuICAgIHJldHVybiBcImltYWdlL3N2Zyt4bWxcIjtcbiAgfVxuICBpZiAoZmlsZVBhdGguZW5kc1dpdGgoXCIuanNvblwiKSkge1xuICAgIHJldHVybiBcImFwcGxpY2F0aW9uL2pzb25cIjtcbiAgfVxuICBpZiAoZmlsZVBhdGguZW5kc1dpdGgoXCIuaWNvXCIpKSB7XG4gICAgcmV0dXJuIFwiaW1hZ2UveC1pY29uXCI7XG4gIH1cbiAgcmV0dXJuIFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCI7XG59XG5cbmZ1bmN0aW9uIHNhZmVEaXN0RmlsZShkaXN0RGlyOiBzdHJpbmcsIHBhdGhuYW1lOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgY29uc3QgZGlzdFJlc29sdmVkID0gcmVzb2x2ZShkaXN0RGlyKTtcbiAgY29uc3QgcmVsYXRpdmUgPVxuICAgIHBhdGhuYW1lID09PSBcIi9cIiA/IFwiaW5kZXguaHRtbFwiIDogcGF0aG5hbWUucmVwbGFjZSgvXlxcLysvLCBcIlwiKTtcbiAgY29uc3QgdGFyZ2V0ID0gcmVzb2x2ZShkaXN0RGlyLCByZWxhdGl2ZSk7XG4gIGlmICh0YXJnZXQgIT09IGRpc3RSZXNvbHZlZCAmJiAhdGFyZ2V0LnN0YXJ0c1dpdGgoZGlzdFJlc29sdmVkICsgc2VwKSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIHJldHVybiB0YXJnZXQ7XG59XG5cbmZ1bmN0aW9uIGJlYXJlclRva2VuKGF1dGhvcml6YXRpb246IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IG51bGwge1xuICBpZiAoYXV0aG9yaXphdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgaWYgKCFhdXRob3JpemF0aW9uLnN0YXJ0c1dpdGgoXCJCZWFyZXIgXCIpKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgY29uc3QgdG9rZW4gPSBhdXRob3JpemF0aW9uLnNsaWNlKFwiQmVhcmVyIFwiLmxlbmd0aCkudHJpbSgpO1xuICBpZiAodG9rZW4gPT09IFwiXCIpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICByZXR1cm4gdG9rZW47XG59XG5cbmZ1bmN0aW9uIHBhcnNlSnNvbkJvZHkocmF3OiBzdHJpbmcpOiB1bmtub3duIHwgdW5kZWZpbmVkIHtcbiAgaWYgKHJhdy50cmltKCkgPT09IFwiXCIpIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UocmF3KSBhcyB1bmtub3duO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG59XG5cbmZ1bmN0aW9uIGFzUmVjb3JkKHZhbHVlOiB1bmtub3duKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCBudWxsIHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJvYmplY3RcIiB8fCB2YWx1ZSA9PT0gbnVsbCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIHJldHVybiB2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbn1cblxuZnVuY3Rpb24gYXNEYXRlUGFydHModmFsdWU6IHVua25vd24pOiBEYXRlUGFydHMgfCBudWxsIHwgdW5kZWZpbmVkIHtcbiAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG4gIGlmICh2YWx1ZSA9PT0gbnVsbCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGNvbnN0IHJlYyA9IGFzUmVjb3JkKHZhbHVlKTtcbiAgaWYgKFxuICAgIHJlYyA9PT0gbnVsbCB8fFxuICAgIHR5cGVvZiByZWMueWVhciAhPT0gXCJudW1iZXJcIiB8fFxuICAgIHR5cGVvZiByZWMubW9udGggIT09IFwibnVtYmVyXCIgfHxcbiAgICB0eXBlb2YgcmVjLmRheSAhPT0gXCJudW1iZXJcIlxuICApIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG4gIHJldHVybiB7IHllYXI6IHJlYy55ZWFyLCBtb250aDogcmVjLm1vbnRoLCBkYXk6IHJlYy5kYXkgfTtcbn1cblxuZnVuY3Rpb24gYWN0b3JGcm9tKFxuICBwcm9maWxlOiBVc2VyUHJvZmlsZSxcbiAgaXNNb2RlcmF0b3I6IGJvb2xlYW4sXG4pOiBBY3RvciB7XG4gIHJldHVybiBhY3RvckZyb21WZXJpZmllZFNlc3Npb24ocHJvZmlsZSwgaXNNb2RlcmF0b3IpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBtYXliZURlbGV0ZU9ycGhhbihcbiAgaW5wdXQ6IEh0dHBEaXNwYXRjaElucHV0LFxuICB1aWQ6IHN0cmluZyxcbik6IFByb21pc2U8SHR0cERpc3BhdGNoUmVzdWx0PiB7XG4gIGF3YWl0IGlucHV0LmRlbGV0ZVVzZXIodWlkKTtcbiAgcmV0dXJuIGVycm9yUmVzdWx0KDQwMywgXCJUaGUgaG91c2Vob2xkIGlzIGZ1bGwgKDEwIHVzZXJzKS5cIik7XG59XG5cbnR5cGUgU2Vzc2lvbiA9XG4gIHwgeyBvazogZmFsc2U7IHJlc3VsdDogSHR0cERpc3BhdGNoUmVzdWx0IH1cbiAgfCB7XG4gICAgICBvazogdHJ1ZTtcbiAgICAgIHVpZDogc3RyaW5nO1xuICAgICAgZW1haWw6IHN0cmluZztcbiAgICAgIHByb2ZpbGU6IFVzZXJQcm9maWxlIHwgbnVsbDtcbiAgICAgIGlzTW9kZXJhdG9yOiBib29sZWFuO1xuICAgIH07XG5cbmFzeW5jIGZ1bmN0aW9uIGF1dGhlbnRpY2F0ZShpbnB1dDogSHR0cERpc3BhdGNoSW5wdXQpOiBQcm9taXNlPFNlc3Npb24+IHtcbiAgY29uc3QgdG9rZW4gPSBiZWFyZXJUb2tlbihpbnB1dC5hdXRob3JpemF0aW9uKTtcbiAgaWYgKHRva2VuID09PSBudWxsKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZXN1bHQ6IGVycm9yUmVzdWx0KDQwMSwgXCJTaWduIGluIHJlcXVpcmVkLlwiKSB9O1xuICB9XG4gIGxldCB2ZXJpZmllZDogVmVyaWZpZWRUb2tlbjtcbiAgdHJ5IHtcbiAgICB2ZXJpZmllZCA9IGF3YWl0IGlucHV0LnZlcmlmeUlkVG9rZW4odG9rZW4pO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlc3VsdDogZXJyb3JSZXN1bHQoNDAxLCBcIlNpZ24gaW4gcmVxdWlyZWQuXCIpIH07XG4gIH1cbiAgY29uc3QgcHJvZmlsZSA9IGF3YWl0IGlucHV0LnJlcG8uZ2V0UHJvZmlsZSh2ZXJpZmllZC51aWQpO1xuICBjb25zdCB0b2tlbkVtYWlsID0gKHZlcmlmaWVkLmVtYWlsID8/IFwiXCIpLnRyaW0oKTtcbiAgY29uc3QgcHJvZmlsZUVtYWlsID0gKHByb2ZpbGU/LmVtYWlsID8/IFwiXCIpLnRyaW0oKTtcbiAgY29uc3QgZW1haWwgPSB0b2tlbkVtYWlsICE9PSBcIlwiID8gdG9rZW5FbWFpbCA6IHByb2ZpbGVFbWFpbDtcbiAgY29uc3QgaXNNb2RlcmF0b3IgPVxuICAgIGlzTW9kZXJhdG9yRW1haWwoZW1haWwsIGlucHV0Lm1vZGVyYXRvckVtYWlsKSB8fFxuICAgIGlzTW9kZXJhdG9yRW1haWwocHJvZmlsZUVtYWlsLCBpbnB1dC5tb2RlcmF0b3JFbWFpbCk7XG4gIHJldHVybiB7XG4gICAgb2s6IHRydWUsXG4gICAgdWlkOiB2ZXJpZmllZC51aWQsXG4gICAgZW1haWwsXG4gICAgcHJvZmlsZSxcbiAgICBpc01vZGVyYXRvcixcbiAgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVxdWlyZVByb2ZpbGUoXG4gIGlucHV0OiBIdHRwRGlzcGF0Y2hJbnB1dCxcbik6IFByb21pc2U8XG4gIHwgeyBvazogZmFsc2U7IHJlc3VsdDogSHR0cERpc3BhdGNoUmVzdWx0IH1cbiAgfCB7IG9rOiB0cnVlOyBhY3RvcjogQWN0b3IgfVxuPiB7XG4gIGNvbnN0IHNlc3Npb24gPSBhd2FpdCBhdXRoZW50aWNhdGUoaW5wdXQpO1xuICBpZiAoIXNlc3Npb24ub2spIHtcbiAgICByZXR1cm4gc2Vzc2lvbjtcbiAgfVxuICBpZiAoc2Vzc2lvbi5wcm9maWxlID09PSBudWxsKSB7XG4gICAgY29uc3QgY291bnQgPSBhd2FpdCBpbnB1dC5yZXBvLnByb2ZpbGVDb3VudCgpO1xuICAgIGlmIChjb3VudCA+PSBNQVhfUFJPRklMRVMpIHtcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVzdWx0OiBhd2FpdCBtYXliZURlbGV0ZU9ycGhhbihpbnB1dCwgc2Vzc2lvbi51aWQpIH07XG4gICAgfVxuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVzdWx0OiBlcnJvclJlc3VsdCg0MDMsIFwiUmVnaXN0ZXIgZmlyc3QuXCIpIH07XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBvazogdHJ1ZSxcbiAgICBhY3RvcjogYWN0b3JGcm9tKHNlc3Npb24ucHJvZmlsZSwgc2Vzc2lvbi5pc01vZGVyYXRvciksXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUlkRnJvbShpbnB1dDogSHR0cERpc3BhdGNoSW5wdXQpOiBzdHJpbmcge1xuICByZXR1cm4gaW5wdXQuY3JlYXRlSWQgPT09IHVuZGVmaW5lZFxuICAgID8gY3J5cHRvLnJhbmRvbVVVSUQoKVxuICAgIDogaW5wdXQuY3JlYXRlSWQoKTtcbn1cblxuZnVuY3Rpb24gbm93SXNvKGlucHV0OiBIdHRwRGlzcGF0Y2hJbnB1dCk6IHN0cmluZyB7XG4gIHJldHVybiBpbnB1dC5ub3dJc28gPT09IHVuZGVmaW5lZFxuICAgID8gbmV3IERhdGUoKS50b0lTT1N0cmluZygpXG4gICAgOiBpbnB1dC5ub3dJc28oKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VHcmFudHModmFsdWU6IHVua25vd24pOiBHcmFudFtdIHwgbnVsbCB7XG4gIGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBjb25zdCBncmFudHM6IEdyYW50W10gPSBbXTtcbiAgZm9yIChjb25zdCBpdGVtIG9mIHZhbHVlKSB7XG4gICAgY29uc3QgcmVjID0gYXNSZWNvcmQoaXRlbSk7XG4gICAgaWYgKHJlYyA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgcmVjLnVzZXJJZCAhPT0gXCJzdHJpbmdcIiB8fCB0eXBlb2YgcmVjLnJvbGUgIT09IFwic3RyaW5nXCIpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBncmFudHMucHVzaCh7IHVzZXJJZDogcmVjLnVzZXJJZCwgcm9sZTogcmVjLnJvbGUgYXMgR3JhbnRSb2xlIH0pO1xuICB9XG4gIHJldHVybiBncmFudHM7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRpc3BhdGNoUmVnaXN0ZXIoXG4gIGlucHV0OiBIdHRwRGlzcGF0Y2hJbnB1dCxcbik6IFByb21pc2U8SHR0cERpc3BhdGNoUmVzdWx0PiB7XG4gIGNvbnN0IHNlc3Npb24gPSBhd2FpdCBhdXRoZW50aWNhdGUoaW5wdXQpO1xuICBpZiAoIXNlc3Npb24ub2spIHtcbiAgICByZXR1cm4gc2Vzc2lvbi5yZXN1bHQ7XG4gIH1cbiAgY29uc3QgZGF0YSA9IGFzUmVjb3JkKHBhcnNlSnNvbkJvZHkoaW5wdXQuYm9keSkpO1xuICBjb25zdCByYXdOYW1lID1cbiAgICBkYXRhICE9PSBudWxsICYmIHR5cGVvZiBkYXRhLmRpc3BsYXlOYW1lID09PSBcInN0cmluZ1wiXG4gICAgICA/IGRhdGEuZGlzcGxheU5hbWVcbiAgICAgIDogXCJcIjtcbiAgY29uc3QgZGlzcGxheU5hbWUgPSByYXdOYW1lLnRyaW0oKTtcbiAgaWYgKGRpc3BsYXlOYW1lID09PSBcIlwiKSB7XG4gICAgcmV0dXJuIGVycm9yUmVzdWx0KDQwMCwgXCJEaXNwbGF5IG5hbWUgaXMgcmVxdWlyZWQuXCIpO1xuICB9XG4gIGlmIChzZXNzaW9uLnByb2ZpbGUgIT09IG51bGwpIHtcbiAgICByZXR1cm4ganNvblJlc3VsdChcbiAgICAgIDIwMCxcbiAgICAgIEpTT04uc3RyaW5naWZ5KG1lUGF5bG9hZChzZXNzaW9uLnByb2ZpbGUsIHNlc3Npb24uaXNNb2RlcmF0b3IpKSxcbiAgICApO1xuICB9XG4gIGNvbnN0IGNvdW50ID0gYXdhaXQgaW5wdXQucmVwby5wcm9maWxlQ291bnQoKTtcbiAgaWYgKGNvdW50ID49IE1BWF9QUk9GSUxFUykge1xuICAgIHJldHVybiBtYXliZURlbGV0ZU9ycGhhbihpbnB1dCwgc2Vzc2lvbi51aWQpO1xuICB9XG4gIGNvbnN0IHByb2ZpbGU6IFVzZXJQcm9maWxlID0ge1xuICAgIGlkOiBzZXNzaW9uLnVpZCxcbiAgICBlbWFpbDogc2Vzc2lvbi5lbWFpbCxcbiAgICBkaXNwbGF5TmFtZSxcbiAgICBjYW5Vc2VGcm9tVGV4dDogc2Vzc2lvbi5pc01vZGVyYXRvcixcbiAgICBjcmVhdGVkQXQ6IG5vd0lzbyhpbnB1dCksXG4gIH07XG4gIGF3YWl0IGlucHV0LnJlcG8uc2F2ZVByb2ZpbGUocHJvZmlsZSk7XG4gIHJldHVybiBqc29uUmVzdWx0KFxuICAgIDIwMSxcbiAgICBKU09OLnN0cmluZ2lmeShtZVBheWxvYWQocHJvZmlsZSwgc2Vzc2lvbi5pc01vZGVyYXRvcikpLFxuICApO1xufVxuXG5hc3luYyBmdW5jdGlvbiBkaXNwYXRjaE1lKFxuICBpbnB1dDogSHR0cERpc3BhdGNoSW5wdXQsXG4pOiBQcm9taXNlPEh0dHBEaXNwYXRjaFJlc3VsdD4ge1xuICBjb25zdCBzZXNzaW9uID0gYXdhaXQgYXV0aGVudGljYXRlKGlucHV0KTtcbiAgaWYgKCFzZXNzaW9uLm9rKSB7XG4gICAgcmV0dXJuIHNlc3Npb24ucmVzdWx0O1xuICB9XG4gIGlmIChzZXNzaW9uLnByb2ZpbGUgPT09IG51bGwpIHtcbiAgICBjb25zdCBjb3VudCA9IGF3YWl0IGlucHV0LnJlcG8ucHJvZmlsZUNvdW50KCk7XG4gICAgaWYgKGNvdW50ID49IE1BWF9QUk9GSUxFUykge1xuICAgICAgcmV0dXJuIG1heWJlRGVsZXRlT3JwaGFuKGlucHV0LCBzZXNzaW9uLnVpZCk7XG4gICAgfVxuICAgIHJldHVybiBlcnJvclJlc3VsdCg0MDMsIFwiUmVnaXN0ZXIgZmlyc3QuXCIpO1xuICB9XG4gIHJldHVybiBqc29uUmVzdWx0KFxuICAgIDIwMCxcbiAgICBKU09OLnN0cmluZ2lmeShtZVBheWxvYWQoc2Vzc2lvbi5wcm9maWxlLCBzZXNzaW9uLmlzTW9kZXJhdG9yKSksXG4gICk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRpc3BhdGNoQXBpKFxuICBpbnB1dDogSHR0cERpc3BhdGNoSW5wdXQsXG4pOiBQcm9taXNlPEh0dHBEaXNwYXRjaFJlc3VsdCB8IG51bGw+IHtcbiAgaWYgKGlucHV0LnBhdGhuYW1lID09PSBcIi9hcGkvc3RvcmVcIikge1xuICAgIHJldHVybiBlcnJvclJlc3VsdCg0MDQsIFwiTm90IGZvdW5kLlwiKTtcbiAgfVxuICBpZiAoaW5wdXQucGF0aG5hbWUgPT09IFwiL2FwaS9oZWFsdGhcIiAmJiBpbnB1dC5tZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICByZXR1cm4ganNvblJlc3VsdCgyMDAsIEpTT04uc3RyaW5naWZ5KHsgb2s6IHRydWUgfSkpO1xuICB9XG4gIGlmIChpbnB1dC5wYXRobmFtZSA9PT0gXCIvYXBpL2NvbmZpZ1wiICYmIGlucHV0Lm1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgIGNvbnN0IGFwaUtleSA9IGlucHV0LmZpcmViYXNlV2ViQXBpS2V5LnRyaW0oKTtcbiAgICBjb25zdCBhdXRoRG9tYWluID0gaW5wdXQuZmlyZWJhc2VXZWJBdXRoRG9tYWluLnRyaW0oKTtcbiAgICBjb25zdCBwcm9qZWN0SWQgPSBpbnB1dC5maXJlYmFzZVdlYlByb2plY3RJZC50cmltKCk7XG4gICAgaWYgKGFwaUtleSA9PT0gXCJcIiB8fCBhdXRoRG9tYWluID09PSBcIlwiIHx8IHByb2plY3RJZCA9PT0gXCJcIikge1xuICAgICAgcmV0dXJuIGVycm9yUmVzdWx0KDUwMywgXCJGaXJlYmFzZSB3ZWIgY29uZmlnIGlzIG1pc3NpbmcuXCIpO1xuICAgIH1cbiAgICBjb25zdCBlbXVsYXRvckhvc3QgPSAoaW5wdXQuZmlyZWJhc2VBdXRoRW11bGF0b3JIb3N0ID8/IFwiXCIpLnRyaW0oKTtcbiAgICBpZiAoZW11bGF0b3JIb3N0ID09PSBcIlwiKSB7XG4gICAgICByZXR1cm4ganNvblJlc3VsdChcbiAgICAgICAgMjAwLFxuICAgICAgICBKU09OLnN0cmluZ2lmeSh7IGFwaUtleSwgYXV0aERvbWFpbiwgcHJvamVjdElkIH0pLFxuICAgICAgKTtcbiAgICB9XG4gICAgY29uc3QgYXV0aEVtdWxhdG9ySG9zdCA9IGVtdWxhdG9ySG9zdC5zdGFydHNXaXRoKFwiaHR0cDovL1wiKSB8fFxuICAgICAgZW11bGF0b3JIb3N0LnN0YXJ0c1dpdGgoXCJodHRwczovL1wiKVxuICAgICAgPyBlbXVsYXRvckhvc3RcbiAgICAgIDogYGh0dHA6Ly8ke2VtdWxhdG9ySG9zdH1gO1xuICAgIHJldHVybiBqc29uUmVzdWx0KFxuICAgICAgMjAwLFxuICAgICAgSlNPTi5zdHJpbmdpZnkoeyBhcGlLZXksIGF1dGhEb21haW4sIHByb2plY3RJZCwgYXV0aEVtdWxhdG9ySG9zdCB9KSxcbiAgICApO1xuICB9XG4gIGlmICghaW5wdXQucGF0aG5hbWUuc3RhcnRzV2l0aChcIi9hcGkvXCIpKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBpZiAoaW5wdXQucGF0aG5hbWUgPT09IFwiL2FwaS9yZWdpc3RlclwiICYmIGlucHV0Lm1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICByZXR1cm4gZGlzcGF0Y2hSZWdpc3RlcihpbnB1dCk7XG4gIH1cbiAgaWYgKGlucHV0LnBhdGhuYW1lID09PSBcIi9hcGkvbWVcIiAmJiBpbnB1dC5tZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICByZXR1cm4gZGlzcGF0Y2hNZShpbnB1dCk7XG4gIH1cblxuICBjb25zdCBnYXRlZCA9IGF3YWl0IHJlcXVpcmVQcm9maWxlKGlucHV0KTtcbiAgaWYgKCFnYXRlZC5vaykge1xuICAgIHJldHVybiBnYXRlZC5yZXN1bHQ7XG4gIH1cbiAgY29uc3QgeyBhY3RvciB9ID0gZ2F0ZWQ7XG4gIGNvbnN0IHsgcmVwbyB9ID0gaW5wdXQ7XG5cbiAgaWYgKGlucHV0LnBhdGhuYW1lID09PSBcIi9hcGkvdXNlcnNcIiAmJiBpbnB1dC5tZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICBjb25zdCB1c2VycyA9IHNvcnRQcm9maWxlcyhhd2FpdCByZXBvLmxpc3RQcm9maWxlcygpKS5tYXAoZGlyZWN0b3J5VXNlcik7XG4gICAgcmV0dXJuIGpzb25SZXN1bHQoMjAwLCBKU09OLnN0cmluZ2lmeSh7IHVzZXJzIH0pKTtcbiAgfVxuXG4gIGlmIChpbnB1dC5wYXRobmFtZSA9PT0gXCIvYXBpL2FkbWluL3VzZXJzXCIgJiYgaW5wdXQubWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgaWYgKCFhY3Rvci5pc01vZGVyYXRvcikge1xuICAgICAgcmV0dXJuIGVycm9yUmVzdWx0KDQwMywgXCJOb3QgYWxsb3dlZC5cIik7XG4gICAgfVxuICAgIGNvbnN0IHVzZXJzID0gc29ydFByb2ZpbGVzKGF3YWl0IHJlcG8ubGlzdFByb2ZpbGVzKCkpO1xuICAgIHJldHVybiBqc29uUmVzdWx0KDIwMCwgSlNPTi5zdHJpbmdpZnkoeyB1c2VycyB9KSk7XG4gIH1cblxuICBjb25zdCBhZG1pblVzZXIgPSAvXlxcL2FwaVxcL2FkbWluXFwvdXNlcnNcXC8oW14vXSspJC8uZXhlYyhpbnB1dC5wYXRobmFtZSk7XG4gIGlmIChhZG1pblVzZXIgIT09IG51bGwgJiYgaW5wdXQubWV0aG9kID09PSBcIkRFTEVURVwiKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGVsZXRlSG91c2Vob2xkVXNlcihcbiAgICAgIHJlcG8sXG4gICAgICBhY3RvcixcbiAgICAgIGFkbWluVXNlclsxXSA/PyBcIlwiLFxuICAgICAgaW5wdXQubW9kZXJhdG9yRW1haWwsXG4gICAgICBpbnB1dC5kZWxldGVVc2VyLFxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQub2spIHtcbiAgICAgIHJldHVybiBlcnJvclJlc3VsdChyZXN1bHQuc3RhdHVzLCByZXN1bHQuZXJyb3IpO1xuICAgIH1cbiAgICByZXR1cm4ganNvblJlc3VsdCgyMDAsIEpTT04uc3RyaW5naWZ5KHsgb2s6IHRydWUgfSkpO1xuICB9XG4gIGlmIChhZG1pblVzZXIgIT09IG51bGwgJiYgaW5wdXQubWV0aG9kID09PSBcIlBBVENIXCIpIHtcbiAgICBpZiAoIWFjdG9yLmlzTW9kZXJhdG9yKSB7XG4gICAgICByZXR1cm4gZXJyb3JSZXN1bHQoNDAzLCBcIk5vdCBhbGxvd2VkLlwiKTtcbiAgICB9XG4gICAgY29uc3QgaWQgPSBhZG1pblVzZXJbMV0gPz8gXCJcIjtcbiAgICBjb25zdCBleGlzdGluZyA9IGF3YWl0IHJlcG8uZ2V0UHJvZmlsZShpZCk7XG4gICAgaWYgKGV4aXN0aW5nID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gZXJyb3JSZXN1bHQoNDA0LCBcIk5vdCBmb3VuZC5cIik7XG4gICAgfVxuICAgIGNvbnN0IGRhdGEgPSBhc1JlY29yZChwYXJzZUpzb25Cb2R5KGlucHV0LmJvZHkpKTtcbiAgICBpZiAoZGF0YSA9PT0gbnVsbCB8fCB0eXBlb2YgZGF0YS5jYW5Vc2VGcm9tVGV4dCAhPT0gXCJib29sZWFuXCIpIHtcbiAgICAgIHJldHVybiBlcnJvclJlc3VsdCg0MDAsIFwiTm90IGFsbG93ZWQuXCIpO1xuICAgIH1cbiAgICBjb25zdCBuZXh0ID0geyAuLi5leGlzdGluZywgY2FuVXNlRnJvbVRleHQ6IGRhdGEuY2FuVXNlRnJvbVRleHQgfTtcbiAgICBhd2FpdCByZXBvLnNhdmVQcm9maWxlKG5leHQpO1xuICAgIHJldHVybiBqc29uUmVzdWx0KDIwMCwgSlNPTi5zdHJpbmdpZnkobmV4dCkpO1xuICB9XG5cbiAgaWYgKGlucHV0LnBhdGhuYW1lID09PSBcIi9hcGkvYnVkZ2V0c1wiICYmIGlucHV0Lm1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgIGNvbnN0IGJ1ZGdldHMgPSBhd2FpdCBsaXN0QnVkZ2V0U3VtbWFyaWVzKHJlcG8sIGFjdG9yKTtcbiAgICByZXR1cm4ganNvblJlc3VsdCgyMDAsIEpTT04uc3RyaW5naWZ5KHsgYnVkZ2V0cyB9KSk7XG4gIH1cblxuICBpZiAoaW5wdXQucGF0aG5hbWUgPT09IFwiL2FwaS9idWRnZXRzXCIgJiYgaW5wdXQubWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgIGNvbnN0IGRhdGEgPSBhc1JlY29yZChwYXJzZUpzb25Cb2R5KGlucHV0LmJvZHkpKTtcbiAgICBpZiAoZGF0YSA9PT0gbnVsbCB8fCB0eXBlb2YgZGF0YS5uYW1lICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICByZXR1cm4gZXJyb3JSZXN1bHQoNDAwLCBcIk5hbWUgaXMgcmVxdWlyZWQuXCIpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjcmVhdGVCdWRnZXRGb3JBY3RvcihcbiAgICAgIHJlcG8sXG4gICAgICBhY3RvcixcbiAgICAgIHtcbiAgICAgICAgbmFtZTogZGF0YS5uYW1lLFxuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICB0eXBlb2YgZGF0YS5kZXNjcmlwdGlvbiA9PT0gXCJzdHJpbmdcIiA/IGRhdGEuZGVzY3JpcHRpb24gOiB1bmRlZmluZWQsXG4gICAgICAgIHN0YXJ0RGF0ZTogYXNEYXRlUGFydHMoZGF0YS5zdGFydERhdGUpLFxuICAgICAgICBlbmREYXRlOiBhc0RhdGVQYXJ0cyhkYXRhLmVuZERhdGUpLFxuICAgICAgICB0YXJnZXRMZWZ0b3ZlckNlbnRzOlxuICAgICAgICAgIGRhdGEudGFyZ2V0TGVmdG92ZXJDZW50cyA9PT0gbnVsbCB8fFxuICAgICAgICAgIHR5cGVvZiBkYXRhLnRhcmdldExlZnRvdmVyQ2VudHMgPT09IFwibnVtYmVyXCJcbiAgICAgICAgICAgID8gZGF0YS50YXJnZXRMZWZ0b3ZlckNlbnRzXG4gICAgICAgICAgICA6IHVuZGVmaW5lZCxcbiAgICAgIH0sXG4gICAgICAoKSA9PiBjcmVhdGVJZEZyb20oaW5wdXQpLFxuICAgICk7XG4gICAgaWYgKCFyZXN1bHQub2spIHtcbiAgICAgIHJldHVybiBlcnJvclJlc3VsdCg0MDAsIHJlc3VsdC5lcnJvcik7XG4gICAgfVxuICAgIHJldHVybiBqc29uUmVzdWx0KDIwMSwgSlNPTi5zdHJpbmdpZnkocmVzdWx0LmJ1ZGdldCkpO1xuICB9XG5cbiAgY29uc3QgYnVkZ2V0Q29weSA9IC9eXFwvYXBpXFwvYnVkZ2V0c1xcLyhbXi9dKylcXC9jb3B5JC8uZXhlYyhpbnB1dC5wYXRobmFtZSk7XG4gIGlmIChidWRnZXRDb3B5ICE9PSBudWxsICYmIGlucHV0Lm1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb3B5QnVkZ2V0Rm9yQWN0b3IocmVwbywgYWN0b3IsIGJ1ZGdldENvcHlbMV0gPz8gXCJcIik7XG4gICAgaWYgKCFyZXN1bHQub2spIHtcbiAgICAgIGNvbnN0IHN0YXR1cyA9IHJlc3VsdC5lcnJvciA9PT0gXCJOb3QgYWxsb3dlZC5cIiA/IDQwMyA6IDQwNDtcbiAgICAgIHJldHVybiBlcnJvclJlc3VsdChzdGF0dXMsIHJlc3VsdC5lcnJvcik7XG4gICAgfVxuICAgIHJldHVybiBqc29uUmVzdWx0KDIwMSwgSlNPTi5zdHJpbmdpZnkocmVzdWx0LmJ1ZGdldCkpO1xuICB9XG5cbiAgY29uc3QgYnVkZ2V0VmlzID0gL15cXC9hcGlcXC9idWRnZXRzXFwvKFteL10rKVxcL3Zpc2liaWxpdHkkLy5leGVjKFxuICAgIGlucHV0LnBhdGhuYW1lLFxuICApO1xuICBpZiAoYnVkZ2V0VmlzICE9PSBudWxsICYmIGlucHV0Lm1ldGhvZCA9PT0gXCJQQVRDSFwiKSB7XG4gICAgY29uc3QgaWQgPSBidWRnZXRWaXNbMV0gPz8gXCJcIjtcbiAgICBjb25zdCBleGlzdGluZyA9IGF3YWl0IHJlcG8uZ2V0QnVkZ2V0RG9jKGlkKTtcbiAgICBjb25zdCBhY2Nlc3MgPSBkZWNpZGVCdWRnZXRBY2Nlc3MoYWN0b3IsIGV4aXN0aW5nLCBcInNoYXJlXCIpO1xuICAgIGlmICghYWNjZXNzLm9rKSB7XG4gICAgICByZXR1cm4gZXJyb3JSZXN1bHQoYWNjZXNzLnN0YXR1cywgYWNjZXNzLmVycm9yKTtcbiAgICB9XG4gICAgY29uc3QgZGF0YSA9IGFzUmVjb3JkKHBhcnNlSnNvbkJvZHkoaW5wdXQuYm9keSkpO1xuICAgIGNvbnN0IHZpc2liaWxpdHkgPSBkYXRhID09PSBudWxsID8gdW5kZWZpbmVkIDogZGF0YS52aXNpYmlsaXR5O1xuICAgIGlmICghaXNWYWxpZFZpc2liaWxpdHkodmlzaWJpbGl0eSkpIHtcbiAgICAgIHJldHVybiBlcnJvclJlc3VsdCg0MDAsIFwiSW52YWxpZCB2aXNpYmlsaXR5LlwiKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgc2V0VmlzaWJpbGl0eUZvckFjdG9yKHJlcG8sIGFjdG9yLCBpZCwgdmlzaWJpbGl0eSk7XG4gICAgaWYgKCFyZXN1bHQub2spIHtcbiAgICAgIHJldHVybiBlcnJvclJlc3VsdChyZXN1bHQuc3RhdHVzLCByZXN1bHQuZXJyb3IpO1xuICAgIH1cbiAgICByZXR1cm4ganNvblJlc3VsdChcbiAgICAgIDIwMCxcbiAgICAgIEpTT04uc3RyaW5naWZ5KHsgdmlzaWJpbGl0eTogcmVzdWx0LmJ1ZGdldC52aXNpYmlsaXR5IH0pLFxuICAgICk7XG4gIH1cblxuICBjb25zdCBidWRnZXRHcmFudHMgPSAvXlxcL2FwaVxcL2J1ZGdldHNcXC8oW14vXSspXFwvZ3JhbnRzJC8uZXhlYyhpbnB1dC5wYXRobmFtZSk7XG4gIGlmIChidWRnZXRHcmFudHMgIT09IG51bGwgJiYgaW5wdXQubWV0aG9kID09PSBcIlBVVFwiKSB7XG4gICAgY29uc3QgaWQgPSBidWRnZXRHcmFudHNbMV0gPz8gXCJcIjtcbiAgICBjb25zdCBleGlzdGluZyA9IGF3YWl0IHJlcG8uZ2V0QnVkZ2V0RG9jKGlkKTtcbiAgICBjb25zdCBzaGFyZSA9IGRlY2lkZUJ1ZGdldEFjY2VzcyhhY3RvciwgZXhpc3RpbmcsIFwic2hhcmVcIik7XG4gICAgaWYgKCFzaGFyZS5vaykge1xuICAgICAgcmV0dXJuIGVycm9yUmVzdWx0KHNoYXJlLnN0YXR1cywgc2hhcmUuZXJyb3IpO1xuICAgIH1cbiAgICBjb25zdCBkYXRhID0gYXNSZWNvcmQocGFyc2VKc29uQm9keShpbnB1dC5ib2R5KSk7XG4gICAgY29uc3QgZ3JhbnRzID0gZGF0YSA9PT0gbnVsbCA/IG51bGwgOiBwYXJzZUdyYW50cyhkYXRhLmdyYW50cyk7XG4gICAgaWYgKGdyYW50cyA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGVycm9yUmVzdWx0KDQwMCwgXCJJbnZhbGlkIGdyYW50LlwiKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgc2V0R3JhbnRzRm9yQWN0b3IocmVwbywgYWN0b3IsIGlkLCBncmFudHMpO1xuICAgIGlmICghcmVzdWx0Lm9rKSB7XG4gICAgICByZXR1cm4gZXJyb3JSZXN1bHQocmVzdWx0LnN0YXR1cywgcmVzdWx0LmVycm9yKTtcbiAgICB9XG4gICAgcmV0dXJuIGpzb25SZXN1bHQoMjAwLCBKU09OLnN0cmluZ2lmeSh7IGdyYW50czogcmVzdWx0LmJ1ZGdldC5ncmFudHMgfSkpO1xuICB9XG5cbiAgY29uc3QgYnVkZ2V0T25lID0gL15cXC9hcGlcXC9idWRnZXRzXFwvKFteL10rKSQvLmV4ZWMoaW5wdXQucGF0aG5hbWUpO1xuICBpZiAoYnVkZ2V0T25lICE9PSBudWxsICYmIGlucHV0Lm1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGdldEJ1ZGdldChyZXBvLCBhY3RvciwgYnVkZ2V0T25lWzFdID8/IFwiXCIpO1xuICAgIGlmICghcmVzdWx0Lm9rKSB7XG4gICAgICByZXR1cm4gZXJyb3JSZXN1bHQoNDA0LCByZXN1bHQuZXJyb3IpO1xuICAgIH1cbiAgICByZXR1cm4ganNvblJlc3VsdCgyMDAsIEpTT04uc3RyaW5naWZ5KHJlc3VsdC52YWx1ZSkpO1xuICB9XG5cbiAgaWYgKGJ1ZGdldE9uZSAhPT0gbnVsbCAmJiBpbnB1dC5tZXRob2QgPT09IFwiUFVUXCIpIHtcbiAgICBjb25zdCBleGlzdGluZyA9IGF3YWl0IGdldEJ1ZGdldChyZXBvLCBhY3RvciwgYnVkZ2V0T25lWzFdID8/IFwiXCIpO1xuICAgIGlmICghZXhpc3Rpbmcub2spIHtcbiAgICAgIHJldHVybiBlcnJvclJlc3VsdCg0MDQsIFwiTm90IGZvdW5kLlwiKTtcbiAgICB9XG4gICAgY29uc3QgZGF0YSA9IGFzUmVjb3JkKHBhcnNlSnNvbkJvZHkoaW5wdXQuYm9keSkpO1xuICAgIGlmIChkYXRhID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gZXJyb3JSZXN1bHQoNDAwLCBcIk5vdCBmb3VuZC5cIik7XG4gICAgfVxuICAgIGNvbnN0IG5leHQ6IEJ1ZGdldCA9IHtcbiAgICAgIC4uLmV4aXN0aW5nLnZhbHVlLFxuICAgICAgbmFtZTogdHlwZW9mIGRhdGEubmFtZSA9PT0gXCJzdHJpbmdcIiA/IGRhdGEubmFtZSA6IGV4aXN0aW5nLnZhbHVlLm5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgdHlwZW9mIGRhdGEuZGVzY3JpcHRpb24gPT09IFwic3RyaW5nXCJcbiAgICAgICAgICA/IGRhdGEuZGVzY3JpcHRpb25cbiAgICAgICAgICA6IGV4aXN0aW5nLnZhbHVlLmRlc2NyaXB0aW9uLFxuICAgICAgaW5jb21lQ2F0ZWdvcmllczogQXJyYXkuaXNBcnJheShkYXRhLmluY29tZUNhdGVnb3JpZXMpXG4gICAgICAgID8gKGRhdGEuaW5jb21lQ2F0ZWdvcmllcyBhcyBDYXRlZ29yeVtdKVxuICAgICAgICA6IGV4aXN0aW5nLnZhbHVlLmluY29tZUNhdGVnb3JpZXMsXG4gICAgICBleHBlbnNlQ2F0ZWdvcmllczogQXJyYXkuaXNBcnJheShkYXRhLmV4cGVuc2VDYXRlZ29yaWVzKVxuICAgICAgICA/IChkYXRhLmV4cGVuc2VDYXRlZ29yaWVzIGFzIENhdGVnb3J5W10pXG4gICAgICAgIDogZXhpc3RpbmcudmFsdWUuZXhwZW5zZUNhdGVnb3JpZXMsXG4gICAgICBpbmNvbWVFbnRyaWVzOiBBcnJheS5pc0FycmF5KGRhdGEuaW5jb21lRW50cmllcylcbiAgICAgICAgPyAoZGF0YS5pbmNvbWVFbnRyaWVzIGFzIEVudHJ5W10pXG4gICAgICAgIDogZXhpc3RpbmcudmFsdWUuaW5jb21lRW50cmllcyxcbiAgICAgIGV4cGVuc2VFbnRyaWVzOiBBcnJheS5pc0FycmF5KGRhdGEuZXhwZW5zZUVudHJpZXMpXG4gICAgICAgID8gKGRhdGEuZXhwZW5zZUVudHJpZXMgYXMgRW50cnlbXSlcbiAgICAgICAgOiBleGlzdGluZy52YWx1ZS5leHBlbnNlRW50cmllcyxcbiAgICB9O1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNhdmVXcml0YWJsZUJ1ZGdldChcbiAgICAgIHJlcG8sXG4gICAgICBhY3RvcixcbiAgICAgIGV4aXN0aW5nLnZhbHVlLmlkLFxuICAgICAgbmV4dCxcbiAgICApO1xuICAgIGlmICghcmVzdWx0Lm9rKSB7XG4gICAgICByZXR1cm4gZXJyb3JSZXN1bHQocmVzdWx0LnN0YXR1cywgcmVzdWx0LmVycm9yKTtcbiAgICB9XG4gICAgcmV0dXJuIGpzb25SZXN1bHQoMjAwLCBKU09OLnN0cmluZ2lmeShyZXN1bHQuYnVkZ2V0KSk7XG4gIH1cblxuICBpZiAoYnVkZ2V0T25lICE9PSBudWxsICYmIGlucHV0Lm1ldGhvZCA9PT0gXCJERUxFVEVcIikge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRlbGV0ZUJ1ZGdldEZvckFjdG9yKHJlcG8sIGFjdG9yLCBidWRnZXRPbmVbMV0gPz8gXCJcIik7XG4gICAgaWYgKCFyZXN1bHQub2spIHtcbiAgICAgIGNvbnN0IHN0YXR1cyA9IHJlc3VsdC5lcnJvciA9PT0gXCJOb3QgYWxsb3dlZC5cIiA/IDQwMyA6IDQwNDtcbiAgICAgIHJldHVybiBlcnJvclJlc3VsdChzdGF0dXMsIHJlc3VsdC5lcnJvcik7XG4gICAgfVxuICAgIHJldHVybiBqc29uUmVzdWx0KDIwMCwgSlNPTi5zdHJpbmdpZnkoeyBvazogdHJ1ZSB9KSk7XG4gIH1cblxuICBpZiAoaW5wdXQucGF0aG5hbWUgPT09IFwiL2FwaS9zdWdnZXN0LWVudHJpZXNcIikge1xuICAgIGlmIChpbnB1dC5tZXRob2QgIT09IFwiUE9TVFwiKSB7XG4gICAgICByZXR1cm4gZXJyb3JSZXN1bHQoNDA0LCBcIk5vdCBmb3VuZC5cIik7XG4gICAgfVxuICAgIGlmICghY2FuVXNlRnJvbVRleHQoYWN0b3IpKSB7XG4gICAgICByZXR1cm4gZXJyb3JSZXN1bHQoNDAzLCBcIkZyb20gdGV4dCBpcyBub3QgYWxsb3dlZC5cIik7XG4gICAgfVxuICAgIGNvbnN0IGRhdGEgPSBhc1JlY29yZChwYXJzZUpzb25Cb2R5KGlucHV0LmJvZHkpKTtcbiAgICBjb25zdCBidWRnZXRJZCA9XG4gICAgICBkYXRhICE9PSBudWxsICYmIHR5cGVvZiBkYXRhLmJ1ZGdldElkID09PSBcInN0cmluZ1wiID8gZGF0YS5idWRnZXRJZCA6IFwiXCI7XG4gICAgY29uc3QgYnVkZ2V0ID0gYnVkZ2V0SWQgPT09IFwiXCIgPyBudWxsIDogYXdhaXQgcmVwby5nZXRCdWRnZXREb2MoYnVkZ2V0SWQpO1xuICAgIGNvbnN0IHdyaXRlID0gZGVjaWRlQnVkZ2V0QWNjZXNzKGFjdG9yLCBidWRnZXQsIFwid3JpdGVcIik7XG4gICAgaWYgKCF3cml0ZS5vaykge1xuICAgICAgcmV0dXJuIGVycm9yUmVzdWx0KHdyaXRlLnN0YXR1cywgd3JpdGUuZXJyb3IpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVTdWdnZXN0RW50cmllcyhcbiAgICAgIGlucHV0LmJvZHksXG4gICAgICBpbnB1dC5nZW1pbmlBcGlLZXksXG4gICAgICBpbnB1dC5nZW1pbmlDYWxsZXIgPz8gY3JlYXRlU2RrQ2FsbGVyKCksXG4gICAgKTtcbiAgICByZXR1cm4ganNvblJlc3VsdChyZXN1bHQuc3RhdHVzLCBKU09OLnN0cmluZ2lmeShyZXN1bHQuYm9keSkpO1xuICB9XG5cbiAgaWYgKGlucHV0LnBhdGhuYW1lID09PSBcIi9hcGkvYWdlbnQvcnVuXCIpIHtcbiAgICBpZiAoaW5wdXQubWV0aG9kICE9PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIGVycm9yUmVzdWx0KDQwNCwgXCJOb3QgZm91bmQuXCIpO1xuICAgIH1cbiAgICBjb25zdCBkYXRhID0gYXNSZWNvcmQocGFyc2VKc29uQm9keShpbnB1dC5ib2R5KSk7XG4gICAgY29uc3Qgc2VjcmV0cyA9IFtpbnB1dC5nZW1pbmlBcGlLZXldLmZpbHRlcigoaXRlbSkgPT4gaXRlbSAhPT0gXCJcIik7XG4gICAgY29uc3QgcnVuID0gYXdhaXQgZXhlY3V0ZUFnZW50UnVuKHtcbiAgICAgIGFjdG9yLFxuICAgICAgcmVwbyxcbiAgICAgIG1lbW9yeTogaW5wdXQuYWdlbnRNZW1vcnkgPz8gZGVmYXVsdEFnZW50TWVtb3J5LFxuICAgICAgcmF3U3RlcHM6IGRhdGEgPT09IG51bGwgPyB1bmRlZmluZWQgOiBkYXRhLnN0ZXBzLFxuICAgICAgbm93TXM6IGlucHV0Lm5vd01zID8/IERhdGUubm93LFxuICAgICAgbWF4TXM6IGlucHV0Lm1heEFnZW50TXMgPz8gQUdFTlRfTUFYX01TLFxuICAgICAgc2VjcmV0cyxcbiAgICB9KTtcbiAgICBpZiAoXCJlcnJvclwiIGluIHJ1bikge1xuICAgICAgcmV0dXJuIGVycm9yUmVzdWx0KHJ1bi5zdGF0dXMsIHJ1bi5lcnJvcik7XG4gICAgfVxuICAgIHJldHVybiBqc29uUmVzdWx0KFxuICAgICAgMjAwLFxuICAgICAgcmVkYWN0U2VjcmV0cyhKU09OLnN0cmluZ2lmeSh7IHN0ZXBzOiBydW4uc3RlcHMgfSksIHNlY3JldHMpLFxuICAgICk7XG4gIH1cblxuICByZXR1cm4gZXJyb3JSZXN1bHQoNDA0LCBcIk5vdCBmb3VuZC5cIik7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkaXNwYXRjaEh0dHBSZXF1ZXN0KFxuICBpbnB1dDogSHR0cERpc3BhdGNoSW5wdXQsXG4pOiBQcm9taXNlPEh0dHBEaXNwYXRjaFJlc3VsdD4ge1xuICBpZiAoQnVmZmVyLmJ5dGVMZW5ndGgoaW5wdXQuYm9keSwgXCJ1dGY4XCIpID4gTUFYX1JFUVVFU1RfQllURVMpIHtcbiAgICByZXR1cm4gZXJyb3JSZXN1bHQoNDEzLCBcIlJlcXVlc3QgdG9vIGxhcmdlLlwiKTtcbiAgfVxuICBjb25zdCBhcGkgPSBhd2FpdCBkaXNwYXRjaEFwaShpbnB1dCk7XG4gIGlmIChhcGkgIT09IG51bGwpIHtcbiAgICByZXR1cm4gYXBpO1xuICB9XG4gIGlmIChpbnB1dC5tZXRob2QgIT09IFwiR0VUXCIgJiYgaW5wdXQubWV0aG9kICE9PSBcIkhFQURcIikge1xuICAgIHJldHVybiBlcnJvclJlc3VsdCg0MDQsIFwiTm90IGZvdW5kLlwiKTtcbiAgfVxuICBpZiAoIWV4aXN0c1N5bmMoaW5wdXQuZGlzdERpcikpIHtcbiAgICByZXR1cm4gZXJyb3JSZXN1bHQoNTAzLCBcIlVJIGJ1aWxkIGlzIG1pc3NpbmcuIFJ1biBucG0gcnVuIGJ1aWxkLlwiKTtcbiAgfVxuICBjb25zdCBmaWxlUGF0aCA9IHNhZmVEaXN0RmlsZShpbnB1dC5kaXN0RGlyLCBpbnB1dC5wYXRobmFtZSk7XG4gIGlmIChmaWxlUGF0aCA9PT0gbnVsbCB8fCAhZXhpc3RzU3luYyhmaWxlUGF0aCkpIHtcbiAgICByZXR1cm4gZXJyb3JSZXN1bHQoNDA0LCBcIk5vdCBmb3VuZC5cIik7XG4gIH1cbiAgY29uc3QgYm9keSA9IGlucHV0Lm1ldGhvZCA9PT0gXCJIRUFEXCIgPyBcIlwiIDogcmVhZEZpbGVTeW5jKGZpbGVQYXRoLCBcInV0ZjhcIik7XG4gIHJldHVybiB7XG4gICAgc3RhdHVzOiAyMDAsXG4gICAgaGVhZGVyczogeyBcIkNvbnRlbnQtVHlwZVwiOiBtaW1lRm9yKGZpbGVQYXRoKSB9LFxuICAgIGJvZHksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWZhdWx0RGlzdERpcigpOiBzdHJpbmcge1xuICByZXR1cm4gam9pbihwcm9jZXNzLmN3ZCgpLCBcImRpc3RcIik7XG59XG4iLCAiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyYy9hZ2VudFRvb2xzLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjL2FnZW50VG9vbHMudHNcIjtpbXBvcnQgeyBkZWNpZGVCdWRnZXRBY2Nlc3MgfSBmcm9tIFwiLi9hY2xcIjtcbmltcG9ydCB7IEFnZW50TWVtb3J5U3RvcmUgfSBmcm9tIFwiLi9hZ2VudE1lbW9yeVwiO1xuaW1wb3J0IHtcbiAgQUdFTlRfTUFYX01TLFxuICBBR0VOVF9NQVhfU1RFUFMsXG4gIHJlZGFjdFNlY3JldHMsXG59IGZyb20gXCIuL3NlcnZlckFjY2Vzc1wiO1xuaW1wb3J0IHsgZ2V0QnVkZ2V0LCBzYXZlV3JpdGFibGVCdWRnZXQsIHR5cGUgQXBwUmVwbyB9IGZyb20gXCIuL3JlcG9cIjtcbmltcG9ydCB0eXBlIHsgQWN0b3IsIEJ1ZGdldCwgQ2F0ZWdvcnksIERhdGVQYXJ0cywgRW50cnkgfSBmcm9tIFwiLi90eXBlc1wiO1xuXG5leHBvcnQgdHlwZSBBZ2VudFN0ZXBSZXN1bHQgPVxuICB8IHsgdG9vbDogc3RyaW5nOyBvazogdHJ1ZTsgdmFsdWU/OiB1bmtub3duIH1cbiAgfCB7IHRvb2w6IHN0cmluZzsgb2s6IGZhbHNlOyBzdGF0dXM6IG51bWJlcjsgZXJyb3I6IHN0cmluZyB9O1xuXG5leHBvcnQgdHlwZSBBZ2VudFJ1blJlc3VsdCA9XG4gIHwgeyBzdGF0dXM6IDIwMDsgc3RlcHM6IEFnZW50U3RlcFJlc3VsdFtdIH1cbiAgfCB7IHN0YXR1czogNDAwOyBlcnJvcjogc3RyaW5nIH07XG5cbmNvbnN0IFRPT0xTID0gbmV3IFNldChbXCJnZXRfYnVkZ2V0XCIsIFwic2F2ZV9idWRnZXRcIiwgXCJyZW1lbWJlclwiLCBcInJlY2FsbFwiXSk7XG5cbmZ1bmN0aW9uIGFzUmVjb3JkKHZhbHVlOiB1bmtub3duKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCBudWxsIHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJvYmplY3RcIiB8fCB2YWx1ZSA9PT0gbnVsbCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIHJldHVybiB2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbn1cblxuZnVuY3Rpb24gYXNEYXRlUGFydHModmFsdWU6IHVua25vd24pOiBEYXRlUGFydHMgfCBudWxsIHwgdW5kZWZpbmVkIHtcbiAgaWYgKHZhbHVlID09PSBudWxsKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgY29uc3QgcmVjID0gYXNSZWNvcmQodmFsdWUpO1xuICBpZiAoXG4gICAgcmVjID09PSBudWxsIHx8XG4gICAgdHlwZW9mIHJlYy55ZWFyICE9PSBcIm51bWJlclwiIHx8XG4gICAgdHlwZW9mIHJlYy5tb250aCAhPT0gXCJudW1iZXJcIiB8fFxuICAgIHR5cGVvZiByZWMuZGF5ICE9PSBcIm51bWJlclwiXG4gICkge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbiAgcmV0dXJuIHsgeWVhcjogcmVjLnllYXIsIG1vbnRoOiByZWMubW9udGgsIGRheTogcmVjLmRheSB9O1xufVxuXG5mdW5jdGlvbiBwYXJzZUVudHJpZXModmFsdWU6IHVua25vd24pOiBFbnRyeVtdIHwgbnVsbCB7XG4gIGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBjb25zdCBlbnRyaWVzOiBFbnRyeVtdID0gW107XG4gIGZvciAoY29uc3QgaXRlbSBvZiB2YWx1ZSkge1xuICAgIGNvbnN0IHJlYyA9IGFzUmVjb3JkKGl0ZW0pO1xuICAgIGlmIChcbiAgICAgIHJlYyA9PT0gbnVsbCB8fFxuICAgICAgdHlwZW9mIHJlYy5pZCAhPT0gXCJzdHJpbmdcIiB8fFxuICAgICAgdHlwZW9mIHJlYy5jYXRlZ29yeUlkICE9PSBcInN0cmluZ1wiIHx8XG4gICAgICB0eXBlb2YgcmVjLmNvbW1lbnQgIT09IFwic3RyaW5nXCIgfHxcbiAgICAgIHR5cGVvZiByZWMuYW1vdW50Q2VudHMgIT09IFwibnVtYmVyXCJcbiAgICApIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBjb25zdCBkYXRlID0gcmVjLmRhdGUgPT09IHVuZGVmaW5lZCA/IG51bGwgOiBhc0RhdGVQYXJ0cyhyZWMuZGF0ZSk7XG4gICAgaWYgKGRhdGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGVudHJpZXMucHVzaCh7XG4gICAgICBpZDogcmVjLmlkLFxuICAgICAgY2F0ZWdvcnlJZDogcmVjLmNhdGVnb3J5SWQsXG4gICAgICBjb21tZW50OiByZWMuY29tbWVudCxcbiAgICAgIGFtb3VudENlbnRzOiByZWMuYW1vdW50Q2VudHMsXG4gICAgICBkYXRlLFxuICAgIH0pO1xuICB9XG4gIHJldHVybiBlbnRyaWVzO1xufVxuXG5mdW5jdGlvbiBwYXJzZUNhdGVnb3JpZXModmFsdWU6IHVua25vd24pOiBDYXRlZ29yeVtdIHwgbnVsbCB7XG4gIGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBjb25zdCBsaXN0OiBDYXRlZ29yeVtdID0gW107XG4gIGZvciAoY29uc3QgaXRlbSBvZiB2YWx1ZSkge1xuICAgIGNvbnN0IHJlYyA9IGFzUmVjb3JkKGl0ZW0pO1xuICAgIGlmIChyZWMgPT09IG51bGwgfHwgdHlwZW9mIHJlYy5pZCAhPT0gXCJzdHJpbmdcIiB8fCB0eXBlb2YgcmVjLm5hbWUgIT09IFwic3RyaW5nXCIpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBsaXN0LnB1c2goeyBpZDogcmVjLmlkLCBuYW1lOiByZWMubmFtZSB9KTtcbiAgfVxuICByZXR1cm4gbGlzdDtcbn1cblxuZnVuY3Rpb24gZGVueShcbiAgdG9vbDogc3RyaW5nLFxuICBzdGF0dXM6IG51bWJlcixcbiAgZXJyb3I6IHN0cmluZyxcbik6IEFnZW50U3RlcFJlc3VsdCB7XG4gIHJldHVybiB7IHRvb2wsIG9rOiBmYWxzZSwgc3RhdHVzLCBlcnJvciB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBydW5HZXRCdWRnZXQoXG4gIGFjdG9yOiBBY3RvcixcbiAgcmVwbzogQXBwUmVwbyxcbiAgYXJnczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG4pOiBQcm9taXNlPEFnZW50U3RlcFJlc3VsdD4ge1xuICBpZiAodHlwZW9mIGFyZ3MuYnVkZ2V0SWQgIT09IFwic3RyaW5nXCIpIHtcbiAgICByZXR1cm4gZGVueShcImdldF9idWRnZXRcIiwgNDAwLCBcIkludmFsaWQgdG9vbCBhcmd1bWVudHMuXCIpO1xuICB9XG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGdldEJ1ZGdldChyZXBvLCBhY3RvciwgYXJncy5idWRnZXRJZCk7XG4gIGlmICghcmVzdWx0Lm9rKSB7XG4gICAgcmV0dXJuIGRlbnkoXCJnZXRfYnVkZ2V0XCIsIDQwNCwgcmVzdWx0LmVycm9yKTtcbiAgfVxuICByZXR1cm4geyB0b29sOiBcImdldF9idWRnZXRcIiwgb2s6IHRydWUsIHZhbHVlOiByZXN1bHQudmFsdWUgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcnVuU2F2ZUJ1ZGdldChcbiAgYWN0b3I6IEFjdG9yLFxuICByZXBvOiBBcHBSZXBvLFxuICBhcmdzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPixcbik6IFByb21pc2U8QWdlbnRTdGVwUmVzdWx0PiB7XG4gIGlmICh0eXBlb2YgYXJncy5idWRnZXRJZCAhPT0gXCJzdHJpbmdcIikge1xuICAgIHJldHVybiBkZW55KFwic2F2ZV9idWRnZXRcIiwgNDAwLCBcIkludmFsaWQgdG9vbCBhcmd1bWVudHMuXCIpO1xuICB9XG4gIGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgcmVwby5nZXRCdWRnZXREb2MoYXJncy5idWRnZXRJZCk7XG4gIGNvbnN0IGFjY2VzcyA9IGRlY2lkZUJ1ZGdldEFjY2VzcyhhY3RvciwgZXhpc3RpbmcsIFwid3JpdGVcIik7XG4gIGlmICghYWNjZXNzLm9rKSB7XG4gICAgcmV0dXJuIGRlbnkoXCJzYXZlX2J1ZGdldFwiLCBhY2Nlc3Muc3RhdHVzLCBhY2Nlc3MuZXJyb3IpO1xuICB9XG4gIGlmIChleGlzdGluZyA9PT0gbnVsbCkge1xuICAgIHJldHVybiBkZW55KFwic2F2ZV9idWRnZXRcIiwgNDA0LCBcIk5vdCBmb3VuZC5cIik7XG4gIH1cbiAgbGV0IG5leHQ6IEJ1ZGdldCA9IGV4aXN0aW5nO1xuICBpZiAoYXJncy5uYW1lICE9PSB1bmRlZmluZWQpIHtcbiAgICBpZiAodHlwZW9mIGFyZ3MubmFtZSAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgcmV0dXJuIGRlbnkoXCJzYXZlX2J1ZGdldFwiLCA0MDAsIFwiSW52YWxpZCB0b29sIGFyZ3VtZW50cy5cIik7XG4gICAgfVxuICAgIG5leHQgPSB7IC4uLm5leHQsIG5hbWU6IGFyZ3MubmFtZSB9O1xuICB9XG4gIGlmIChhcmdzLmRlc2NyaXB0aW9uICE9PSB1bmRlZmluZWQpIHtcbiAgICBpZiAodHlwZW9mIGFyZ3MuZGVzY3JpcHRpb24gIT09IFwic3RyaW5nXCIpIHtcbiAgICAgIHJldHVybiBkZW55KFwic2F2ZV9idWRnZXRcIiwgNDAwLCBcIkludmFsaWQgdG9vbCBhcmd1bWVudHMuXCIpO1xuICAgIH1cbiAgICBuZXh0ID0geyAuLi5uZXh0LCBkZXNjcmlwdGlvbjogYXJncy5kZXNjcmlwdGlvbiB9O1xuICB9XG4gIGlmIChhcmdzLmV4cGVuc2VFbnRyaWVzICE9PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBlbnRyaWVzID0gcGFyc2VFbnRyaWVzKGFyZ3MuZXhwZW5zZUVudHJpZXMpO1xuICAgIGlmIChlbnRyaWVzID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gZGVueShcInNhdmVfYnVkZ2V0XCIsIDQwMCwgXCJJbnZhbGlkIHRvb2wgYXJndW1lbnRzLlwiKTtcbiAgICB9XG4gICAgbmV4dCA9IHsgLi4ubmV4dCwgZXhwZW5zZUVudHJpZXM6IGVudHJpZXMgfTtcbiAgfVxuICBpZiAoYXJncy5pbmNvbWVFbnRyaWVzICE9PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBlbnRyaWVzID0gcGFyc2VFbnRyaWVzKGFyZ3MuaW5jb21lRW50cmllcyk7XG4gICAgaWYgKGVudHJpZXMgPT09IG51bGwpIHtcbiAgICAgIHJldHVybiBkZW55KFwic2F2ZV9idWRnZXRcIiwgNDAwLCBcIkludmFsaWQgdG9vbCBhcmd1bWVudHMuXCIpO1xuICAgIH1cbiAgICBuZXh0ID0geyAuLi5uZXh0LCBpbmNvbWVFbnRyaWVzOiBlbnRyaWVzIH07XG4gIH1cbiAgaWYgKGFyZ3MuaW5jb21lQ2F0ZWdvcmllcyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc3QgY2F0cyA9IHBhcnNlQ2F0ZWdvcmllcyhhcmdzLmluY29tZUNhdGVnb3JpZXMpO1xuICAgIGlmIChjYXRzID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gZGVueShcInNhdmVfYnVkZ2V0XCIsIDQwMCwgXCJJbnZhbGlkIHRvb2wgYXJndW1lbnRzLlwiKTtcbiAgICB9XG4gICAgbmV4dCA9IHsgLi4ubmV4dCwgaW5jb21lQ2F0ZWdvcmllczogY2F0cyB9O1xuICB9XG4gIGlmIChhcmdzLmV4cGVuc2VDYXRlZ29yaWVzICE9PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBjYXRzID0gcGFyc2VDYXRlZ29yaWVzKGFyZ3MuZXhwZW5zZUNhdGVnb3JpZXMpO1xuICAgIGlmIChjYXRzID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gZGVueShcInNhdmVfYnVkZ2V0XCIsIDQwMCwgXCJJbnZhbGlkIHRvb2wgYXJndW1lbnRzLlwiKTtcbiAgICB9XG4gICAgbmV4dCA9IHsgLi4ubmV4dCwgZXhwZW5zZUNhdGVnb3JpZXM6IGNhdHMgfTtcbiAgfVxuICBjb25zdCBzYXZlZCA9IGF3YWl0IHNhdmVXcml0YWJsZUJ1ZGdldChyZXBvLCBhY3RvciwgZXhpc3RpbmcuaWQsIG5leHQpO1xuICBpZiAoIXNhdmVkLm9rKSB7XG4gICAgcmV0dXJuIGRlbnkoXCJzYXZlX2J1ZGdldFwiLCBzYXZlZC5zdGF0dXMsIHNhdmVkLmVycm9yKTtcbiAgfVxuICByZXR1cm4geyB0b29sOiBcInNhdmVfYnVkZ2V0XCIsIG9rOiB0cnVlLCB2YWx1ZTogc2F2ZWQuYnVkZ2V0IH07XG59XG5cbmZ1bmN0aW9uIHJ1blJlbWVtYmVyKFxuICBhY3RvcjogQWN0b3IsXG4gIG1lbW9yeTogQWdlbnRNZW1vcnlTdG9yZSxcbiAgYXJnczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG4pOiBBZ2VudFN0ZXBSZXN1bHQge1xuICBpZiAodHlwZW9mIGFyZ3Mua2V5ICE9PSBcInN0cmluZ1wiIHx8IHR5cGVvZiBhcmdzLnZhbHVlICE9PSBcInN0cmluZ1wiKSB7XG4gICAgcmV0dXJuIGRlbnkoXCJyZW1lbWJlclwiLCA0MDAsIFwiSW52YWxpZCB0b29sIGFyZ3VtZW50cy5cIik7XG4gIH1cbiAgaWYgKGFyZ3Mua2V5Lmxlbmd0aCA9PT0gMCB8fCBhcmdzLmtleS5sZW5ndGggPiA2NCB8fCBhcmdzLnZhbHVlLmxlbmd0aCA+IDEwMjQpIHtcbiAgICByZXR1cm4gZGVueShcInJlbWVtYmVyXCIsIDQwMCwgXCJJbnZhbGlkIHRvb2wgYXJndW1lbnRzLlwiKTtcbiAgfVxuICBtZW1vcnkucmVtZW1iZXIoYWN0b3IucHJvZmlsZS5pZCwgYXJncy5rZXksIGFyZ3MudmFsdWUpO1xuICByZXR1cm4geyB0b29sOiBcInJlbWVtYmVyXCIsIG9rOiB0cnVlIH07XG59XG5cbmZ1bmN0aW9uIHJ1blJlY2FsbChcbiAgYWN0b3I6IEFjdG9yLFxuICBtZW1vcnk6IEFnZW50TWVtb3J5U3RvcmUsXG4gIGFyZ3M6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LFxuKTogQWdlbnRTdGVwUmVzdWx0IHtcbiAgaWYgKHR5cGVvZiBhcmdzLmtleSAhPT0gXCJzdHJpbmdcIikge1xuICAgIHJldHVybiBkZW55KFwicmVjYWxsXCIsIDQwMCwgXCJJbnZhbGlkIHRvb2wgYXJndW1lbnRzLlwiKTtcbiAgfVxuICBjb25zdCB2YWx1ZSA9IG1lbW9yeS5yZWNhbGwoYWN0b3IucHJvZmlsZS5pZCwgYXJncy5rZXkpO1xuICBpZiAodmFsdWUgPT09IG51bGwpIHtcbiAgICByZXR1cm4gZGVueShcInJlY2FsbFwiLCA0MDQsIFwiTm90IGZvdW5kLlwiKTtcbiAgfVxuICByZXR1cm4geyB0b29sOiBcInJlY2FsbFwiLCBvazogdHJ1ZSwgdmFsdWU6IHsgdmFsdWUgfSB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBleGVjdXRlVG9vbChcbiAgYWN0b3I6IEFjdG9yLFxuICByZXBvOiBBcHBSZXBvLFxuICBtZW1vcnk6IEFnZW50TWVtb3J5U3RvcmUsXG4gIHRvb2w6IHN0cmluZyxcbiAgYXJnczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG4pOiBQcm9taXNlPEFnZW50U3RlcFJlc3VsdD4ge1xuICBpZiAodG9vbCA9PT0gXCJnZXRfYnVkZ2V0XCIpIHtcbiAgICByZXR1cm4gcnVuR2V0QnVkZ2V0KGFjdG9yLCByZXBvLCBhcmdzKTtcbiAgfVxuICBpZiAodG9vbCA9PT0gXCJzYXZlX2J1ZGdldFwiKSB7XG4gICAgcmV0dXJuIHJ1blNhdmVCdWRnZXQoYWN0b3IsIHJlcG8sIGFyZ3MpO1xuICB9XG4gIGlmICh0b29sID09PSBcInJlbWVtYmVyXCIpIHtcbiAgICByZXR1cm4gcnVuUmVtZW1iZXIoYWN0b3IsIG1lbW9yeSwgYXJncyk7XG4gIH1cbiAgcmV0dXJuIHJ1blJlY2FsbChhY3RvciwgbWVtb3J5LCBhcmdzKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVBZ2VudFJ1bihpbnB1dDoge1xuICBhY3RvcjogQWN0b3I7XG4gIHJlcG86IEFwcFJlcG87XG4gIG1lbW9yeTogQWdlbnRNZW1vcnlTdG9yZTtcbiAgcmF3U3RlcHM6IHVua25vd247XG4gIG5vd01zOiAoKSA9PiBudW1iZXI7XG4gIG1heE1zPzogbnVtYmVyO1xuICBtYXhTdGVwcz86IG51bWJlcjtcbiAgc2VjcmV0cz86IHJlYWRvbmx5IHN0cmluZ1tdO1xufSk6IFByb21pc2U8QWdlbnRSdW5SZXN1bHQ+IHtcbiAgY29uc3QgbWF4U3RlcHMgPSBpbnB1dC5tYXhTdGVwcyA/PyBBR0VOVF9NQVhfU1RFUFM7XG4gIGNvbnN0IG1heE1zID0gaW5wdXQubWF4TXMgPz8gQUdFTlRfTUFYX01TO1xuICBpZiAoIUFycmF5LmlzQXJyYXkoaW5wdXQucmF3U3RlcHMpKSB7XG4gICAgcmV0dXJuIHsgc3RhdHVzOiA0MDAsIGVycm9yOiBcIkludmFsaWQgdG9vbCBhcmd1bWVudHMuXCIgfTtcbiAgfVxuICBpZiAoaW5wdXQucmF3U3RlcHMubGVuZ3RoID4gbWF4U3RlcHMpIHtcbiAgICByZXR1cm4geyBzdGF0dXM6IDQwMCwgZXJyb3I6IFwiVG9vIG1hbnkgc3RlcHMuXCIgfTtcbiAgfVxuICBjb25zdCBzdGFydGVkQXQgPSBpbnB1dC5ub3dNcygpO1xuICBjb25zdCBzdGVwczogQWdlbnRTdGVwUmVzdWx0W10gPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBpbnB1dC5yYXdTdGVwcy5sZW5ndGg7IGkgKz0gMSkge1xuICAgIGNvbnN0IHJhdyA9IGFzUmVjb3JkKGlucHV0LnJhd1N0ZXBzW2ldKTtcbiAgICBjb25zdCB0b29sID1cbiAgICAgIHJhdyAhPT0gbnVsbCAmJiB0eXBlb2YgcmF3LnRvb2wgPT09IFwic3RyaW5nXCIgPyByYXcudG9vbCA6IFwiXCI7XG4gICAgaWYgKGkgPiAwICYmIGlucHV0Lm5vd01zKCkgLSBzdGFydGVkQXQgPiBtYXhNcykge1xuICAgICAgc3RlcHMucHVzaChkZW55KHRvb2wgPT09IFwiXCIgPyBcInVua25vd25cIiA6IHRvb2wsIDQwMCwgXCJUaW1lIGxpbWl0IGV4Y2VlZGVkLlwiKSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgaWYgKHJhdyA9PT0gbnVsbCB8fCAhVE9PTFMuaGFzKHRvb2wpKSB7XG4gICAgICBzdGVwcy5wdXNoKGRlbnkodG9vbCA9PT0gXCJcIiA/IFwidW5rbm93blwiIDogdG9vbCwgNDAwLCBcIkludmFsaWQgdG9vbC5cIikpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IGFyZ3MgPSBhc1JlY29yZChyYXcuYXJndW1lbnRzKSA/PyB7fTtcbiAgICBzdGVwcy5wdXNoKGF3YWl0IGV4ZWN1dGVUb29sKGlucHV0LmFjdG9yLCBpbnB1dC5yZXBvLCBpbnB1dC5tZW1vcnksIHRvb2wsIGFyZ3MpKTtcbiAgfVxuICBjb25zdCBzZWNyZXRzID0gaW5wdXQuc2VjcmV0cyA/PyBbXTtcbiAgY29uc3QgZW5jb2RlZCA9IHJlZGFjdFNlY3JldHMoSlNPTi5zdHJpbmdpZnkoc3RlcHMpLCBzZWNyZXRzKTtcbiAgcmV0dXJuIHsgc3RhdHVzOiAyMDAsIHN0ZXBzOiBKU09OLnBhcnNlKGVuY29kZWQpIGFzIEFnZW50U3RlcFJlc3VsdFtdIH07XG59XG4iLCAiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyYy9zZXJ2ZXJBY2Nlc3MudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL2hvbWUvcm9nZXIvR2l0SHViL25leHRwYXRoLWJ1ZGdldGFwcC9zcmMvc2VydmVyQWNjZXNzLnRzXCI7ZXhwb3J0IGNvbnN0IE1BWF9SRVFVRVNUX0JZVEVTID0gNjU1MzY7XG5leHBvcnQgY29uc3QgQUdFTlRfTUFYX1NURVBTID0gODtcbmV4cG9ydCBjb25zdCBBR0VOVF9NQVhfTVMgPSA1MDAwO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVkYWN0U2VjcmV0cyh0ZXh0OiBzdHJpbmcsIHNlY3JldHM6IHJlYWRvbmx5IHN0cmluZ1tdKTogc3RyaW5nIHtcbiAgbGV0IG91dCA9IHRleHQ7XG4gIGZvciAoY29uc3Qgc2VjcmV0IG9mIHNlY3JldHMpIHtcbiAgICBpZiAoc2VjcmV0Lmxlbmd0aCA8IDgpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBvdXQgPSBvdXQuc3BsaXQoc2VjcmV0KS5qb2luKFwiW3JlZGFjdGVkXVwiKTtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuIiwgImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyY1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL2hvbWUvcm9nZXIvR2l0SHViL25leHRwYXRoLWJ1ZGdldGFwcC9zcmMvZ2VtaW5pU3VnZ2VzdC50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyYy9nZW1pbmlTdWdnZXN0LnRzXCI7aW1wb3J0IHsgR29vZ2xlR2VuZXJhdGl2ZUFJIH0gZnJvbSBcIkBnb29nbGUvZ2VuZXJhdGl2ZS1haVwiO1xuaW1wb3J0IHsgcGFyc2VTdWdnZXN0UmVzcG9uc2UsIHR5cGUgU3VnZ2VzdEl0ZW0gfSBmcm9tIFwiLi9zdWdnZXN0XCI7XG5cbmV4cG9ydCBjb25zdCBHRU1JTklfTU9ERUxfSUQgPSBcImdlbWluaS0zLjYtZmxhc2hcIjtcbmV4cG9ydCBjb25zdCBHRU1JTklfSlNPTl9NSU1FID0gXCJhcHBsaWNhdGlvbi9qc29uXCI7XG5cbmV4cG9ydCB0eXBlIENhdGVnb3J5UmVmID0geyBpZDogc3RyaW5nOyBuYW1lOiBzdHJpbmcgfTtcblxuZXhwb3J0IHR5cGUgU3VnZ2VzdFJlcXVlc3RCb2R5ID0ge1xuICB0ZXh0OiBzdHJpbmc7XG4gIGluY29tZUNhdGVnb3JpZXM6IENhdGVnb3J5UmVmW107XG4gIGV4cGVuc2VDYXRlZ29yaWVzOiBDYXRlZ29yeVJlZltdO1xufTtcblxuZXhwb3J0IHR5cGUgR2VtaW5pSnNvbkNhbGwgPSB7XG4gIGFwaUtleTogc3RyaW5nO1xuICBtb2RlbDogc3RyaW5nO1xuICByZXNwb25zZU1pbWVUeXBlOiBzdHJpbmc7XG4gIHByb21wdDogc3RyaW5nO1xufTtcblxuZXhwb3J0IHR5cGUgR2VtaW5pQ2FsbGVyID0ge1xuICBnZW5lcmF0ZUpzb246IChpbnB1dDogR2VtaW5pSnNvbkNhbGwpID0+IFByb21pc2U8c3RyaW5nPjtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTZGtDYWxsZXIoKTogR2VtaW5pQ2FsbGVyIHtcbiAgcmV0dXJuIHtcbiAgICBhc3luYyBnZW5lcmF0ZUpzb24oaW5wdXQpIHtcbiAgICAgIGNvbnN0IGdlbkFJID0gbmV3IEdvb2dsZUdlbmVyYXRpdmVBSShpbnB1dC5hcGlLZXkpO1xuICAgICAgY29uc3QgbW9kZWwgPSBnZW5BSS5nZXRHZW5lcmF0aXZlTW9kZWwoe1xuICAgICAgICBtb2RlbDogaW5wdXQubW9kZWwsXG4gICAgICAgIGdlbmVyYXRpb25Db25maWc6IHsgcmVzcG9uc2VNaW1lVHlwZTogaW5wdXQucmVzcG9uc2VNaW1lVHlwZSB9LFxuICAgICAgfSk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBtb2RlbC5nZW5lcmF0ZUNvbnRlbnQoaW5wdXQucHJvbXB0KTtcbiAgICAgIHJldHVybiByZXN1bHQucmVzcG9uc2UudGV4dCgpO1xuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGlzQ2F0ZWdvcnlSZWYodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBDYXRlZ29yeVJlZiB7XG4gIHJldHVybiAoXG4gICAgdHlwZW9mIHZhbHVlID09PSBcIm9iamVjdFwiICYmXG4gICAgdmFsdWUgIT09IG51bGwgJiZcbiAgICBcImlkXCIgaW4gdmFsdWUgJiZcbiAgICBcIm5hbWVcIiBpbiB2YWx1ZSAmJlxuICAgIHR5cGVvZiB2YWx1ZS5pZCA9PT0gXCJzdHJpbmdcIiAmJlxuICAgIHR5cGVvZiB2YWx1ZS5uYW1lID09PSBcInN0cmluZ1wiXG4gICk7XG59XG5cbmZ1bmN0aW9uIHBhcnNlQ2F0ZWdvcnlMaXN0KHZhbHVlOiB1bmtub3duKTogQ2F0ZWdvcnlSZWZbXSB8IG51bGwge1xuICBpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgY29uc3QgbGlzdDogQ2F0ZWdvcnlSZWZbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGl0ZW0gb2YgdmFsdWUpIHtcbiAgICBpZiAoIWlzQ2F0ZWdvcnlSZWYoaXRlbSkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBsaXN0LnB1c2goaXRlbSk7XG4gIH1cbiAgcmV0dXJuIGxpc3Q7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVN1Z2dlc3RSZXF1ZXN0Qm9keShcbiAgZGF0YTogdW5rbm93bixcbik6IFN1Z2dlc3RSZXF1ZXN0Qm9keSB8IG51bGwge1xuICBpZiAodHlwZW9mIGRhdGEgIT09IFwib2JqZWN0XCIgfHwgZGF0YSA9PT0gbnVsbCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGlmICghKFwidGV4dFwiIGluIGRhdGEpIHx8IHR5cGVvZiBkYXRhLnRleHQgIT09IFwic3RyaW5nXCIpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBjb25zdCBpbmNvbWVDYXRlZ29yaWVzID0gcGFyc2VDYXRlZ29yeUxpc3QoXG4gICAgXCJpbmNvbWVDYXRlZ29yaWVzXCIgaW4gZGF0YSA/IGRhdGEuaW5jb21lQ2F0ZWdvcmllcyA6IHVuZGVmaW5lZCxcbiAgKTtcbiAgY29uc3QgZXhwZW5zZUNhdGVnb3JpZXMgPSBwYXJzZUNhdGVnb3J5TGlzdChcbiAgICBcImV4cGVuc2VDYXRlZ29yaWVzXCIgaW4gZGF0YSA/IGRhdGEuZXhwZW5zZUNhdGVnb3JpZXMgOiB1bmRlZmluZWQsXG4gICk7XG4gIGlmIChpbmNvbWVDYXRlZ29yaWVzID09PSBudWxsIHx8IGV4cGVuc2VDYXRlZ29yaWVzID09PSBudWxsKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICB0ZXh0OiBkYXRhLnRleHQsXG4gICAgaW5jb21lQ2F0ZWdvcmllcyxcbiAgICBleHBlbnNlQ2F0ZWdvcmllcyxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkU3VnZ2VzdFByb21wdChyZXF1ZXN0OiBTdWdnZXN0UmVxdWVzdEJvZHkpOiBzdHJpbmcge1xuICByZXR1cm4gW1xuICAgIFwiRXh0cmFjdCBpbmNvbWUgYW5kIGV4cGVuc2UgaXRlbXMgZnJvbSB0aGUgdXNlcidzIGZyZWUgdGV4dC5cIixcbiAgICBcIlJldHVybiBKU09OIHdpdGggYW4gaXRlbXMgYXJyYXkgb25seS5cIixcbiAgICBcIkVhY2ggaXRlbToga2luZCAoaW5jb21lLCBleHBlbnNlLCBvciBudWxsIGlmIHVuY2xlYXIpLCBjYXRlZ29yeUlkIChleGlzdGluZyBpZCBvciBudWxsKSwgY2F0ZWdvcnlOYW1lLCBjb21tZW50LCBhbW91bnRFdXJvcyAobnVtYmVyIG9ubHkpLCBkYXRlIChkZC5tbS55eXl5IG9yIG51bGwpLlwiLFxuICAgIFwiY2F0ZWdvcnlOYW1lIG11c3QgYmUgYSBnZW5lcmFsIGNhdGVnb3J5IHBlb3BsZSByZXVzZSBpbiBhIGJ1ZGdldCAoZm9yIGV4YW1wbGUgZm9vZCwgZ3JvY2VyaWVzLCByZW50LCBzYWxhcnksIGNsb3RoZXMpLCBub3QgdGhlIHNwZWNpZmljIGl0ZW0uXCIsXG4gICAgXCJEbyBub3QgdXNlIHRoZSBzcGVjaWZpYyBpdGVtIGFzIGNhdGVnb3J5TmFtZTogbWlsayBpcyBub3QgYSBjYXRlZ29yeTsgbmV3IHNob2VzIGlzIG5vdCBhIGNhdGVnb3J5LlwiLFxuICAgIFwiUHV0IHRoZSBzcGVjaWZpYyBpdGVtIGluIGNvbW1lbnQgKGZvciBleGFtcGxlIG1pbGssIG5ldyBzaG9lcykuXCIsXG4gICAgXCJFeGFtcGxlOiB1c2VyIHRleHQgXFxcIm1pbGsgNCBldXJvc1xcXCIgLT4gY2F0ZWdvcnlOYW1lIGxpa2UgZm9vZCBvciBncm9jZXJpZXMsIGNvbW1lbnQgbWlsaywgbm90IGNhdGVnb3J5TmFtZSBtaWxrLlwiLFxuICAgIFwiUmV1c2UgYW4gZXhpc3RpbmcgY2F0ZWdvcnkgaWQgd2hlbiB0aGUgaXRlbSBiZWxvbmdzIGluIHRoYXQgZ2VuZXJhbCBjYXRlZ29yeS5cIixcbiAgICBcIklmIG5vIGNhdGVnb3J5IGZpdHMsIHByb3Bvc2UgYSBuZXcgZ2VuZXJhbCBjYXRlZ29yeU5hbWUgaW4gdGhlIHVzZXIncyBsYW5ndWFnZSAoZG8gbm90IHRyYW5zbGF0ZSkgYW5kIHNldCBjYXRlZ29yeUlkIHRvIG51bGwuXCIsXG4gICAgXCJOZXZlciBzdWdnZXN0IGRlbGV0aW5nLCByZW5hbWluZywgb3IgZWRpdGluZyBleGlzdGluZyBkYXRhLlwiLFxuICAgIFwiSWdub3JlIGN1cnJlbmN5IHdvcmRzIGFuZCBzeW1ib2xzIChldXJvLCBldXJvcywgRVVSLCBcdTIwQUMsIGFuZCBvdGhlcnMpOyBrZWVwIG9ubHkgdGhlIG51bWVyaWMgYW1vdW50LlwiLFxuICAgIFwiRXhpc3RpbmcgaW5jb21lIGNhdGVnb3JpZXM6XCIsXG4gICAgSlNPTi5zdHJpbmdpZnkocmVxdWVzdC5pbmNvbWVDYXRlZ29yaWVzKSxcbiAgICBcIkV4aXN0aW5nIGV4cGVuc2UgY2F0ZWdvcmllczpcIixcbiAgICBKU09OLnN0cmluZ2lmeShyZXF1ZXN0LmV4cGVuc2VDYXRlZ29yaWVzKSxcbiAgICBcIlVzZXIgdGV4dDpcIixcbiAgICByZXF1ZXN0LnRleHQsXG4gIF0uam9pbihcIlxcblwiKTtcbn1cblxuZXhwb3J0IHR5cGUgU3VnZ2VzdEh0dHBSZXN1bHQgPSB7XG4gIHN0YXR1czogbnVtYmVyO1xuICBib2R5OiB7IGl0ZW1zOiBTdWdnZXN0SXRlbVtdIH0gfCB7IGVycm9yOiBzdHJpbmcgfTtcbn07XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYW5kbGVTdWdnZXN0RW50cmllcyhcbiAgcmF3Qm9keTogc3RyaW5nLFxuICBhcGlLZXk6IHN0cmluZyxcbiAgY2FsbGVyOiBHZW1pbmlDYWxsZXIsXG4pOiBQcm9taXNlPFN1Z2dlc3RIdHRwUmVzdWx0PiB7XG4gIGlmIChhcGlLZXkudHJpbSgpID09PSBcIlwiKSB7XG4gICAgcmV0dXJuIHsgc3RhdHVzOiA1MDMsIGJvZHk6IHsgZXJyb3I6IFwiR2VtaW5pIEFQSSBrZXkgaXMgbWlzc2luZy5cIiB9IH07XG4gIH1cbiAgbGV0IHBhcnNlZEpzb246IHVua25vd247XG4gIHRyeSB7XG4gICAgcGFyc2VkSnNvbiA9IEpTT04ucGFyc2UocmF3Qm9keSkgYXMgdW5rbm93bjtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHsgc3RhdHVzOiA0MDAsIGJvZHk6IHsgZXJyb3I6IFwiQ291bGQgbm90IHN1Z2dlc3QgZW50cmllcy5cIiB9IH07XG4gIH1cbiAgY29uc3QgcmVxdWVzdCA9IHBhcnNlU3VnZ2VzdFJlcXVlc3RCb2R5KHBhcnNlZEpzb24pO1xuICBpZiAocmVxdWVzdCA9PT0gbnVsbCkge1xuICAgIHJldHVybiB7IHN0YXR1czogNDAwLCBib2R5OiB7IGVycm9yOiBcIkNvdWxkIG5vdCBzdWdnZXN0IGVudHJpZXMuXCIgfSB9O1xuICB9XG4gIGNvbnN0IHByb21wdCA9IGJ1aWxkU3VnZ2VzdFByb21wdChyZXF1ZXN0KTtcbiAgbGV0IHJhdzogc3RyaW5nO1xuICB0cnkge1xuICAgIHJhdyA9IGF3YWl0IGNhbGxlci5nZW5lcmF0ZUpzb24oe1xuICAgICAgYXBpS2V5LFxuICAgICAgbW9kZWw6IEdFTUlOSV9NT0RFTF9JRCxcbiAgICAgIHJlc3BvbnNlTWltZVR5cGU6IEdFTUlOSV9KU09OX01JTUUsXG4gICAgICBwcm9tcHQsXG4gICAgfSk7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiB7IHN0YXR1czogNTAyLCBib2R5OiB7IGVycm9yOiBcIkNvdWxkIG5vdCBzdWdnZXN0IGVudHJpZXMuXCIgfSB9O1xuICB9XG4gIGxldCBtb2RlbEpzb246IHVua25vd247XG4gIHRyeSB7XG4gICAgbW9kZWxKc29uID0gSlNPTi5wYXJzZShyYXcpIGFzIHVua25vd247XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiB7IHN0YXR1czogNTAyLCBib2R5OiB7IGVycm9yOiBcIkNvdWxkIG5vdCBzdWdnZXN0IGVudHJpZXMuXCIgfSB9O1xuICB9XG4gIGNvbnN0IHBhcnNlZCA9IHBhcnNlU3VnZ2VzdFJlc3BvbnNlKG1vZGVsSnNvbik7XG4gIGlmICghcGFyc2VkLm9rKSB7XG4gICAgcmV0dXJuIHsgc3RhdHVzOiA1MDIsIGJvZHk6IHsgZXJyb3I6IHBhcnNlZC5lcnJvciB9IH07XG4gIH1cbiAgcmV0dXJuIHsgc3RhdHVzOiAyMDAsIGJvZHk6IHsgaXRlbXM6IHBhcnNlZC5pdGVtcyB9IH07XG59XG4iLCAiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyYy9zdWdnZXN0LnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjL3N1Z2dlc3QudHNcIjtpbXBvcnQgeyBsaXN0QnVkZ2V0cyB9IGZyb20gXCIuL2J1ZGdldHNcIjtcbmltcG9ydCB7IGFkZENhdGVnb3J5IH0gZnJvbSBcIi4vY2F0ZWdvcmllc1wiO1xuaW1wb3J0IHsgcGFyc2VEYXRlIH0gZnJvbSBcIi4vZGF0ZXNcIjtcbmltcG9ydCB7IGFkZEVudHJ5IH0gZnJvbSBcIi4vZW50cmllc1wiO1xuaW1wb3J0IHsgZm9ybWF0TW9uZXksIHBhcnNlTW9uZXkgfSBmcm9tIFwiLi9tb25leVwiO1xuaW1wb3J0IHsgaXNOYW1lVGFrZW4sIG5vcm1hbGl6ZU5hbWUgfSBmcm9tIFwiLi9uYW1lc1wiO1xuaW1wb3J0IHR5cGUgeyBCdWRnZXQsIENhdGVnb3J5IH0gZnJvbSBcIi4vdHlwZXNcIjtcblxuZXhwb3J0IHR5cGUgU3VnZ2VzdEtpbmQgPSBcImluY29tZVwiIHwgXCJleHBlbnNlXCI7XG5cbmV4cG9ydCB0eXBlIFN1Z2dlc3RJdGVtID0ge1xuICBraW5kOiBTdWdnZXN0S2luZCB8IG51bGw7XG4gIGNhdGVnb3J5SWQ6IHN0cmluZyB8IG51bGw7XG4gIGNhdGVnb3J5TmFtZTogc3RyaW5nO1xuICBjb21tZW50OiBzdHJpbmc7XG4gIGFtb3VudEV1cm9zOiBudW1iZXI7XG4gIGRhdGU6IHN0cmluZyB8IG51bGw7XG59O1xuXG5leHBvcnQgdHlwZSBSZXZpZXdSb3cgPSB7XG4gIGtpbmQ6IFN1Z2dlc3RLaW5kIHwgbnVsbDtcbiAgY2F0ZWdvcnlJZDogc3RyaW5nIHwgbnVsbDtcbiAgY2F0ZWdvcnlOYW1lOiBzdHJpbmc7XG4gIGNvbW1lbnQ6IHN0cmluZztcbiAgYW1vdW50VGV4dDogc3RyaW5nO1xuICBkYXRlVGV4dDogc3RyaW5nO1xuICBlcnJvcjogc3RyaW5nO1xufTtcblxuZXhwb3J0IHR5cGUgUGFyc2VTdWdnZXN0UmVzdWx0ID1cbiAgfCB7IG9rOiB0cnVlOyBpdGVtczogU3VnZ2VzdEl0ZW1bXSB9XG4gIHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfTtcblxuY29uc3QgUEFSU0VfRkFJTDogUGFyc2VTdWdnZXN0UmVzdWx0ID0ge1xuICBvazogZmFsc2UsXG4gIGVycm9yOiBcIkNvdWxkIG5vdCBzdWdnZXN0IGVudHJpZXMuXCIsXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gYW1vdW50RXVyb3NUb1RleHQoYW1vdW50RXVyb3M6IG51bWJlcik6IHN0cmluZyB7XG4gIHJldHVybiBmb3JtYXRNb25leShNYXRoLnJvdW5kKGFtb3VudEV1cm9zICogMTAwKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdWdnZXN0SXRlbVRvUmV2aWV3Um93KGl0ZW06IFN1Z2dlc3RJdGVtKTogUmV2aWV3Um93IHtcbiAgcmV0dXJuIHtcbiAgICBraW5kOiBpdGVtLmtpbmQsXG4gICAgY2F0ZWdvcnlJZDogaXRlbS5jYXRlZ29yeUlkLFxuICAgIGNhdGVnb3J5TmFtZTogaXRlbS5jYXRlZ29yeU5hbWUsXG4gICAgY29tbWVudDogaXRlbS5jb21tZW50LFxuICAgIGFtb3VudFRleHQ6IGFtb3VudEV1cm9zVG9UZXh0KGl0ZW0uYW1vdW50RXVyb3MpLFxuICAgIGRhdGVUZXh0OiBpdGVtLmRhdGUgPz8gXCJcIixcbiAgICBlcnJvcjogXCJcIixcbiAgfTtcbn1cblxuZnVuY3Rpb24gaXNLaW5kKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgU3VnZ2VzdEtpbmQgfCBudWxsIHtcbiAgcmV0dXJuIHZhbHVlID09PSBcImluY29tZVwiIHx8IHZhbHVlID09PSBcImV4cGVuc2VcIiB8fCB2YWx1ZSA9PT0gbnVsbDtcbn1cblxuZnVuY3Rpb24gcGFyc2VJdGVtKHJhdzogdW5rbm93bik6IFN1Z2dlc3RJdGVtIHwgbnVsbCB7XG4gIGlmICh0eXBlb2YgcmF3ICE9PSBcIm9iamVjdFwiIHx8IHJhdyA9PT0gbnVsbCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGNvbnN0IHJlY29yZCA9IHJhdyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgaWYgKCFpc0tpbmQocmVjb3JkLmtpbmQgPz8gbnVsbCkpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBpZiAoXG4gICAgcmVjb3JkLmNhdGVnb3J5SWQgIT09IG51bGwgJiZcbiAgICByZWNvcmQuY2F0ZWdvcnlJZCAhPT0gdW5kZWZpbmVkICYmXG4gICAgdHlwZW9mIHJlY29yZC5jYXRlZ29yeUlkICE9PSBcInN0cmluZ1wiXG4gICkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGlmICh0eXBlb2YgcmVjb3JkLmNhdGVnb3J5TmFtZSAhPT0gXCJzdHJpbmdcIikge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGlmICh0eXBlb2YgcmVjb3JkLmNvbW1lbnQgIT09IFwic3RyaW5nXCIpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBpZiAodHlwZW9mIHJlY29yZC5hbW91bnRFdXJvcyAhPT0gXCJudW1iZXJcIiB8fCAhTnVtYmVyLmlzRmluaXRlKHJlY29yZC5hbW91bnRFdXJvcykpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBpZiAocmVjb3JkLmRhdGUgIT09IG51bGwgJiYgdHlwZW9mIHJlY29yZC5kYXRlICE9PSBcInN0cmluZ1wiKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBraW5kOiAocmVjb3JkLmtpbmQgPz8gbnVsbCkgYXMgU3VnZ2VzdEtpbmQgfCBudWxsLFxuICAgIGNhdGVnb3J5SWQ6XG4gICAgICB0eXBlb2YgcmVjb3JkLmNhdGVnb3J5SWQgPT09IFwic3RyaW5nXCIgPyByZWNvcmQuY2F0ZWdvcnlJZCA6IG51bGwsXG4gICAgY2F0ZWdvcnlOYW1lOiByZWNvcmQuY2F0ZWdvcnlOYW1lLFxuICAgIGNvbW1lbnQ6IHJlY29yZC5jb21tZW50LFxuICAgIGFtb3VudEV1cm9zOiByZWNvcmQuYW1vdW50RXVyb3MsXG4gICAgZGF0ZTogdHlwZW9mIHJlY29yZC5kYXRlID09PSBcInN0cmluZ1wiID8gcmVjb3JkLmRhdGUgOiBudWxsLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VTdWdnZXN0UmVzcG9uc2UoZGF0YTogdW5rbm93bik6IFBhcnNlU3VnZ2VzdFJlc3VsdCB7XG4gIGlmICh0eXBlb2YgZGF0YSAhPT0gXCJvYmplY3RcIiB8fCBkYXRhID09PSBudWxsKSB7XG4gICAgcmV0dXJuIFBBUlNFX0ZBSUw7XG4gIH1cbiAgaWYgKCEoXCJpdGVtc1wiIGluIGRhdGEpIHx8ICFBcnJheS5pc0FycmF5KGRhdGEuaXRlbXMpKSB7XG4gICAgcmV0dXJuIFBBUlNFX0ZBSUw7XG4gIH1cbiAgY29uc3QgaXRlbXM6IFN1Z2dlc3RJdGVtW10gPSBbXTtcbiAgZm9yIChjb25zdCByYXcgb2YgZGF0YS5pdGVtcykge1xuICAgIGNvbnN0IGl0ZW0gPSBwYXJzZUl0ZW0ocmF3KTtcbiAgICBpZiAoaXRlbSA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIFBBUlNFX0ZBSUw7XG4gICAgfVxuICAgIGl0ZW1zLnB1c2goaXRlbSk7XG4gIH1cbiAgcmV0dXJuIHsgb2s6IHRydWUsIGl0ZW1zIH07XG59XG5cbmZ1bmN0aW9uIGNhdGVnb3JpZXNPZihidWRnZXQ6IEJ1ZGdldCwga2luZDogU3VnZ2VzdEtpbmQpOiBDYXRlZ29yeVtdIHtcbiAgcmV0dXJuIGtpbmQgPT09IFwiaW5jb21lXCIgPyBidWRnZXQuaW5jb21lQ2F0ZWdvcmllcyA6IGJ1ZGdldC5leHBlbnNlQ2F0ZWdvcmllcztcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZU9yQ3JlYXRlQ2F0ZWdvcnkoXG4gIGJ1ZGdldElkOiBzdHJpbmcsXG4gIGtpbmQ6IFN1Z2dlc3RLaW5kLFxuICBjYXRlZ29yeUlkOiBzdHJpbmcgfCBudWxsLFxuICBuYW1lOiBzdHJpbmcsXG4pOiBzdHJpbmcgfCBudWxsIHtcbiAgY29uc3QgYnVkZ2V0ID0gbGlzdEJ1ZGdldHMoKS5maW5kKChpdGVtKSA9PiBpdGVtLmlkID09PSBidWRnZXRJZCk7XG4gIGlmICghYnVkZ2V0KSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgY29uc3QgbGlzdCA9IGNhdGVnb3JpZXNPZihidWRnZXQsIGtpbmQpO1xuICBpZiAoY2F0ZWdvcnlJZCAmJiBsaXN0LnNvbWUoKGNhdGVnb3J5KSA9PiBjYXRlZ29yeS5pZCA9PT0gY2F0ZWdvcnlJZCkpIHtcbiAgICByZXR1cm4gY2F0ZWdvcnlJZDtcbiAgfVxuICBjb25zdCBleGlzdGluZyA9IGxpc3QuZmluZCgoY2F0ZWdvcnkpID0+XG4gICAgaXNOYW1lVGFrZW4obmFtZSwgW2NhdGVnb3J5Lm5hbWVdKSxcbiAgKTtcbiAgaWYgKGV4aXN0aW5nKSB7XG4gICAgcmV0dXJuIGV4aXN0aW5nLmlkO1xuICB9XG4gIGFkZENhdGVnb3J5KGJ1ZGdldElkLCBraW5kLCB7IG5hbWUgfSk7XG4gIGNvbnN0IGFmdGVyID0gbGlzdEJ1ZGdldHMoKS5maW5kKChpdGVtKSA9PiBpdGVtLmlkID09PSBidWRnZXRJZCk7XG4gIGlmICghYWZ0ZXIpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBjb25zdCBtYXRjaEFmdGVyID0gY2F0ZWdvcmllc09mKGFmdGVyLCBraW5kKS5maW5kKChjYXRlZ29yeSkgPT5cbiAgICBpc05hbWVUYWtlbihuYW1lLCBbY2F0ZWdvcnkubmFtZV0pLFxuICApO1xuICByZXR1cm4gbWF0Y2hBZnRlcj8uaWQgPz8gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5U3VnZ2VzdGVkSXRlbXMoXG4gIGJ1ZGdldElkOiBzdHJpbmcsXG4gIHJvd3M6IFJldmlld1Jvd1tdLFxuKTogUmV2aWV3Um93W10ge1xuICBjb25zdCByZW1haW5pbmc6IFJldmlld1Jvd1tdID0gW107XG4gIGZvciAoY29uc3Qgcm93IG9mIHJvd3MpIHtcbiAgICBpZiAocm93LmtpbmQgIT09IFwiaW5jb21lXCIgJiYgcm93LmtpbmQgIT09IFwiZXhwZW5zZVwiKSB7XG4gICAgICByZW1haW5pbmcucHVzaCh7IC4uLnJvdywgZXJyb3I6IFwiU2VsZWN0IGluY29tZSBvciBleHBlbnNlLlwiIH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IG5hbWUgPSBub3JtYWxpemVOYW1lKHJvdy5jYXRlZ29yeU5hbWUpO1xuICAgIGlmIChuYW1lID09PSBcIlwiKSB7XG4gICAgICByZW1haW5pbmcucHVzaCh7IC4uLnJvdywgZXJyb3I6IFwiTmFtZSBpcyByZXF1aXJlZC5cIiB9KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCBhbW91bnQgPSBwYXJzZU1vbmV5KHJvdy5hbW91bnRUZXh0KTtcbiAgICBpZiAoIWFtb3VudC5vaykge1xuICAgICAgcmVtYWluaW5nLnB1c2goeyAuLi5yb3csIGVycm9yOiBhbW91bnQuZXJyb3IgfSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3QgZGF0ZSA9IHBhcnNlRGF0ZShyb3cuZGF0ZVRleHQpO1xuICAgIGlmICghZGF0ZS5vaykge1xuICAgICAgcmVtYWluaW5nLnB1c2goeyAuLi5yb3csIGVycm9yOiBkYXRlLmVycm9yIH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IGNhdGVnb3J5SWQgPSByZXNvbHZlT3JDcmVhdGVDYXRlZ29yeShcbiAgICAgIGJ1ZGdldElkLFxuICAgICAgcm93LmtpbmQsXG4gICAgICByb3cuY2F0ZWdvcnlJZCxcbiAgICAgIG5hbWUsXG4gICAgKTtcbiAgICBpZiAoY2F0ZWdvcnlJZCA9PT0gbnVsbCkge1xuICAgICAgcmVtYWluaW5nLnB1c2goeyAuLi5yb3csIGVycm9yOiBcIlNlbGVjdCBhIGNhdGVnb3J5LlwiIH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IGFkZGVkID0gYWRkRW50cnkoYnVkZ2V0SWQsIHJvdy5raW5kLCB7XG4gICAgICBjYXRlZ29yeUlkLFxuICAgICAgY29tbWVudDogcm93LmNvbW1lbnQsXG4gICAgICBhbW91bnRDZW50czogYW1vdW50LmNlbnRzLFxuICAgICAgZGF0ZTogZGF0ZS5kYXRlLFxuICAgIH0pO1xuICAgIGlmICghYWRkZWQub2spIHtcbiAgICAgIHJlbWFpbmluZy5wdXNoKHsgLi4ucm93LCBlcnJvcjogYWRkZWQuZXJyb3IgfSk7XG4gICAgfVxuICB9XG4gIHJldHVybiByZW1haW5pbmc7XG59XG4iLCAiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyYy9jYXRlZ29yaWVzLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjL2NhdGVnb3JpZXMudHNcIjtpbXBvcnQgeyBsaXN0QnVkZ2V0cywgbWFwQnVkZ2V0LCB0eXBlIENyZWF0ZUJ1ZGdldFJlc3VsdCB9IGZyb20gXCIuL2J1ZGdldHNcIjtcbmltcG9ydCB7IGlzTmFtZVRha2VuLCBub3JtYWxpemVOYW1lIH0gZnJvbSBcIi4vbmFtZXNcIjtcbmltcG9ydCB0eXBlIHsgQnVkZ2V0LCBDYXRlZ29yeSwgRW50cnkgfSBmcm9tIFwiLi90eXBlc1wiO1xuXG50eXBlIENhdGVnb3J5S2luZCA9IFwiaW5jb21lXCIgfCBcImV4cGVuc2VcIjtcblxubGV0IGNhdGVnb3J5U2VxID0gMDtcblxuZnVuY3Rpb24gY2F0ZWdvcmllc09mKGJ1ZGdldDogQnVkZ2V0LCBraW5kOiBDYXRlZ29yeUtpbmQpOiBDYXRlZ29yeVtdIHtcbiAgcmV0dXJuIGtpbmQgPT09IFwiaW5jb21lXCIgPyBidWRnZXQuaW5jb21lQ2F0ZWdvcmllcyA6IGJ1ZGdldC5leHBlbnNlQ2F0ZWdvcmllcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZENhdGVnb3J5KFxuICBidWRnZXRJZDogc3RyaW5nLFxuICBraW5kOiBDYXRlZ29yeUtpbmQsXG4gIGlucHV0OiB7IG5hbWU6IHN0cmluZyB9LFxuKTogQ3JlYXRlQnVkZ2V0UmVzdWx0IHtcbiAgY29uc3QgbmFtZSA9IG5vcm1hbGl6ZU5hbWUoaW5wdXQubmFtZSk7XG4gIGlmIChuYW1lID09PSBcIlwiKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJOYW1lIGlzIHJlcXVpcmVkLlwiIH07XG4gIH1cbiAgY29uc3QgYnVkZ2V0ID0gbGlzdEJ1ZGdldHMoKS5maW5kKChpdGVtKSA9PiBpdGVtLmlkID09PSBidWRnZXRJZCk7XG4gIGlmIChidWRnZXQgJiYgaXNOYW1lVGFrZW4obmFtZSwgY2F0ZWdvcmllc09mKGJ1ZGdldCwga2luZCkubWFwKChpdGVtKSA9PiBpdGVtLm5hbWUpKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiVGhlIG5hbWUgaXMgYWxyZWFkeSBpbiB1c2UuXCIgfTtcbiAgfVxuICBjYXRlZ29yeVNlcSArPSAxO1xuICBjb25zdCBjYXRlZ29yeSA9IHsgaWQ6IGBjLSR7RGF0ZS5ub3coKX0tJHtjYXRlZ29yeVNlcX1gLCBuYW1lIH07XG4gIG1hcEJ1ZGdldChidWRnZXRJZCwgKGN1cnJlbnQpID0+XG4gICAga2luZCA9PT0gXCJpbmNvbWVcIlxuICAgICAgPyB7XG4gICAgICAgICAgLi4uY3VycmVudCxcbiAgICAgICAgICBpbmNvbWVDYXRlZ29yaWVzOiBbLi4uY3VycmVudC5pbmNvbWVDYXRlZ29yaWVzLCBjYXRlZ29yeV0sXG4gICAgICAgIH1cbiAgICAgIDoge1xuICAgICAgICAgIC4uLmN1cnJlbnQsXG4gICAgICAgICAgZXhwZW5zZUNhdGVnb3JpZXM6IFsuLi5jdXJyZW50LmV4cGVuc2VDYXRlZ29yaWVzLCBjYXRlZ29yeV0sXG4gICAgICAgIH0sXG4gICk7XG4gIHJldHVybiB7IG9rOiB0cnVlIH07XG59XG5cbmZ1bmN0aW9uIGxpc3RDb250YWluaW5nKGJ1ZGdldDogQnVkZ2V0LCBjYXRlZ29yeUlkOiBzdHJpbmcpOiBDYXRlZ29yeVtdIHtcbiAgaWYgKGJ1ZGdldC5pbmNvbWVDYXRlZ29yaWVzLnNvbWUoKGNhdGVnb3J5KSA9PiBjYXRlZ29yeS5pZCA9PT0gY2F0ZWdvcnlJZCkpIHtcbiAgICByZXR1cm4gYnVkZ2V0LmluY29tZUNhdGVnb3JpZXM7XG4gIH1cbiAgcmV0dXJuIGJ1ZGdldC5leHBlbnNlQ2F0ZWdvcmllcztcbn1cblxuZnVuY3Rpb24gcmVuYW1lQ2F0ZWdvcnlJbkxpc3QoXG4gIGNhdGVnb3JpZXM6IENhdGVnb3J5W10sXG4gIGNhdGVnb3J5SWQ6IHN0cmluZyxcbiAgbmFtZTogc3RyaW5nLFxuKTogQ2F0ZWdvcnlbXSB7XG4gIHJldHVybiBjYXRlZ29yaWVzLm1hcCgoY2F0ZWdvcnkpID0+XG4gICAgY2F0ZWdvcnkuaWQgPT09IGNhdGVnb3J5SWQgPyB7IC4uLmNhdGVnb3J5LCBuYW1lIH0gOiBjYXRlZ29yeSxcbiAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZUNhdGVnb3J5KFxuICBidWRnZXRJZDogc3RyaW5nLFxuICBjYXRlZ29yeUlkOiBzdHJpbmcsXG4gIGlucHV0OiB7IG5hbWU6IHN0cmluZyB9LFxuKTogQ3JlYXRlQnVkZ2V0UmVzdWx0IHtcbiAgY29uc3QgbmFtZSA9IG5vcm1hbGl6ZU5hbWUoaW5wdXQubmFtZSk7XG4gIGlmIChuYW1lID09PSBcIlwiKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJOYW1lIGlzIHJlcXVpcmVkLlwiIH07XG4gIH1cbiAgY29uc3QgYnVkZ2V0ID0gbGlzdEJ1ZGdldHMoKS5maW5kKChpdGVtKSA9PiBpdGVtLmlkID09PSBidWRnZXRJZCk7XG4gIGNvbnN0IG90aGVyTmFtZXMgPSBidWRnZXRcbiAgICA/IGxpc3RDb250YWluaW5nKGJ1ZGdldCwgY2F0ZWdvcnlJZClcbiAgICAgICAgLmZpbHRlcigoY2F0ZWdvcnkpID0+IGNhdGVnb3J5LmlkICE9PSBjYXRlZ29yeUlkKVxuICAgICAgICAubWFwKChjYXRlZ29yeSkgPT4gY2F0ZWdvcnkubmFtZSlcbiAgICA6IFtdO1xuICBpZiAoaXNOYW1lVGFrZW4obmFtZSwgb3RoZXJOYW1lcykpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIlRoZSBuYW1lIGlzIGFscmVhZHkgaW4gdXNlLlwiIH07XG4gIH1cbiAgbWFwQnVkZ2V0KGJ1ZGdldElkLCAoY3VycmVudCkgPT4gKHtcbiAgICAuLi5jdXJyZW50LFxuICAgIGluY29tZUNhdGVnb3JpZXM6IHJlbmFtZUNhdGVnb3J5SW5MaXN0KFxuICAgICAgY3VycmVudC5pbmNvbWVDYXRlZ29yaWVzLFxuICAgICAgY2F0ZWdvcnlJZCxcbiAgICAgIG5hbWUsXG4gICAgKSxcbiAgICBleHBlbnNlQ2F0ZWdvcmllczogcmVuYW1lQ2F0ZWdvcnlJbkxpc3QoXG4gICAgICBjdXJyZW50LmV4cGVuc2VDYXRlZ29yaWVzLFxuICAgICAgY2F0ZWdvcnlJZCxcbiAgICAgIG5hbWUsXG4gICAgKSxcbiAgfSkpO1xuICByZXR1cm4geyBvazogdHJ1ZSB9O1xufVxuXG5mdW5jdGlvbiB3aXRob3V0Q2F0ZWdvcnkoXG4gIGNhdGVnb3JpZXM6IENhdGVnb3J5W10sXG4gIGNhdGVnb3J5SWQ6IHN0cmluZyxcbik6IENhdGVnb3J5W10ge1xuICByZXR1cm4gY2F0ZWdvcmllcy5maWx0ZXIoKGNhdGVnb3J5KSA9PiBjYXRlZ29yeS5pZCAhPT0gY2F0ZWdvcnlJZCk7XG59XG5cbmZ1bmN0aW9uIHdpdGhvdXRFbnRyaWVzRm9yKGVudHJpZXM6IEVudHJ5W10sIGNhdGVnb3J5SWQ6IHN0cmluZyk6IEVudHJ5W10ge1xuICByZXR1cm4gZW50cmllcy5maWx0ZXIoKGVudHJ5KSA9PiBlbnRyeS5jYXRlZ29yeUlkICE9PSBjYXRlZ29yeUlkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlbGV0ZUNhdGVnb3J5KGJ1ZGdldElkOiBzdHJpbmcsIGNhdGVnb3J5SWQ6IHN0cmluZyk6IHZvaWQge1xuICBtYXBCdWRnZXQoYnVkZ2V0SWQsIChjdXJyZW50KSA9PiAoe1xuICAgIC4uLmN1cnJlbnQsXG4gICAgaW5jb21lQ2F0ZWdvcmllczogd2l0aG91dENhdGVnb3J5KGN1cnJlbnQuaW5jb21lQ2F0ZWdvcmllcywgY2F0ZWdvcnlJZCksXG4gICAgZXhwZW5zZUNhdGVnb3JpZXM6IHdpdGhvdXRDYXRlZ29yeShjdXJyZW50LmV4cGVuc2VDYXRlZ29yaWVzLCBjYXRlZ29yeUlkKSxcbiAgICBpbmNvbWVFbnRyaWVzOiB3aXRob3V0RW50cmllc0ZvcihjdXJyZW50LmluY29tZUVudHJpZXMsIGNhdGVnb3J5SWQpLFxuICAgIGV4cGVuc2VFbnRyaWVzOiB3aXRob3V0RW50cmllc0ZvcihjdXJyZW50LmV4cGVuc2VFbnRyaWVzLCBjYXRlZ29yeUlkKSxcbiAgfSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2F0ZWdvcnlFbnRyeUNvdW50KGJ1ZGdldDogQnVkZ2V0LCBjYXRlZ29yeUlkOiBzdHJpbmcpOiBudW1iZXIge1xuICByZXR1cm4gWy4uLmJ1ZGdldC5pbmNvbWVFbnRyaWVzLCAuLi5idWRnZXQuZXhwZW5zZUVudHJpZXNdLmZpbHRlcihcbiAgICAoZW50cnkpID0+IGVudHJ5LmNhdGVnb3J5SWQgPT09IGNhdGVnb3J5SWQsXG4gICkubGVuZ3RoO1xufVxuIiwgImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyY1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL2hvbWUvcm9nZXIvR2l0SHViL25leHRwYXRoLWJ1ZGdldGFwcC9zcmMvZW50cmllcy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyYy9lbnRyaWVzLnRzXCI7aW1wb3J0IHsgbGlzdEJ1ZGdldHMsIG1hcEJ1ZGdldCwgdHlwZSBDcmVhdGVCdWRnZXRSZXN1bHQgfSBmcm9tIFwiLi9idWRnZXRzXCI7XG5pbXBvcnQgdHlwZSB7IEVudHJ5IH0gZnJvbSBcIi4vdHlwZXNcIjtcblxudHlwZSBFbnRyeUtpbmQgPSBcImluY29tZVwiIHwgXCJleHBlbnNlXCI7XG5cbmxldCBlbnRyeVNlcSA9IDA7XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRFbnRyeShcbiAgYnVkZ2V0SWQ6IHN0cmluZyxcbiAga2luZDogRW50cnlLaW5kLFxuICBpbnB1dDogT21pdDxFbnRyeSwgXCJpZFwiPixcbik6IENyZWF0ZUJ1ZGdldFJlc3VsdCB7XG4gIGNvbnN0IGJ1ZGdldCA9IGxpc3RCdWRnZXRzKCkuZmluZCgoaXRlbSkgPT4gaXRlbS5pZCA9PT0gYnVkZ2V0SWQpO1xuICBjb25zdCBjYXRlZ29yaWVzID0gYnVkZ2V0XG4gICAgPyBraW5kID09PSBcImluY29tZVwiXG4gICAgICA/IGJ1ZGdldC5pbmNvbWVDYXRlZ29yaWVzXG4gICAgICA6IGJ1ZGdldC5leHBlbnNlQ2F0ZWdvcmllc1xuICAgIDogW107XG4gIGNvbnN0IGNhdGVnb3J5TWlzc2luZyA9ICFjYXRlZ29yaWVzLnNvbWUoXG4gICAgKGNhdGVnb3J5KSA9PiBjYXRlZ29yeS5pZCA9PT0gaW5wdXQuY2F0ZWdvcnlJZCxcbiAgKTtcbiAgaWYgKGlucHV0LmNhdGVnb3J5SWQgPT09IFwiXCIgfHwgY2F0ZWdvcnlNaXNzaW5nKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJTZWxlY3QgYSBjYXRlZ29yeS5cIiB9O1xuICB9XG4gIGVudHJ5U2VxICs9IDE7XG4gIGNvbnN0IGVudHJ5OiBFbnRyeSA9IHtcbiAgICBpZDogYGUtJHtEYXRlLm5vdygpfS0ke2VudHJ5U2VxfWAsXG4gICAgY2F0ZWdvcnlJZDogaW5wdXQuY2F0ZWdvcnlJZCxcbiAgICBjb21tZW50OiBpbnB1dC5jb21tZW50LFxuICAgIGFtb3VudENlbnRzOiBpbnB1dC5hbW91bnRDZW50cyxcbiAgICBkYXRlOiBpbnB1dC5kYXRlLFxuICB9O1xuICBtYXBCdWRnZXQoYnVkZ2V0SWQsIChjdXJyZW50KSA9PlxuICAgIGtpbmQgPT09IFwiaW5jb21lXCJcbiAgICAgID8geyAuLi5jdXJyZW50LCBpbmNvbWVFbnRyaWVzOiBbLi4uY3VycmVudC5pbmNvbWVFbnRyaWVzLCBlbnRyeV0gfVxuICAgICAgOiB7IC4uLmN1cnJlbnQsIGV4cGVuc2VFbnRyaWVzOiBbLi4uY3VycmVudC5leHBlbnNlRW50cmllcywgZW50cnldIH0sXG4gICk7XG4gIHJldHVybiB7IG9rOiB0cnVlIH07XG59XG5cbmZ1bmN0aW9uIHBhdGNoRW50cnkoXG4gIGVudHJpZXM6IEVudHJ5W10sXG4gIGVudHJ5SWQ6IHN0cmluZyxcbiAgaW5wdXQ6IE9taXQ8RW50cnksIFwiaWRcIj4sXG4pOiBFbnRyeVtdIHtcbiAgcmV0dXJuIGVudHJpZXMubWFwKChlbnRyeSkgPT5cbiAgICBlbnRyeS5pZCA9PT0gZW50cnlJZCA/IHsgLi4uZW50cnksIC4uLmlucHV0IH0gOiBlbnRyeSxcbiAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZUVudHJ5KFxuICBidWRnZXRJZDogc3RyaW5nLFxuICBlbnRyeUlkOiBzdHJpbmcsXG4gIGlucHV0OiBPbWl0PEVudHJ5LCBcImlkXCI+LFxuKTogdm9pZCB7XG4gIG1hcEJ1ZGdldChidWRnZXRJZCwgKGN1cnJlbnQpID0+ICh7XG4gICAgLi4uY3VycmVudCxcbiAgICBpbmNvbWVFbnRyaWVzOiBwYXRjaEVudHJ5KGN1cnJlbnQuaW5jb21lRW50cmllcywgZW50cnlJZCwgaW5wdXQpLFxuICAgIGV4cGVuc2VFbnRyaWVzOiBwYXRjaEVudHJ5KGN1cnJlbnQuZXhwZW5zZUVudHJpZXMsIGVudHJ5SWQsIGlucHV0KSxcbiAgfSkpO1xufVxuXG5mdW5jdGlvbiB3aXRob3V0RW50cnkoZW50cmllczogRW50cnlbXSwgZW50cnlJZDogc3RyaW5nKTogRW50cnlbXSB7XG4gIHJldHVybiBlbnRyaWVzLmZpbHRlcigoZW50cnkpID0+IGVudHJ5LmlkICE9PSBlbnRyeUlkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlbGV0ZUVudHJ5KGJ1ZGdldElkOiBzdHJpbmcsIGVudHJ5SWQ6IHN0cmluZyk6IHZvaWQge1xuICBtYXBCdWRnZXQoYnVkZ2V0SWQsIChjdXJyZW50KSA9PiAoe1xuICAgIC4uLmN1cnJlbnQsXG4gICAgaW5jb21lRW50cmllczogd2l0aG91dEVudHJ5KGN1cnJlbnQuaW5jb21lRW50cmllcywgZW50cnlJZCksXG4gICAgZXhwZW5zZUVudHJpZXM6IHdpdGhvdXRFbnRyeShjdXJyZW50LmV4cGVuc2VFbnRyaWVzLCBlbnRyeUlkKSxcbiAgfSkpO1xufVxuIiwgImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyY1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL2hvbWUvcm9nZXIvR2l0SHViL25leHRwYXRoLWJ1ZGdldGFwcC9zcmMvbWlncmF0ZS50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyYy9taWdyYXRlLnRzXCI7aW1wb3J0IHsgZXhpc3RzU3luYywgcmVhZEZpbGVTeW5jIH0gZnJvbSBcIm5vZGU6ZnNcIjtcbmltcG9ydCB7IHBhcnNlU3RvcmVKc29uIH0gZnJvbSBcIi4vc3RvcmVcIjtcbmltcG9ydCB0eXBlIHsgQXBwUmVwbyB9IGZyb20gXCIuL3JlcG9cIjtcbmltcG9ydCB0eXBlIHsgQnVkZ2V0IH0gZnJvbSBcIi4vdHlwZXNcIjtcblxuZnVuY3Rpb24gd2l0aE93bmVyKFxuICBidWRnZXQ6IEJ1ZGdldCxcbiAgb3duZXJJZDogc3RyaW5nLFxuKTogQnVkZ2V0IHtcbiAgcmV0dXJuIHtcbiAgICAuLi5idWRnZXQsXG4gICAgb3duZXJJZCxcbiAgICB2aXNpYmlsaXR5OiBcImhpZGRlblwiLFxuICAgIGdyYW50czogW10sXG4gIH07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBtaWdyYXRlSnNvbklmTmVlZGVkKFxuICByZXBvOiBBcHBSZXBvLFxuICBqc29uUGF0aDogc3RyaW5nLFxuICBtb2RlcmF0b3JVaWQ6IHN0cmluZyxcbik6IFByb21pc2U8dm9pZD4ge1xuICBpZiAoYXdhaXQgcmVwby5idWRnZXRDb3VudCgpID4gMCkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoIWV4aXN0c1N5bmMoanNvblBhdGgpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHBhcnNlZCA9IHBhcnNlU3RvcmVKc29uKHJlYWRGaWxlU3luYyhqc29uUGF0aCwgXCJ1dGY4XCIpKTtcbiAgaWYgKCFwYXJzZWQub2spIHtcbiAgICByZXR1cm47XG4gIH1cbiAgZm9yIChjb25zdCBidWRnZXQgb2YgcGFyc2VkLnZhbHVlLmJ1ZGdldHMpIHtcbiAgICBhd2FpdCByZXBvLnNhdmVCdWRnZXQod2l0aE93bmVyKGJ1ZGdldCwgbW9kZXJhdG9yVWlkKSk7XG4gIH1cbn1cbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL2hvbWUvcm9nZXIvR2l0SHViL25leHRwYXRoLWJ1ZGdldGFwcC9zcmNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjL3N0b3JlLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjL3N0b3JlLnRzXCI7aW1wb3J0IHsgZXhpc3RzU3luYywgbWtkaXJTeW5jLCByZWFkRmlsZVN5bmMsIHdyaXRlRmlsZVN5bmMgfSBmcm9tIFwibm9kZTpmc1wiO1xuaW1wb3J0IHsgZGlybmFtZSB9IGZyb20gXCJub2RlOnBhdGhcIjtcbmltcG9ydCB7IGxpc3RCdWRnZXRzLCByZXNldFN0b3JlIH0gZnJvbSBcIi4vYnVkZ2V0c1wiO1xuaW1wb3J0IHsgQVBQX0JVREdFVFNfRklMRSB9IGZyb20gXCIuL3BhdGhzXCI7XG5pbXBvcnQgeyBzZXRQZXJzaXN0IH0gZnJvbSBcIi4vcGVyc2lzdFwiO1xuaW1wb3J0IHR5cGUgeyBCdWRnZXQgfSBmcm9tIFwiLi90eXBlc1wiO1xuXG5leHBvcnQgdHlwZSBTdG9yZUZpbGUgPSB7XG4gIHZlcnNpb246IG51bWJlcjtcbiAgYnVkZ2V0czogQnVkZ2V0W107XG59O1xuXG5jb25zdCBFTVBUWV9TVE9SRTogU3RvcmVGaWxlID0geyB2ZXJzaW9uOiAxLCBidWRnZXRzOiBbXSB9O1xuXG5sZXQgYnVkZ2V0c0ZpbGVQYXRoOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuZXhwb3J0IGZ1bmN0aW9uIHNlcmlhbGl6ZVN0b3JlKHN0b3JlOiBTdG9yZUZpbGUpOiBzdHJpbmcge1xuICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoeyB2ZXJzaW9uOiBzdG9yZS52ZXJzaW9uLCBidWRnZXRzOiBzdG9yZS5idWRnZXRzIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2F2ZVN0b3JlKCk6IHZvaWQge1xuICBpZiAoYnVkZ2V0c0ZpbGVQYXRoID09PSBudWxsKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHdyaXRlRmlsZVN5bmMoXG4gICAgYnVkZ2V0c0ZpbGVQYXRoLFxuICAgIHNlcmlhbGl6ZVN0b3JlKHsgdmVyc2lvbjogMSwgYnVkZ2V0czogbGlzdEJ1ZGdldHMoKSB9KSxcbiAgKTtcbn1cblxuZnVuY3Rpb24gYXBwbHlMb2FkZWRTdG9yZShcbiAgcGF0aDogc3RyaW5nLFxuICBzdG9yZTogU3RvcmVGaWxlLFxuKTogeyBvazogdHJ1ZTsgdmFsdWU6IFN0b3JlRmlsZSB9IHtcbiAgYnVkZ2V0c0ZpbGVQYXRoID0gcGF0aDtcbiAgc2V0UGVyc2lzdChzYXZlU3RvcmUpO1xuICByZXNldFN0b3JlKHN0b3JlLmJ1ZGdldHMpO1xuICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHN0b3JlIH07XG59XG5cbmV4cG9ydCB0eXBlIExvYWRTdG9yZVJlc3VsdCA9XG4gIHwgeyBvazogdHJ1ZTsgdmFsdWU6IFN0b3JlRmlsZSB9XG4gIHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfTtcblxuZnVuY3Rpb24gaXNTdG9yZUZpbGUoZGF0YTogdW5rbm93bik6IGRhdGEgaXMgU3RvcmVGaWxlIHtcbiAgaWYgKHR5cGVvZiBkYXRhICE9PSBcIm9iamVjdFwiIHx8IGRhdGEgPT09IG51bGwpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKCEoXCJ2ZXJzaW9uXCIgaW4gZGF0YSkgfHwgZGF0YS52ZXJzaW9uICE9PSAxKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmICghKFwiYnVkZ2V0c1wiIGluIGRhdGEpIHx8ICFBcnJheS5pc0FycmF5KGRhdGEuYnVkZ2V0cykpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVN0b3JlSnNvbihyYXc6IHN0cmluZyk6IExvYWRTdG9yZVJlc3VsdCB7XG4gIHRyeSB7XG4gICAgY29uc3QgZGF0YTogdW5rbm93biA9IEpTT04ucGFyc2UocmF3KTtcbiAgICBpZiAoIWlzU3RvcmVGaWxlKGRhdGEpKSB7XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkNvdWxkIG5vdCByZWFkIGJ1ZGdldHMuanNvbi5cIiB9O1xuICAgIH1cbiAgICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IGRhdGEgfTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJDb3VsZCBub3QgcmVhZCBidWRnZXRzLmpzb24uXCIgfTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9hZFN0b3JlKHBhdGg6IHN0cmluZyA9IEFQUF9CVURHRVRTX0ZJTEUpOiBMb2FkU3RvcmVSZXN1bHQge1xuICBpZiAoIWV4aXN0c1N5bmMocGF0aCkpIHtcbiAgICBta2RpclN5bmMoZGlybmFtZShwYXRoKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgd3JpdGVGaWxlU3luYyhwYXRoLCBzZXJpYWxpemVTdG9yZShFTVBUWV9TVE9SRSkpO1xuICAgIHJldHVybiBhcHBseUxvYWRlZFN0b3JlKHBhdGgsIEVNUFRZX1NUT1JFKTtcbiAgfVxuICBjb25zdCBwYXJzZWQgPSBwYXJzZVN0b3JlSnNvbihyZWFkRmlsZVN5bmMocGF0aCwgXCJ1dGY4XCIpKTtcbiAgaWYgKCFwYXJzZWQub2spIHtcbiAgICByZXR1cm4gcGFyc2VkO1xuICB9XG4gIHJldHVybiBhcHBseUxvYWRlZFN0b3JlKHBhdGgsIHBhcnNlZC52YWx1ZSk7XG59XG4iLCAiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9ob21lL3JvZ2VyL0dpdEh1Yi9uZXh0cGF0aC1idWRnZXRhcHAvc3JjXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyYy9wYXRocy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vaG9tZS9yb2dlci9HaXRIdWIvbmV4dHBhdGgtYnVkZ2V0YXBwL3NyYy9wYXRocy50c1wiO2ltcG9ydCB7IGpvaW4gfSBmcm9tIFwibm9kZTpwYXRoXCI7XG5cbmV4cG9ydCBjb25zdCBBUFBfQlVER0VUU19GSUxFID0gam9pbihwcm9jZXNzLmN3ZCgpLCBcImRhdGFcIiwgXCJidWRnZXRzLmpzb25cIik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUlPLFNBQVMsaUJBQ2QsT0FDQSxnQkFDUztBQUNULFFBQU0sY0FBYyxrQkFBa0IsSUFBSSxLQUFLO0FBQy9DLE1BQUksZUFBZSxJQUFJO0FBQ3JCLFdBQU87QUFBQSxFQUNUO0FBQ0EsU0FBTyxNQUFNLEtBQUssRUFBRSxZQUFZLE1BQU0sV0FBVyxZQUFZO0FBQy9EO0FBRUEsU0FBUyxhQUFhLE9BQWMsUUFBdUM7QUFDekUsUUFBTSxRQUFRLE9BQU8sT0FBTyxLQUFLLENBQUMsVUFBVSxNQUFNLFdBQVcsTUFBTSxRQUFRLEVBQUU7QUFDN0UsTUFBSSxDQUFDLE9BQU87QUFDVixXQUFPO0FBQUEsRUFDVDtBQUNBLE1BQUksWUFBWSxTQUFTLE1BQU0sSUFBSSxHQUFHO0FBQ3BDLFdBQU8sTUFBTTtBQUFBLEVBQ2Y7QUFDQSxTQUFPO0FBQ1Q7QUFFQSxTQUFTLFFBQVEsT0FBYyxRQUF5QjtBQUN0RCxTQUFPLE9BQU8sWUFBWSxNQUFNLFFBQVE7QUFDMUM7QUFFTyxTQUFTLGVBQWUsT0FBYyxRQUF5QjtBQUNwRSxNQUFJLE1BQU0sZUFBZSxRQUFRLE9BQU8sTUFBTSxHQUFHO0FBQy9DLFdBQU87QUFBQSxFQUNUO0FBQ0EsUUFBTSxPQUFPLGFBQWEsT0FBTyxNQUFNO0FBQ3ZDLE1BQUksU0FBUyxTQUFTLFNBQVMsWUFBWSxTQUFTLFFBQVE7QUFDMUQsV0FBTztBQUFBLEVBQ1Q7QUFDQSxTQUFPLE9BQU8sZUFBZTtBQUMvQjtBQUVPLFNBQVMsUUFBUSxPQUFjLFFBQXlCO0FBQzdELE1BQUksTUFBTSxlQUFlLFFBQVEsT0FBTyxNQUFNLEdBQUc7QUFD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QyxZQUMvQixpQkFBaUIsUUFBUSxPQUFPLFFBQVEsSUFBSSxtQkFBbUIsRUFBRTtBQUFBLFlBQ25FO0FBQ0EsZ0JBQUksY0FBYyxRQUFXO0FBQzNCLG9CQUFNLG9CQUFvQixNQUFNLGtCQUFrQixVQUFVLEVBQUU7QUFBQSxZQUNoRTtBQUFBLFVBQ0Y7QUFDQSxnQkFBTSxPQUFPLE1BQU0sU0FBUyxHQUFzQjtBQUNsRCxnQkFBTSxXQUFXO0FBQ2pCLGdCQUFNLFNBQVMsTUFBTSxvQkFBb0I7QUFBQSxZQUN2QyxRQUFRLElBQUksVUFBVTtBQUFBLFlBQ3RCO0FBQUEsWUFDQTtBQUFBLFlBQ0EsZUFBZSxTQUFTLFFBQVE7QUFBQSxZQUNoQyxjQUFjLFFBQVEsSUFBSSxrQkFBa0I7QUFBQSxZQUM1QyxTQUFTO0FBQUEsWUFDVDtBQUFBLFlBQ0EsZ0JBQWdCLFFBQVEsSUFBSSxtQkFBbUI7QUFBQSxZQUMvQyxtQkFBbUIsUUFBUSxJQUFJLHdCQUF3QjtBQUFBLFlBQ3ZELHVCQUF1QixRQUFRLElBQUksNEJBQTRCO0FBQUEsWUFDL0Qsc0JBQXNCLFFBQVEsSUFBSSwyQkFBMkI7QUFBQSxZQUM3RCwwQkFDRSxRQUFRLElBQUksK0JBQStCO0FBQUEsWUFDN0MsZUFBQUU7QUFBQSxZQUNBLFlBQVlEO0FBQUEsWUFDWjtBQUFBLFVBQ0YsQ0FBQztBQUNELGdCQUFNLFdBQVc7QUFDakIsbUJBQVMsYUFBYSxPQUFPO0FBQzdCLHFCQUFXLENBQUMsTUFBTSxLQUFLLEtBQUssT0FBTyxRQUFRLE9BQU8sT0FBTyxHQUFHO0FBQzFELHFCQUFTLFVBQVUsTUFBTSxLQUFLO0FBQUEsVUFDaEM7QUFDQSxtQkFBUyxJQUFJLE9BQU8sSUFBSTtBQUFBLFFBQzFCLEdBQUc7QUFBQSxNQUNMLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDRjtBQUNGO0FBRUEsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sR0FBRyxlQUFlLENBQUM7QUFBQSxFQUNuQyxNQUFNO0FBQUEsSUFDSixpQkFBaUI7QUFBQSxJQUNqQixNQUFNO0FBQUEsRUFDUjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbImJ1ZGdldHMiLCAiYnVkZ2V0cyIsICJidWRnZXQiLCAiR1JBTlRfUk9MRVMiLCAiZGVsZXRlQXV0aFVzZXIiLCAiZXhpc3RzU3luYyIsICJyZWFkRmlsZVN5bmMiLCAiam9pbiIsICJhc1JlY29yZCIsICJhc0RhdGVQYXJ0cyIsICJidWRnZXRzIiwgImV4aXN0c1N5bmMiLCAicmVhZEZpbGVTeW5jIiwgImV4aXN0c1N5bmMiLCAicmVhZEZpbGVTeW5jIiwgImpvaW4iLCAiam9pbiIsICJleGlzdHNTeW5jIiwgInJlYWRGaWxlU3luYyIsICJyZXNvbHZlIiwgImNyZWF0ZUFwcFJlcG8iLCAiZGVsZXRlQXV0aFVzZXIiLCAidmVyaWZ5SWRUb2tlbiJdCn0K
