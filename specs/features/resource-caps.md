# Feature: Resource caps

## Overview

- **Status:** Draft
- **Created:** 2026-09-23
- **Affected subsystems:** HTTP adapter, household repo, client forms — see [auth-accounts.md](auth-accounts.md), [specs/ui-ux.md](../ui-ux.md), [specs/runbooks/cloud-run.md](../runbooks/cloud-run.md)

## Problem Statement

The household size is a fixed `MAX_PROFILES = 10`. Owned budgets, categories, and entries have no limit. A spam of registers, budget copies, or rows can fill Firestore. The browser cannot know a Cloud Run limit until a save is rejected.

## Current Behavior

`MAX_PROFILES` is `10` in `src/repo.ts`. `src/httpDispatch.ts` imports it. `POST /api/register`, orphan `GET /api/me`, and `requireProfile` (any later `/api/*` with a token and no profile) compare `profileCount()` to that constant. At the cap they call `deleteUser` and return `403` `{"error":"The household is full (10 users)."}`. A UID that already has a profile re-registers with `200` and is not deleted. The moderator’s profile counts as one profile.

`createBudgetForActor` and `copyBudgetForActor` save with no owned-count check. `POST /api/budgets/:id/copy` maps `"Not allowed."` to `403` and every other failure to `404`. `saveWritableBudget` checks write access, then `repo.saveBudget`, with no length check. Agent `save_budget` calls `saveWritableBudget`. `repo.saveBudget` is also used by tests and migration.

`addCategory` and `addEntry` append whenever the name or category checks pass. `GET /api/config` returns Firebase web fields only. `HomeScreen` shows `Sign-up is full (10 users).` when `(household ?? []).length >= 10`. Copy on Home ignores a failed `copyBudgetRemote`. Create already puts `createBudgetRemote`’s error on the name `.field-error`.

`server.ts` and the Vite `/api` middleware in `vite.config.ts` build `dispatchHttpRequest` input and do not read cap variables. Tests call `dispatchHttpRequest` directly.

## Proposed Change

Caps are ordinary env (`UPPER_SNAKE`, same style as `MODERATOR_EMAIL`), not Secret Manager secrets. The budget key is `CAP_USER_BUDGET_COUNT`.

| Variable | Default | Counts |
|---|---|---|
| `CAP_USER_COUNT` | 3 | Profiles, including the moderator |
| `CAP_USER_BUDGET_COUNT` | 2 | Budgets whose `ownerId` is that user. Shared or public budgets owned by someone else do not count |
| `CAP_CATEGORY_COUNT` | 4 | Income categories and expense categories, separately |
| `CAP_ENTRY_COUNT` | 4 | Income entries and expense entries, separately |

A value is a positive integer only when, after trim, it matches `/^[1-9][0-9]*$/`. Missing, empty, `0`, negatives, leading zeros, decimals, and any other string use that variable’s default.

`readResourceCaps()` parses `process.env` once. `server.ts` and `vite.config.ts` pass the result on the dispatch input. `dispatchHttpRequest` does not read these four variables. Omitted caps on the input are the defaults, so tests stay on 3 / 2 / 4 / 4 when a developer `.env` sets other numbers.

Messages interpolate the active number:

- `The household is full (3 users).`
- `You can own at most 2 budgets.`
- `A budget can have at most 4 income categories.`
- `A budget can have at most 4 expense categories.`
- `A budget can have at most 4 income entries.`
- `A budget can have at most 4 expense entries.`
- `Sign-up is full (3 users).`

Plural wording stays as written for every positive integer, including `1`.

**Users.** Replace `MAX_PROFILES` at register, orphan `/api/me`, and `requireProfile`. At the cap, still delete that Auth user and return `403` with the household-full message. An existing profile still re-registers `200` and is not deleted. The moderator still occupies one slot.

**Owned budgets.** `createBudgetForActor` and `copyBudgetForActor` reject when that actor already owns `userBudgetCount` budgets, before name checks, with `400` and the owned-budget message. `repo.saveBudget` stores whatever it is given.

**Categories and entries.** `saveWritableBudget` (budget `PUT` and agent `save_budget`), after the write check and before `repo.saveBudget`: if a list’s next length is greater than its cap and greater than its stored length, return `400` and leave the stored budget unchanged. Check order: income categories, expense categories, income entries, expense entries. The first failure is the message. A save whose every over-cap list stays the same length or shrinks succeeds, so a later lower cap does not freeze edits or deletes. Copy checks the source lists in that same order after the owned-budget check; a source list longer than its cap is `400` with that list’s message, and the repo gains no budget. Copy of a budget whose four lists are each exactly at the cap succeeds. Copy `"Not allowed."` stays `403`. Copy `"Not found."` stays `404`.

**Client.** Defaults match the table until `loadFirebaseAuth` stores positive-integer `userCount`, `userBudgetCount`, `categoryCount`, and `entryCount` from `GET /api/config`. A missing or invalid field keeps that field’s default and still initializes Firebase when `apiKey`, `authDomain`, and `projectId` are present. `addCategory` and `addEntry` return the matching message and do not append when that list’s length is already at the cap. `applySuggestedItems` puts that `addCategory` message on the row. Home counts budgets with `ownerId` equal to the actor’s profile id (summaries when present, otherwise `listBudgets()`). At the owned cap, create sets the name `.field-error` and does not call `createBudgetRemote`; copy sets a `.field-error` on that budget row and does not call `copyBudgetRemote`. A copy whose local budget lists exceed a cap shows that message and does not call `copyBudgetRemote`. A copy request that still fails shows the server `error` string in that row’s `.field-error`. Login keeps showing the server error string. Home shows `Sign-up is full (N users).` when the household length is at least the client user cap.

`GET /api/config` adds the four numbers from the dispatch input. Dockerfile does not contain these names. `.env.example` documents them as ordinary env. The Cloud Run `--set-env-vars` example includes all four.

## Acceptance Criteria

### AC1: Invalid env uses the defaults
**Given** `readResourceCaps` reads an env object
**When** `CAP_USER_COUNT` is missing, `CAP_USER_BUDGET_COUNT` is `"0"`, `CAP_CATEGORY_COUNT` is `"4abc"`, and `CAP_ENTRY_COUNT` is `" 4 "`
**Then** the result is `{ userCount: 3, userBudgetCount: 2, categoryCount: 4, entryCount: 4 }`
**When** the four values are `""`, `"-2"`, `"08"`, and `"3.0"`
**Then** the result is the same defaults

### AC2: Positive integers are kept
**Given** `readResourceCaps` reads an env object
**When** `CAP_USER_COUNT` is `" 5 "`, `CAP_USER_BUDGET_COUNT` is `"9"`, `CAP_CATEGORY_COUNT` is `"11"`, and `CAP_ENTRY_COUNT` is `"13"`
**Then** the result is `{ userCount: 5, userBudgetCount: 9, categoryCount: 11, entryCount: 13 }`

### AC3: Dispatch uses input caps, not process.env
**Given** `process.env.CAP_USER_COUNT` is `"9"` and the dispatch input omits caps
**When** `POST /api/register` runs with 3 stored profiles and a new UID
**Then** status `403`, body exactly `{"error":"The household is full (3 users)."}`

### AC4: Public config includes the default caps
**Given** dispatch caps are omitted and Firebase web fields are `"k"`, `"demo.firebaseapp.com"`, `"demo"`
**When** `GET /api/config` with no `Authorization` header
**Then** status `200` and the body is exactly `{"apiKey":"k","authDomain":"demo.firebaseapp.com","projectId":"demo","userCount":3,"userBudgetCount":2,"categoryCount":4,"entryCount":4}`

### AC5: Config includes configured caps and the emulator host
**Given** dispatch caps are `{ userCount: 5, userBudgetCount: 9, categoryCount: 11, entryCount: 13 }` and `firebaseAuthEmulatorHost` is `"127.0.0.1:9099"`
**When** `GET /api/config`
**Then** status `200` and the body is exactly `{"apiKey":"k","authDomain":"demo.firebaseapp.com","projectId":"demo","authEmulatorHost":"http://127.0.0.1:9099","userCount":5,"userBudgetCount":9,"categoryCount":11,"entryCount":13}`

### AC6: Third register succeeds and the fourth is rejected
**Given** 2 profiles are stored and caps are omitted
**When** `POST /api/register` with a new UID and body `{ "displayName": "New" }`
**Then** status `201` and `profileCount()` is `3`
**Given** 3 profiles are stored
**When** `POST /api/register` with a different new UID and body `{ "displayName": "Next" }`
**Then** status `403`, body exactly `{"error":"The household is full (3 users)."}`, `profileCount()` is `3`, and `deleteUser` is called once with that new UID

### AC7: The configured user cap is the number in the error
**Given** dispatch `userCount` is `5` and 5 profiles are stored
**When** `POST /api/register` with a new UID
**Then** status `403`, body exactly `{"error":"The household is full (5 users)."}`, and `deleteUser` is called once with that UID

### AC8: An existing profile at the cap is not deleted
**Given** Alice’s profile is stored and 2 other profiles are stored (3 total)
**When** `POST /api/register` with Alice’s Bearer token and body `{ "displayName": "Other" }`
**Then** status `200`, Alice’s stored `displayName` is unchanged, and `deleteUser` is not called

### AC9: Orphan GET /api/me at the default cap deletes the Auth user
**Given** 3 profiles are stored and the token UID has no profile
**When** `GET /api/me`
**Then** status `403`, body exactly `{"error":"The household is full (3 users)."}`, and `deleteUser` is called once with that UID

### AC10: An orphan on another route at the cap gets the same rejection
**Given** 3 profiles are stored and the token UID has no profile
**When** `POST /api/budgets` with body `{ "name": "Summer" }`
**Then** status `403`, body exactly `{"error":"The household is full (3 users)."}`, `deleteUser` is called once with that UID, and `budgetCount()` is `0`

### AC11: The moderator occupies one of the three slots
**Given** 2 non-moderator profiles are stored and `moderatorEmail` matches the new token email
**When** `POST /api/register` with body `{ "displayName": "Mod" }`
**Then** status `201`, response `isModerator` is `true`, and `profileCount()` is `3`
**Given** those 3 profiles include the moderator
**When** a fourth new UID registers
**Then** status `403`, body exactly `{"error":"The household is full (3 users)."}`

### AC12: A third owned budget is rejected
**Given** Alice’s profile exists and Alice already owns budgets `b1` and `b2`
**When** `POST /api/budgets` as Alice with body `{ "name": "" }`
**Then** status `400`, body exactly `{"error":"You can own at most 2 budgets."}`, and `budgetCount()` is `2`
**When** `POST /api/budgets` as Alice with body `{ "name": "Autumn" }`
**Then** status `400`, body exactly `{"error":"You can own at most 2 budgets."}`, and `budgetCount()` is `2`

### AC13: Budgets owned by someone else do not count
**Given** Alice owns `b1`, and Bob owns `b2` and `b3` with Alice granted `edit` on `b2`
**When** `POST /api/budgets` as Alice with body `{ "name": "Autumn" }`
**Then** status `201` and the new budget’s `ownerId` is Alice’s id

### AC14: Copy at the owned cap is 400
**Given** Alice owns `b1` and `b2`, and Alice can read Bob’s budget `b3` (4 or fewer categories and entries on each list)
**When** `POST /api/budgets/b3/copy` as Alice
**Then** status `400`, body exactly `{"error":"You can own at most 2 budgets."}`, and `budgetCount()` is `3`

### AC15: repo.saveBudget is not capped
**Given** Alice already owns 2 budgets
**When** `repo.saveBudget` stores a third budget with `ownerId` Alice
**Then** `budgetCount()` is `3` and that third budget is stored
**When** `createBudgetForActor` then runs for Alice
**Then** it returns `{ ok: false, error: "You can own at most 2 budgets." }` and `budgetCount()` is still `3`

### AC16: Income categories cannot grow past the cap
**Given** Alice can write budget `b1` and `b1.incomeCategories` has length 4
**When** `PUT /api/budgets/b1` sets `incomeCategories` to length 5 and leaves the other three lists the same length
**Then** status `400`, body exactly `{"error":"A budget can have at most 4 income categories."}`, and the stored `incomeCategories` length is 4

### AC17: The other three lists use their own messages
**Given** Alice can write budget `b1` and each of the four lists has length 4
**When** `PUT /api/budgets/b1` grows only `expenseCategories` to length 5
**Then** status `400`, body exactly `{"error":"A budget can have at most 4 expense categories."}`, and the stored budget is unchanged
**When** `PUT /api/budgets/b1` grows only `incomeEntries` to length 5
**Then** status `400`, body exactly `{"error":"A budget can have at most 4 income entries."}`, and the stored budget is unchanged
**When** `PUT /api/budgets/b1` grows only `expenseEntries` to length 5
**Then** status `400`, body exactly `{"error":"A budget can have at most 4 expense entries."}`, and the stored budget is unchanged

### AC18: An over-cap list that does not grow still saves
**Given** `repo.saveBudget` stored `b1` with `incomeCategories` length 5, and Alice can write `b1`
**When** `PUT /api/budgets/b1` sends those same 5 categories with the first name changed to `Salary`
**Then** status `200` and the stored first income category name is `Salary`
**When** `PUT /api/budgets/b1` sends `incomeCategories` length 4
**Then** status `200` and the stored `incomeCategories` length is 4

### AC19: The first overflowing list is the error
**Given** Alice can write `b1` and all four lists have length 4
**When** one `PUT /api/budgets/b1` sets `incomeCategories` and `expenseEntries` each to length 5
**Then** status `400`, body exactly `{"error":"A budget can have at most 4 income categories."}`, and the stored budget is unchanged
**Given** dispatch `categoryCount` is `6` and `incomeCategories` length is 6
**When** `PUT /api/budgets/b1` sets `incomeCategories` to length 7
**Then** status `400`, body exactly `{"error":"A budget can have at most 6 income categories."}`

### AC20: Copy of a budget past a list cap is rejected
**Given** Alice owns fewer than 2 budgets and can read `b1`, whose `incomeCategories` length is 5 and whose other lists have length 0
**When** `POST /api/budgets/b1/copy` as Alice
**Then** status `400`, body exactly `{"error":"A budget can have at most 4 income categories."}`, and Alice’s owned budget count is unchanged
**Given** Alice can read `b2`, whose `expenseEntries` length is 5 and whose other lists have length 4
**When** `POST /api/budgets/b2/copy` as Alice
**Then** status `400`, body exactly `{"error":"A budget can have at most 4 expense entries."}`

### AC21: Copy at exactly the cap succeeds
**Given** Alice owns 1 budget and can read `b1`, and each of `b1`’s four lists has length 4
**When** `POST /api/budgets/b1/copy` as Alice
**Then** status `201` and the new budget’s `ownerId` is Alice’s id

### AC22: Agent save_budget uses the same category cap
**Given** Alice can write `b1` and `b1.incomeCategories` has length 4
**When** the agent runs `save_budget` with `incomeCategories` length 5
**Then** the step is `{ tool: "save_budget", ok: false, status: 400, error: "A budget can have at most 4 income categories." }` and the stored length is 4

### AC23: addCategory and addEntry stop at the cap
**Given** budget `b1` has 4 income categories and the client caps are the defaults
**When** `addCategory("b1", "income", { name: "Bonus" })`
**Then** the result is `{ ok: false, error: "A budget can have at most 4 income categories." }` and `incomeCategories` length is 4
**Given** budget `b1` has 4 expense entries and one expense category `c1`
**When** `addEntry("b1", "expense", { categoryId: "c1", comment: "x", amountCents: 1, date: null })`
**Then** the result is `{ ok: false, error: "A budget can have at most 4 expense entries." }` and `expenseEntries` length is 4
**Given** the client `categoryCount` is `6` and `b1` has 4 income categories
**When** `addCategory("b1", "income", { name: "Bonus" })`
**Then** the result is `{ ok: true }` and `incomeCategories` length is 5

### AC24: Create fails in the form before the request
**Given** Home has `getIdToken` set, Alice is the actor, and the summaries include 2 budgets whose `ownerId` is Alice plus 1 whose `ownerId` is Bob
**When** the user submits New budget with name `Autumn`
**Then** a `.field-error` has text exactly `You can own at most 2 budgets.` and `createBudgetRemote` is not called

### AC25: Copy surfaces the cap error on the row
**Given** Home has `getIdToken` set, Alice owns 2 budgets, and a third row is Bob’s readable budget
**When** the user clicks `Copy` on Bob’s row
**Then** that row contains a `.field-error` with text exactly `You can own at most 2 budgets.` and `copyBudgetRemote` is not called
**Given** Alice owns 1 budget, the local budget `b1` has 5 income categories, and `copyBudgetRemote` is mocked
**When** the user clicks `Copy` on `b1`
**Then** that row’s `.field-error` is exactly `A budget can have at most 4 income categories.` and `copyBudgetRemote` is not called
**Given** the owned count is under the cap, the local lists are within the cap, and `copyBudgetRemote` resolves `{ ok: false, error: "A budget can have at most 4 income entries." }`
**When** the user clicks `Copy`
**Then** that row’s `.field-error` is exactly `A budget can have at most 4 income entries.`

### AC26: The client stores config caps and uses defaults until then
**Given** no config has been loaded
**When** the client caps are read
**Then** they are `{ userCount: 3, userBudgetCount: 2, categoryCount: 4, entryCount: 4 }`
**Given** `GET /api/config` returns Firebase fields plus `userCount` `7`, `userBudgetCount` `9`, `categoryCount` `11`, and `entryCount` `0`
**When** `loadFirebaseAuth` resolves
**Then** the stored caps are `{ userCount: 7, userBudgetCount: 9, categoryCount: 11, entryCount: 4 }` and `initializeApp` was called

### AC27: Home sign-up full uses the user cap
**Given** the client user cap is the default `3` and the moderator household has 3 profiles
**When** `HomeScreen` renders
**Then** the text `Sign-up is full (3 users).` is present
**Given** the household has 2 profiles
**When** `HomeScreen` renders
**Then** the text `Sign-up is full (3 users).` is absent
**Given** `loadFirebaseAuth` stored `userCount` `10` and the household has 3 profiles
**When** `HomeScreen` renders
**Then** the text `Sign-up is full (10 users).` is absent
**Given** that stored cap is `10` and the household has 10 profiles
**When** `HomeScreen` renders
**Then** the text `Sign-up is full (10 users).` is present

### AC28: Apply shows the category cap error
**Given** budget `b1` has 4 income categories and a review row needs a new income category `Bonus`
**When** `applySuggestedItems("b1", [row])` runs
**Then** the remaining row’s `error` is exactly `A budget can have at most 4 income categories.` and `incomeCategories` length is 4

### AC29: Packaging keeps caps out of the image and names them in env
**Given** `Dockerfile` and `specs/runbooks/cloud-run.md` and `.env.example`
**When** those files are read
**Then** `Dockerfile` does not contain `CAP_USER_COUNT=`, `CAP_USER_BUDGET_COUNT=`, `CAP_CATEGORY_COUNT=`, or `CAP_ENTRY_COUNT=`
**Then** `.env.example` contains those four names, the defaults `3`, `2`, `4`, and `4`, and the words `not secret`
**Then** the runbook `--set-env-vars` example contains `CAP_USER_COUNT`, `CAP_USER_BUDGET_COUNT`, `CAP_CATEGORY_COUNT`, and `CAP_ENTRY_COUNT`
**Then** `specs/ui-ux.md` contains `The household is full (N users).` and `Sign-up is full (N users).` and does not contain `full (10 users)`

## Files to Modify

| File | Change |
|------|--------|
| `specs/features/resource-caps.md` | This spec |
| `src/resourceCaps.ts` | `readResourceCaps`, defaults, and the client get/set used by forms |
| `src/resourceCaps.test.ts` | AC1, AC2, AC26 cap values before config |
| `src/server.ts` | Read caps once and pass them into `dispatchHttpRequest` |
| `vite.config.ts` | Pass the same `readResourceCaps()` result into dispatch for `npm start` |
| `src/httpDispatch.ts` | Optional caps on the input (default 3 / 2 / 4 / 4). Config JSON. Household-full message. Pass caps into create, copy, and `saveWritableBudget`. Copy cap failures return `400` |
| `src/repo.ts` | Remove `MAX_PROFILES`. Owned-count check in `createBudgetForActor` and `copyBudgetForActor`. List-growth check in `saveWritableBudget`. `saveBudget` stays uncapped |
| `src/categories.ts` | `addCategory` returns the category cap error and does not append |
| `src/entries.ts` | `addEntry` returns the entry cap error and does not append |
| `src/suggest.ts` | `applySuggestedItems` uses the `addCategory` error string on the row |
| `src/authClient.ts` | After a successful config parse, store positive-integer cap fields |
| `src/ui/HomeScreen.tsx` | Sign-up sentence from the client user cap. Create and copy show the cap errors and skip the remote call when the client can already decide |
| `src/httpDispatch.test.ts` | AC3–AC14, AC16–AC21. Existing AC1 and AC65 config bodies gain the four numbers. Existing AC8 and AC13 seed 3 profiles and expect `The household is full (3 users).` |
| `src/repo.test.ts` | AC15 and the create/copy/save helpers behind AC12–AC21 |
| `src/categories.test.ts` | AC23 income categories |
| `src/entries.test.ts` | AC23 expense entries |
| `src/authClient.test.ts` | AC26 |
| `src/ui/HomeScreen.test.tsx` | AC24, AC25, AC27. Existing AC60 expects `Sign-up is full (3 users).` at the default cap |
| `src/sessionBoundAccess.test.ts` | AC22 |
| `src/suggest.test.ts` | AC28 |
| `src/cloudRun.test.ts` | AC29 Dockerfile and runbook assertions |
| `.env.example` | Comment the four names as ordinary env, not secrets, with defaults 3, 2, 4, 4 |
| `specs/runbooks/cloud-run.md` | Add the four names to the `--set-env-vars` example |
| `specs/ui-ux.md` | Household-full and sign-up-full lines use `N` from `CAP_USER_COUNT` (default 3) |
| `src/ui/LoginScreen.tsx` | No change. Login still renders the server `error` string |

## Risk

- What could break: existing AC1 and AC65 exact config JSON; AC8 and AC13 household-full tests and the Home AC60 sentence; copy failures that are not `"Not allowed."` if every copy error becomes `400` (only the cap errors move to `400`); `addCategory` / `addEntry` tests that append a fifth row; From-text apply turning a new category at the cap into `Select a category.`; a global cap read inside `dispatchHttpRequest` would make tests follow the developer `.env`.
- Rollback: revert the files in the table. No data migration. Documents already over a cap remain readable and editable until a list grows.
- Dependencies: local `.env` and Cloud Run `--set-env-vars`. No new Secret Manager secrets. Dockerfile stays free of the four names.

## Testing Strategy (MANDATORY)

| Function | Case | Given | When | Then |
|---|---|---|---|---|
| `readResourceCaps` | AC1 invalid env | Missing, `"0"`, `"4abc"`, `" 4 "`, then `"0"`-like invalids | Parse | Defaults `{3,2,4,4}` both times |
| `readResourceCaps` | AC2 positive integers | `" 5 "`, `"9"`, `"11"`, `"13"` | Parse | `{5,9,11,13}` |
| `POST /api/register` | AC3 dispatch ignores env | `process.env.CAP_USER_COUNT=9`, input caps omitted, 3 profiles | Register a new UID | `403` `{"error":"The household is full (3 users)."}` |
| `GET /api/config` | AC4 default config | Caps omitted, web fields `k` / `demo.firebaseapp.com` / `demo` | GET with no auth | Exact JSON including `"userCount":3,"userBudgetCount":2,"categoryCount":4,"entryCount":4` |
| `GET /api/config` | AC5 configured config | Caps 5/9/11/13 and emulator host | GET | Exact JSON with `authEmulatorHost` and those four numbers |
| `POST /api/register` | AC6 boundary | 2 profiles, then 3 | Register `New`, then `Next` | First `201` and count 3; second `403` full-(3 users), count stays 3, `deleteUser` once |
| `POST /api/register` | AC7 configured count | `userCount` 5, 5 profiles | Register | `403` `{"error":"The household is full (5 users)."}` |
| `POST /api/register` | AC8 existing profile | Alice plus 2 others | Re-register Alice | `200`, stored name unchanged, `deleteUser` not called |
| `GET /api/me` | AC9 orphan me | 3 profiles, unknown UID | GET | `403` full-(3 users), `deleteUser` once |
| `POST /api/budgets` | AC10 orphan route | 3 profiles, unknown UID | POST `{ "name": "Summer" }` | `403` full-(3 users), no budget saved |
| `POST /api/register` | AC11 moderator slot | 2 profiles, then moderator included in 3 | Register moderator, then a fourth UID | `201` `isModerator` true and count 3; fourth `403` full-(3 users) |
| `POST /api/budgets` | AC12 third owned | Alice owns `b1` and `b2` | POST `name` `""`, then `Autumn` | Both `400` `{"error":"You can own at most 2 budgets."}`; count stays 2 |
| `POST /api/budgets` | AC13 others’ budgets | Alice owns 1; Bob owns 2 and granted Alice `edit` | POST `Autumn` | `201`, `ownerId` Alice |
| `POST /api/budgets/:id/copy` | AC14 copy owned cap | Alice owns 2 and can read Bob’s `b3` | Copy `b3` | `400` owned-budget message; count stays 3 |
| `repo.saveBudget` / `createBudgetForActor` | AC15 uncapped save | Alice owns 2 | `saveBudget` a third, then create | Count becomes 3; create returns the owned-budget error and count stays 3 |
| `PUT /api/budgets/:id` | AC16 income categories | 4 income categories | PUT length 5 | `400` income-categories message; stored length 4 |
| `PUT /api/budgets/:id` | AC17 other lists | Each list length 4 | Grow expense categories, then income entries, then expense entries | Each `400` with that list’s message; stored budget unchanged |
| `PUT /api/budgets/:id` | AC18 no growth | Stored income categories length 5 | PUT same 5 with a renamed first category, then length 4 | Both `200`; name `Salary`, then length 4 |
| `PUT /api/budgets/:id` | AC19 first list | Two lists grow past 4; later `categoryCount` 6 | PUT | First response is the income-categories message and stored data is unchanged; configured message says `6` |
| `POST /api/budgets/:id/copy` | AC20 over-cap source | Source has 5 income categories; another has 5 expense entries | Copy each | `400` with that list’s message; owned count unchanged |
| `POST /api/budgets/:id/copy` | AC21 exact cap | Alice owns 1; source lists each length 4 | Copy | `201`, new `ownerId` is Alice |
| `save_budget` | AC22 agent | 4 income categories | Agent save length 5 | `ok: false`, status `400`, income-categories error; stored length 4 |
| `addCategory` / `addEntry` | AC23 client lists | 4 income categories; 4 expense entries; then client `categoryCount` 6 | Add one more | Cap errors and lengths stay 4; with cap 6 the income add returns `ok: true` and length 5 |
| `HomeScreen` | AC24 create | Alice owns 2 summaries; Bob owns 1 | Submit `Autumn` | Name `.field-error` is the owned-budget message; `createBudgetRemote` not called |
| `HomeScreen` | AC25 copy | Owned cap; then local 5 income categories; then server entry error | Click `Copy` | Row `.field-error` matches each message; remote not called for the first two |
| `loadFirebaseAuth` | AC26 client caps | No config, then config 7/9/11/`entryCount` 0 | Read caps, then load | Defaults first; after load `{7,9,11,4}` and `initializeApp` called |
| `HomeScreen` | AC27 sign-up full | Household lengths 3, 2, then user cap 10 with lengths 3 and 10 | Render | `Sign-up is full (3 users).` only at default length 3; `(10 users).` only at length 10 |
| `applySuggestedItems` | AC28 from text | 4 income categories; row needs `Bonus` | Apply | Row `error` is the income-categories message; length stays 4 |
| Dockerfile / runbook / `.env.example` / `ui-ux.md` | AC29 packaging | Those files | Read | Image has no `CAP_*=` assignments; example and `--set-env-vars` name all four; ui-ux uses `N` and has no `full (10 users)` |

Login stays a display of the server string. `src/ui/LoginScreen.test.tsx` keeps asserting whatever `error` the mocked register response returns.

## Spec Readiness checklist

- [x] Every AC has a precise expected value — no "works correctly"
- [x] Another person could write a test from each AC without asking
- [x] Every AC can fail — one that cannot fail proves nothing
- [x] Error and edge cases have ACs of their own
- [x] Every AC appears in the testing strategy table
