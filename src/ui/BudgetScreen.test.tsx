/** @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setAuthTokenGetter } from "../authToken";
import { listBudgets, resetStore } from "../budgets";
import type { Budget, MeProfile } from "../types";
import { BudgetScreen } from "./BudgetScreen";

function budgetFixture(): Budget {
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

function aliceMe(canUseFromText: boolean): MeProfile {
  return {
    id: "uid-alice",
    email: "alice@example.com",
    displayName: "Alice",
    canUseFromText,
    createdAt: "2026-01-01T00:00:00.000Z",
    isModerator: false,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setAuthTokenGetter(async () => null);
});

describe("AC56: From-text tab hidden without permission", () => {
  it("AC56: From-text tab hidden without permission", () => {
    resetStore([budgetFixture()]);
    render(<BudgetScreen budgetId="b1" me={aliceMe(false)} />);
    const tabs = document.querySelector(".tabs");
    expect(tabs).toBeTruthy();
    const labels = within(tabs as HTMLElement)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(labels).toEqual(["Categories", "Income", "Expenses", "Report"]);
  });
});

describe("AC57: From-text tab shown with permission", () => {
  it("AC57: From-text tab shown with permission", () => {
    resetStore([budgetFixture()]);
    render(<BudgetScreen budgetId="b1" me={aliceMe(true)} />);
    const tabs = document.querySelector(".tabs");
    expect(tabs).toBeTruthy();
    const labels = within(tabs as HTMLElement)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(labels).toEqual([
      "Categories",
      "Income",
      "Expenses",
      "Report",
      "From text",
    ]);
  });
});

describe("AC57b: From-text tab shown for moderator without stored flag", () => {
  it("AC57b: From-text tab shown for moderator without stored flag", () => {
    resetStore([budgetFixture()]);
    render(
      <BudgetScreen
        budgetId="b1"
        me={{
          ...aliceMe(false),
          isModerator: true,
        }}
      />,
    );
    const tabs = document.querySelector(".tabs");
    expect(tabs).toBeTruthy();
    const labels = within(tabs as HTMLElement)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(labels).toEqual([
      "Categories",
      "Income",
      "Expenses",
      "Report",
      "From text",
    ]);
  });
});

describe("AC58: Sharing UI on own budget", () => {
  it("AC58: Sharing UI on own budget", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          users: [
            {
              id: "uid-alice",
              email: "alice@example.com",
              displayName: "Alice",
            },
            { id: "uid-bob", email: "bob@example.com", displayName: "Bob" },
          ],
        }),
      })),
    );
    resetStore([budgetFixture()]);
    render(<BudgetScreen budgetId="b1" me={aliceMe(false)} />);
    expect(screen.getByLabelText("Visibility")).toBeTruthy();
    const visibility = screen.getByLabelText("Visibility") as HTMLSelectElement;
    const options = [...visibility.options].map((option) => option.textContent);
    expect(options).toEqual(["Hidden", "Public"]);
    expect(screen.getByRole("heading", { name: "Sharing" })).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText("Bob")).toBeTruthy());
    const bob = screen.getByLabelText("Bob") as HTMLSelectElement;
    expect([...bob.options].map((option) => option.textContent)).toEqual([
      "None",
      "See",
      "Browse",
      "Edit",
    ]);
  });
});

describe("AC59: Sharing UI hidden for edit grant", () => {
  it("AC59: Sharing UI hidden for edit grant", () => {
    resetStore([
      {
        ...budgetFixture(),
        grants: [{ userId: "uid-bob", role: "edit" }],
      },
    ]);
    render(
      <BudgetScreen
        budgetId="b1"
        me={{
          id: "uid-bob",
          email: "bob@example.com",
          displayName: "Bob",
          canUseFromText: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          isModerator: false,
        }}
      />,
    );
    expect(screen.queryByLabelText("Visibility")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Sharing" })).toBeNull();
  });
});

describe("Visibility and sharing selects stay on the chosen value", () => {
  it("shows Public after Visibility is changed to public", async () => {
    setAuthTokenGetter(async () => "tok-alice");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url === "/api/users") {
          return {
            ok: true,
            json: async () => ({ users: [] }),
          };
        }
        return { ok: true, json: async () => ({}) };
      }),
    );
    resetStore([budgetFixture()]);
    render(<BudgetScreen budgetId="b1" me={aliceMe(false)} />);
    const visibility = screen.getByLabelText("Visibility") as HTMLSelectElement;
    expect(visibility.value).toBe("hidden");
    fireEvent.change(visibility, { target: { value: "public" } });
    await waitFor(() => expect(visibility.value).toBe("public"));
    expect(listBudgets()[0]?.visibility).toBe("public");
  });

  it("shows Browse after Bob’s sharing role is changed", async () => {
    setAuthTokenGetter(async () => "tok-alice");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url === "/api/users") {
          return {
            ok: true,
            json: async () => ({
              users: [
                {
                  id: "uid-alice",
                  email: "alice@example.com",
                  displayName: "Alice",
                },
                { id: "uid-bob", email: "bob@example.com", displayName: "Bob" },
              ],
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      }),
    );
    resetStore([budgetFixture()]);
    render(<BudgetScreen budgetId="b1" me={aliceMe(false)} />);
    await waitFor(() => expect(screen.getByLabelText("Bob")).toBeTruthy());
    const bob = screen.getByLabelText("Bob") as HTMLSelectElement;
    expect(bob.value).toBe("none");
    fireEvent.change(bob, { target: { value: "browse" } });
    await waitFor(() => expect(bob.value).toBe("browse"));
    expect(listBudgets()[0]?.grants).toEqual([
      { userId: "uid-bob", role: "browse" },
    ]);
  });
});
