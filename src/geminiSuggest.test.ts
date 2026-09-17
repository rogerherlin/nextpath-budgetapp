import { describe, expect, it, vi } from "vitest";
import {
  GEMINI_JSON_MIME,
  GEMINI_MODEL_ID,
  buildSuggestPrompt,
  handleSuggestEntries,
  type GeminiCaller,
} from "./geminiSuggest";

const validBody = JSON.stringify({
  text: "paid rent 600 euros",
  incomeCategories: [{ id: "c1", name: "Salary" }],
  expenseCategories: [{ id: "c2", name: "Rent" }],
});

describe("AC5: Gemini model and JSON mode", () => {
  it("AC5: Gemini model and JSON mode", async () => {
    const generateJson = vi.fn(async () =>
      JSON.stringify({
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
    );
    const caller: GeminiCaller = { generateJson };
    const result = await handleSuggestEntries(validBody, "test-key", caller);
    expect(result.status).toBe(200);
    expect(generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "test-key",
        model: GEMINI_MODEL_ID,
        responseMimeType: GEMINI_JSON_MIME,
      }),
    );
    expect(GEMINI_MODEL_ID).toBe("gemini-3.6-flash");
    expect(GEMINI_JSON_MIME).toBe("application/json");
  });
});

describe("AC21: Missing API key", () => {
  it("AC21: Missing API key", async () => {
    const generateJson = vi.fn(async () => "");
    const result = await handleSuggestEntries(validBody, "", {
      generateJson,
    });
    expect(result).toEqual({
      status: 503,
      body: { error: "Gemini API key is missing." },
    });
    expect(generateJson).not.toHaveBeenCalled();
  });
});

describe("AC26: Prompt asks for general category names", () => {
  it("AC26: Prompt asks for general category names", () => {
    const prompt = buildSuggestPrompt({
      text: "milk 4 euros",
      incomeCategories: [],
      expenseCategories: [],
    });
    expect(prompt).toContain("general category");
    expect(prompt).toContain("not the specific item");
    expect(prompt).toContain("milk");
    expect(prompt).toContain("comment");
  });
});

describe("AC22: Gemini / parse failure (handler)", () => {
  it("AC22: Gemini / parse failure (handler)", async () => {
    const result = await handleSuggestEntries(validBody, "test-key", {
      generateJson: async () => "not-json",
    });
    expect(result.status).toBe(502);
    expect(result.body).toEqual({ error: "Could not suggest entries." });
  });
});
