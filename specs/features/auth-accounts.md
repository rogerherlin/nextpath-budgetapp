# Feature: Auth, accounts, sharing, and visibility

## Overview

- **Status:** In Progress
- **Created:** 2026-09-18
- **Affected subsystems:** HTTP adapter, domain ACL, Login/Home/Budget UI — see [specs/PRD.md](../PRD.md), [specs/architecture.md](../architecture.md), [specs/tech-stack.md](../tech-stack.md)

## Problem Statement

The MVP has no identity: anyone who can reach the process can dump or overwrite every budget. Household use needs email/password accounts, a hard cap of **10** profiles, one **moderator**, and server-enforced visibility and per-user grants. UI hiding is not security.

## Current Behavior

There is no login screen. `GET`/`PUT` `/api/store` are unauthenticated. `POST /api/suggest-entries` does not check a user. Budgets have no `ownerId`, `visibility`, or `grants`. Home lists every budget with Open, Copy, and Delete.

## Proposed Change

1. Browser: Firebase Auth **email/password** (client Auth SDK + public web config from `GET /api/config`).
2. Node: verify `Authorization: Bearer <Firebase ID token>` on every `/api/*` except health and config. Create at most **10** `UserProfile` documents. Moderator is the account whose email equals `MODERATOR_EMAIL` (case-insensitive); that account occupies one of the 10 slots.
3. Pure ACL helpers decide list/read/write/delete/From-text. HTTP returns fixed status codes and error strings.
4. Visibility is global (`public` | `hidden`). Grants are per-user (`see` | `browse` | `edit`). Default new budget: hidden, empty grants, creator is owner.
5. Login gate before Home. Sharing UI for owner/moderator. Moderator panel for users and `canUseFromText`. From-text tab and `/api/suggest-entries` require `canUseFromText` or moderator, **and** write access to that budget.

Related budget CRUD, copy/delete, and Firestore document shape are specified in [budget-lifecycle.md](budget-lifecycle.md) and [persistence.md](persistence.md). This spec owns **identity, cap, moderator, ACL helpers, sharing/visibility HTTP, login UI, and From-text gating**.

## Types

```ts
interface UserProfile {
  id: string; // Firebase UID
  email: string;
  displayName: string;
  canUseFromText: boolean;
  createdAt: string; // ISO-8601
}

type Visibility = "public" | "hidden";
type GrantRole = "see" | "browse" | "edit";

interface Grant {
  userId: string;
  role: GrantRole;
}

// Budget gains (see persistence AC1):
// ownerId, visibility, grants
```

**Actor** (for pure helpers): `{ profile: UserProfile, isModerator: boolean }`.

`isModerator` is `true` iff `profile.email` equals `process.env.MODERATOR_EMAIL` after trim and case-insensitive compare. Empty `MODERATOR_EMAIL` means **no** moderator.

**BudgetSummary** (list payload, never includes entries/categories/grants):

| Field | Type |
|---|---|
| `id` | string |
| `name` | string |
| `ownerId` | string |
| `ownerDisplayName` | string |
| `visibility` | `"public"` \| `"hidden"` |
| `startDate` | DateParts \| null |
| `endDate` | DateParts \| null |
| `viewerRelation` | `"owner"` \| `"moderator"` \| `"edit"` \| `"browse"` \| `"see"` \| `"public"` |

If several relations apply, use this priority: owner, then moderator, then the grant role, then `"public"`.

## Error contract (HTTP)

Every error body is JSON `{ "error": "<exact string>" }`.

| Situation | Status | `error` |
|---|---|---|
| Missing `Authorization` header, or scheme is not `Bearer`, or token empty | `401` | `Sign in required.` |
| Token present but Admin `verifyIdToken` fails | `401` | `Sign in required.` |
| Token valid but no profile and household already has 10 profiles | `403` | `The household is full (10 users).` |
| Authenticated, action forbidden, resource existence may be shown | `403` | `Not allowed.` |
| Authenticated, no list/read right (do not leak hidden budgets) | `404` | `Not found.` |
| From-text without `canUseFromText` and not moderator | `403` | `From text is not allowed.` |
| Display name missing/whitespace on register | `400` | `Display name is required.` |
| Visibility not `public` or `hidden` | `400` | `Invalid visibility.` |
| Grants array invalid (see AC) | `400` | `Invalid grant.` |
| Public Firebase config env missing | `503` | `Firebase web config is missing.` |
| Gemini key missing (existing) | `503` | `Gemini API key is missing.` |

## API contracts

Unless noted, requests **must** send `Authorization: Bearer <idToken>`. JSON request/response `Content-Type` is `application/json`.

### `GET /api/health`

No auth. **Then** status `200`, body exactly `{"ok":true}`.

### `GET /api/config`

No auth. Reads `FIREBASE_WEB_API_KEY`, `FIREBASE_WEB_AUTH_DOMAIN`, `FIREBASE_WEB_PROJECT_ID` from the environment (no `VITE_` prefix).

**Given** those three are non-empty strings `"k"`, `"demo.firebaseapp.com"`, `"demo"`
**When** `GET /api/config`
**Then** status `200`, body exactly `{"apiKey":"k","authDomain":"demo.firebaseapp.com","projectId":"demo"}`

**Given** any of the three is unset or `""`
**When** `GET /api/config`
**Then** status `503`, body `{"error":"Firebase web config is missing."}`

The response **must not** include `GEMINI_API_KEY`, `MODERATOR_EMAIL`, or service-account fields.

### `POST /api/register`

Creates the Firestore profile for the token’s UID. The browser has already created the Firebase Auth user (email/password).

Request body: `{ "displayName": string }`. Email is taken from the verified token (`email` claim). `displayName` is trimmed.

Response `201` body:

```json
{
  "id": "<uid>",
  "email": "<token email>",
  "displayName": "<trimmed>",
  "canUseFromText": false,
  "createdAt": "<ISO-8601>",
  "isModerator": false
}
```

If the token email matches `MODERATOR_EMAIL`, `canUseFromText` is `true` and `isModerator` is `true` even if the stored flag is unused for the moderator.

If a profile for that UID already exists: `200` and the existing profile (same JSON shape); do not change `canUseFromText` or `createdAt`.

If there are already **10** profiles and this UID has none: **do not** insert a profile; **delete** the Firebase Auth user for that UID in the same request; status `403`, `{"error":"The household is full (10 users)."}`.

### `GET /api/me`

Returns the current profile (same JSON shape as register, including `isModerator`).

**Given** a valid token whose UID has a profile
**When** `GET /api/me`
**Then** status `200` and that profile.

**Given** a valid token, **no** profile, and fewer than 10 profiles
**When** `GET /api/me`
**Then** status `403`, body `{"error":"Register first."}` (do not auto-create; register is explicit so display name is collected).

**Given** a valid token, **no** profile, and 10 profiles already
**When** `GET /api/me`
**Then** status `403`, `{"error":"The household is full (10 users)."}`, and the Auth user for that UID is deleted in the same request.

### `GET /api/users`

Signed-in household directory for the sharing picker.

**Then** status `200`, body `{ "users": [ { "id", "email", "displayName" } ] }` sorted by `displayName` ascending (case-insensitive), then `id`. Does **not** include `canUseFromText`.

### `GET /api/admin/users`

**Given** the caller is not moderator
**When** `GET /api/admin/users`
**Then** status `403`, `{"error":"Not allowed."}`

**Given** the caller is moderator
**When** `GET /api/admin/users`
**Then** status `200`, body `{ "users": [ { "id", "email", "displayName", "canUseFromText", "createdAt" } ] }` sorted the same way as `GET /api/users`. Length is the profile count (≤ 10).

### `PATCH /api/admin/users/:id`

Body: `{ "canUseFromText": boolean }` only.

**Given** caller is not moderator
**Then** `403` `Not allowed.` and no write.

**Given** caller is moderator and `:id` is a non-moderator profile
**When** body `{ "canUseFromText": true }`
**Then** status `200`, that user’s `canUseFromText` is `true`.

**Given** caller is moderator and `:id` is the moderator’s own id
**When** body `{ "canUseFromText": false }`
**Then** status `200`, stored flag may be `false`, but `canUseFromText(actor)` and From-text HTTP still succeed for the moderator (`isModerator` wins).

**Given** `:id` is not a profile
**Then** `404` `Not found.`

### `GET /api/budgets`

**Then** status `200`, body `{ "budgets": BudgetSummary[] }` — only budgets where `canListSummary` is true, sorted by `name` ascending (case-insensitive), then `id`.

### `POST /api/budgets`

Create as owner (lifecycle AC1). Body includes `name` and optionals as in lifecycle. **Then** `201` and the full budget JSON (hidden, `grants` `[]`, `ownerId` = caller uid). Unauthenticated: `401` `Sign in required.`

### `GET /api/budgets/:id`

**Given** `canRead`
**Then** `200` and the full budget (categories, entries, `grants`, `visibility`, `ownerId`).

**Given** not `canRead` (including grant `see` or public-summary-only)
**Then** `404` `Not found.`

### `PATCH /api/budgets/:id/visibility`

Body: `{ "visibility": "public" | "hidden" }`.

Allowed iff owner or moderator. Edit/browse/see: `403` `Not allowed.` if `canRead`, else `404` `Not found.`

### `PUT /api/budgets/:id/grants`

Body: `{ "grants": [ { "userId": string, "role": "see" | "browse" | "edit" } ] }`. Replaces the whole array.

Allowed iff owner or moderator. Same 403/404 split as visibility.

Invalid grant (any of): `400` `Invalid grant.` and the stored grants are unchanged:

- `role` not exactly `see`, `browse`, or `edit`
- `userId` empty, or not an existing profile id
- `userId` equals `ownerId`
- duplicate `userId` in the array

Empty array is valid (clears all grants).

### `POST /api/suggest-entries`

Body **must** include `budgetId` plus the existing fields:

```json
{
  "budgetId": "b1",
  "text": "paid rent 600 euros",
  "incomeCategories": [{ "id": "c1", "name": "Salary" }],
  "expenseCategories": [{ "id": "c2", "name": "Rent" }]
}
```

Checks in order:

1. Auth → else `401` `Sign in required.`
2. `canUseFromText(actor)` → else `403` `From text is not allowed.` (even if they could write)
3. Budget exists and `canWrite(actor, budget)` → else if not `canRead` then `404` `Not found.`; if `canRead` then `403` `Not allowed.`
4. Existing Gemini key / model behaviour from [from-text.md](from-text.md)

### Removed routes

`GET` and `PUT` `/api/store`: status `404`, `{"error":"Not found."}` (with or without a token). Firestore is not written.

## ACL helpers (pure)

Signatures:

- `canListSummary(actor, budget): boolean`
- `canRead(actor, budget): boolean` — full document
- `canWrite(actor, budget): boolean` — categories and entries only
- `canManageSharing(actor, budget): boolean` — visibility and grants
- `canDelete(actor, budget): boolean`
- `canUseFromText(actor): boolean`

Rules (moderator email match ⇒ `isModerator`):

| Actor | list | read | write | sharing | delete | From-text API/tab |
|---|---|---|---|---|---|---|
| Owner | yes | yes | yes | yes | yes | iff profile flag or moderator |
| Moderator (any budget) | yes | yes | yes | yes | yes | **yes** (flag ignored) |
| Grant `edit` | yes | yes | yes | no | no | iff flag or moderator |
| Grant `browse` | yes | yes | no | no | no | no (no write) |
| Grant `see` | yes | no | no | no | no | no |
| Other, `public` | yes | no | no | no | no | no |
| Other, `hidden`, no grant | no | no | no | no | no | no |

`canUseFromText(actor)` is `actor.isModerator || actor.profile.canUseFromText === true`.

Grant lookup: first matching `grants[].userId === actor.profile.id`. Unknown role treated as no grant.

## Acceptance Criteria

### AC1: Public config
**Given** env `FIREBASE_WEB_API_KEY`=`"k"`, `FIREBASE_WEB_AUTH_DOMAIN`=`"demo.firebaseapp.com"`, `FIREBASE_WEB_PROJECT_ID`=`"demo"`
**When** `dispatchHttpRequest` `GET` `/api/config` with no `authorization` header
**Then** status `200` and body exactly `{"apiKey":"k","authDomain":"demo.firebaseapp.com","projectId":"demo"}`

### AC2: Config missing
**Given** `FIREBASE_WEB_API_KEY` is `""`
**When** `GET` `/api/config`
**Then** status `503` and body `{"error":"Firebase web config is missing."}`

### AC3: Health is public
**Given** no token
**When** `GET` `/api/health`
**Then** status `200` and body `{"ok":true}`

### AC4: API requires Bearer token
**Given** no `authorization` header
**When** `GET` `/api/me`
**Then** status `401` and body `{"error":"Sign in required."}`

### AC5: Invalid token
**Given** `authorization` is `Bearer not-a-token` and token verification fails
**When** `GET` `/api/me`
**Then** status `401` and body `{"error":"Sign in required."}`

### AC6: Register creates profile under the cap
**Given** 0 profiles; verified token uid `"uid-alice"`, email `"alice@example.com"`
**When** `POST /api/register` with body `{"displayName":"  Alice  "}`
**Then** status `201`; JSON `id` is `"uid-alice"`, `email` `"alice@example.com"`, `displayName` `"Alice"`, `canUseFromText` `false`, `isModerator` `false`; `createdAt` is a non-empty ISO-8601 string; profile count is `1`

### AC7: Register rejects empty display name
**Given** 0 profiles; verified token uid `"uid-alice"`
**When** `POST /api/register` with body `{"displayName":"   "}`
**Then** status `400`, body `{"error":"Display name is required."}`, profile count is `0`

### AC8: Eleventh register is rejected and Auth user is deleted
**Given** 10 profiles already exist; verified token uid `"uid-new"` that has **no** profile; Admin Auth `deleteUser` is available
**When** `POST /api/register` with body `{"displayName":"New"}`
**Then** status `403`, body `{"error":"The household is full (10 users)."}`; profile count is still `10`; `deleteUser("uid-new")` was called once

### AC9: Re-register is idempotent
**Given** profile `uid-alice` with `displayName` `"Alice"`, `canUseFromText` `false`
**When** `POST /api/register` with `{"displayName":"Other"}` as alice
**Then** status `200`; `displayName` is still `"Alice"`; `canUseFromText` is still `false`

### AC10: Moderator occupies a slot and is flagged
**Given** `MODERATOR_EMAIL` is `"mod@example.com"`; 0 profiles; token uid `"uid-mod"`, email `"Mod@example.com"`
**When** `POST /api/register` with `{"displayName":"Mod"}`
**Then** status `201`; `isModerator` is `true`; `canUseFromText` is `true`; profile count is `1`

### AC11: GET /api/me after register
**Given** alice’s profile exists
**When** `GET /api/me` as alice
**Then** status `200` and `id` `"uid-alice"` and `isModerator` `false`

### AC12: GET /api/me without profile
**Given** valid token `"uid-bob"`, 0 profiles
**When** `GET /api/me`
**Then** status `403`, body `{"error":"Register first."}`, profile count is `0`

### AC13: Orphan Auth user at cap is deleted on /api/me
**Given** 10 profiles; token uid `"uid-orphan"` with no profile
**When** `GET /api/me`
**Then** status `403`, `{"error":"The household is full (10 users)."}`; `deleteUser("uid-orphan")` was called once

### AC14: Login screen before Home
**Given** Firebase Auth current user is `null`
**When** `App` renders
**Then** a heading with accessible name `Sign in` is shown; the text `Budgets` (home title) is **not** shown; there are textboxes labelled `Email` and `Password` and `Display name`; buttons `Sign in` and `Register`

### AC15: Sign in success shows Home
**Given** the login screen; mocked Auth `signInWithEmailAndPassword` resolves; `GET /api/me` returns alice’s profile; `GET /api/budgets` returns `{ "budgets": [] }`
**When** the user enters email `alice@example.com`, password `secret12`, and clicks `Sign in`
**Then** the home title `Budgets` is shown; a button `Sign out` is shown; the heading `Sign in` is gone

### AC16: Sign in failure
**Given** mocked `signInWithEmailAndPassword` rejects
**When** the user clicks `Sign in` with any email and password
**Then** a `.field-error` shows `Could not sign in.`; home is not shown

### AC17: Register from the login screen
**Given** mocked `createUserWithEmailAndPassword` resolves with uid `"uid-alice"`; `POST /api/register` returns 201
**When** the user fills Email `alice@example.com`, Password `secret12`, Display name `Alice`, and clicks `Register`
**Then** `POST /api/register` is called with JSON body `{"displayName":"Alice"}` and a Bearer token; afterwards Home `Budgets` is shown

### AC18: Register at cap from the login screen
**Given** `POST /api/register` returns `403` with `{"error":"The household is full (10 users)."}`
**When** the user clicks `Register` with valid fields
**Then** a `.field-error` shows `The household is full (10 users).`; home is not shown

### AC19: Sign out returns to login
**Given** alice is signed in and Home is visible
**When** the user clicks `Sign out`
**Then** Firebase `signOut` is called; the `Sign in` heading is shown; `Budgets` is not shown

### AC20: canListSummary — hidden stranger
**Given** actor bob, not moderator; budget `ownerId` alice, `visibility` `"hidden"`, `grants` `[]`
**When** `canListSummary(bob, budget)`
**Then** the return is `false`

### AC21: canListSummary — public stranger
**Given** actor bob, not moderator; budget `visibility` `"public"`, `grants` `[]`, owner alice
**When** `canListSummary(bob, budget)`
**Then** the return is `true`

### AC22: canListSummary — see grant on hidden
**Given** actor bob; hidden budget with `grants: [{ userId: "uid-bob", role: "see" }]`
**When** `canListSummary(bob, budget)`
**Then** the return is `true`

### AC23: canRead — see grant
**Given** the budget from AC22
**When** `canRead(bob, budget)`
**Then** the return is `false`

### AC24: canRead — browse grant
**Given** bob grant `browse`
**When** `canRead(bob, budget)`
**Then** the return is `true`

### AC25: canRead — public without grant
**Given** public budget, no grant to bob
**When** `canRead(bob, budget)`
**Then** the return is `false`

### AC26: canWrite — edit yes, browse no, owner yes
**Given** three budgets: owner alice; bob `edit`; bob `browse`
**When** `canWrite` is called for alice on hers, bob on edit, bob on browse
**Then** the returns are `true`, `true`, `false`

### AC27: canDelete — owner and moderator only
**Given** alice owner; bob `edit`; moderator actor
**When** `canDelete` for alice, bob, moderator on alice’s budget
**Then** the returns are `true`, `false`, `true`

### AC28: canManageSharing — edit cannot
**Given** bob `edit` on alice’s budget
**When** `canManageSharing(bob, budget)`
**Then** the return is `false`

### AC29: canUseFromText — flag and moderator
**Given** alice `canUseFromText` `false` not moderator; bob `canUseFromText` `true`; mod `canUseFromText` `false` but `isModerator` `true`
**When** `canUseFromText` for alice, bob, mod
**Then** the returns are `false`, `true`, `true`

### AC30: GET /api/budgets filters by canListSummary
**Given** alice owns hidden `"Mine"`; bob owns public `"PublicOne"` with no grant to alice; carol owns hidden `"Secret"` with no grant to alice; dave owns hidden `"SharedSee"` with grant `see` to alice
**When** `GET /api/budgets` as alice
**Then** status `200`; `budgets` names are exactly `["Mine","PublicOne","SharedSee"]` (sorted); `Secret` is absent; `"PublicOne"` has `viewerRelation` `"public"`; `"SharedSee"` has `viewerRelation` `"see"`; `"Mine"` has `viewerRelation` `"owner"`; no object in the array contains keys `incomeEntries` or `grants`

### AC31: GET full budget forbidden for see and public
**Given** alice has `see` on hidden `"b-see"`; `"b-pub"` is public with no grant to alice
**When** `GET /api/budgets/b-see` then `GET /api/budgets/b-pub` as alice
**Then** both status `404` and body `{"error":"Not found."}`

### AC32: GET full budget allowed for browse
**Given** alice grant `browse` on `"b1"`
**When** `GET /api/budgets/b1` as alice
**Then** status `200` and JSON `id` is `"b1"` and `incomeCategories` is an array

### AC33: Owner sets visibility public
**Given** alice owns hidden `"b1"`
**When** `PATCH /api/budgets/b1/visibility` as alice with `{"visibility":"public"}`
**Then** status `200`; stored `visibility` is `"public"`; `GET /api/budgets` as bob includes `"b1"` with `viewerRelation` `"public"`

### AC34: Owner hides again
**Given** `"b1"` is public, no grants
**When** `PATCH /api/budgets/b1/visibility` as alice with `{"visibility":"hidden"}`
**Then** status `200`; `GET /api/budgets` as bob does not include `"b1"`

### AC35: Invalid visibility
**Given** alice owns `"b1"`
**When** `PATCH /api/budgets/b1/visibility` with `{"visibility":"secret"}`
**Then** status `400`, `{"error":"Invalid visibility."}`; stored visibility is unchanged

### AC36: Edit grant cannot change visibility
**Given** bob has `edit` on `"b1"`
**When** `PATCH /api/budgets/b1/visibility` as bob with `{"visibility":"public"}`
**Then** status `403`, `{"error":"Not allowed."}`; visibility is still `"hidden"`

### AC37: Stranger cannot change visibility (no leak)
**Given** hidden `"b1"` owned by alice, no grant to bob
**When** `PATCH /api/budgets/b1/visibility` as bob
**Then** status `404`, `{"error":"Not found."}`

### AC38: Owner grants see without making public
**Given** alice owns hidden `"b1"`; bob profile exists; grants `[]`
**When** `PUT /api/budgets/b1/grants` as alice with `{"grants":[{"userId":"uid-bob","role":"see"}]}`
**Then** status `200`; stored grants are exactly that array; `visibility` is still `"hidden"`; `GET /api/budgets` as bob includes `"b1"` with `viewerRelation` `"see"`; `GET /api/budgets/b1` as bob is `404` `Not found.`

### AC39: Grant browse then edit
**Given** `"b1"` hidden, bob exists
**When** alice `PUT` grants `browse` for bob, then `PUT` grants `edit` for bob
**Then** both `200`; final grants are `[{ "userId": "uid-bob", "role": "edit" }]`; `canWrite(bob)` is `true`

### AC40: Clear grants
**Given** bob had `edit` on hidden `"b1"`
**When** alice `PUT /api/budgets/b1/grants` with `{"grants":[]}`
**Then** status `200`; `GET /api/budgets` as bob does not include `"b1"`

### AC41: Reject grant to owner
**Given** alice owns `"b1"`
**When** `PUT` grants `[{"userId":"uid-alice","role":"edit"}]`
**Then** status `400`, `{"error":"Invalid grant."}`; stored grants still `[]`

### AC42: Reject grant to unknown user
**Given** alice owns `"b1"`
**When** `PUT` grants `[{"userId":"uid-nobody","role":"see"}]`
**Then** status `400`, `{"error":"Invalid grant."}`

### AC43: Reject duplicate userId in grants
**Given** alice owns `"b1"`; bob exists
**When** `PUT` grants two entries both `userId` `"uid-bob"`
**Then** status `400`, `{"error":"Invalid grant."}`

### AC44: Reject invalid role
**Given** alice owns `"b1"`; bob exists
**When** `PUT` grants `[{"userId":"uid-bob","role":"owner"}]`
**Then** status `400`, `{"error":"Invalid grant."}`

### AC45: Edit cannot PUT grants
**Given** bob `edit` on `"b1"`
**When** bob `PUT /api/budgets/b1/grants` with `{"grants":[]}`
**Then** status `403`, `{"error":"Not allowed."}`; grants unchanged

### AC46: Moderator can set grants and visibility on another’s budget
**Given** alice owns hidden `"b1"`; bob exists; actor is moderator
**When** moderator `PATCH` visibility `"public"` then `PUT` grants see for bob
**Then** both `200`; stored visibility `"public"`; grants include bob `see`

### AC47: Moderator lists users
**Given** profiles alice and moderator
**When** `GET /api/admin/users` as moderator
**Then** status `200`; `users` length `2`; each item has `canUseFromText` and `email`

### AC48: Non-moderator cannot list admin users
**Given** alice is not moderator
**When** `GET /api/admin/users` as alice
**Then** status `403`, `{"error":"Not allowed."}`

### AC49: Moderator toggles From-text flag
**Given** alice `canUseFromText` `false`
**When** moderator `PATCH /api/admin/users/uid-alice` with `{"canUseFromText":true}`
**Then** status `200`; alice’s stored `canUseFromText` is `true`

### AC50: Alice cannot toggle her own From-text flag
**Given** alice is not moderator
**When** alice `PATCH /api/admin/users/uid-alice` with `{"canUseFromText":true}`
**Then** status `403`, `{"error":"Not allowed."}`; flag remains `false`

### AC51: Suggest rejected without From-text flag
**Given** alice `canUseFromText` `false`, not moderator; alice owns `"b1"`
**When** `POST /api/suggest-entries` as alice with valid body including `"budgetId":"b1"`
**Then** status `403`, `{"error":"From text is not allowed."}`; Gemini SDK is not called

### AC52: Suggest rejected without write even with flag
**Given** bob `canUseFromText` `true` and grant `browse` on `"b1"`
**When** `POST /api/suggest-entries` as bob with `"budgetId":"b1"`
**Then** status `403`, `{"error":"Not allowed."}`; Gemini SDK is not called

### AC53: Suggest rejected as see (no leak vs write)
**Given** bob `canUseFromText` `true` and grant `see` on `"b1"`
**When** `POST /api/suggest-entries` as bob with `"budgetId":"b1"`
**Then** status `404`, `{"error":"Not found."}`

### AC54: Suggest allowed for editor with flag
**Given** bob `canUseFromText` `true`, grant `edit` on `"b1"`, `GEMINI_API_KEY` set, Gemini mocked to `{ "items": [] }`
**When** `POST /api/suggest-entries` as bob with `"budgetId":"b1"` and otherwise valid body
**Then** status `200` and Gemini SDK is called once

### AC55: Suggest allowed for moderator without stored flag
**Given** moderator `canUseFromText` stored `false`; moderator can write `"b1"`; key set; Gemini mocked
**When** `POST /api/suggest-entries` as moderator with `"budgetId":"b1"`
**Then** status `200` and Gemini SDK is called once

### AC56: From-text tab hidden without permission
**Given** alice `canUseFromText` `false`, not moderator, owner of the open budget
**When** the budget screen renders
**Then** the tab labels are exactly `Categories`, `Income`, `Expenses`, `Report` (no `From text`)

### AC57: From-text tab shown with permission
**Given** alice `canUseFromText` `true`, owner of the open budget
**When** the budget screen renders
**Then** the tab labels in order are exactly `Categories`, `Income`, `Expenses`, `Report`, `From text`

### AC58: Sharing UI on own budget
**Given** alice owns the open budget; `GET /api/users` returns alice and bob
**When** the budget screen renders for the owner
**Then** there is a control labelled `Visibility` with options `Hidden` and `Public`; there is a heading `Sharing`; bob can be assigned role `See`, `Browse`, or `Edit` or `None`

### AC59: Sharing UI hidden for edit grant
**Given** bob has `edit` and the budget is open
**When** the budget screen renders
**Then** there is no control labelled `Visibility` and no heading `Sharing`

### AC60: Moderator panel
**Given** the signed-in user is moderator
**When** Home renders
**Then** a heading `Household` is shown with the user list (emails) and a checkbox labelled `From text` per non-self row (or including self); when 10 profiles exist, text `Sign-up is full (10 users).` is shown

### AC61: Moderator panel hidden for ordinary user
**Given** alice is not moderator
**When** Home renders
**Then** there is no heading `Household`

### AC62: Store dump gone
**Given** any token or none
**When** `GET /api/store` or `PUT /api/store`
**Then** status `404` and body `{"error":"Not found."}`

### AC63: GET /api/users for picker
**Given** profiles alice (`displayName` `"Alice"`) and bob (`"Bob"`)
**When** `GET /api/users` as alice
**Then** status `200`; `users` is `[{ "id":"uid-alice", "email":"alice@example.com", "displayName":"Alice" }, { "id":"uid-bob", "email":"bob@example.com", "displayName":"Bob" }]` (sorted); no `canUseFromText` key

### AC64: Client never uses Firestore data SDK
**Given** the client source under `src/ui` and `src/main.tsx` / `src/App.tsx`
**When** those files are inspected
**Then** they do not import `firebase/firestore` or `getFirestore`; they may import `firebase/auth`

## Files to Modify

| File | Change |
|---|---|
| `src/types.ts` | `UserProfile`, `Grant`, `Visibility`, `BudgetSummary`; add `ownerId`, `visibility`, `grants` on `Budget`. |
| `src/acl.ts` | New: `canListSummary`, `canRead`, `canWrite`, `canManageSharing`, `canDelete`, `canUseFromText`, `isModeratorEmail`. |
| `src/acl.test.ts` | AC20–AC29 (and matrix extras). |
| `src/httpDispatch.ts` | Token gate; routes in API contracts; remove `/api/store`; suggest checks. |
| `src/httpDispatch.test.ts` | AC1–AC13, AC30–AC55, AC62–AC63. |
| `src/server.ts` / `vite.config.ts` | Pass Admin Auth/Firestore deps and `MODERATOR_EMAIL` into dispatch. |
| `src/firebaseAdmin.ts` | New: Admin init (emulator-aware); `verifyIdToken`; `deleteUser`. |
| `src/ui/LoginScreen.tsx` | New: AC14, AC16–AC18 fields and errors. |
| `src/ui/LoginScreen.test.tsx` | AC14, AC16–AC18. |
| `src/App.tsx` | Gate on Auth; sign-out; load `/api/me` and budgets. |
| `src/App.test.tsx` | AC14–AC19. |
| `src/ui/HomeScreen.tsx` | Sign out already in App; moderator panel AC60–AC61. |
| `src/ui/HomeScreen.test.tsx` | AC60–AC61. |
| `src/ui/BudgetScreen.tsx` | Sharing UI AC58–AC59; From-text tab AC56–AC57. |
| `src/ui/BudgetScreen.test.tsx` | AC56–AC59. |
| `src/ui/FromTextTab.tsx` | Include `budgetId` in POST body. |
| `src/clientStore.ts` | Per-budget fetch with Bearer token; no `/api/store`. |
| `.env.example` | `MODERATOR_EMAIL=`, `FIREBASE_WEB_API_KEY=`, `FIREBASE_WEB_AUTH_DOMAIN=`, `FIREBASE_WEB_PROJECT_ID=` (no secrets). |
| `package.json` | `firebase` (client Auth), `firebase-admin`. |
| `specs/ui-ux.md` | Login, sharing, moderator panel (when implementing). |

## Risk Assessment

- **What could break:** Existing `/api/store` and From-text tests that omit `budgetId` and auth. A Firebase user created in the client before a failed register must be deleted or the cap can be bypassed with orphan Auth users.
- **Rollback:** Revert this spec’s files; do not restore unauthenticated `PUT /api/store` in production.
- **Dependencies:** Firebase Auth + Admin; `MODERATOR_EMAIL`; persistence repository for profiles and grants.

## Testing Strategy (MANDATORY)

| Function | Case | Given | When | Then | Mocks |
|----------|------|-------|------|------|-------|
| dispatchHttpRequest | AC1 config | three env vars | GET `/api/config` | exact JSON | none |
| dispatchHttpRequest | AC2 config missing | empty apiKey | GET `/api/config` | 503 missing config | none |
| dispatchHttpRequest | AC3 health | no token | GET `/api/health` | `{"ok":true}` | none |
| dispatchHttpRequest | AC4 no token | no header | GET `/api/me` | 401 Sign in required. | none |
| dispatchHttpRequest | AC5 bad token | Bearer junk | GET `/api/me` | 401 | verifyIdToken fail |
| dispatchHttpRequest | AC6 register | 0 profiles | POST register Alice | 201 trimmed name | Admin Auth |
| dispatchHttpRequest | AC7 empty name | 0 profiles | displayName spaces | 400 Display name is required. | Admin Auth |
| dispatchHttpRequest | AC8 cap | 10 profiles | register 11th | 403; deleteUser | deleteUser mock |
| dispatchHttpRequest | AC9 idempotent | existing alice | register Other | 200 Alice | fake repo |
| dispatchHttpRequest | AC10 moderator | MOD email | register Mod@ | isModerator true | fake repo |
| dispatchHttpRequest | AC11 me | alice profile | GET `/api/me` | 200 | fake repo |
| dispatchHttpRequest | AC12 me no profile | 0 profiles | GET `/api/me` | 403 Register first. | fake repo |
| dispatchHttpRequest | AC13 orphan | 10 + orphan token | GET `/api/me` | 403 full; deleteUser | deleteUser mock |
| App / LoginScreen | AC14 gate | auth null | render | Sign in, not Budgets | Auth mock |
| App | AC15 sign in | me + empty budgets | click Sign in | Budgets + Sign out | Auth + fetch |
| LoginScreen | AC16 fail | signIn rejects | click Sign in | Could not sign in. | Auth mock |
| LoginScreen | AC17 register UI | createUser + 201 | click Register | POST body displayName | fetch mock |
| LoginScreen | AC18 cap UI | register 403 full | click Register | exact error | fetch mock |
| App | AC19 sign out | signed in | Sign out | Sign in heading | Auth mock |
| canListSummary | AC20 hidden | bob, hidden | helper | false | none |
| canListSummary | AC21 public | bob, public | helper | true | none |
| canListSummary | AC22 see | bob see | helper | true | none |
| canRead | AC23 see | bob see | helper | false | none |
| canRead | AC24 browse | bob browse | helper | true | none |
| canRead | AC25 public | no grant | helper | false | none |
| canWrite | AC26 | owner/edit/browse | helper | true/true/false | none |
| canDelete | AC27 | owner/edit/mod | helper | true/false/true | none |
| canManageSharing | AC28 | bob edit | helper | false | none |
| canUseFromText | AC29 | flag/mod | helper | false/true/true | none |
| dispatchHttpRequest | AC30 list | mixed budgets | GET `/api/budgets` | three names | fake repo |
| dispatchHttpRequest | AC31 get deny | see + public | GET by id | 404 Not found. | fake repo |
| dispatchHttpRequest | AC32 get browse | browse | GET by id | 200 | fake repo |
| dispatchHttpRequest | AC33 public | hidden | PATCH public | bob lists it | fake repo |
| dispatchHttpRequest | AC34 hide | public | PATCH hidden | bob list omits | fake repo |
| dispatchHttpRequest | AC35 bad vis | owner | PATCH secret | 400 | fake repo |
| dispatchHttpRequest | AC36 edit vis | bob edit | PATCH public | 403 | fake repo |
| dispatchHttpRequest | AC37 stranger vis | bob none | PATCH | 404 | fake repo |
| dispatchHttpRequest | AC38 grant see | hidden | PUT see | list yes, get 404 | fake repo |
| dispatchHttpRequest | AC39 browse→edit | hidden | two PUTs | edit write | fake repo |
| dispatchHttpRequest | AC40 clear | had edit | PUT [] | bob list omits | fake repo |
| dispatchHttpRequest | AC41 grant owner | alice | PUT self | 400 | fake repo |
| dispatchHttpRequest | AC42 unknown uid | alice | PUT nobody | 400 | fake repo |
| dispatchHttpRequest | AC43 dup | alice | PUT two bob | 400 | fake repo |
| dispatchHttpRequest | AC44 role | alice | PUT owner | 400 | fake repo |
| dispatchHttpRequest | AC45 edit grants | bob edit | PUT [] | 403 | fake repo |
| dispatchHttpRequest | AC46 mod sharing | mod | PATCH+PUT | 200 | fake repo |
| dispatchHttpRequest | AC47 admin list | mod | GET admin/users | length 2 | fake repo |
| dispatchHttpRequest | AC48 admin deny | alice | GET admin/users | 403 | fake repo |
| dispatchHttpRequest | AC49 flag on | mod | PATCH alice true | stored true | fake repo |
| dispatchHttpRequest | AC50 self flag | alice | PATCH self | 403 | fake repo |
| dispatchHttpRequest | AC51 suggest flag | no flag | POST suggest | 403 From text is not allowed. | gemini unused |
| dispatchHttpRequest | AC52 suggest browse | flag+browse | POST suggest | 403 Not allowed. | gemini unused |
| dispatchHttpRequest | AC53 suggest see | flag+see | POST suggest | 404 | gemini unused |
| dispatchHttpRequest | AC54 suggest edit | flag+edit | POST suggest | 200 SDK called | gemini mock |
| dispatchHttpRequest | AC55 suggest mod | mod flag false | POST suggest | 200 SDK called | gemini mock |
| BudgetScreen | AC56 hide tab | no flag | render | four tabs | none |
| BudgetScreen | AC57 show tab | flag | render | five tabs | none |
| BudgetScreen | AC58 sharing | owner | render | Visibility + Sharing | users fetch |
| BudgetScreen | AC59 no sharing | edit | render | no Visibility | none |
| HomeScreen | AC60 mod panel | moderator | render | Household + full text if 10 | none |
| HomeScreen | AC61 no panel | alice | render | no Household | none |
| dispatchHttpRequest | AC62 no store | any | GET/PUT `/api/store` | 404 | none |
| dispatchHttpRequest | AC63 directory | alice+bob | GET `/api/users` | sorted, no flag | fake repo |
| grep / source | AC64 no client FS | src/ui App | inspect | no firestore import | none |

### Coverage Target

- Minimum: 80% of `acl.ts` and auth/sharing branches in `httpDispatch.ts`
- Critical paths: 100% of the ACL table cells; register cap + `deleteUser`; every grant role × get/list/visibility/grants/suggest

### Test Data

- `uid-alice` / `alice@example.com` / displayName `Alice`
- `uid-bob` / `bob@example.com` / `Bob`
- `uid-mod` / `mod@example.com` with `MODERATOR_EMAIL=mod@example.com`
- Fake profile/budget maps; mock `verifyIdToken` and `deleteUser`; do not call live Firebase

## Related Documentation

- **Tier 1:** [specs/PRD.md](../PRD.md), [specs/architecture.md](../architecture.md), [specs/tech-stack.md](../tech-stack.md)
- **Features:** [persistence.md](persistence.md), [budget-lifecycle.md](budget-lifecycle.md), [from-text.md](from-text.md)
- **UI:** [specs/ui-ux.md](../ui-ux.md)
- **Patterns:** Bearer token on Node; Admin SDK only writer; no client Firestore data SDK

## Spec Readiness checklist

- [x] Every AC has a precise expected value — no "works correctly"
- [x] Another person could write a test from each AC without asking
- [x] Every AC can fail — one that cannot fail proves nothing
- [x] Error and edge cases have ACs of their own
- [x] Every AC appears in the testing strategy table
