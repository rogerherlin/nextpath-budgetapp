/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listBudgets, resetStore } from "../budgets";
import type { Budget } from "../types";
import { BudgetScreen } from "./BudgetScreen";

function budgetFixture(): Budget {
  return {
    id: "b1",
    name: "Summer 2026",
    description: "",
    startDate: null,
    endDate: null,
    targetLeftoverCents: null,
    incomeCategories: [{ id: "c1", name: "Salary" }],
    expenseCategories: [{ id: "c2", name: "Rent" }],
    incomeEntries: [],
    expenseEntries: [],
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function openFromText(budget: Budget = budgetFixture()) {
  resetStore([budget]);
  render(<BudgetScreen budgetId="b1" />);
  fireEvent.click(screen.getByRole("button", { name: "From text" }));
}

describe("AC1: Fifth tab labelled From text", () => {
  it("AC1: Fifth tab labelled From text", () => {
    resetStore([budgetFixture()]);
    render(<BudgetScreen budgetId="b1" />);
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

describe("AC2: Panel names the open budget", () => {
  it("AC2: Panel names the open budget", () => {
    openFromText();
    expect(
      screen.getByRole("heading", {
        name: "Describe entries for “Summer 2026”",
      }),
    ).toBeTruthy();
  });
});

describe("AC3: Empty description is not sent to Gemini", () => {
  it("AC3: Empty description is not sent to Gemini", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    openFromText();
    fireEvent.click(screen.getByRole("button", { name: "Suggest" }));
    expect(screen.getByText("Enter a description.")).toBeTruthy();
    expect(screen.getByText("Enter a description.").className).toContain(
      "field-error",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("AC4: Suggest request body", () => {
  it("AC4: Suggest request body", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ items: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    openFromText();
    fireEvent.change(screen.getByLabelText("What happened"), {
      target: { value: "paid rent 600 euros" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Suggest" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const first = fetchMock.mock.calls[0] as unknown as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(first[0]).toBe("/api/suggest-entries");
    expect(first[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "paid rent 600 euros",
          incomeCategories: [{ id: "c1", name: "Salary" }],
          expenseCategories: [{ id: "c2", name: "Rent" }],
        }),
      }),
    );
  });
});

describe("AC6: Review appears; store unchanged", () => {
  it("AC6: Review appears; store unchanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          items: [
            {
              kind: "expense",
              categoryId: "c2",
              categoryName: "Rent",
              comment: "rent",
              amountEuros: 600,
              date: null,
            },
          ],
        }),
      })),
    );
    openFromText();
    fireEvent.change(screen.getByLabelText("What happened"), {
      target: { value: "paid rent 600 euros" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Suggest" }));
    await waitFor(() => expect(screen.getByLabelText("Type")).toBeTruthy());
    expect((screen.getByLabelText("Type") as HTMLSelectElement).value).toBe(
      "expense",
    );
    expect((screen.getByLabelText("Category") as HTMLInputElement).value).toBe(
      "Rent",
    );
    expect((screen.getByLabelText("Comment") as HTMLInputElement).value).toBe(
      "rent",
    );
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe(
      "600,00",
    );
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("");
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeEntries).toEqual([]);
    expect(budget?.expenseEntries).toEqual([]);
  });
});

describe("AC7: Apply uses existing category (UI)", () => {
  it("AC7: Apply uses existing category (UI)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          items: [
            {
              kind: "expense",
              categoryId: "c2",
              categoryName: "Rent",
              comment: "rent",
              amountEuros: 600,
              date: null,
            },
          ],
        }),
      })),
    );
    openFromText();
    fireEvent.change(screen.getByLabelText("What happened"), {
      target: { value: "paid rent 600 euros" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Suggest" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.expenseEntries).toHaveLength(1);
    expect(budget?.expenseEntries[0]?.categoryId).toBe("c2");
    expect(budget?.expenseEntries[0]?.amountCents).toBe(60000);
    expect(budget?.expenseCategories).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
  });
});

describe("AC16: Cancel review writes nothing", () => {
  it("AC16: Cancel review writes nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          items: [
            {
              kind: "expense",
              categoryId: "c2",
              categoryName: "Rent",
              comment: "rent",
              amountEuros: 600,
              date: null,
            },
          ],
        }),
      })),
    );
    openFromText();
    fireEvent.change(screen.getByLabelText("What happened"), {
      target: { value: "paid rent 600 euros" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Suggest" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.incomeEntries).toEqual([]);
    expect(budget?.expenseEntries).toEqual([]);
    expect(budget?.incomeCategories).toEqual([{ id: "c1", name: "Salary" }]);
    expect(budget?.expenseCategories).toEqual([{ id: "c2", name: "Rent" }]);
  });
});

describe("AC20: Currency words do not change the amount", () => {
  it("AC20: Currency words do not change the amount (review)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          items: [
            {
              kind: "expense",
              categoryId: null,
              categoryName: "Food",
              comment: "shop",
              amountEuros: 50,
              date: null,
            },
          ],
        }),
      })),
    );
    openFromText();
    fireEvent.change(screen.getByLabelText("What happened"), {
      target: { value: "bought food for 50 euros" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Suggest" }));
    await waitFor(() => expect(screen.getByLabelText("Amount")).toBeTruthy());
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe(
      "50,00",
    );
  });
});

describe("AC22: Gemini / parse failure", () => {
  it("AC22: Gemini / parse failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: "Could not suggest entries." }),
      })),
    );
    openFromText();
    fireEvent.change(screen.getByLabelText("What happened"), {
      target: { value: "paid rent 600 euros" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Suggest" }));
    await waitFor(() =>
      expect(screen.getByText("Could not suggest entries.")).toBeTruthy(),
    );
    expect(screen.getByText("Could not suggest entries.").className).toContain(
      "field-error",
    );
    const budget = listBudgets().find((item) => item.id === "b1");
    expect(budget?.expenseEntries).toEqual([]);
  });
});
