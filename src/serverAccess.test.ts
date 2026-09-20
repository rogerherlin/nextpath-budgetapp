import { describe, expect, it } from "vitest";
import { decideBudgetAccess } from "./acl";
import type { Actor, Budget, UserProfile } from "./types";

const ALICE: UserProfile = {
  id: "uid-alice",
  email: "alice@example.com",
  displayName: "Alice",
  canUseFromText: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const BOB: UserProfile = {
  id: "uid-bob",
  email: "bob@example.com",
  displayName: "Bob",
  canUseFromText: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function actorOf(profile: UserProfile): Actor {
  return { profile, isModerator: false };
}

function hiddenAlice(): Budget {
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
  };
}

describe("AC10: decideBudgetAccess is the shared deny", () => {
  it("AC10: hidden stranger read and write are 404", () => {
    const budget = hiddenAlice();
    expect(decideBudgetAccess(actorOf(BOB), budget, "read")).toEqual({
      ok: false,
      status: 404,
      error: "Not found.",
    });
    expect(decideBudgetAccess(actorOf(BOB), budget, "write")).toEqual({
      ok: false,
      status: 404,
      error: "Not found.",
    });
  });

  it("AC10: browse can read but not write", () => {
    const budget = {
      ...hiddenAlice(),
      grants: [{ userId: "uid-bob", role: "browse" as const }],
    };
    expect(decideBudgetAccess(actorOf(BOB), budget, "read")).toEqual({
      ok: true,
    });
    expect(decideBudgetAccess(actorOf(BOB), budget, "write")).toEqual({
      ok: false,
      status: 403,
      error: "Not allowed.",
    });
  });

  it("AC10: missing budget is 404", () => {
    expect(decideBudgetAccess(actorOf(ALICE), null, "read")).toEqual({
      ok: false,
      status: 404,
      error: "Not found.",
    });
  });
});
