# Feature: Budget lifecycle

Status: Draft

## Overview

- **Status:** Draft (ACL + per-owner names; implementation still matches the old global unique / anyone-may-delete behaviour until TDD)
- **Created:** 2026-09-18
- **Affected subsystems:** domain, HTTP, Home UI — see [specs/PRD.md](../PRD.md), [specs/architecture.md](../architecture.md)

## Problem Statement

Users start signed in, then pick or create a budget. Names must stay unique **for that owner**. Copy must duplicate a whole dataset without sharing data and must make the **copier** the owner of the copy. Only the owner or moderator may delete. The home list must not show hidden budgets to strangers.

## Current Behavior

`createBudget` / `listBudgets` / `copyBudget` / `deleteBudget` operate on a global in-memory array. Names are unique across **all** budgets. Anyone may delete any budget, including the last one. Home always shows Open, Copy, and Delete on every row. There is no `ownerId`, visibility, or grants.

## Proposed Change

Domain functions take an **actor** (profile id + moderator flag + grants context). Create sets `ownerId`, `visibility: "hidden"`, `grants: []`. Name uniqueness is case-insensitive **among that owner’s budgets**. Copy uses `nextCopyName` against the **copier’s** names and assigns a new id, remapped categories/entries, copier as owner, hidden, empty grants. Delete requires `canDelete`. List/open use `canListSummary` / `canRead`.

Roles:

| Actor | List summary | Open full | Mutate rows/categories | Visibility & grants | Delete |
|---|---|---|---|---|---|
| Owner | yes | yes | yes | yes | yes |
| Moderator | yes | yes | yes | yes | yes |
| Grant `edit` | yes | yes | yes | no | no |
| Grant `browse` | yes | yes (read-only UI) | no | no | no |
| Grant `see` | yes | no | no | no | no |
| Other, `public` | yes (summary only) | no | no | no | no |
| Other, `hidden` | no | no | no | no | no |

Copy is allowed when the actor can **read** the source (`canRead`: owner, moderator, browse, edit). The copy is always a new owned hidden budget. See-only and public-summary-only cannot copy.

## Acceptance Criteria

### AC1: Create budget with unique name for owner
**Given** actor alice owns no budgets
**When** `createBudget(alice, { name: "Summer" })`
**Then** alice has one budget with `name` `"Summer"`, `ownerId` alice, `visibility` `"hidden"`, `grants` `[]`, `description` `""`, `startDate` `null`, `endDate` `null`, `targetLeftoverCents` `null`, `incomeCategories` `[]`, `expenseCategories` `[]`, `incomeEntries` `[]`, `expenseEntries` `[]`

### AC2: Trim name on create
**Given** actor alice owns no budgets
**When** `createBudget(alice, { name: "  Summer  " })`
**Then** the created budget `name` is `"Summer"`

### AC3: Reject empty name
**Given** actor alice owns no budgets
**When** `createBudget(alice, { name: "" })`
**Then** the return value is `{ ok: false, error: "Name is required." }` and alice still has `0` budgets

### AC4: Reject whitespace-only name
**Given** actor alice owns no budgets
**When** `createBudget(alice, { name: "   " })`
**Then** the return value is `{ ok: false, error: "Name is required." }` and alice still has `0` budgets

### AC5: Reject duplicate name for the same owner case-insensitively
**Given** alice owns a budget named `"Summer"`
**When** `createBudget(alice, { name: "summer" })`
**Then** the return value is `{ ok: false, error: "The name is already in use." }` and alice still has `1` budget

### AC5b: Same name allowed for a different owner
**Given** alice owns `"Summer"` and bob owns none
**When** `createBudget(bob, { name: "Summer" })`
**Then** the return is ok and bob’s budget `name` is `"Summer"` and alice still has exactly one `"Summer"`

### AC6: Create with optional fields set
**Given** actor alice owns no budgets
**When** `createBudget(alice, { name: "Summer", description: "Holiday", startDate: { year: 2026, month: 6, day: 1 }, endDate: { year: 2026, month: 6, day: 30 }, targetLeftoverCents: 20000 })`
**Then** the created budget has `description` `"Holiday"`, `startDate` `{ year: 2026, month: 6, day: 1 }`, `endDate` `{ year: 2026, month: 6, day: 30 }`, `targetLeftoverCents` `20000`

### AC7: nextCopyName first copy
**Given** existing names `["Summer"]` (copier’s names)
**When** `nextCopyName("Summer", ["Summer"])`
**Then** the return value is `"Summer (copy1)"`

### AC8: nextCopyName skips taken suffix
**Given** existing names `["Summer", "Summer (copy1)"]`
**When** `nextCopyName("Summer", ["Summer", "Summer (copy1)"])`
**Then** the return value is `"Summer (copy2)"`

### AC9: nextCopyName is case-insensitive against existing
**Given** existing names `["summer (copy1)"]`
**When** `nextCopyName("Summer", ["summer (copy1)"])`
**Then** the return value is `"Summer (copy2)"`

### AC10: Copy clones data with a new id, copy name, and copier as owner
**Given** alice owns `"Summer"` id `"b1"` with income category `{ id: "c1", name: "Salary" }` and income entry `{ id: "e1", categoryId: "c1", comment: "June", amountCents: 10000, date: null }`; bob has grant `browse` on `"b1"` and owns no budgets
**When** `copyBudget(bob, "b1")`
**Then** there are `2` budgets; the new budget has `name` `"Summer (copy1)"`, `id` not equal to `"b1"`, `ownerId` bob, `visibility` `"hidden"`, `grants` `[]`; it has one income category with `name` `"Salary"` and `id` not equal to `"c1"`; it has one income entry with `comment` `"June"`, `amountCents` `10000`, `date` `null`, `id` not equal to `"e1"`, and `categoryId` equal to the **new** category id

### AC11: Copy does not share data with the source
**Given** the result of AC10
**When** the source budget’s category name is changed to `"Wages"`
**Then** the copy’s category name is still `"Salary"`

### AC11b: See-only cannot copy
**Given** bob has grant `see` on alice’s `"b1"`
**When** `copyBudget(bob, "b1")`
**Then** the return is `{ ok: false, error: "Not found." }` and there is still `1` budget

### AC12: Owner deletes budget by id
**Given** alice owns `"Summer"` (`"b1"`) and `"Winter"` (`"b2"`)
**When** `deleteBudget(alice, "b1")`
**Then** `listBudgetSummaries(alice)` returns exactly one budget and that budget’s `name` is `"Winter"`

### AC13: Delete the last owned budget
**Given** alice owns one budget `"Summer"` (`"b1"`)
**When** `deleteBudget(alice, "b1")`
**Then** `listBudgetSummaries(alice)` returns `[]`

### AC13b: Edit grant cannot delete
**Given** bob has grant `edit` on alice’s `"b1"`
**When** `deleteBudget(bob, "b1")`
**Then** the return is `{ ok: false, error: "Not allowed." }` and `"b1"` still exists

### AC13c: Moderator can delete another user’s budget
**Given** alice owns `"b1"` and actor is the moderator
**When** `deleteBudget(moderator, "b1")`
**Then** `"b1"` is gone

### AC14: Rename to a taken name **for that owner** is rejected
**Given** alice owns `"Summer"` (`"b1"`) and `"Winter"` (`"b2"`)
**When** `updateBudget(alice, "b1", { name: " winter " })`
**Then** the return value is `{ ok: false, error: "The name is already in use." }` and `"b1"` is still named `"Summer"`

### AC14b: Rename to another owner’s name is allowed
**Given** alice owns `"Summer"` (`"b1"`) and bob owns `"Winter"`
**When** `updateBudget(alice, "b1", { name: "Winter" })`
**Then** `"b1"` is named `"Winter"`

### AC15: Rename with trim succeeds
**Given** alice owns `"Summer"` (`"b1"`)
**When** `updateBudget(alice, "b1", { name: "  Autumn  " })`
**Then** `"b1"` has `name` `"Autumn"`

### AC16: Delete-budget confirmation copy
**Given** the owner has chosen Delete on budget `"Summer"`
**When** the confirmation is shown
**Then** the message is exactly `Delete budget “Summer”? This cannot be undone.`

### AC17: Home list labels when empty
**Given** `listBudgetSummaries(viewer)` is `[]`
**When** the home screen renders
**Then** it shows the text `No budgets yet.` and a control whose accessible name is `New budget`

### AC18: Home list actions follow grants
**Given** alice’s Home: she owns `"Mine"`; `"PublicOne"` is public owned by bob with no grant to alice; `"SharedEdit"` is hidden with grant `edit` to alice; `"SharedSee"` is hidden with grant `see` to alice
**When** the home screen renders for alice
**Then** it shows `Mine`, `PublicOne`, `SharedEdit`, and `SharedSee`; `Mine` has `Open`, `Copy`, `Delete`; `PublicOne` has none of `Open`, `Copy`, `Delete`; `SharedEdit` has `Open` and `Copy` and not `Delete`; `SharedSee` has none of `Open`, `Copy`, `Delete`

### AC19: Browse is read-only inside the budget
**Given** alice has grant `browse` on `"b1"`
**When** she opens the budget screen
**Then** she can see categories, entries, and report; there are no enabled add/edit/delete controls for categories or entries

### AC20: Hidden budget omitted from strangers’ lists
**Given** alice owns hidden `"Summer"` with no grants
**When** bob’s home renders
**Then** `Summer` is not shown

## Files to Modify

| File | Change |
|---|---|
| `src/types.ts` | `Budget.ownerId`, `visibility`, `grants`; `UserProfile`. |
| `src/names.ts` | `normalizeName`, `isNameTaken` **per owner**, `nextCopyName`. |
| `src/budgets.ts` | Actor-aware `createBudget`, `updateBudget`, `copyBudget`, `deleteBudget`, list. |
| `src/acl.ts` (new) | `canListSummary`, `canRead`, `canWrite`, `canDelete`. |
| `src/names.test.ts` | Tests for AC7–AC9. |
| `src/budgets.test.ts` | Tests for AC1–AC6, AC5b, AC10–AC15, AC13b–c, AC14b. |
| `src/acl.test.ts` | Role × action matrix. |
| `src/ui/HomeScreen.tsx` | Badges; hide actions; AC16–AC18, AC20. |
| `src/ui/HomeScreen.test.tsx` | Tests for AC16–AC18, AC20. |
| `src/ui/BudgetScreen.tsx` | Read-only browse (AC19). |

## Risk Assessment

- **What could break:** Tests that assume global unique names and Delete on every home row. Copies that forgot to remap ids would alias arrays.
- **Rollback:** Keep old global mutators only if product reverts to no-accounts (not planned).
- **Dependencies:** Persistence/auth specs for actor identity.

## Testing Strategy (MANDATORY)

| Function | Case | Given | When | Then |
|----------|------|-------|------|------|
| createBudget | AC1 | alice none | create Summer | hidden, owner alice, empty collections |
| createBudget | AC2 | alice | `"  Summer  "` | name `"Summer"` |
| createBudget | AC3 | alice | `""` | `"Name is required."` |
| createBudget | AC4 | alice | `"   "` | `"Name is required."` |
| createBudget | AC5 | alice has Summer | create summer | `"The name is already in use."` |
| createBudget | AC5b | alice Summer | bob create Summer | both ok |
| createBudget | AC6 | alice | full fields | optionals match |
| nextCopyName | AC7–AC9 | as today | nextCopyName | copy1 / copy2 / case skip |
| copyBudget | AC10 | bob browse | copy | bob owns copy1, new ids |
| copyBudget | AC11 | after copy | rename source cat | copy still Salary |
| copyBudget | AC11b | bob see | copy | `"Not found."` |
| deleteBudget | AC12–AC13 | owner | delete | remaining / empty |
| deleteBudget | AC13b | edit grant | delete | `"Not allowed."` |
| deleteBudget | AC13c | moderator | delete | gone |
| updateBudget | AC14 | same owner clash | rename | `"The name is already in use."` |
| updateBudget | AC14b | other owner has Winter | alice rename Winter | ok |
| updateBudget | AC15 | Summer | trim Autumn | `"Autumn"` |
| HomeScreen | AC16 | Delete | dialog | exact string |
| HomeScreen | AC17 | empty list | render | `No budgets yet.` + New budget |
| HomeScreen | AC18 | mixed grants | render | actions per table |
| BudgetScreen | AC19 | browse | open | no mutate controls |
| HomeScreen | AC20 | hidden stranger | bob home | Summer absent |

### Coverage Target

- ACL helpers: 100% of role × action cells
- Lifecycle mutators: every AC above

## Related Documentation

- **Tier 1:** [specs/PRD.md](../PRD.md), [specs/architecture.md](../architecture.md)
- **Features:** [persistence.md](persistence.md)
- **UI:** [specs/ui-ux.md](../ui-ux.md) (Home/Budget chrome; login and sharing UI land in the auth feature spec)

## Spec Readiness checklist

- [x] Every AC has a precise expected value — no "works correctly"
- [x] Another person could write a test from each AC without asking
- [x] Every AC can fail — one that cannot fail proves nothing
- [x] Error and edge cases have ACs of their own
- [x] Every AC appears in the testing strategy table
