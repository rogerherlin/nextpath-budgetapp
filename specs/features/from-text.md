# Feature: From-text entry suggestions (Gemini)

Status: Done

## Problem Statement

Typing each income and expense row by hand is slow. Household users can already describe a batch of events in ordinary language. The app should turn that description into suggested categories and rows for the **open** budget, let the user check and fix them, then write only additions.

## Proposed Change

A fifth budget tab, labelled exactly `From text`. The panel states which budget is being edited. The user pastes free text and clicks `Suggest`. The Vite server calls **Gemini `gemini-3.6-flash`** via the official SDK (`@google/generative-ai`), sending the text plus that budget’s existing category `{ id, name }` lists. The model returns JSON only. Currency words (`euro`, `euros`, `EUR`, `€`, and other currency names/symbols) are ignored; only the numeric amounts are used. Dates in the text become `dd.mm.yyyy`; if none, date is empty.

The UI shows a **review table** (not the store yet). The user can change each row’s type (`Income` / `Expense`) so ambiguous items such as a loan can be classified by a person. `Apply` writes valid rows through existing `addCategory` and `addEntry` only. Invalid rows stay in the review list with field errors. `Cancel` writes nothing.

The API key lives in a gitignored `.env` as `GEMINI_API_KEY` (no `VITE_` prefix). The browser never receives the key.

**New category names:** `categoryName` is a general bucket (food, groceries, rent, salary), not the product itself. The specific item goes in `comment`. Apply still stores the model’s `categoryName` as returned (no translation). The user may still edit the name in the review table before `Apply`.

## Gemini JSON (server → UI)

Each element of `items` is:

| Field | Type | Meaning |
|---|---|---|
| `kind` | `"income"` \| `"expense"` \| `null` | Model guess; `null` if it cannot choose |
| `categoryId` | `string` \| `null` | Existing category id of that kind, else `null` |
| `categoryName` | `string` | Existing name or proposed new name |
| `comment` | `string` | Short comment; may be `""` |
| `amountEuros` | `number` | Numeric amount only (not cents); currency words stripped |
| `date` | `string` \| `null` | `dd.mm.yyyy` or `null` |

The prompt instructs the model: reuse an existing category id when it fits; otherwise propose a **general** `categoryName` (a budget category such as food or groceries, never the purchased item such as milk) in the user’s language (do not translate) and set `categoryId` to `null`; put the specific item in `comment`; never suggest deletes, renames, or edits of existing data; ignore currency words; use `null` `kind` when income vs expense is unclear.

## Acceptance Criteria

### AC1: Fifth tab labelled From text
**Given** the user has opened a budget
**When** the budget screen renders
**Then** the tabs in order are exactly `Categories`, `Income`, `Expenses`, `Report`, `From text`

### AC2: Panel names the open budget
**Given** the open budget `name` is `Summer 2026`
**When** the user selects tab `From text`
**Then** the panel shows the heading `Describe entries for “Summer 2026”`

### AC3: Empty description is not sent to Gemini
**Given** the From text tab with the description field `""`
**When** the user clicks `Suggest`
**Then** a `.field-error` next to the description shows `Enter a description.` and no `/api/suggest-entries` request is made

### AC4: Suggest request body
**Given** open budget `"b1"` with income categories `[{ id: "c1", name: "Salary" }]` and expense categories `[{ id: "c2", name: "Rent" }]` and description text `paid rent 600 euros`
**When** the user clicks `Suggest` (Gemini client is injected/mocked)
**Then** `POST /api/suggest-entries` JSON body is exactly `{ "text": "paid rent 600 euros", "incomeCategories": [{ "id": "c1", "name": "Salary" }], "expenseCategories": [{ "id": "c2", "name": "Rent" }] }`

### AC5: Gemini model and JSON mode
**Given** `GEMINI_API_KEY` is set
**When** the server handles `POST /api/suggest-entries`
**Then** it calls the SDK with model id `gemini-3.6-flash` and requests JSON output (`responseMimeType` `application/json`)

### AC6: Review appears; store unchanged
**Given** a mocked Gemini response `{ "items": [{ "kind": "expense", "categoryId": "c2", "categoryName": "Rent", "comment": "rent", "amountEuros": 600, "date": null }] }`
**When** `Suggest` succeeds
**Then** the review table shows one row with type `Expense`, category `Rent`, comment `rent`, amount `600,00`, date `""`, and that budget still has the same `incomeEntries` and `expenseEntries` arrays as before `Suggest`

### AC7: Apply uses existing category
**Given** the review row from AC6 and expense category `"c2"` `"Rent"`
**When** the user clicks `Apply`
**Then** `expenseEntries` gains one entry `{ categoryId: "c2", comment: "rent", amountCents: 60000, date: null }` (id is a non-empty string), `expenseCategories` length is unchanged, and `incomeEntries` is unchanged

### AC8: Apply creates a missing category
**Given** budget `"b1"` with no expense categories; review row `{ kind: "expense", categoryId: null, categoryName: "Movies", comment: "tickets", amountEuros: 20, date: null }`
**When** the user clicks `Apply`
**Then** `expenseCategories` is `[{ id: <non-empty string>, name: "Movies" }]` and `expenseEntries` has length `1` with that new category’s `id`, `comment` `"tickets"`, `amountCents` `2000`, `date` `null`

### AC9: New category matches existing name (case-insensitive)
**Given** expense category `"c2"` `"Rent"` and review row `{ kind: "expense", categoryId: null, categoryName: "rent", comment: "July", amountEuros: 600, date: null }`
**When** the user clicks `Apply`
**Then** no second expense category is added; the new entry’s `categoryId` is `"c2"`

### AC10: User can change income vs expense before apply
**Given** a review row `{ kind: "income", categoryId: null, categoryName: "Loan", comment: "friend", amountEuros: 100, date: null }`
**When** the user sets that row’s type to `Expense` and clicks `Apply`
**Then** `expenseCategories` contains `"Loan"`, `expenseEntries` has length `1` with `amountCents` `10000`, and `incomeCategories` / `incomeEntries` are unchanged

### AC11: Null kind must be chosen
**Given** a review row with `kind` `null`, `categoryName` `"Loan"`, `amountEuros` `100`
**When** the user clicks `Apply` without choosing type
**Then** that row shows `.field-error` text `Select income or expense.` and no category or entry is added

### AC12: Partial apply
**Given** two review rows: (1) `{ kind: "income", categoryId: "c1", categoryName: "Salary", comment: "pay", amountEuros: 4000, date: null }` with `"c1"` an income category; (2) `{ kind: "expense", categoryId: null, categoryName: "", comment: "x", amountEuros: 50, date: null }`
**When** the user clicks `Apply`
**Then** one income entry is added (`amountCents` `400000`); row (2) remains in the review list with `.field-error` `Name is required.`; no expense category or expense entry is added

### AC13: Invalid amount on a review row is skipped
**Given** a review row with a valid kind and category name and amount field text `abc`
**When** the user clicks `Apply`
**Then** that row shows `Enter a valid amount.` and no entry is added for it

### AC14: Date parsed or left empty
**Given** a review row with date text `15.03.2026` and another with date `""`
**When** the user clicks `Apply` (both rows otherwise valid)
**Then** the first new entry `date` is `{ year: 2026, month: 3, day: 15 }` and the second new entry `date` is `null`

### AC15: Invalid date on a review row is skipped
**Given** a review row with date text `2026-03-15` (otherwise valid)
**When** the user clicks `Apply`
**Then** that row shows `Enter a date as dd.mm.yyyy.` and no entry is added for it

### AC16: Cancel review writes nothing
**Given** the review table from a successful `Suggest` and an empty entry list
**When** the user clicks `Cancel`
**Then** the review table is gone and `incomeEntries` / `expenseEntries` / category arrays are unchanged

### AC17: Delete-shaped Gemini fields never delete
**Given** mocked Gemini JSON `{ "items": [], "deleteCategoryIds": ["c2"], "deleteEntryIds": ["e1"] }` and budget `"b1"` that has expense category `"c2"` and expense entry `"e1"`
**When** `parseSuggestResponse` / `Suggest` completes and the user clicks `Apply` (empty items)
**Then** `"c2"` and `"e1"` still exist; `applySuggestedItems` never calls `deleteCategory` or `deleteEntry`

### AC18: Wrong-list category id is not used
**Given** income category `"c1"` `"Salary"` only; review row `{ kind: "expense", categoryId: "c1", categoryName: "Salary", comment: "x", amountEuros: 1, date: null }`
**When** the user clicks `Apply`
**Then** a **new** expense category named `"Salary"` is created and the expense entry uses that new id, not `"c1"`

### AC19: Batch ids are unique
**Given** three valid review rows applied in one `Apply`
**When** `applySuggestedItems` finishes
**Then** the three new entry `id` values are three different non-empty strings, and any newly created category ids are unique too

### AC20: Currency words do not change the amount
**Given** mocked Gemini JSON item `amountEuros` `50` for text that contained `50` and the word `euros`
**When** the review row is shown
**Then** the amount field is `50,00` (not a parse error)

### AC21: Missing API key
**Given** `GEMINI_API_KEY` is unset or empty
**When** the server handles `POST /api/suggest-entries` with valid JSON body
**Then** the HTTP status is `503` and the JSON body is `{ "error": "Gemini API key is missing." }` and the SDK is not called

### AC22: Gemini / parse failure
**Given** the SDK throws or returns non-JSON
**When** `Suggest` finishes
**Then** a `.field-error` shows `Could not suggest entries.` and the store is unchanged

### AC23: Key never uses VITE_ prefix
**Given** the app source and Vite client env
**When** a production or dev client bundle is considered
**Then** the client reads no `import.meta.env.VITE_GEMINI_API_KEY` (or any `VITE_` Gemini key); only the Node plugin reads `GEMINI_API_KEY` from `.env`

### AC24: `.env` is gitignored
**Given** the repository `.gitignore`
**When** it is read
**Then** it contains a line `.env`

### AC25: New category name keeps the model’s wording
**Given** no expense category named `elokuvat`; review row `{ kind: "expense", categoryId: null, categoryName: "elokuvat", comment: "liput", amountEuros: 20, date: null }`
**When** the user clicks `Apply`
**Then** `expenseCategories` contains exactly one category whose `name` is `"elokuvat"` (not `"Movies"` or any other translation) and the new expense entry uses that category’s `id`

### AC26: Prompt asks for general category names
**Given** a suggest request with text `milk 4 euros` and empty category lists
**When** `buildSuggestPrompt` runs
**Then** the prompt contains `general category`, `not the specific item`, the example `milk`, and `comment`

## Files to Modify

| File | Change |
|---|---|
| `.gitignore` | Add `.env`. |
| `.env.example` | Tracked template: `GEMINI_API_KEY=` (empty). |
| `package.json` | Dependency `@google/generative-ai`. |
| `vite.config.ts` | `POST /api/suggest-entries`; load `GEMINI_API_KEY` with `loadEnv`; never put the key in client HTML. |
| `src/suggest.ts` | `parseSuggestResponse`, `applySuggestedItems` (adds only). |
| `src/suggest.test.ts` | Domain tests for apply/parse ACs. |
| `src/geminiSuggest.ts` | Node-only: SDK call, model `gemini-3.6-flash`, JSON mime type, prompt. |
| `src/geminiSuggest.test.ts` | Mock SDK; AC5, AC21, AC22. |
| `src/ui/FromTextTab.tsx` | Description field, Suggest, review table, Apply, Cancel. |
| `src/ui/FromTextTab.test.tsx` | UI ACs; mock `fetch`. |
| `src/ui/BudgetScreen.tsx` | Fifth tab `From text`; pass `budgetId`. |
| `src/categories.ts` / `src/entries.ts` | Unique ids for batch adds if `Date.now()` would collide (used by apply). |
| `specs/ui-ux.md` | Tab list and From text panel (done in this spec pass). |
| `specs/architecture.md` | Same-origin Gemini proxy (done in this spec pass). |
| `specs/tech-stack.md` | SDK, `.env`, route (done in this spec pass). |

## Risk

- What could break: leaking `GEMINI_API_KEY` via `VITE_` env; duplicate ids on batch apply; applying before review; cascade deletes if apply reused `deleteCategory`; existing tab-order tests if the fifth tab is inserted in the middle.
- Rollback: remove the tab, `/api/suggest-entries`, `src/suggest.ts`, `src/geminiSuggest.ts`, and the SDK dependency; keep `.env` gitignored.
- Tests must mock the SDK; CI must not call Google.

## Testing Strategy (MANDATORY)

| Function | Case | Given | When | Then |
|---|---|---|---|---|
| BudgetScreen | AC1 tab order | open budget | render | five labels in that order |
| FromTextTab | AC2 heading | name Summer 2026 | From text tab | heading with curly quotes |
| FromTextTab | AC3 empty | text `""` | Suggest | `Enter a description.`; no fetch |
| FromTextTab | AC4 body | categories c1, c2 | Suggest | POST body as specified |
| geminiSuggest | AC5 model | key set | POST handler | model `gemini-3.6-flash`, JSON mime |
| FromTextTab | AC6 review | mocked items | Suggest | review row; entries unchanged |
| applySuggestedItems | AC7 reuse | c2 Rent | Apply | one expense entry on c2, 60000 cents |
| applySuggestedItems | AC8 new cat | no expense cats | Apply | Movies + entry 2000 cents |
| applySuggestedItems | AC9 name match | Rent exists | Apply name `rent` | still one category; entry on c2 |
| applySuggestedItems | AC10 kind edit | kind flipped to expense | Apply | expense Loan 10000; income unchanged |
| applySuggestedItems | AC11 null kind | kind null | Apply | `Select income or expense.`; no write |
| applySuggestedItems | AC12 partial | one good, one empty name | Apply | one income entry; error on row 2 |
| applySuggestedItems | AC13 amount | amount `abc` | Apply | `Enter a valid amount.` |
| applySuggestedItems | AC14 dates | `15.03.2026` and `""` | Apply | DateParts vs null |
| applySuggestedItems | AC15 bad date | `2026-03-15` | Apply | `Enter a date as dd.mm.yyyy.` |
| FromTextTab | AC16 cancel | review visible | Cancel | no store change; review gone |
| parseSuggestResponse | AC17 extras | delete arrays in JSON | parse + Apply | c2 and e1 remain |
| applySuggestedItems | AC18 wrong list | expense row with income id | Apply | new expense category |
| applySuggestedItems | AC19 unique ids | three rows | Apply | three distinct entry ids |
| FromTextTab | AC20 currency | amountEuros 50 | review | `50,00` |
| geminiSuggest | AC21 no key | empty key | POST | 503, exact error JSON |
| FromTextTab | AC22 fail | SDK/non-JSON | Suggest | `Could not suggest entries.` |
| grep / source | AC23 no VITE_ key | src + vite client | inspect | no `VITE_GEMINI` |
| .gitignore | AC24 | repo | read | line `.env` |
| applySuggestedItems | AC25 keep wording | categoryName `elokuvat` | Apply | category name is `elokuvat` |
| buildSuggestPrompt | AC26 general names | text milk 4 euros | buildSuggestPrompt | prompt has general category, not the specific item, milk, comment |

## Spec Readiness checklist

- [x] Every AC has a precise expected value — no "works correctly"
- [x] Another person could write a test from each AC without asking
- [x] Every AC can fail — one that cannot fail proves nothing
- [x] Error and edge cases have ACs of their own
- [x] Every AC appears in the testing strategy table
