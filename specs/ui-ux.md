# UI / UX (MVP)

## Goal

A clear desktop UI for one shared home computer. English. Native controls. No decoration that is not in the PRD.

## Layout

Max width ~56rem, left-aligned, system font, comfortable spacing. Keyboard: tab through fields; primary actions are real `<button>`s.

**Home**

- Title `Budgets`.
- If there are no budgets: text `No budgets yet.` and button `New budget`.
- If there are budgets: a list. Each row shows the name; buttons `Open`, `Copy`, `Delete`.
- `New budget` opens a short form on the same page: `Name` (required), `Description`, `Start`, `End`, `Target leftover` with static `EUR` beside the amount. Buttons `Save` and `Cancel`.
- Delete uses `window.confirm` with exactly: `Delete budget “{name}”? This cannot be undone.` OK runs delete; Cancel does nothing.

**Budget**

- Top: name (editable), description, start, end, target leftover (`EUR` beside amount). Button `Back to budgets`.
- Tabs, in order, labelled exactly: `Categories` | `Income` | `Expenses` | `Report`.
- **Categories:** two columns headed `Income` and `Expense`. Each row: name, `Edit`, `Delete`. Add field + `Add` per list. Unused delete confirm: `Delete category “{name}”?` Used: `Delete category “{name}”? {n} entries will be deleted.`
- **Income / Expenses:** table columns Category, Comment, Amount (`EUR` beside amount controls), Date, actions. Add row at the top or bottom — one form, button `Add`. Category `<select>` only that tab’s list. Date placeholder `dd.mm.yyyy`.
- **Report:** read-only. Income totals then expense totals (name + `formatMoney`). Then `Actual balance` + formatted actual. If target is set, `Target leftover` + formatted target next to it. If target is unset, do not show `Target leftover`. No charts, no line items.

## Feedback

- Field errors appear next to the field as the spec’s exact strings (`Name is required.`, `The name is already in use.`, `Enter a valid amount.`, `Enter a date as dd.mm.yyyy.`, `Select a category.`).
- No toasts. No loading spinners unless a save takes visibly long (MVP: ignore).
- Amounts and dates always displayed with `formatMoney` / `formatDate`.

## Out of scope

Mobile-first layout, theming, icons-as-navigation, drag-and-drop, print/PDF, onboarding tour, accessibility beyond labels on inputs and buttons.
