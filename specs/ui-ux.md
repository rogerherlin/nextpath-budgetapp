# UI / UX (MVP)

## Goal

A clear desktop UI for one shared home computer. English. Native controls. Paper-ledger look: off-white page, white card, ink text, one teal accent. No charts, no icon navigation, no theme switcher.

## Look

- Page background warm paper (`--page`). `main` is a card: max width ~56rem, padding, hairline border, light shadow.
- System font. Tabular numerals on amounts (`font-variant-numeric: tabular-nums`).
- Buttons stay real `<button>`s with roles:
  - `button button--primary`: Save, New budget, Add, Open
  - `button button--secondary`: Cancel, Copy, Back to budgets, Edit
  - `button button--danger`: Delete
  - `tab` / `tab--active`: Categories | Income | Expenses | Report | From text
- Field errors: element with class `field-error` next to the field, exact spec strings.
- Amounts in tables and the report: class `money`. Actual vs target: `money--ahead` if actual ≥ target, `money--short` if actual < target; neither extra class if target is unset.

## Layout

Left-aligned card, comfortable spacing. Keyboard: tab through fields; primary actions are real `<button>`s.

**Login**

- Heading `Sign in`. Fields labelled `Email`, `Password`, and `Display name`. Buttons `Sign in` and `Register`.
- Sign-in failure: `.field-error` with `Could not sign in.`
- Register posts `{ "displayName" }` with a Bearer token. Household-full error shows `.field-error` with `The household is full (10 users).`

**Home**

- Title `Budgets`. Button `Sign out` returns to the login heading.
- The signed-in viewer’s `displayName` and `email` sit in a `.session-bar` header above the page title (Home and open budget), stacked, with `Sign out` on the right.
- Moderator: heading `Household` with emails, a `From text` checkbox per user, and `Delete user` on other members (not self). Confirm: `Delete user “{email}”? Their budgets will also be deleted.` At 10 profiles: `Sign-up is full (10 users).`
- `New budget` opens a short form on the same page: `Name` (required), `Description`, `Start`, `End`, `Target leftover (EUR)`. Buttons `Save` and `Cancel`. Labels stack above inputs.
- Delete uses `window.confirm` with exactly: `Delete budget “{name}”? This cannot be undone.` OK runs delete; Cancel does nothing.

**Budget**

- Top: name (editable), description, start, end, `Target leftover (EUR)`. Button `Back to budgets`. Browse is read-only (no Save / Add / Edit / Delete).
- Owner or moderator: control labelled `Visibility` (`Hidden` / `Public`) and heading `Sharing` with per-user roles `None`, `See`, `Browse`, `Edit`. Hidden for `edit` grant.
- Tabs, in order, labelled exactly: `Categories` | `Income` | `Expenses` | `Report` | `From text`. Omit `From text` unless the profile may use it (or moderator) and can write. Selected tab has `tab--active`.
- **Categories:** two columns headed `Income` and `Expense`. Each row: name, `Edit`, `Delete`. Add field + `Add` per list. Unused delete confirm: `Delete category “{name}”?` Used: `Delete category “{name}”? {n} entries will be deleted.`
- **Income / Expenses:** table columns Category, Comment, Amount (`EUR` beside amount controls), Date, actions. Add row as a distinct form (`entry-form`), button `Add`. Category `<select>` only that tab’s list. Date placeholder `dd.mm.yyyy`. Amount cells use class `money`.
- **Report:** read-only. Income totals in the first `.report-block`, expense totals in the second (name + `formatMoney`). Then `.report-summary` with `Actual balance` + formatted actual. If target is set, `Target leftover` + formatted target next to it. If target is unset, do not show `Target leftover`. No charts, no line items.
- **From text:** heading `Describe entries for “{budget name}”`. Textarea labelled `What happened` + `Suggest`. After a successful suggest, a review table (type, category, comment, amount, date) with `Apply` and `Cancel`. Type is a `<select>`: `Income` and `Expense` (and empty until chosen if the model sent `null`). No writes until `Apply`. Field errors use the same `.field-error` strings as other tabs plus `Enter a description.`, `Select income or expense.`, `Could not suggest entries.`, `Gemini API key is missing.`

## Feedback

- Field errors appear next to the field as the spec’s exact strings (`Name is required.`, `The name is already in use.`, `Enter a valid amount.`, `Enter a date as dd.mm.yyyy.`, `Select a category.`, `Enter a description.`, `Select income or expense.`, `Could not suggest entries.`, `Gemini API key is missing.`).
- No toasts. Client network work (browser `fetch` and Firebase Auth sign-in/register/sign-out) shows a visible spinner overlay (`.busy-overlay` / `.spinner`, status `Loading.`) only after **400ms** of continuous in-flight work; once shown, hide it only after **250ms** with no in-flight work.
- Amounts and dates always displayed with `formatMoney` / `formatDate`.

## Out of scope

Mobile-first layout, dark mode, icons-as-navigation, drag-and-drop, print/PDF, onboarding tour, accessibility beyond labels on inputs and buttons.
