import { describe, expect, it } from "vitest";
import {
  canDelete,
  canListSummary,
  canManageSharing,
  canRead,
  canUseFromText,
  canWrite,
  isModeratorEmail,
} from "./acl";
import type { Actor, Budget, Grant, GrantRole, UserProfile } from "./types";

function profile(
  id: string,
  overrides: Partial<UserProfile> = {},
): UserProfile {
  return {
    id,
    email: `${id}@example.com`,
    displayName: id,
    canUseFromText: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function actor(
  id: string,
  overrides: { isModerator?: boolean; profile?: Partial<UserProfile> } = {},
): Actor {
  return {
    profile: profile(id, overrides.profile),
    isModerator: overrides.isModerator ?? false,
  };
}

const alice = actor("uid-alice");
const bob = actor("uid-bob");
const mod = actor("uid-mod", {
  isModerator: true,
  profile: { email: "mod@example.com", canUseFromText: false },
});

function budget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: "b1",
    name: "Summer",
    ownerId: "uid-alice",
    visibility: "hidden",
    grants: [],
    description: "",
    startDate: null,
    endDate: null,
    targetLeftoverCents: null,
    incomeCategories: [],
    expenseCategories: [],
    incomeEntries: [],
    expenseEntries: [],
    ...overrides,
  };
}

function grant(userId: string, role: GrantRole): Grant {
  return { userId, role };
}

describe("AC20: canListSummary — hidden stranger", () => {
  it("AC20: canListSummary — hidden stranger", () => {
    const hidden = budget({ ownerId: "uid-alice", visibility: "hidden", grants: [] });
    expect(canListSummary(bob, hidden)).toBe(false);
  });
});

describe("AC21: canListSummary — public stranger", () => {
  it("AC21: canListSummary — public stranger", () => {
    const listed = budget({
      ownerId: "uid-alice",
      visibility: "public",
      grants: [],
    });
    expect(canListSummary(bob, listed)).toBe(true);
  });
});

describe("AC22: canListSummary — see grant on hidden", () => {
  it("AC22: canListSummary — see grant on hidden", () => {
    const shared = budget({
      grants: [grant("uid-bob", "see")],
    });
    expect(canListSummary(bob, shared)).toBe(true);
  });
});

describe("AC23: canRead — see grant", () => {
  it("AC23: canRead — see grant", () => {
    const shared = budget({
      grants: [grant("uid-bob", "see")],
    });
    expect(canRead(bob, shared)).toBe(false);
  });
});

describe("AC24: canRead — browse grant", () => {
  it("AC24: canRead — browse grant", () => {
    const shared = budget({
      grants: [grant("uid-bob", "browse")],
    });
    expect(canRead(bob, shared)).toBe(true);
  });
});

describe("AC25: canRead — public without grant", () => {
  it("AC25: canRead — public without grant", () => {
    const listed = budget({ visibility: "public", grants: [] });
    expect(canRead(bob, listed)).toBe(false);
  });
});

describe("AC26: canWrite — edit yes, browse no, owner yes", () => {
  it("AC26: canWrite — edit yes, browse no, owner yes", () => {
    const owned = budget({ ownerId: "uid-alice", grants: [] });
    const editGrant = budget({ grants: [grant("uid-bob", "edit")] });
    const browseGrant = budget({ grants: [grant("uid-bob", "browse")] });
    expect(canWrite(alice, owned)).toBe(true);
    expect(canWrite(bob, editGrant)).toBe(true);
    expect(canWrite(bob, browseGrant)).toBe(false);
  });
});

describe("AC27: canDelete — owner and moderator only", () => {
  it("AC27: canDelete — owner and moderator only", () => {
    const owned = budget({
      ownerId: "uid-alice",
      grants: [grant("uid-bob", "edit")],
    });
    expect(canDelete(alice, owned)).toBe(true);
    expect(canDelete(bob, owned)).toBe(false);
    expect(canDelete(mod, owned)).toBe(true);
  });
});

describe("AC28: canManageSharing — edit cannot", () => {
  it("AC28: canManageSharing — edit cannot", () => {
    const owned = budget({ grants: [grant("uid-bob", "edit")] });
    expect(canManageSharing(bob, owned)).toBe(false);
  });
});

describe("AC29: canUseFromText — flag and moderator", () => {
  it("AC29: canUseFromText — flag and moderator", () => {
    const aliceNoFlag = actor("uid-alice", {
      isModerator: false,
      profile: { canUseFromText: false },
    });
    const bobFlag = actor("uid-bob", {
      isModerator: false,
      profile: { canUseFromText: true },
    });
    const modNoFlag = actor("uid-mod", {
      isModerator: true,
      profile: { canUseFromText: false },
    });
    expect(canUseFromText(aliceNoFlag)).toBe(false);
    expect(canUseFromText(bobFlag)).toBe(true);
    expect(canUseFromText(modNoFlag)).toBe(true);
  });
});

describe("ACL matrix extras", () => {
  it("owner can list, read, write, share, and delete a hidden budget", () => {
    const hidden = budget();
    expect(canListSummary(alice, hidden)).toBe(true);
    expect(canRead(alice, hidden)).toBe(true);
    expect(canWrite(alice, hidden)).toBe(true);
    expect(canManageSharing(alice, hidden)).toBe(true);
    expect(canDelete(alice, hidden)).toBe(true);
  });

  it("moderator can list, read, write, share, and delete another user’s hidden budget", () => {
    const hidden = budget({ grants: [] });
    expect(canListSummary(mod, hidden)).toBe(true);
    expect(canRead(mod, hidden)).toBe(true);
    expect(canWrite(mod, hidden)).toBe(true);
    expect(canManageSharing(mod, hidden)).toBe(true);
    expect(canDelete(mod, hidden)).toBe(true);
  });

  it("unknown grant role is treated as no grant", () => {
    const weird = budget({
      visibility: "hidden",
      grants: [{ userId: "uid-bob", role: "owner" as GrantRole }],
    });
    expect(canListSummary(bob, weird)).toBe(false);
    expect(canRead(bob, weird)).toBe(false);
    expect(canWrite(bob, weird)).toBe(false);
  });

  it("first matching grant wins", () => {
    const shared = budget({
      grants: [grant("uid-bob", "see"), grant("uid-bob", "edit")],
    });
    expect(canRead(bob, shared)).toBe(false);
    expect(canWrite(bob, shared)).toBe(false);
    expect(canListSummary(bob, shared)).toBe(true);
  });
});

describe("isModeratorEmail", () => {
  it("matches after trim and case-insensitive compare", () => {
    expect(isModeratorEmail("Mod@example.com", "  mod@example.com  ")).toBe(
      true,
    );
  });

  it("empty configured email means no moderator", () => {
    expect(isModeratorEmail("mod@example.com", "")).toBe(false);
    expect(isModeratorEmail("mod@example.com", undefined)).toBe(false);
    expect(isModeratorEmail("mod@example.com", "   ")).toBe(false);
  });
});
