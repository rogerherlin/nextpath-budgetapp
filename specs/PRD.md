# PRD: BudgetApp

## Goal

A web app for tracking household income and expenses in named budgets, used by a small group (at most 10 signed-in people) on a shared home network or on Cloud Run. Users sign in with email and password. Success is: register or log in, pick or create a budget you are allowed to use, enter data, close the app, and find the same data next time — with Finnish number/date display, a clear tabbed UI, and access control that the API enforces.

## Users

Signed-in household members. **No anonymous editing.** Anyone may create an email/password account until **10 user profiles** exist (the moderator occupies one slot). Further sign-ups fail with a clear error.

**Moderator.** One fixed account whose email is `MODERATOR_EMAIL`. That user is always admin: all budget summaries, open any budget, change grants and visibility, delete any budget, list users, and toggle `canUseFromText`. A typo in the configured email locks admin out; keep the value in `.env` / Secret Manager and document rotation.

## Decisions

**Identity.** Firebase Auth email/password. The browser uses the Firebase **client Auth SDK** only (public web config). The Node process verifies ID tokens with the **Admin SDK**. Profile records live in Firestore (`users/{uid}`): `id`, `email`, `displayName`, `canUseFromText`, `createdAt`. First successful login creates the profile if under the cap; if the cap is already 10, the API must not leave a usable Firebase user without a profile (delete or block in the same request).

**Budgets.** After sign-in, Home lists: budgets the viewer **owns**, budgets with a grant to them, and **public** summaries. Hidden budgets do not appear on the public list. Name is mandatory, trimmed, unique **per owner** (case-insensitive). Two owners may both have `"Summer"`. Description, target leftover, and start/end dates are optional. Dates are a named range only (they do not constrain rows). Empty budgets may be saved. Copy clones the whole dataset into a **new budget owned by the copier** (name `Name (copy1)`, then `(copy2)`, … uniqueness against **that owner’s** names). Delete: confirm; only **owner or moderator**; deleting the last budget the viewer can see is allowed. Budgets do not share categories or rows.

**Default ACL.** New budget: `visibility: "hidden"`, `grants: []`, `ownerId` = creator. Only owner and moderator can list it as theirs and open it until the owner opts in.

**Visibility vs grants.** `visibility: "public" | "hidden"` is **global listing**. Grants are **per-user**: `see` (listed to that user, cannot open), `browse` (read-only full budget including report), `edit` (mutate categories and rows like the owner). **edit does not include** delete, visibility, grants, or ownership transfer. Public listing is independent of grants: a budget can be public (everyone signed-in sees a summary) while remaining unopenable except to owner, moderator, and browse/edit grantees. Grant **see** without making the budget public.

**Inside a budget.** Tabs: **Categories** (income and expense lists — add/edit/delete), **Income**, **Expenses**, **Report**, **From text**. Each row: category, comment, amount, optional date. Amounts may be zero or negative. EUR is a static label next to amount fields only. From text: describe several events; review Gemini suggestions; apply only adds categories and rows (never deletes). The From-text tab is hidden or disabled unless `canUseFromText` **or** the viewer is the moderator. `POST /api/suggest-entries` **must** reject otherwise (and must also require write access to that budget). Gemini key never in the browser.

**Deletes.** Category with no rows: light confirm. Category with rows: confirm, warn data loss, cascade-delete those rows. Budget delete: owner or moderator only.

**Report.** Category totals only (no line items). Show actual balance (`income − expenses`) next to target leftover. Browse-only users may view the report, not mutate.

**Formats.** UI in English. Decimal comma, space as thousands separator, dates `dd.mm.yyyy`.

**Persistence.** Firestore (Native mode) via Admin SDK on the Node API. Collections such as `users/{uid}` and `budgets/{id}`. Firestore Security Rules deny all client access. The browser never PUTs a whole catalog. Optional file-backed repository is **unit tests only**. Existing `data/budgets.json` is a **one-shot migration** assigned to the moderator, not an ongoing store.

**Deploy.** One Node process serves the UI and `/api` (`src/server.ts`, `PORT` / `0.0.0.0`). Local: Vite + Firebase emulators. Production: Docker image on Cloud Run; secrets from Secret Manager; runtime service account (ADC), not a JSON key in the image.

## Non-goals

- Anonymous / shared-device editing without sign-in
- Client Firestore or client Gemini
- Express, React Router, Redux
- Per-user Gemini keys
- Bank import, recurring transactions, invoices, attachments
- Splitting a budget into months/weeks
- Charts, PDF/export, multi-currency
- Enforcing that row dates fall inside the budget range
- Mixing target leftover into the actual-balance formula
- Optimistic concurrency beyond last-write-wins (acceptable for ≤10 users; document it)
