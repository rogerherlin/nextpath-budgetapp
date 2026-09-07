# Feature: Report

Status: Done

## Problem Statement

Users need a read-only summary per category and a final leftover compared with the optional target leftover. Line items must not appear on this tab. Actual leftover is income minus expenses only.

## Proposed Change

`buildReport(budget)` returns per-category totals (every category, including `0`) and actual leftover in cents. The Report tab shows those formatted amounts. If `targetLeftoverCents` is `null`, the target leftover line is absent.

## Acceptance Criteria

Fixture used by AC1–AC6: budget `"Summer"` with `targetLeftoverCents` `20000`; income categories `"Salary"` (`"c1"`), `"Other"` (`"c2"`); expense categories `"Rent"` (`"c3"`), `"Food"` (`"c4"`); income entries `c1/100000`, `c1/50000`, `c2/1000`; expense entry `c3/30000`; no Food entries.

### AC1: Income category totals
**Given** the fixture
**When** `buildReport(budget)`
**Then** `income` is exactly `[{ name: "Salary", totalCents: 150000 }, { name: "Other", totalCents: 1000 }]` (same category order as `incomeCategories`)

### AC2: Expense category totals including zero
**Given** the fixture
**When** `buildReport(budget)`
**Then** `expense` is exactly `[{ name: "Rent", totalCents: 30000 }, { name: "Food", totalCents: 0 }]` (same order as `expenseCategories`)

### AC3: Actual leftover is income minus expenses
**Given** the fixture
**When** `buildReport(budget)`
**Then** `actualCents` is `121000` (151000 − 30000)

### AC4: Target leftover is passed through
**Given** the fixture
**When** `buildReport(budget)`
**Then** `targetCents` is `20000`

### AC5: Missing target is null
**Given** the fixture but `targetLeftoverCents` is `null`
**When** `buildReport(budget)`
**Then** `targetCents` is `null` and `actualCents` is still `121000`

### AC6: Report has no entry comments or row ids
**Given** the fixture
**When** `buildReport(budget)`
**Then** the returned object has keys only `income`, `expense`, `actualCents`, `targetCents` (no `entries` key)

### AC7: Report tab formatted totals
**Given** the fixture and the user opens tab `Report`
**When** the tab renders
**Then** it shows `Salary` with `1 500,00`, `Other` with `10,00`, `Rent` with `300,00`, `Food` with `0,00`, label `Actual balance` with `1 210,00`, label `Target leftover` with `200,00`

### AC8: Hide target leftover when unset
**Given** the fixture except `targetLeftoverCents` is `null`
**When** the Report tab renders
**Then** it shows `Actual balance` with `1 210,00` and does not show the text `Target leftover`

### AC9: Empty budget report
**Given** a budget with no categories, no entries, `targetLeftoverCents` `null`
**When** `buildReport(budget)`
**Then** `{ income: [], expense: [], actualCents: 0, targetCents: null }`

## Files to Modify

| File | Change |
|---|---|
| `src/report.ts` | `buildReport`. |
| `src/report.test.ts` | Tests for AC1–AC6, AC9. |
| `src/ui/ReportTab.tsx` | Read-only totals; AC7–AC8. |
| `src/ui/ReportTab.test.tsx` | Tests for AC7–AC8. |
| `src/ui/BudgetScreen.tsx` | Tab labelled `Report`. |

## Risk

- What could break: mixing target into `actualCents` would violate the PRD formula.
- Rollback: remove report module and tab.

## Testing Strategy (MANDATORY)

| Function | Case | Given | When | Then |
|---|---|---|---|---|
| buildReport | AC1 income | fixture | buildReport | Salary 150000, Other 1000 |
| buildReport | AC2 expense | fixture | buildReport | Rent 30000, Food 0 |
| buildReport | AC3 actual | fixture | buildReport | actualCents 121000 |
| buildReport | AC4 target | fixture | buildReport | targetCents 20000 |
| buildReport | AC5 no target | target null | buildReport | targetCents null, actual 121000 |
| buildReport | AC6 shape | fixture | buildReport | keys income, expense, actualCents, targetCents only |
| ReportTab | AC7 format | fixture | render | formatted strings and both labels |
| ReportTab | AC8 hide target | target null | render | Actual balance 1 210,00; no `Target leftover` |
| buildReport | AC9 empty | empty budget | buildReport | empty arrays, actual 0, target null |

## Spec Readiness checklist

- [x] Every AC has a precise expected value — no "works correctly"
- [x] Another person could write a test from each AC without asking
- [x] Every AC can fail — one that cannot fail proves nothing
- [x] Error and edge cases have ACs of their own
- [x] Every AC appears in the testing strategy table
