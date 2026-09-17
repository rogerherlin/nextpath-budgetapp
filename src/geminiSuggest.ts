import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseSuggestResponse, type SuggestItem } from "./suggest";

export const GEMINI_MODEL_ID = "gemini-3.6-flash";
export const GEMINI_JSON_MIME = "application/json";

export type CategoryRef = { id: string; name: string };

export type SuggestRequestBody = {
  text: string;
  incomeCategories: CategoryRef[];
  expenseCategories: CategoryRef[];
};

export type GeminiJsonCall = {
  apiKey: string;
  model: string;
  responseMimeType: string;
  prompt: string;
};

export type GeminiCaller = {
  generateJson: (input: GeminiJsonCall) => Promise<string>;
};

export function createSdkCaller(): GeminiCaller {
  return {
    async generateJson(input) {
      const genAI = new GoogleGenerativeAI(input.apiKey);
      const model = genAI.getGenerativeModel({
        model: input.model,
        generationConfig: { responseMimeType: input.responseMimeType },
      });
      const result = await model.generateContent(input.prompt);
      return result.response.text();
    },
  };
}

function isCategoryRef(value: unknown): value is CategoryRef {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

function parseCategoryList(value: unknown): CategoryRef[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const list: CategoryRef[] = [];
  for (const item of value) {
    if (!isCategoryRef(item)) {
      return null;
    }
    list.push(item);
  }
  return list;
}

export function parseSuggestRequestBody(
  data: unknown,
): SuggestRequestBody | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  if (!("text" in data) || typeof data.text !== "string") {
    return null;
  }
  const incomeCategories = parseCategoryList(
    "incomeCategories" in data ? data.incomeCategories : undefined,
  );
  const expenseCategories = parseCategoryList(
    "expenseCategories" in data ? data.expenseCategories : undefined,
  );
  if (incomeCategories === null || expenseCategories === null) {
    return null;
  }
  return {
    text: data.text,
    incomeCategories,
    expenseCategories,
  };
}

export function buildSuggestPrompt(request: SuggestRequestBody): string {
  return [
    "Extract income and expense items from the user's free text.",
    "Return JSON with an items array only.",
    "Each item: kind (income, expense, or null if unclear), categoryId (existing id or null), categoryName, comment, amountEuros (number only), date (dd.mm.yyyy or null).",
    "categoryName must be a general category people reuse in a budget (for example food, groceries, rent, salary, clothes), not the specific item.",
    "Do not use the specific item as categoryName: milk is not a category; new shoes is not a category.",
    "Put the specific item in comment (for example milk, new shoes).",
    "Example: user text \"milk 4 euros\" -> categoryName like food or groceries, comment milk, not categoryName milk.",
    "Reuse an existing category id when the item belongs in that general category.",
    "If no category fits, propose a new general categoryName in the user's language (do not translate) and set categoryId to null.",
    "Never suggest deleting, renaming, or editing existing data.",
    "Ignore currency words and symbols (euro, euros, EUR, €, and others); keep only the numeric amount.",
    "Existing income categories:",
    JSON.stringify(request.incomeCategories),
    "Existing expense categories:",
    JSON.stringify(request.expenseCategories),
    "User text:",
    request.text,
  ].join("\n");
}

export type SuggestHttpResult = {
  status: number;
  body: { items: SuggestItem[] } | { error: string };
};

export async function handleSuggestEntries(
  rawBody: string,
  apiKey: string,
  caller: GeminiCaller,
): Promise<SuggestHttpResult> {
  if (apiKey.trim() === "") {
    return { status: 503, body: { error: "Gemini API key is missing." } };
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody) as unknown;
  } catch {
    return { status: 400, body: { error: "Could not suggest entries." } };
  }
  const request = parseSuggestRequestBody(parsedJson);
  if (request === null) {
    return { status: 400, body: { error: "Could not suggest entries." } };
  }
  const prompt = buildSuggestPrompt(request);
  let raw: string;
  try {
    raw = await caller.generateJson({
      apiKey,
      model: GEMINI_MODEL_ID,
      responseMimeType: GEMINI_JSON_MIME,
      prompt,
    });
  } catch {
    return { status: 502, body: { error: "Could not suggest entries." } };
  }
  let modelJson: unknown;
  try {
    modelJson = JSON.parse(raw) as unknown;
  } catch {
    return { status: 502, body: { error: "Could not suggest entries." } };
  }
  const parsed = parseSuggestResponse(modelJson);
  if (!parsed.ok) {
    return { status: 502, body: { error: parsed.error } };
  }
  return { status: 200, body: { items: parsed.items } };
}
