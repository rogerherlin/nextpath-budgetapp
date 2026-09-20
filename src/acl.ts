import type { Actor, Budget, GrantRole, UserProfile, ViewerRelation } from "./types";

const GRANT_ROLES: readonly GrantRole[] = ["see", "browse", "edit"];

export function isModeratorEmail(
  email: string,
  moderatorEmail: string | undefined,
): boolean {
  const configured = (moderatorEmail ?? "").trim();
  if (configured === "") {
    return false;
  }
  return email.trim().toLowerCase() === configured.toLowerCase();
}

function grantRoleFor(actor: Actor, budget: Budget): GrantRole | undefined {
  const match = budget.grants.find((grant) => grant.userId === actor.profile.id);
  if (!match) {
    return undefined;
  }
  if (GRANT_ROLES.includes(match.role)) {
    return match.role;
  }
  return undefined;
}

function isOwner(actor: Actor, budget: Budget): boolean {
  return budget.ownerId === actor.profile.id;
}

export function canListSummary(actor: Actor, budget: Budget): boolean {
  if (actor.isModerator || isOwner(actor, budget)) {
    return true;
  }
  const role = grantRoleFor(actor, budget);
  if (role === "see" || role === "browse" || role === "edit") {
    return true;
  }
  return budget.visibility === "public";
}

export function canRead(actor: Actor, budget: Budget): boolean {
  if (actor.isModerator || isOwner(actor, budget)) {
    return true;
  }
  const role = grantRoleFor(actor, budget);
  return role === "browse" || role === "edit";
}

export function canWrite(actor: Actor, budget: Budget): boolean {
  if (actor.isModerator || isOwner(actor, budget)) {
    return true;
  }
  return grantRoleFor(actor, budget) === "edit";
}

export function canManageSharing(actor: Actor, budget: Budget): boolean {
  return actor.isModerator || isOwner(actor, budget);
}

export function canDelete(actor: Actor, budget: Budget): boolean {
  return canManageSharing(actor, budget);
}

export function canUseFromText(actor: Actor): boolean {
  return actor.isModerator || actor.profile.canUseFromText === true;
}

export function viewerRelation(actor: Actor, budget: Budget): ViewerRelation {
  if (isOwner(actor, budget)) {
    return "owner";
  }
  if (actor.isModerator) {
    return "moderator";
  }
  const role = grantRoleFor(actor, budget);
  if (role !== undefined) {
    return role;
  }
  return "public";
}

export type BudgetAction = "read" | "write" | "delete" | "share";

export type AccessDecision =
  | { ok: true }
  | { ok: false; status: 403 | 404; error: "Not found." | "Not allowed." };

export function actorFromVerifiedSession(
  profile: UserProfile,
  isModerator: boolean,
): Actor {
  return { profile, isModerator };
}

export function decideBudgetAccess(
  actor: Actor,
  budget: Budget | null,
  action: BudgetAction,
): AccessDecision {
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
  const allowed =
    action === "write"
      ? canWrite(actor, budget)
      : action === "delete"
        ? canDelete(actor, budget)
        : canManageSharing(actor, budget);
  if (!allowed) {
    return { ok: false, status: 403, error: "Not allowed." };
  }
  return { ok: true };
}
