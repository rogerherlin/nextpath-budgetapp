# Feature: Income and expense entries

Status: Done

## Problem Statement

Users record money on separate Income and Expenses tabs. Each row needs a category from the matching list, a comment, an amount, and an optional date. Budget start/end dates do not filter or reject rows.

## Proposed Change

Add/edit/delete entries. Amounts are integer cents (including `0` and negative). Comment may be `""`. Date may be `null`. Income tab categories = income list only; expense tab = expense list only. Amount fields show a static `EUR` label. UI language English.

## Acceptance Criteria

### AC1: Add income entry
**Given** budget `"b1"` with income category `"c1"` `"Salary"`
**When** `addEntry("b1", "income", { categoryId: "c1", comment: "June", amountCents: 100000, date: { year: 2026, month: 6, day: 1 } })`
**Then** `incomeEntries` has length `1` with `categoryId` `"c1"`, `comment` `"June"`, `amountCents` `100000`, `date` `{ year: 2026, month: 6, day: 1 }` and `expenseEntries` is `[]`

### AC2: Add expense entry
**Given** budget `"b1"` with expense category `"c2"` `"Rent"`
**When** `addEntry("b1", "expense", { categoryId: "c2", comment: "Flat", amountCents: 30000, date: null })`
**Then** `expenseEntries` has length `1` with those field values and `incomeEntries` is `[]`

### AC3: Allow empty comment
**Given** income category `"c1"`
**When** `addEntry("b1", "income", { categoryId: "c1", comment: "", amountCents: 1, date: null })`
**Then** the entry `comment` is `""`

### AC4: Allow zero amount
**Given** income category `"c1"`
**When** `addEntry("b1", "income", { categoryId: "c1", comment: "x", amountCents: 0, date: null })`
**Then** the entry `amountCents` is `0`

### AC5: Allow negative amount
**Given** income category `"c1"`
**When** `addEntry("b1", "income", { categoryId: "c1", comment: "x", amountCents: -500, date: null })`
**Then** the entry `amountCents` is `-500`

### AC6: Reject missing category
**Given** budget `"b1"`
**When** `addEntry("b1", "income", { categoryId: "", comment: "x", amountCents: 100, date: null })`
**Then** `{ ok: false, error: "Select a category." }` and `incomeEntries` is `[]`

### AC7: Reject income entry with expense category
**Given** expense category `"c2"` only
**When** `addEntry("b1", "income", { categoryId: "c2", comment: "x", amountCents: 100, date: null })`
**Then** `{ ok: false, error: "Select a category." }` and `incomeEntries` is `[]`

### AC8: Entry date may fall outside budget range
**Given** budget start `{ year: 2026, month: 6, day: 1 }`, end `{ year: 2026, month: 6, day: 30 }`, income category `"c1"`
**When** `addEntry("b1", "income", { categoryId: "c1", comment: "x", amountCents: 100, date: { year: 2020, month: 1, day: 1 } })`
**Then** `{ ok: true }` and the entry date is `{ year: 2020, month: 1, day: 1 }`

### AC9: Update entry
**Given** income entry `"e1"` with comment `"June"` amount `100`
**When** `updateEntry("b1", "e1", { comment: "July", amountCents: 200, categoryId: "c1", date: null })`
**Then** `"e1"` has `comment` `"July"` and `amountCents` `200`

### AC10: Delete entry
**Given** income entries `"e1"` and `"e2"`
**When** `deleteEntry("b1", "e1")`
**Then** `incomeEntries` has length `1` and that entry’s `id` is `"e2"`

### AC11: Income and Expenses are separate tabs
**Given** the user has opened a budget
**When** the budget screen renders
**Then** there are tabs named exactly `Income` and `Expenses` (in addition to `Categories` and `Report`)

### AC12: EUR label on amount fields
**Given** the user is on the Income tab add/edit form
**When** the amount field is shown
**Then** the static text `EUR` is visible next to that field (not inside the value)

### AC13: Invalid amount on the form uses parseMoney error
**Given** the user submits an income row with amount text `"abc"`
**When** the form is submitted
**Then** the form shows the text `Enter a valid amount.` and no new entry is added

### AC14: Entries are not shared across budgets
**Given** `"b1"` has one income entry and `"b2"` has none
**When** `addEntry("b2", "income", { categoryId: <b2 category id>, comment: "x", amountCents: 1, date: null })`
**Then** `"b1"` still has `1` income entry and `"b2"` has `1` income entry with a different `id`

## Files to Modify

| File | Change |
|---|---|
| `src/entries.ts` | `addEntry`, `updateEntry`, `deleteEntry`. |
| `src/entries.test.ts` | Tests for AC1–AC10, AC14. |
| `src/ui/EntriesTab.tsx` | Income/Expenses tables and form; AC11–AC13. |
| `src/ui/EntriesTab.test.tsx` | Tests for AC11–AC13. |
| `src/ui/BudgetScreen.tsx` | Tabs `Income`, `Expenses`. |

## Risk

- What could break: report totals if kind (income vs expense) is stored on the wrong array.
- Rollback: remove entries module and tabs; categories still work.

## Testing Strategy (MANDATORY)

| Function | Case | Given | When | Then |
|---|---|---|---|---|
| addEntry | AC1 income | cat c1 | add June 100000 dated | one income entry, 0 expense |
| addEntry | AC2 expense | cat c2 | add Rent 30000 no date | one expense entry |
| addEntry | AC3 comment | c1 | comment `""` | comment `""` |
| addEntry | AC4 zero | c1 | amount 0 | amountCents 0 |
| addEntry | AC5 negative | c1 | amount -500 | amountCents -500 |
| addEntry | AC6 no cat | categoryId `""` | add | `"Select a category."` |
| addEntry | AC7 wrong kind | expense cat on income | add | `"Select a category."` |
| addEntry | AC8 range | budget Jun 2026 | date 01.01.2020 | accepted |
| updateEntry | AC9 | e1 June/100 | July/200 | those values |
| deleteEntry | AC10 | e1,e2 | delete e1 | only e2 |
| BudgetScreen | AC11 tabs | budget open | render | tabs Income, Expenses |
| EntriesTab | AC12 EUR | Income form | render | text `EUR` beside amount |
| EntriesTab | AC13 bad amount | `"abc"` | submit | `Enter a valid amount.`, 0 new rows |
| addEntry | AC14 isolate | b1 has 1 | add on b2 | different ids |

## Spec Readiness checklist

- [x] Every AC has a precise expected value — no "works correctly"
- [x] Another person could write a test from each AC without asking
- [x] Every AC can fail — one that cannot fail proves nothing
- [x] Error and edge cases have ACs of their own
- [x] Every AC appears in the testing strategy table
