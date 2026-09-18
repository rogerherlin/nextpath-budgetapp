# Feature: Persistence (Firestore)

Status: Draft

## Overview

- **Status:** Draft (replaces the JSON-file MVP; code still uses `data/budgets.json` until TDD)
- **Created:** 2026-09-18
- **Affected subsystems:** HTTP adapter, domain types, UI session cache — see [specs/architecture.md](../architecture.md), [specs/PRD.md](../PRD.md)

## Problem Statement

A whole-catalog JSON file (`data/budgets.json`) plus unauthenticated `PUT /api/store` cannot enforce per-user ACL and cannot survive Cloud Run (ephemeral disk, multiple instances). Persistence must be a shared store the Node process owns, with per-budget reads and writes.

## Current Behavior

`loadStore` / `saveStore` read and write `{ version: 1, budgets: [] }` at `data/budgets.json`. The browser hydrates with `GET /api/store` and persists by PUTting the **entire** store after every mutation. There is no user, no ACL, and names are unique across all budgets.

## Proposed Change

Replace the JSON document with a **repository** used only from Node:

- Production and emulators: Firestore via Firebase Admin SDK. Collections: `users/{uid}`, `budgets/{id}` (full budget document including categories, entries, `ownerId`, `visibility`, `grants`).
- Unit tests: in-memory (or file-backed) fake implementing the same interface — **not** a production path.
- Delete `GET`/`PUT` `/api/store`. Persist **one budget** (or one profile field) per mutation.
- Firestore Security Rules deny all client access.
- One-shot migration: if `data/budgets.json` exists and Firestore has no budgets, import those budgets with `ownerId` = moderator UID, `visibility: "hidden"`, `grants: []`. Do not keep writing the file afterwards.

Gemini remains env-only (`GEMINI_API_KEY`). Concurrent editors of one budget: last-write-wins.

## Acceptance Criteria

### AC1: Budget document fields
**Given** owner `"uid-alice"` creates a budget named `"Summer"` with empty collections and all optionals unset
**When** the budget is stored
**Then** the document includes string `id`, `ownerId` `"uid-alice"`, `name` `"Summer"`, `description` `""`, `startDate` `null`, `endDate` `null`, `targetLeftoverCents` `null`, `visibility` `"hidden"`, `grants` `[]`, `incomeCategories` `[]`, `expenseCategories` `[]`, `incomeEntries` `[]`, `expenseEntries` `[]`

### AC2: Empty catalog for a new user
**Given** Firestore has no budgets the viewer may list
**When** `listBudgetSummaries(alice)`
**Then** the result is `[]` (no file is created on disk)

### AC3: Load round-trip
**Given** a stored budget as in AC1
**When** `getBudget(alice, id)` where alice is the owner
**Then** the returned budget `name` is `"Summer"` and `ownerId` is `"uid-alice"`

### AC4: Save after create is per-document
**Given** an empty catalog
**When** `createBudget` for alice named `"Winter"` succeeds
**Then** the repository contains a budget with `"name": "Winter"` and `ownerId` alice; no other user’s budgets are rewritten

### AC5: Save after delete
**Given** alice owns `"Summer"` and `"Winter"`
**When** `deleteBudget` of Summer succeeds for alice
**Then** `listBudgetSummaries(alice)` has length `1` and that summary’s `name` is `"Winter"`

### AC6: Save after copy
**Given** alice owns only `"Summer"` and bob may browse it
**When** `copyBudget` of that budget succeeds **as bob**
**Then** alice still has one budget `"Summer"`; bob has a new budget `"Summer (copy1)"` with `ownerId` bob, `visibility` `"hidden"`, `grants` `[]`; the two documents do not share category or entry ids

### AC7: Unauthenticated store dump is gone
**Given** any repository state
**When** `dispatchHttpRequest` is called with `method` `"GET"` or `"PUT"` and `pathname` `"/api/store"` and no token
**Then** the result `status` is `404` or `401` (not `200`), and Firestore is not written by that request

### AC8: Viewer cannot read a hidden budget they do not own
**Given** alice owns hidden `"Summer"` with no grants
**When** `getBudget(bob, summerId)`
**Then** the return is `{ ok: false, error: "Not found." }` (do not leak existence) and bob’s list does not include `"Summer"`

### AC9: Public summary without full document
**Given** alice owns `"Summer"` with `visibility` `"public"` and no grants to bob
**When** `listBudgetSummaries(bob)` then `getBudget(bob, summerId)`
**Then** the list includes a summary with `name` `"Summer"` and owner display name; `getBudget` is `{ ok: false, error: "Not found." }` (public list is not browse)

### AC10: Moderator reads all
**Given** the viewer email equals `MODERATOR_EMAIL` and alice owns hidden `"Summer"`
**When** `listBudgetSummaries(moderator)` and `getBudget(moderator, summerId)`
**Then** the list includes `"Summer"` and `getBudget` returns the full document

### AC11: Migration assigns JSON budgets to the moderator
**Given** `data/budgets.json` contains one budget named `"Summer"` and Firestore has zero budgets and the moderator profile exists
**When** migration runs once
**Then** Firestore has one budget `"Summer"` with `ownerId` equal to the moderator’s uid, `visibility` `"hidden"`, `grants` `[]`; a second migration run does not duplicate it

### AC12: File adapter is tests-only
**Given** the production server is started without a test flag
**When** a budget is created
**Then** the implementation uses the Firestore Admin repository (or emulator), not `APP_BUDGETS_FILE` as the live store

## Files to Modify

| File | Change |
|---|---|
| `src/types.ts` | `UserProfile`, budget `ownerId` / `visibility` / `grants`; stop treating `StoreFile` as the API contract. |
| `src/store.ts` / new `src/repo.ts` | Repository interface; Firestore Admin adapter; in-memory fake for tests. |
| `src/store.test.ts` / `src/repo.test.ts` | Tests for AC1–AC12 against the fake (and later emulator if added). |
| `src/paths.ts` | Keep only for one-shot migration of `budgets.json`; not the live store. |
| `src/httpDispatch.ts` | Remove `/api/store`; per-budget routes; token required. |
| `src/clientStore.ts` | Per-resource fetch; no whole-store PUT. |
| `src/httpDispatch.test.ts` | Token required; PUT store gone. |
| Firestore rules file (new) | `allow read, write: if false`. |

## Risk Assessment

- **What could break:** Existing tests that assume `budgets.json` and `/api/store` fail until this spec is implemented. Cloud Run without Firestore would lose data if anyone shipped Docker on the old file store.
- **Rollback:** Revert to JSON store only in local MVP; do not roll back ACL in production.
- **Dependencies:** Firebase project, emulators locally, Admin credentials via ADC.

## Testing Strategy (MANDATORY)

| Function | Case | Given | When | Then | Mocks |
|----------|------|-------|------|------|-------|
| create/get | AC1 fields | alice | create Summer | hidden, ownerId, empty collections | fake repo |
| listBudgetSummaries | AC2 empty | no visible budgets | list as alice | `[]` | fake repo |
| getBudget | AC3 round-trip | AC1 stored | get as alice | name Summer | fake repo |
| createBudget | AC4 per-doc | empty | create Winter | only that doc | fake repo |
| deleteBudget | AC5 | Summer+Winter alice | delete Summer | list length 1 Winter | fake repo |
| copyBudget | AC6 | alice Summer, bob browse | copy as bob | bob owns copy1 hidden | fake repo |
| dispatchHttpRequest | AC7 no dump | any | GET/PUT `/api/store` no token | 401 or 404, no write | fake repo |
| getBudget | AC8 hidden | alice hidden Summer | get as bob | error `"Not found."` | fake repo |
| list/get | AC9 public | public no grant | bob list then get | summary yes, full no | fake repo |
| getBudget | AC10 mod | hidden Summer | get as moderator | full doc | fake repo |
| migrate | AC11 | JSON Summer, empty FS | migrate once then twice | one doc, owner moderator | fake + temp JSON |
| production wiring | AC12 | serve without test flag | create | not `APP_BUDGETS_FILE` | unit or smoke |

### Coverage Target

- Minimum: 80% of repository + HTTP persist paths
- Critical paths: 100% of ACL × get/list/create/delete/copy

### Test Data

- Users: `uid-alice`, `uid-bob`, moderator matching `MODERATOR_EMAIL`
- Fake Admin SDK / in-memory maps; do not write the real `data/budgets.json` in tests

## Related Documentation

- **Tier 1:** [specs/PRD.md](../PRD.md), [specs/architecture.md](../architecture.md), [specs/tech-stack.md](../tech-stack.md)
- **Features:** [budget-lifecycle.md](budget-lifecycle.md)
- **Patterns:** Node HTTP + Admin SDK only; no client Firestore

## Spec Readiness checklist

- [x] Every AC has a precise expected value — no "works correctly"
- [x] Another person could write a test from each AC without asking
- [x] Every AC can fail — one that cannot fail proves nothing
- [x] Error and edge cases have ACs of their own
- [x] Every AC appears in the testing strategy table
