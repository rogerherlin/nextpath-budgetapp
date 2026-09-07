User prompts - BudgetApp

1 · Research (read-only)

Run a research pass — read-only, no code, no spec.

Task: I would like to Build a budgeting app for tracking income and expence. Each budget can be given a time span, name (unique and mandatory), a description and a target balance. Each budget can be stored separately and opened for editing later. Any budget can also be deleted by anyone. You start by selecting an existing budget or create a new one. On each budget you can add, edit and delete income and expence categories on its own tab in the ui. On each user entry row you select category and give a comment and the amount of money. Income and expences are on different tabs in the ui. We will also need a report tab where we summarize each category and calculate a final buget balance. No user-accounts, as this works locally at home on one shared device. Anyone can edit any stored budget and add new ones.You can make a copy of an existing budget. Budgets do not share any data between them. Each budget is a separate data set. Use comma as decimal separator, use a blank space for thousands separator, use dateformat dd.mm.yyyy.

This is a fresh project, so research the problem, not a codebase: the simplest approach that could work, working web application with clear ui. Let's think about tech stack later.

Report: the approach you would take, what to reuse, and what was unclear enough that you had to guess. Ask me about the guesses — do not resolve them yourself.

2 Product decisions
Here are my answers 1. Start and enddate are not mandatory informative only. 2. Yes rows should have a date but not required 3. Target balance is desired leftover. 4. income - expences, 5. Categories tab has two lists. 6. Confirm if user wants to delete, inform about data loss and cascade-delete. 7. Use Automatic name append with (copy1...n) 8. not case sensitive, trim spaces, warn the name is in use require another name. 9 optio9nal, 10. yes they can be zero and negative too. 11. Yes ask confirmation for delete, last budget deletiuon allowed too. 12. Yes you can save empty budget, 13. English. 14 Yes EUR, but oly as a static label by field. 15. Save data in a file,  16. yes category totals only, show target leftover next to actual balance, 17. Yes just a named range for now. Copy name as you suggested.  Category delete vs empty list: show a lighter warning.

3. Product requirement document
Write the product requirement document in specs/PRD.md: goal, users, the decisions I just made, and
explicit non-goals. One page. Do not use the feature template yet.

4 · Feature specs
Write the spec for the features of the app.
Ground it in the research pass findings and PRD. Write specs/features/«feature».md using the spec template structure.
Acceptance criteria as Given/When/Then, numbered AC1, AC2, … Every one names a precise expected value or output — never "a sensible message", never "works correctly".
Then run the Spec Readiness checklist and show the result item by item.

5 · Architecture, UI/UX, tech stack
Write architecture, ui/ux and tech stack specs into specs/. Focus on
simplicity and being able to quickly develop an MVP.
Stay inside the PRD non-goals as described in PRD.md
One page each.

Then scaffold the project according to the tech stack spec: install
what is needed, make the commands in @AGENTS.md real, and run `npm test`
with no tests yet. It must pass green. Show the output.

6) TDD: kriteeri kerrallaan (2–3 h) (./features/budget-lifecycle.md..report.md,  AC1..ACn)

Run the `tdd` workflow from @AGENTS.md for AC9 in
specs/features/report.md.

RED first: write the failing test for this AC only. The test name states
the AC. Run it and paste the real output. Confirm it fails because the
behaviour is missing — not because of an import, path or fixture.

Only then GREEN: the smallest change that passes it. Run ALL tests and
show the summary. Then REFACTOR with the tests green.

Stop after this AC. Do not start the next one.