import type { Actor, Budget, GrantRole, ViewerRelation } from "./types";

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
