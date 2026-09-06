# Feature: Budget lifecycle

Status: Done

## Problem Statement

Users start by picking or creating a budget. Names must stay unique on a shared device. Copy must duplicate a whole dataset without sharing data. Anyone may delete any budget, including the last one.

## Proposed Change

Domain functions create, list, open (by id), copy, and delete budgets. Names are trimmed; uniqueness is case-insensitive. Copy assigns `Name (copyN)`. Empty budgets are valid. Optional description, start date, end date, and target leftover (cents or `null`). Start/end dates do not constrain entries (see entries spec).

## Acceptance Criteria

### AC1: Create budget with unique name
**Given** no budgets
**When** `createBudget({ name: "Summer" })`
**Then** the store has one budget with `name` `"Summer"`, `description` `""`, `startDate` `null`, `endDate` `null`, `targetLeftoverCents` `null`, `incomeCategories` `[]`, `expenseCategories` `[]`, `incomeEntries` `[]`, `expenseEntries` `[]`

### AC2: Trim name on create
**Given** no budgets
**When** `createBudget({ name: "  Summer  " })`
**Then** the created budget `name` is `"Summer"`

### AC3: Reject empty name
**Given** no budgets
**When** `createBudget({ name: "" })`
**Then** the return value is `{ ok: false, error: "Name is required." }` and the store still has `0` budgets

### AC4: Reject whitespace-only name
**Given** no budgets
**When** `createBudget({ name: "   " })`
**Then** the return value is `{ ok: false, error: "Name is required." }` and the store still has `0` budgets

### AC5: Reject duplicate name case-insensitively
**Given** a budget named `"Summer"`
**When** `createBudget({ name: "summer" })`
**Then** the return value is `{ ok: false, error: "The name is already in use." }` and the store still has `1` budget

### AC6: Create with optional fields set
**Given** no budgets
**When** `createBudget({ name: "Summer", description: "Holiday", startDate: { year: 2026, month: 6, day: 1 }, endDate: { year: 2026, month: 6, day: 30 }, targetLeftoverCents: 20000 })`
**Then** the created budget has `description` `"Holiday"`, `startDate` `{ year: 2026, month: 6, day: 1 }`, `endDate` `{ year: 2026, month: 6, day: 30 }`, `targetLeftoverCents` `20000`

### AC7: nextCopyName first copy
**Given** existing names `["Summer"]`
**When** `nextCopyName("Summer", ["Summer"])`
**Then** the return value is `"Summer (copy1)"`

### AC8: nextCopyName skips taken suffix
**Given** existing names `["Summer", "Summer (copy1)"]`
**When** `nextCopyName("Summer", ["Summer", "Summer (copy1)"])`
**Then** the return value is `"Summer (copy2)"`

### AC9: nextCopyName is case-insensitive against existing
**Given** existing names `["summer (copy1)"]`
**When** `nextCopyName("Summer", ["summer (copy1)"])`
**Then** the return value is `"Summer (copy2)"`

### AC10: Copy clones data with a new id and copy name
**Given** budget `"Summer"` with id `"b1"`, one income category `{ id: "c1", name: "Salary" }`, one income entry `{ id: "e1", categoryId: "c1", comment: "June", amountCents: 10000, date: null }`
**When** `copyBudget("b1")`
**Then** there are `2` budgets; the new budget has `name` `"Summer (copy1)"`, `id` not equal to `"b1"`; it has one income category with `name` `"Salary"` and `id` not equal to `"c1"`; it has one income entry with `comment` `"June"`, `amountCents` `10000`, `date` `null`, `id` not equal to `"e1"`, and `categoryId` equal to the **new** category id

### AC11: Copy does not share data with the source
**Given** the result of AC10
**When** the source budget’s category name is changed to `"Wages"`
**Then** the copy’s category name is still `"Salary"`

### AC12: Delete budget by id
**Given** budgets `"Summer"` (`"b1"`) and `"Winter"` (`"b2"`)
**When** `deleteBudget("b1")`
**Then** `listBudgets()` returns exactly one budget and that budget’s `name` is `"Winter"`

### AC13: Delete the last budget
**Given** one budget `"Summer"` (`"b1"`)
**When** `deleteBudget("b1")`
**Then** `listBudgets()` returns `[]`

### AC14: Rename to a taken name is rejected
**Given** budgets `"Summer"` (`"b1"`) and `"Winter"` (`"b2"`)
**When** `updateBudget("b1", { name: " winter " })`
**Then** the return value is `{ ok: false, error: "The name is already in use." }` and `"b1"` is still named `"Summer"`

### AC15: Rename with trim succeeds
**Given** one budget `"Summer"` (`"b1"`)
**When** `updateBudget("b1", { name: "  Autumn  " })`
**Then** `"b1"` has `name` `"Autumn"`

### AC16: Delete-budget confirmation copy
**Given** the user has chosen Delete on budget `"Summer"`
**When** the confirmation is shown
**Then** the message is exactly `Delete budget “Summer”? This cannot be undone.`

### AC17: Home list labels when empty
**Given** `listBudgets()` is `[]`
**When** the home screen renders
**Then** it shows the text `No budgets yet.` and a control whose accessible name is `New budget`

### AC18: Home list shows names
**Given** budgets named `"Summer"` and `"Winter"`
**When** the home screen renders
**Then** it shows `Summer` and `Winter` and each row has actions `Open`, `Copy`, `Delete`

## Files to Modify

| File | Change |
|---|---|
| `src/types.ts` | `Budget`, `Category`, `Entry`, `DateParts` types. |
| `src/names.ts` | `normalizeName`, `isNameTaken`, `nextCopyName`. |
| `src/budgets.ts` | `createBudget`, `updateBudget`, `copyBudget`, `deleteBudget`, `listBudgets`. |
| `src/names.test.ts` | Tests for AC7–AC9. |
| `src/budgets.test.ts` | Tests for AC1–AC6, AC10–AC15. |
| `src/ui/HomeScreen.tsx` | Home list, New budget, Open/Copy/Delete; AC16–AC18. |
| `src/ui/HomeScreen.test.tsx` | Tests for AC16–AC18. |

## Risk

- What could break: later persistence if ids or copy wiring are wrong — copies would alias the same arrays.
- Rollback: remove `src/budgets.ts` / home screen; no report/entries yet depend on copy isolation until those features exist.

## Testing Strategy (MANDATORY)

| Function | Case | Given | When | Then |
|---|---|---|---|---|
| createBudget | AC1 empty ok | no budgets | create `"Summer"` | one budget, empty collections, null optionals |
| createBudget | AC2 trim | `"  Summer  "` | create | name `"Summer"` |
| createBudget | AC3 empty | `""` | create | error `"Name is required."`, 0 budgets |
| createBudget | AC4 whitespace | `"   "` | create | error `"Name is required."`, 0 budgets |
| createBudget | AC5 duplicate | `"Summer"` exists | create `"summer"` | error `"The name is already in use."`, 1 budget |
| createBudget | AC6 optionals | full fields | create | description/dates/target match input |
| nextCopyName | AC7 first | `["Summer"]` | nextCopyName Summer | `"Summer (copy1)"` |
| nextCopyName | AC8 second | copy1 taken | nextCopyName Summer | `"Summer (copy2)"` |
| nextCopyName | AC9 case | `"summer (copy1)"` listed | nextCopyName Summer | `"Summer (copy2)"` |
| copyBudget | AC10 clone | Summer with cat+entry | copy | new ids, name `"Summer (copy1)"`, entry.categoryId remapped |
| copyBudget | AC11 isolate | after copy | rename source category | copy still `"Salary"` |
| deleteBudget | AC12 one of two | Summer+Winter | delete Summer | only Winter |
| deleteBudget | AC13 last | Summer only | delete | `[]` |
| updateBudget | AC14 taken | Summer+Winter | rename Summer to winter | error `"The name is already in use."` |
| updateBudget | AC15 trim | Summer | rename `"  Autumn  "` | `"Autumn"` |
| HomeScreen | AC16 confirm | Delete Summer | show dialog | `Delete budget “Summer”? This cannot be undone.` |
| HomeScreen | AC17 empty | no budgets | render | `No budgets yet.` + `New budget` |
| HomeScreen | AC18 list | Summer, Winter | render | names + Open/Copy/Delete |

## Spec Readiness checklist

- [x] Every AC has a precise expected value — no "works correctly"
- [x] Another person could write a test from each AC without asking
- [x] Every AC can fail — one that cannot fail proves nothing
- [x] Error and edge cases have ACs of their own
- [x] Every AC appears in the testing strategy table
