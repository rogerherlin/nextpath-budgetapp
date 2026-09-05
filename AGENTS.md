```
# AGENTS.md — BudgetApp

> Operating manual for AI agents in this repo. The model reads this file
> at the start of every session — anything written here never needs
> repeating in a prompt.

## What this is

«One paragraph: what this app does, for whom, and what "working" means.»
Build a budgeting app for tracking income and expence. Each budget can be given a time span, name (unique and mandatory), a description and a target balance. Each budget can be stored separately and opened for editing later. Any budget can also be deleted by anyone. You start by selecting an existing budget or create a new one. On each budget you can add, edit and delete income and expence categories on its own tab in the ui. On each user entry row you select category and give a comment and the amount of money. Income and expences are on different tabs in the ui. We will also need a report tab where we summarize each category and calculate a final buget balance. No user-accounts, as this works locally at home on one shared device. Anyone can edit any stored budget and add new ones.You can make a copy of an existing budget. Budgets do not share any data between them. Each budget is a separate data set. Use comma as decimal separator, use a blank space for thousands separator, use dateformat dd.mm.yyyy.

## Commands

- `npm test` — run all tests (Vitest)
- `npx tsc --noEmit` — type check
- `npm start` — run the app

Run these — never reason about what they would probably print.
"Green" means the command exited 0 just now, nothing else.

## Workflows: research and spec

### research
Goal: understand the task before planning. Read-only.
1. Gather context: existing code when there is any, libraries and
   worked examples worth reusing, external API docs if needed
2. Identify scope: which files, what rules apply, what depends on what
3. Analyze: outline what needs doing, list what is still unknown
4. Present findings and ASK about every open question —
   never resolve a guess silently
No code, no spec, in this pass.

### spec
Goal: a specification before implementation.
Required for: new features, API changes, anything multi-file.
Write specs/features/<name>.md — structure in specs/TEMPLATE.md.

Spec Readiness checklist — the spec is NOT ready until every box holds:
- [ ] Every AC is Given/When/Then with a precise expected value
- [ ] Files to modify are listed with what changes in each
- [ ] Risk: what could break, and how to roll back
- [ ] Testing strategy covers every AC, plus error and edge cases
- [ ] Every AC has at least one named test case

## Workflows: tdd, develop, review

### tdd
Prerequisite: a spec with a testing strategy (run spec first).
For EACH acceptance criterion, in order:
  RED      write the failing test for THIS AC only; the test name
           states the AC; run it and confirm it fails FOR THE RIGHT
           REASON (missing behaviour, not a broken import)
  GREEN    smallest implementation that passes this test; run ALL
           tests, confirm no regressions
  REFACTOR remove duplication, improve names; tests stay green
Then repeat the cycle for edge cases: invalid input, boundaries,
error paths.

Two traps, both near-certain:
- The model writes test and implementation in one pass. The test is
  then derived from the code and always passes. Ask separately.
- The model "fixes" a failing test to match the code. The spec
  decides which one is wrong — correct the spec first, then the test.

### develop
For work that has a spec: read it, follow the patterns already in
the codebase, change only the files the spec lists, run tdd for the
ACs, and update the spec status Draft -> In Progress -> Done.

### review
Compare the diff against the spec: which AC each change serves, what
changed that no AC asked for, which tests prove what. End with a
verdict: APPROVED or CHANGES_REQUIRED — never prose that cannot be
branched on.

## Coding conventions

- TypeScript strict, no `any`
- ES modules
- Business logic in pure functions, testable without the CLI/UI
- «your rule — e.g. "interfaces for every data structure"»
- «your rule»

## Guardrails

- Never touch `.env`; never run a command that deletes data
- Never "fix" a failing test by editing the test — the spec decides
  which one is wrong, and the spec is corrected first
- Stop after two consecutive red rounds and report — do not thrash
- «your line — what must never happen in THIS project»

## When you notice something

One line in INBOX.md. Do not implement it, do not detour.
```

