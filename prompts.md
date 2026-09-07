# User prompts — BudgetApp

Each item is a user prompt, then a three-sentence summary of what was answered.

## 1 · Research (read-only)

Run a research pass — read-only, no code, no spec.

Task: I would like to Build a budgeting app for tracking income and expence. Each budget can be given a time span, name (unique and mandatory), a description and a target balance. Each budget can be stored separately and opened for editing later. Any budget can also be deleted by anyone. You start by selecting an existing budget or create a new one. On each budget you can add, edit and delete income and expence categories on its own tab in the ui. On each user entry row you select category and give a comment and the amount of money. Income and expences are on different tabs in the ui. We will also need a report tab where we summarize each category and calculate a final buget balance. No user-accounts, as this works locally at home on one shared device. Anyone can edit any stored budget and add new ones.You can make a copy of an existing budget. Budgets do not share any data between them. Each budget is a separate data set. Use comma as decimal separator, use a blank space for thousands separator, use dateformat dd.mm.yyyy.

This is a fresh project, so research the problem, not a codebase: the simplest approach that could work, working web application with clear ui. Let's think about tech stack later.

Report: the approach you would take, what to reuse, and what was unclear enough that you had to guess. Ask me about the guesses — do not resolve them yourself.

**Answer:** The app is a local household tool: pick or create a budget, keep categories and income/expense rows, and show a report; no logins. The simplest shape is a tabbed web UI plus pure functions for money, names, copy, and totals, with one local store so data survives a restart. Seventeen product questions were left open (dates, target leftover, copy names, deletes, currency, where files live) instead of guessing.

## 2 · Product decisions

Here are my answers 1. Start and enddate are not mandatory informative only. 2. Yes rows should have a date but not required 3. Target balance is desired leftover. 4. income - expences, 5. Categories tab has two lists. 6. Confirm if user wants to delete, inform about data loss and cascade-delete. 7. Use Automatic name append with (copy1...n) 8. not case sensitive, trim spaces, warn the name is in use require another name. 9 optio9nal, 10. yes they can be zero and negative too. 11. Yes ask confirmation for delete, last budget deletiuon allowed too. 12. Yes you can save empty budget, 13. English. 14 Yes EUR, but oly as a static label by field. 15. Save data in a file,  16. yes category totals only, show target leftover next to actual balance, 17. Yes just a named range for now. Copy name as you suggested.  Category delete vs empty list: show a lighter warning.

Follow-ups in chat: 1. one file for all budgets, 2. fixed app data folder, 3 save on every change, 4. App remembers file. 5. JSON format please

**Answer:** Those answers were recorded as locked product rules (optional span, leftover vs actual, two category lists, copy names, English UI, EUR label). Remaining file questions were asked, then settled as one JSON file in a fixed folder, autosave, no picker. Research was marked complete so a spec could be written without inventing behaviour.

## 3 · Product requirement document

Write the product requirement document in specs/PRD.md: goal, users, the decisions I just made, and
explicit non-goals. One page. Do not use the feature template yet.

**Answer:** `specs/PRD.md` was written as one page: household users on one device, the decisions above, and non-goals (no accounts, no cloud, no charts, no bank import). It does not use the feature template. Feature specs were left for the next prompt.

## 4 · Feature specs

Write the spec for the features of the app.
Ground it in the research pass findings and PRD. Write specs/features/«feature».md using the spec template structure.
Acceptance criteria as Given/When/Then, numbered AC1, AC2, … Every one names a precise expected value or output — never "a sensible message", never "works correctly".
Then run the Spec Readiness checklist and show the result item by item.

**Answer:** Six Draft specs were added: formatting, budget-lifecycle, categories, entries, report, persistence. Amounts are integer cents; every AC has an exact string, number, or `{ ok, error }`. All six files were marked as passing the Spec Readiness checklist.

## 5 · Architecture, UI/UX, tech stack

Write architecture, ui/ux and tech stack specs into specs/. Focus on
simplicity and being able to quickly develop an MVP.
Stay inside the PRD non-goals as described in PRD.md
One page each.

Then scaffold the project according to the tech stack spec: install
what is needed, make the commands in @AGENTS.md real, and run `npm test`
with no tests yet. It must pass green. Show the output.

**Answer:** One-page files were written for architecture (domain → `/api/store` → `data/budgets.json`), UI/UX (Home + Budget tabs, exact labels), and tech stack (React, Vite 5, Vitest 2, TypeScript). The repo was scaffolded so `npm start`, `npm test`, and `npx tsc --noEmit` match AGENTS.md. `npm test` exited 0 with no test files.

## 6 · TDD: one AC at a time

Run the `tdd` workflow from @AGENTS.md for AC9 in
specs/features/report.md.

RED first: write the failing test for this AC only. The test name states
the AC. Run it and paste the real output. Confirm it fails because the
behaviour is missing — not because of an import, path or fixture.

Only then GREEN: the smallest change that passes it. Run ALL tests and
show the summary. Then REFACTOR with the tests green.

Stop after this AC. Do not start the next one.

This same block (via `@prompts.md:38-48` or `@prompts.md:37-48`) was reused many times from Sunday 6 Sep through Monday 7 Sep, walking ACs in order across lifecycle, formatting, categories, entries, report, then persistence.

**Answer:** Each run implemented one numbered AC: failing test first, then the smallest domain or UI change, then a full green suite. Domain modules (`budgets`, `names`, `money`, `dates`, `categories`, `entries`, `report`, `store`) and later UI tests were built this way. Persistence used `specs/features/persistence.md` (the old `persitence.md` typo in notes was noted in INBOX).

## 7 · Cannot find module `./BudgetScreen`

For the code present, we get this error:
```
Cannot find module './BudgetScreen' or its corresponding type declarations.
```
Fix it, verify, and then give a concise explanation. @src/ui/CategoriesTab.test.tsx:6-9

**Answer:** The import path was already correct; `BudgetScreen.tsx` sat next to the test. The editor diagnostic was stale after the new file appeared. `npx tsc --noEmit` and `npm test` were green (32 tests at that time).

## 8 · Cannot find module `./entries`

For the code present, we get this error:
```
Cannot find module './entries' or its corresponding type declarations.
```
Fix it, verify, and then give a concise explanation. @src/entries.test.ts:2-5

**Answer:** `src/entries.ts` already exported the functions the test imported. CLI typecheck and Vitest passed; a `.ts`/`.js` import experiment was reverted. Restarting the TypeScript language service was the real fix for the squiggle.

## 9 · Cannot find module `./report`

Please fix this error:

**Error in src/report.test.ts:**
- **Line 2:** Cannot find module './report' or its corresponding type declarations.
- **Severity:** Error
- **Code:** 2307

Provide a solution that resolves this issue. @report.test.ts

**Answer:** `src/report.ts` already existed and exported `buildReport`. `npx tsc --noEmit` resolved the import and exited 0. The editor warning was a stale language-service diagnostic.

## 10 · Browser walkthrough (do not fix)

Start the app. If the port is already in use, pick another one and tell
me the URL you actually used.

Then use the browser tool («Claude Code: Chrome-laajennus · Codex/OpenCode:
Playwright MCP · Cursor: @Browser») to walk through AC«N» as a user
would: click, type, read the screen, take a screenshot.

Report exactly what you did and what you saw — inputs and outputs. List
every difference from the AC. Do not fix anything yet.

**Answer:** Vite ran at `http://localhost:5173/` (port free). Cursor Browser MCP was not connected, so headless Chrome was used instead. The page was only a **Budgets** heading: no create/open, no Report tab, so report AC9 could not be exercised as a user; nothing in the app was changed.

## 11 · Do you support browser extension

do you support browser extension

**Answer:** Cursor’s in-IDE browser cannot install Chrome/Firefox extensions. Agents can still write extension code and drive the built-in browser without extra extensions. Cursor itself is a desktop IDE, not a Chrome extension.

## 12 · Fix the UI so it is a working app

can you fix hte UI so its a working app
(screenshot of the title-only Budgets page)

**Answer:** Home and Budget screens were wired: create/open/copy/delete, category lists, income/expense rows, report, autosave to `data/budgets.json`. A browser pass created **Summer**, Salary/Rent, income `1 500,00` and expense `300,00`; report showed actual `1 200,00` beside target `200,00`. Copy produced **Summer (copy1)** and names survived reload at `http://127.0.0.1:5173/`.

## 13 · Tests and review

Run all tests and show the summary.

Then run the `review` workflow from @AGENTS.md on all changes so far:
for each change, which AC it serves; what changed that no AC asked for;
which test proves what. Also audit input validation and error paths.
End with APPROVED or CHANGES_REQUIRED and a numbered list.

If CHANGES_REQUIRED: fix the items one at a time, each through the tdd
workflow (red first), then run the review again. Stop when APPROVED, or
after two rounds without progress — then tell me what is stuck.

**Answer:** `npm test` was green (**84 passed**, 12 files) and `tsc` exited 0. Review 1 was **CHANGES_REQUIRED**: report/persistence ACs mapped to tests, plus extras and gaps (cross-kind `updateEntry`, weak `parseStoreJson`, fire-and-forget PUT, empty-name update vs lifecycle spec). Fixes were started via TDD; leftover validation notes also sit in INBOX.md.

## 14 · This file

Write all my prompts to prompts.md and briefly summarise what you
answered with three sentences each.

**Answer:** This file lists the prompts above in order, including the reused TDD block and later UI/review work. Each **Answer** is three sentences. System “briefly inform the user” follow-ups after background jobs are omitted.
