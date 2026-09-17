# Feature: Visual polish (ledger look)

Status: Done

## Problem Statement

The MVP UI is unstyled native controls. Household users need a clearer ledger: page frame, button roles, selected tabs, aligned money, and a readable report — without changing copy, flows, or data.

## Proposed Change

Apply a paper-ledger look via CSS tokens and class names. Labels, confirms, tabs order, and `formatMoney` / `formatDate` stay the same. Native `<button>`, `<input>`, `<select>` remain.

## Acceptance Criteria

### AC1: Home budget rows are list items with a row class
**Given** budgets named `Summer` and `Winter`
**When** Home is rendered
**Then** there are two `listitem`s, each with class `budget-row`, each containing `Open`, `Copy`, and `Delete`

### AC2: Button roles on Home
**Given** one budget named `Summer`
**When** Home is rendered
**Then** `New budget` has classes `button` and `button--primary`; `Open` has `button` and `button--primary`; `Copy` has `button` and `button--secondary`; `Delete` has `button` and `button--danger`

### AC3: Selected tab class
**Given** an open budget
**When** the budget screen is shown
**Then** `Categories` has classes `tab` and `tab--active`, and `Income`, `Expenses`, and `Report` have class `tab` but not `tab--active`
**When** the user clicks `Report`
**Then** `Report` has `tab--active` and `Categories` does not

### AC4: Field errors use `field-error`
**Given** an open budget on the Income tab
**When** the user enters amount `abc` and clicks `Add`
**Then** the element whose text is `Enter a valid amount.` has class `field-error`

### AC5: Report groups and summary
**Given** the report fixture from `specs/features/report.md` (actual `1 210,00`, target `200,00`)
**When** the user opens the Report tab
**Then** there are exactly two elements with class `report-block`; the first contains `Salary` and `1 500,00`; the second contains `Rent` and `300,00`; `Actual balance` and `Target leftover` are inside an element with class `report-summary`

### AC6: Actual vs target tone
**Given** the report fixture (actual cents `121000`, target cents `20000`)
**When** the user opens the Report tab
**Then** the formatted actual `1 210,00` has classes `money` and `money--ahead`
**Given** the same fixture but `targetLeftoverCents` `200000`
**When** the user opens the Report tab
**Then** the formatted actual `1 210,00` has classes `money` and `money--short`
**Given** the fixture with `targetLeftoverCents` `null`
**When** the user opens the Report tab
**Then** the formatted actual `1 210,00` has class `money` and has neither `money--ahead` nor `money--short`

### AC7: Entry amounts use `money`
**Given** an open budget with one income entry of `10000` cents
**When** the user opens the Income tab
**Then** the table cell whose text is `100,00` has class `money`

## Files to Modify

| File | Change |
|---|---|
| `specs/ui-ux.md` | Ledger tokens, button/tab/report rules; theming for this look is in scope |
| `src/styles.css` | Tokens and component styles |
| `src/ui/HomeScreen.tsx` | Row and button classes; field + field-error |
| `src/ui/BudgetScreen.tsx` | Header fields, tab classes, button roles |
| `src/ui/CategoriesTab.tsx` | Row/button/error classes |
| `src/ui/EntriesTab.tsx` | Field layout, money cells, button/error classes |
| `src/ui/ReportTab.tsx` | report-block, report-summary, money tone |
| `src/ui/visual-polish.test.tsx` | Tests for AC1–AC7 |

## Risk

- What could break: tests that assume unclassed markup or extra `listitem`s; visual regression if class names are omitted on a new button
- Rollback: revert this feature’s files; behaviour is unchanged without CSS

## Testing Strategy (MANDATORY)

| Function | Case | Given | When | Then |
|---|---|---|---|---|
| HomeScreen | AC1 rows | Summer, Winter | render | two `budget-row` listitems with Open/Copy/Delete |
| HomeScreen | AC2 roles | Summer | render | New budget/Open primary; Copy secondary; Delete danger |
| BudgetScreen | AC3 default tab | open budget | render | Categories `tab--active` |
| BudgetScreen | AC3 switch tab | open budget | click Report | Report `tab--active` |
| EntriesTab | AC4 error class | Income tab | Add amount `abc` | `field-error` on `Enter a valid amount.` |
| ReportTab | AC5 groups | report fixture | Report tab | two `report-block`; summary wraps actual + target |
| ReportTab | AC6 ahead | actual > target | Report tab | `money--ahead` on actual |
| ReportTab | AC6 short | actual < target | Report tab | `money--short` on actual |
| ReportTab | AC6 no target | target null | Report tab | `money` only on actual |
| EntriesTab | AC7 money cell | income 10000 cents | Income tab | cell `100,00` has `money` |

## Spec Readiness checklist

- [x] Every AC has a precise expected value — no "works correctly"
- [x] Another person could write a test from each AC without asking
- [x] Every AC can fail — one that cannot fail proves nothing
- [x] Error and edge cases have ACs of their own
- [x] Every AC appears in the testing strategy table
