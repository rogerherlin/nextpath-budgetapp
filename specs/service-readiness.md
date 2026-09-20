# Service readiness: owner first-budget round-trip

<!-- @tier: 1 -->
<!-- @see-also: specs/PRD.md, specs/architecture.md, specs/tech-stack.md, specs/ui-ux.md, specs/features/auth-accounts.md, specs/features/persistence.md -->

## Overview

- **Status:** Draft (read-only audit; **no rebuild** in this pass)
- **Created:** 2026-09-20
- **Journey:** Alice registers, creates her first hidden budget, records one expense, checks the report, signs out, and finds the same data after sign-in. Bob cannot open that budget unless the **API** allows it.

This document is the operational checklist for that journey: empty / loading / success / error, keyboard, **server** authorization, and recovery. Hiding Open, Copy, Delete, Sharing, or From text in the UI is **not** authorization.

## Current storage

| Store | Role | Who writes | Not |
|---|---|---|---|
| **Firestore Native** (`users/{uid}`, `budgets/{id}`) via **Firebase Admin SDK** on Node | Production and local emulators | `src/firestoreRepo.ts` through `createAppRepo()` in `src/firebaseAdmin.ts` | Browser Firestore SDK, client Security Rules as ACL |
| **Firestore Security Rules** (`firestore.rules`) | Deny all client `read`/`write` (`allow read, write: if false`) | n/a | Substituting for Admin ACL |
| **Firebase Auth** (email/password) | Identity. Client Auth SDK + `GET /api/config`; Node `verifyIdToken` | Auth service | App data |
| **In-memory `MemoryRepo`** | Tests / `BUDGETAPP_MEMORY_REPO=1` | `src/repo.ts` | Production Cloud Run |
| **`data/budgets.json`** | One-shot migration (`src/migrate.ts`) onto the **moderator** as owner, hidden, empty grants | Server start only if Firestore has zero budgets | Live store |
| **Browser session cache** (`resetStore` / `listBudgets` in `src/budgets.ts`) | UI after `hydrateFromServer` | Client after authorized GETs; later mutations may `PUT /api/budgets/:id` fire-and-forget (`src/clientStore.ts`) | Source of truth |

`GET`/`PUT` `/api/store` return `404` `{"error":"Not found."}`. Last-write-wins on one budget (acceptable for ≤10 users). Firestore unavailable must **not** fall back to `budgets.json` as a live adapter (`persistAdapterName()` is `"firestore"` unless the memory test flag is set).

Secrets: local gitignored `.env`; Cloud Run Secret Manager → env (`GEMINI_API_KEY`, `MODERATOR_EMAIL`). Runtime SA + ADC. Public web config only: `FIREBASE_WEB_API_KEY`, `FIREBASE_WEB_AUTH_DOMAIN`, `FIREBASE_WEB_PROJECT_ID` via `/api/config`.

## Current tools

### Application

| Tool | Where | Purpose |
|---|---|---|
| Vite 5 + React 19 | `npm start` | Dev UI; `/api` via `dispatchHttpRequest` |
| Node `http` (`src/server.ts`) | `npm run serve` / Cloud Run | Same-origin UI + API on `PORT` / `0.0.0.0` |
| Vitest 2 + jsdom | `npm test` | Unit/UI tests; no browser E2E runner in package.json |
| `tsc --noEmit` | `npm run typecheck` | Strict TypeScript |
| Firebase Auth + Firestore emulators | `.env.example` hosts | Local identity + Admin Firestore |
| `@google/generative-ai` model `gemini-3.6-flash` | Node `POST /api/suggest-entries` | From-text suggestions; key never in the browser |
| Docker + Artifact Registry + Cloud Run | `specs/runbooks/cloud-run.md` | Production process |
| Firebase Admin | `verifyIdToken`, `deleteUser`, Firestore | Token gate, cap cleanup, persistence |

### Agent (this repo)

| Tool | Purpose |
|---|---|
| `AGENTS.md` | Product rules, ACL, workflows (research / spec / tdd / develop / review) |
| Feature specs under `specs/features/` | Auth, persistence, lifecycle, entries, report, from-text, Cloud Run |
| `INBOX.md` | Observed gaps (do not treat as implemented) |
| Skills listed in `AGENTS.md` PART 3 | Optional CLI helpers (Gemini, GitHub, search); **not** part of the user journey |

There is no in-repo `.agents/skills` tree; agent behaviour is the operating manual in `AGENTS.md`.

## Security boundary (do not regress)

Authorization is **only** the Node ACL helpers (`canListSummary`, `canRead`, `canWrite`, `canDelete`, `canManageSharing`, `canUseFromText`) plus HTTP status/body in [auth-accounts.md](features/auth-accounts.md):

- Unauthenticated `/api/*` (except health and config): `401` `Sign in required.`
- Hidden budget, no grant: `404` `Not found.` (no existence leak)
- Authenticated but forbidden when existence may be shown: `403` `Not allowed.`
- From-text without flag and not moderator: `403` `From text is not allowed.` **and** Gemini is not called
- From-text also requires `canWrite`; browse + flag is `403` `Not allowed.`; see + flag is `404`

**Not security:** omitting Open for `see` / public, omitting Save on browse, omitting From text, omitting Sharing for `edit`. Those are UX. A client that still calls the API must get the same deny as above.

**edit** may change categories and rows; it may **not** delete the budget, change visibility, change grants, or transfer ownership — even if the UI were patched to show those controls.

## Journey: Alice’s first budget (household of Alice + Bob)

**Actors:** Alice (new owner, `canUseFromText` false, not moderator). Bob (existing profile, no grant). Moderator is **not** required for the happy path.

**Success (PRD):** register, create a budget Alice may use, enter data, sign out, see the same data next time under the same ACL.

### Empty

#### AC-E1: Login is empty of household data
**Given** Firebase Auth current user is `null`
**When** `App` renders
**Then** heading `Sign in` is shown; text `Budgets` is not shown; text `No budgets yet.` is not shown; no budget names are shown

#### AC-E2: Signed-in owner with no listable budgets
**Given** Alice is signed in; `GET /api/me` is 200; `GET /api/budgets` returns `{ "budgets": [] }`
**When** Home renders
**Then** heading `Budgets` is shown; a paragraph with class `empty-note` and text `No budgets yet.` is shown; button `New budget` is shown; there is no `Household` heading

#### AC-E3: New budget may be saved empty
**Given** Alice is on Home with the new-budget form; Name `Summer`; other fields blank
**When** she activates `Save`
**Then** `POST /api/budgets` succeeds; Home no longer shows `No budgets yet.`; a row named `Summer` with badge `Yours` and buttons `Open`, `Copy`, `Delete` is shown; stored document has empty category and entry arrays, `visibility` `"hidden"`, `grants` `[]`, `ownerId` Alice

#### AC-E4: Report of an empty budget
**Given** Alice has opened `Summer` with no entries
**When** she activates tab `Report`
**Then** Actual balance displays `formatMoney(0)`; `Target leftover` is not shown

### Loading

`specs/ui-ux.md` currently says MVP may ignore spinners. Service-ready loading is still observable so users do not confuse bootstrap with login failure.

#### AC-L1: Auth bootstrap is not the login form
**Given** `loadFirebaseAuth` has not yet delivered a user (`user === undefined` in `App`)
**When** `App` renders
**Then** heading `Sign in` is **not** shown; heading `Budgets` is **not** shown; the live region or status text is exactly `Loading.` (or an equivalent single status string documented in UI tests)

#### AC-L2: Profile hydrate after sign-in is not a failed login
**Given** Firebase Auth user is non-null and `GET /api/me` or `GET /api/budgets` has not yet completed
**When** `App` renders
**Then** heading `Sign in` is **not** shown; `.field-error` `Could not sign in.` is **not** shown; status text is `Loading.` until Home or a documented error appears

#### AC-L3: Suggest in flight
**Given** Alice has From-text permission, write access, non-empty `What happened`, and `POST /api/suggest-entries` has not returned
**When** she has activated `Suggest`
**Then** `Suggest` is disabled until the response arrives; the review table is not shown yet

**Current gap:** `App` shows a blank `<main />` while Auth is undefined, then `LoginScreen` while `me === null || !ready` even if a Firebase user exists. Hydrate failure sets `loadError` but often leaves `ready` false, so the user still sees Sign in instead of the error. Do not treat that as passing AC-L1/AC-L2/AC-R2.

### Success

#### AC-S1: Register then Home
**Given** fewer than 10 profiles; Auth `createUserWithEmailAndPassword` succeeds for `alice@example.com`
**When** Alice fills Email, Password, Display name `Alice`, and activates `Register`
**Then** `POST /api/register` is sent with Bearer token and JSON `{"displayName":"Alice"}`; Home heading `Budgets` is shown; session bar shows `Alice` and `alice@example.com`; button `Sign out` is shown

#### AC-S2: Open, categorize, expense, report
**Given** Alice owns empty hidden `Summer`
**When** she activates `Open`, adds income category `Salary` and expense category `Rent`, adds an expense: category `Rent`, comment `June`, amount `600,00`, date `01.06.2026`, then opens `Report`
**Then** expense total for `Rent` is `600,00`; Actual balance is `-600,00` with class `money--short` if a target greater than that actual is set, or without ahead/short classes if target is unset

#### AC-S3: Sign out then sign in round-trip
**Given** AC-S2 data is stored in Firestore for `Summer`
**When** Alice activates `Sign out`, then signs in with the same email and password
**Then** Firebase `signOut` ran; after sign-in, Home lists `Summer`; Open shows the same Rent expense (`600,00`, date `01.06.2026`); Bob still has no row unless a grant or public visibility was set (it was not)

#### AC-S4: Copy is a new owned budget
**Given** Alice can read `Summer`
**When** she activates `Copy`
**Then** a new budget `Summer (copy1)` appears with badge `Yours`; it is hidden with empty grants and `ownerId` Alice; category/entry ids differ from `Summer`

### Error

#### AC-F1: Sign-in failure
**Given** login screen; `signInWithEmailAndPassword` rejects
**When** Alice activates `Sign in`
**Then** `.field-error` text is exactly `Could not sign in.`; Home is not shown

#### AC-F2: Household full
**Given** 10 profiles exist; Alice’s Auth user is created then `POST /api/register` returns `403` `{"error":"The household is full (10 users)."}`
**When** she activates `Register`
**Then** `.field-error` is exactly `The household is full (10 users).`; Home is not shown; Auth user for that UID is deleted on the server in that request

#### AC-F3: Empty budget name
**Given** new-budget form
**When** Alice activates `Save` with Name blank or whitespace
**Then** `.field-error` next to Name is `Name is required.`; no budget is created

#### AC-F4: Duplicate name for the same owner
**Given** Alice already owns `Summer`
**When** she creates another with name `summer`
**Then** `.field-error` is `The name is already in use.`; she still has one `Summer`

#### AC-F5: Unauthenticated store dump
**Given** any repository state
**When** `GET` or `PUT` `/api/store` with or without a token
**Then** status `404`, body `{"error":"Not found."}`; Firestore is not written

#### AC-F6: From-text without permission (API, not UI)
**Given** Alice `canUseFromText` false, not moderator, owns `Summer`
**When** `POST /api/suggest-entries` with a valid Bearer token and `budgetId` of `Summer`
**Then** status `403`, `{"error":"From text is not allowed."}`; Gemini SDK is not called. Omitting the tab does not satisfy this AC.

#### AC-F7: Missing Gemini key
**Given** Alice may use From text and can write `Summer`; `GEMINI_API_KEY` is empty
**When** she submits a non-empty description to Suggest
**Then** API `503` `{"error":"Gemini API key is missing."}`; UI `.field-error` is `Gemini API key is missing.`

#### AC-F8: Firestore / API failure on hydrate
**Given** Alice is signed in; `GET /api/budgets` fails with a non-auth server error
**When** Home would otherwise render
**Then** heading `Sign in` is not shown; the error text is the API `error` string (or a dedicated `Could not load budgets.` if the body is not JSON); `Sign out` remains available

### Keyboard navigation

Labels and real `<button>`s already exist; this journey requires a complete Tab cycle without a mouse.

#### AC-K1: Login Tab order
**Given** login screen
**When** the user Tabs from the start of `main`
**Then** focus order is: Email, Password, Display name, `Sign in`, `Register`. Enter in the form activates `Sign in` (submit). Space/Enter on `Register` activates register.

#### AC-K2: Home Tab order (empty)
**Given** AC-E2
**When** the user Tabs from the session bar
**Then** focus order is: `Sign out`, `New budget`. Activating `New budget` then Tabs through Name, Description, Start, End, Target leftover (EUR), `Save`, `Cancel`. Enter in the form activates `Save`.

#### AC-K3: Budget tabs
**Given** Alice has opened `Summer` with write access and without From text
**When** she Tabs through the tablist
**Then** focusable tabs in order are `Categories`, `Income`, `Expenses`, `Report`; the selected tab has class `tab--active`; Enter/Space selects the focused tab. `Back to budgets` is a focusable button before the header fields.

#### AC-K4: Browse cannot submit edits from the keyboard
**Given** Bob has grant `browse` and has opened `Summer`
**When** he Tabs through the header
**Then** header inputs are `disabled`; there is no `Save` button; there is no `Add` on Categories/Income/Expenses. A crafted `PUT /api/budgets/:id` as Bob still returns `403` `Not allowed.` (or `404` if `canRead` is false). Disabled controls are UX; the PUT status is the AC that proves authorization.

#### AC-K5: Delete confirm
**Given** Alice’s Home row for `Summer`
**When** she focuses `Delete` and activates it with Enter
**Then** `window.confirm` text is exactly `Delete budget “Summer”? This cannot be undone.`; Escape/Cancel does not delete; confirming runs `DELETE /api/budgets/:id` as Alice and the row disappears.

### Authorization (API-first)

UI badges and hidden buttons are listed only as expected presentation after the API result.

#### AC-A1: Bob cannot read Alice’s hidden budget
**Given** Alice owns hidden `Summer`, `grants` `[]`
**When** Bob `GET /api/budgets/:id` for that id with his Bearer token
**Then** `404` `{"error":"Not found."}`. Bob’s `GET /api/budgets` list does not include `Summer`.

#### AC-A2: Public list is not browse
**Given** Alice sets visibility `public` and grants stay `[]`
**When** Bob `GET /api/budgets` then `GET /api/budgets/:id`
**Then** the list includes `Summer` with `viewerRelation` `"public"`; full GET is `404` `Not found.` Home may hide `Open` for that row; that hide is not sufficient without the 404.

#### AC-A3: Grant `see` lists but does not open
**Given** Alice `PUT` grants `[{ "userId": "<bob>", "role": "see" }]` on still-hidden `Summer`
**When** Bob lists then GETs by id
**Then** list includes `Summer` with `viewerRelation` `"see"`; GET by id is `404` `Not found.`

#### AC-A4: Grant `browse` is read-only on the server
**Given** Bob’s grant is `browse`
**When** Bob `GET /api/budgets/:id` then `PUT` the same document with a changed entry
**Then** GET is `200`; PUT is `403` `{"error":"Not allowed."}`; stored entries are unchanged

#### AC-A5: Grant `edit` cannot share or delete
**Given** Bob’s grant is `edit`
**When** Bob `PATCH .../visibility`, `PUT .../grants`, or `DELETE /api/budgets/:id`
**Then** each response is `403` `{"error":"Not allowed."}`; visibility, grants, and the document remain

#### AC-A6: No token
**Given** no `Authorization` header
**When** `GET /api/me` or `POST /api/budgets`
**Then** `401` `{"error":"Sign in required."}`

### Recovery

#### AC-R1: Sign out from an error or success screen
**Given** Alice is signed in (Home, budget, or load error)
**When** she activates `Sign out`
**Then** Auth `signOut` runs; heading `Sign in` is shown; cached budgets are not shown

#### AC-R2: Retry after failed hydrate
**Given** AC-F8 was shown
**When** Alice signs out, signs in again, and `GET /api/budgets` returns 200 with `Summer`
**Then** Home lists `Summer` (no leftover `Loading.` or Sign-in error from the previous failure)

#### AC-R3: Retry From-text after key restored
**Given** AC-F7; operator sets `GEMINI_API_KEY`; Alice still has write + From-text
**When** she activates `Suggest` again with the same description
**Then** status `200` and a review table appears or `.field-error` `Enter a description.` if she cleared the field; previous `Gemini API key is missing.` is gone

#### AC-R4: Grant revoked while Bob has the UI open
**Given** Bob had `browse` and the budget screen open; Alice `PUT` grants `[]`
**When** Bob `GET /api/budgets/:id` or `PUT` entries
**Then** `404` `Not found.` Home refresh for Bob omits `Summer`. Closing a hidden tab is not recovery; the next API call is.

#### AC-R5: Invalid token after expiry
**Given** Alice’s ID token is rejected by `verifyIdToken`
**When** any `/api/budgets` call is made
**Then** `401` `Sign in required.`; the UI returns to the login heading (or shows that error and `Sign out`) rather than an empty Home that looks like AC-E2

## Files involved (no change in this pass)

| File | Relevance |
|---|---|
| `src/App.tsx` | Auth gate, hydrate, loadError vs LoginScreen |
| `src/ui/LoginScreen.tsx` | Empty login, errors, keyboard submit |
| `src/ui/HomeScreen.tsx` | Empty list, create/copy/delete, badges |
| `src/ui/BudgetScreen.tsx` | Tabs, browse disabled fields, sharing UI |
| `src/clientStore.ts` | Bearer GETs; fire-and-forget PUT |
| `src/httpDispatch.ts` / `src/acl.ts` | Real authorization |
| `src/firestoreRepo.ts` / `src/firebaseAdmin.ts` | Storage |
| `src/geminiSuggest.ts` | From-text tool |
| `firestore.rules` | Client deny-all |

## Risk

- **What could break:** Treating UI tests that omit Open as ACL tests; shipping Cloud Run on memory repo or JSON file; flashing Login during hydrate so users re-register.
- **Rollback:** This spec is documentation only.
- **Dependencies:** Firebase Auth + Firestore, `MODERATOR_EMAIL`, optional Gemini for From-text (not required for AC-S1–S3).

## Testing strategy

| Function / surface | Case | Given | When | Then |
|---|---|---|---|---|
| App | AC-E1 | auth null | render | Sign in, not Budgets |
| HomeScreen | AC-E2 | summaries `[]` | render | `No budgets yet.` |
| createBudget + Home | AC-E3 | empty list | Save Summer | hidden owned empty doc |
| ReportTab | AC-E4 | no entries | Report | actual `0,00` (formatted), no target |
| App | AC-L1 | user undefined | render | not Sign in; `Loading.` |
| App | AC-L2 | user set, me pending | render | not Could not sign in. |
| FromTextTab | AC-L3 | fetch pending | Suggest | button disabled |
| App / Login | AC-S1 | register 201 | Register | Home + session bar |
| Entries + Report | AC-S2 | Summer open | add Rent 600 | report totals |
| App | AC-S3 | after sign out | sign in | same expense |
| copyBudgetRemote | AC-S4 | owner | Copy | copy1 hidden new ids |
| LoginScreen | AC-F1 | signIn reject | Sign in | Could not sign in. |
| LoginScreen + HTTP | AC-F2 | 10 profiles | Register | household full + deleteUser |
| HomeScreen | AC-F3 | blank name | Save | Name is required. |
| createBudget | AC-F4 | existing Summer | create summer | name in use |
| dispatchHttpRequest | AC-F5 | any | GET/PUT `/api/store` | 404 |
| dispatchHttpRequest | AC-F6 | no flag | POST suggest | 403 From text is not allowed. |
| FromTextTab + HTTP | AC-F7 | empty key | Suggest | 503 + field error |
| App | AC-F8 | budgets 500 | hydrate | not login form |
| LoginScreen | AC-K1 | login | Tab | email→…→Register |
| HomeScreen | AC-K2 | empty home | Tab | Sign out, New budget, form |
| BudgetScreen | AC-K3 | owner | Tab tabs | four labels |
| HTTP | AC-K4 | bob browse PUT | PUT budget | 403 |
| HomeScreen | AC-K5 | Delete Enter | confirm | exact string |
| dispatchHttpRequest | AC-A1–A6 | see auth-accounts | GET/PATCH/PUT/DELETE | 401/403/404 as specified |
| App | AC-R1 | signed in | Sign out | Sign in |
| App | AC-R2 | prior hydrate fail | sign in again | Summer listed |
| FromTextTab | AC-R3 | key restored | Suggest | 200 or review |
| dispatchHttpRequest | AC-R4 | grants cleared | Bob GET | 404 |
| App | AC-R5 | verifyIdToken fail | API | 401 then login |

### Coverage target

- Minimum: 80% of this journey’s UI branches in `App`, `LoginScreen`, `HomeScreen`
- Critical: 100% of AC-A1–A6 and AC-F5–F6 (API), plus AC-S3 persistence round-trip

### Test data

- Alice `uid-alice` / `alice@example.com` / `Alice`
- Bob `uid-bob` / `bob@example.com` / `Bob`
- Budget name `Summer`; expense `Rent` / `June` / 60000 cents / `01.06.2026`
- Fake repo + mocked Auth; do not call live Gemini or production Firestore

## Related documentation

- **Tier 1:** [PRD.md](PRD.md), [architecture.md](architecture.md), [tech-stack.md](tech-stack.md), [ui-ux.md](ui-ux.md)
- **Features:** [auth-accounts.md](features/auth-accounts.md), [persistence.md](features/persistence.md), [budget-lifecycle.md](features/budget-lifecycle.md), [entries.md](features/entries.md), [report.md](features/report.md), [from-text.md](features/from-text.md)
- **Runbook:** [runbooks/cloud-run.md](runbooks/cloud-run.md)
- **Patterns:** Bearer on Node; Admin SDK only writer; UI hide ≠ ACL

## Spec readiness checklist

- [x] Every AC has Given/When/Then with a precise expected value
- [x] Error, empty, loading, keyboard, authorization, and recovery have ACs
- [x] Authorization ACs assert HTTP status/body, not omitted buttons
- [x] Testing strategy has a row per AC
- [ ] Implementation of AC-L1, AC-L2, AC-F8, AC-R2, AC-R5 (current `App` gate) — task list below; not done in this pass

## Task list (short)

1. **Fix session bootstrap** so Auth-unknown and post-sign-in hydrate show `Loading.`, not `LoginScreen` (`App.tsx`; AC-L1, AC-L2).
2. **Surface hydrate/API failures** with `Sign out` and retry (AC-F8, AC-R2, AC-R5); do not map them to `Could not sign in.`
3. **Keep ACL tests on `httpDispatch` / `acl`** for AC-A1–A6 and AC-F5–F6; add no “security” tests that only check missing Open/From text.
4. **Add one Vitest journey** covering AC-E2 → AC-E3 → AC-S2 → AC-S3 with mocked Auth + fake repo (jsdom; no new E2E runner unless chosen later).
5. **Keyboard tests** for AC-K1 and AC-K2 (tab order + Enter submit); AC-K4 remains an HTTP 403.
6. **Persist errors:** if `PUT /api/budgets/:id` fails, show the API `error` string next to Save (closes INBOX fire-and-forget gap); not required to complete AC-S3 if hydrate GET still round-trips.
7. **Do not** restore `/api/store`, client Firestore writes, or Gemini in the browser.
8. **Operator:** emulators + `GEMINI_API_KEY` only for From-text ACs; Cloud Run still follows [runbooks/cloud-run.md](runbooks/cloud-run.md) (Firestore Admin, deny-all rules, Secret Manager).
