# Feature: Income and expense categories

Status: In Progress

## Problem Statement

Each budget has its own income and expense categories. Users add, edit, and delete them on one Categories tab with two lists. Deleting a category that has rows must warn and remove those rows.

## Proposed Change

A Categories tab with two lists. Names are trimmed; uniqueness is case-insensitive **within that list** (income vs expense). The same name may exist once in income and once in expense. Delete unused: light confirm. Delete with rows: warn count and cascade-delete matching entries.

## Acceptance Criteria

### AC1: Add income category
**Given** budget `"b1"` with no categories
**When** `addCategory("b1", "income", { name: "Salary" })`
**Then** `incomeCategories` is `[{ id: <non-empty string>, name: "Salary" }]` and `expenseCategories` is `[]`

### AC2: Add expense category
**Given** budget `"b1"` with no categories
**When** `addCategory("b1", "expense", { name: "Rent" })`
**Then** `expenseCategories` is `[{ id: <non-empty string>, name: "Rent" }]` and `incomeCategories` is `[]`

### AC3: Trim category name
**Given** budget `"b1"`
**When** `addCategory("b1", "income", { name: "  Salary  " })`
**Then** the new category `name` is `"Salary"`

### AC4: Reject empty category name
**Given** budget `"b1"`
**When** `addCategory("b1", "income", { name: "" })`
**Then** `{ ok: false, error: "Name is required." }` and `incomeCategories` is still `[]`

### AC5: Reject duplicate in the same list
**Given** `"b1"` already has income category `"Salary"`
**When** `addCategory("b1", "income", { name: "salary" })`
**Then** `{ ok: false, error: "The name is already in use." }` and there is still `1` income category

### AC6: Same name allowed in the other list
**Given** `"b1"` has income category `"Other"`
**When** `addCategory("b1", "expense", { name: "Other" })`
**Then** `{ ok: true }` and there is `1` income category named `"Other"` and `1` expense category named `"Other"`

### AC7: Rename category
**Given** income category `"c1"` named `"Salary"`
**When** `updateCategory("b1", "c1", { name: "  Wages  " })`
**Then** that category `name` is `"Wages"`

### AC8: Rename to a taken name in the same list
**Given** income categories `"Salary"` (`"c1"`) and `"Bonus"` (`"c2"`)
**When** `updateCategory("b1", "c1", { name: "bonus" })`
**Then** `{ ok: false, error: "The name is already in use." }` and `"c1"` is still `"Salary"`

### AC9: Delete unused category
**Given** income category `"c1"` `"Salary"` and no entries
**When** `deleteCategory("b1", "c1")`
**Then** `incomeCategories` is `[]` and entry arrays are unchanged (`[]`)

### AC10: Delete category with rows cascade
**Given** expense category `"c1"` `"Rent"`; expense entries `{ id: "e1", categoryId: "c1", comment: "July", amountCents: 1000, date: null }` and `{ id: "e2", categoryId: "c2", comment: "Shop", amountCents: 200, date: null }` where `"c2"` is `"Food"`
**When** `deleteCategory("b1", "c1")`
**Then** `"c1"` is gone; `expenseEntries` has length `1` and that entry’s `id` is `"e2"`

### AC11: Categories tab lists
**Given** the user has opened a budget
**When** they select tab `Categories`
**Then** the tab panel shows heading `Income` and heading `Expense` (two lists)

### AC12: Light confirm when category has zero entries
**Given** the user chooses Delete on income category `"Salary"` that has `0` entries
**When** the confirmation is shown
**Then** the message is exactly `Delete category “Salary”?`

### AC13: Heavy confirm when category has entries
**Given** the user chooses Delete on expense category `"Rent"` that has `3` entries
**When** the confirmation is shown
**Then** the message is exactly `Delete category “Rent”? 3 entries will be deleted.`

### AC14: Categories are not shared across budgets
**Given** budget `"b1"` has income `"Salary"` and budget `"b2"` has no categories
**When** `addCategory("b2", "income", { name: "Salary" })`
**Then** `"b1"` still has `1` income category and `"b2"` has `1` income category with a different `id`

### AC15: Reject empty name on rename
**Given** income category `"c1"` named `"Salary"`
**When** `updateCategory("b1", "c1", { name: "" })`
**Then** `{ ok: false, error: "Name is required." }` and `"c1"` is still named `"Salary"`

## Files to Modify

| File | Change |
|---|---|
| `src/categories.ts` | `addCategory`, `updateCategory`, `deleteCategory`, `categoryEntryCount`. |
| `src/categories.test.ts` | Tests for AC1–AC10, AC14–AC15. |
| `src/ui/CategoriesTab.tsx` | Two lists, add/edit/delete, confirms AC11–AC13. |
| `src/ui/CategoriesTab.test.tsx` | Tests for AC11–AC13. |
| `src/ui/BudgetScreen.tsx` | Tab labelled `Categories`. |

## Risk

- What could break: entries that keep a deleted `categoryId` if cascade is skipped.
- Rollback: remove category module and tab; budgets still open.

## Testing Strategy (MANDATORY)

| Function | Case | Given | When | Then |
|---|---|---|---|---|
| addCategory | AC1 income | empty b1 | add income Salary | one income cat, zero expense |
| addCategory | AC2 expense | empty b1 | add expense Rent | one expense cat, zero income |
| addCategory | AC3 trim | `"  Salary  "` | add income | name `"Salary"` |
| addCategory | AC4 empty | `""` | add | `"Name is required."`, still [] |
| addCategory | AC5 dup list | Salary exists | add salary | `"The name is already in use."` |
| addCategory | AC6 other list | income Other | add expense Other | both exist |
| updateCategory | AC7 rename | Salary | `"  Wages  "` | `"Wages"` |
| updateCategory | AC8 taken | Salary+Bonus | rename to bonus | error, still Salary |
| deleteCategory | AC9 unused | Salary, 0 entries | delete | incomeCategories [] |
| deleteCategory | AC10 cascade | Rent+Food, 2 entries | delete Rent | only e2 remains |
| CategoriesTab | AC11 layout | budget open | click Categories | headings Income and Expense |
| CategoriesTab | AC12 light | 0 entries | delete Salary | `Delete category “Salary”?` |
| CategoriesTab | AC13 heavy | 3 entries | delete Rent | `Delete category “Rent”? 3 entries will be deleted.` |
| addCategory | AC14 isolate | b1 has Salary | add Salary on b2 | different ids, b1 count 1 |
| updateCategory | AC15 empty | Salary | `""` | `"Name is required."`, still Salary |

## Spec Readiness checklist

- [x] Every AC has a precise expected value — no "works correctly"
- [x] Another person could write a test from each AC without asking
- [x] Every AC can fail — one that cannot fail proves nothing
- [x] Error and edge cases have ACs of their own
- [x] Every AC appears in the testing strategy table
