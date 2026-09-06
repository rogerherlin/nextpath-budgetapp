# PRD: BudgetApp

## Goal

A local web app for tracking household income and expenses in named budgets. Anyone on the shared home device can create a budget, record rows, and see a report of category totals and actual leftover (`income − expenses`) beside the optional target leftover. Success is: open the app, pick or create a budget, enter data, close it, and find the same data next time — with Finnish number/date display and a clear tabbed UI.

## Users

Household members on **one shared computer**. No accounts. Anyone may create, edit, copy, or delete any budget.

## Decisions

**Budgets.** List at start: open, create, copy, or delete. Name is mandatory and unique after trim, compared case-insensitively; if taken, warn and require another name. Description, target leftover, and start/end dates are optional. Dates are a named range only (informative; they do not constrain rows). Empty budgets may be saved. Copy clones the whole dataset as `Name (copy1)`, then `(copy2)`, … Delete budget: confirm; deleting the last budget is allowed. Budgets do not share categories or rows.

**Inside a budget.** Tabs: **Categories** (two lists: income and expense — add/edit/delete), **Income**, **Expenses**, **Report**. Each row: category, comment, amount, optional date. Amounts may be zero or negative. EUR is a static label next to amount fields only.

**Deletes.** Category with no rows: light confirm. Category with rows: confirm, warn data loss, cascade-delete those rows.

**Report.** Category totals only (no line items). Show actual balance (`income − expenses`) next to target leftover.

**Formats.** UI in English. Decimal comma, space as thousands separator, dates `dd.mm.yyyy`.

**Persistence.** One JSON file for all budgets, in a fixed app data folder. The app always uses that file. Save on every change.

## Non-goals

- User accounts, permissions, or multi-user identity
- Cloud sync, sharing between devices, or a file picker per open
- One file per budget
- Bank import, recurring transactions, invoices, attachments
- Splitting a budget into months/weeks
- Charts, PDF/export beyond the JSON store, multi-currency
- Enforcing that row dates fall inside the budget range
- Mixing target leftover into the actual-balance formula
