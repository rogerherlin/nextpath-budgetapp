# Architecture

## Goal

The structure that ships the PRD: Firebase Auth in the browser, a Node API as the only writer to Firestore, pure domain + ACL helpers, a thin UI. Gemini stays on Node. The browser never holds `GEMINI_API_KEY` and never uses the Firestore client SDK for data.

## Shape (target)

```
Browser UI (Auth SDK)  →  Authorization: Bearer <ID token>
     ↑                      /api/*  (same origin)
  Login | Home | Budget
     ↑
  session cache of allowed budgets
                            Cloud Run / Vite Node / src/server.ts
                              → Firebase Auth (verify token)
                              → Firestore Admin SDK (users, budgets)
                              → Gemini gemini-3.6-flash (if canUseFromText)
                            Secrets: .env locally; Secret Manager on Cloud Run
```

Screens: **Login** (register / sign-in / sign-out), **Home** (filtered list), **Budget** (header + tabs; read-only when browse). No client router library: screen state in React (`unauthenticated` | home | `currentBudgetId`).

## Layers

1. **Domain** — Types (`UserProfile`, `Budget` with `ownerId`, `visibility`, `grants`, plus `Category`, `Entry`, `DateParts`) and pure functions. No `window`, no `fs`, no Firebase SDK. Result type `{ ok: true, value } | { ok: false, error: string }` with spec error strings. Mutators take a budget (or the caller’s owned subset) and return a new value. **ACL helpers** (unit-tested): `canListSummary`, `canRead`, `canWrite`, `canDelete`, `canUseFromText`. Ids: opaque strings (`crypto.randomUUID()` at the API/store edge, injectable in tests). Budget name uniqueness is **scoped to `ownerId`**.
2. **Repository** — Interface: `listBudgetSummaries(viewer)`, `getBudget(viewer, id)` (full document only if browse/edit/owner/moderator), `create` / `update` / `delete` per budget, `setVisibility`, `setGrants`, `listUsers` / `setCanUseFromText` (moderator). **Production and local emulators:** Firestore via Firebase Admin SDK (`users/{uid}`, `budgets/{id}`). **Unit tests:** optional in-memory or file-backed fake; not a second production path. Security Rules: `allow read, write: if false`.
3. **HTTP adapter** — Shared `dispatchHttpRequest`. Verify Bearer token on every `/api/*` except health and public Firebase web config. **Delete** unauthenticated `GET`/`PUT` `/api/store`. Routes (UID + moderator from `MODERATOR_EMAIL`): register / first-login profile (max 10), `GET /api/me`, `GET /api/budgets` (summaries), per-budget CRUD, grant/visibility, `POST /api/suggest-entries` (`canUseFromText` **and** `canWrite`), moderator user list and From-text flag. Persist **per mutation**. Gemini key from env only.
4. **UI** — Login gate before Home. Home badges (yours / public / shared); hide Open/Copy/Delete when the grant does not allow it. Budget: read-only for browse; hide From text unless allowed. Sharing UI on own budgets. Moderator panel: users, From-text allow, sign-up cap. In-memory `resetStore` / revision hook remain a **session cache** of budgets the viewer may have, refreshed after each API call.

## Data isolation

Each `Budget` owns its arrays. Copy deep-clones, remaps ids, sets `ownerId` to the copier, `visibility: "hidden"`, `grants: []`. Functions that accept `budgetId` only change that object **after** ACL succeeds.

## Current code vs this architecture

Until the auth/persistence slices land, the running app still uses `GET`/`PUT` `/api/store` and `data/budgets.json`. That path **cannot coexist** with per-user ACL (a logged-in client could overwrite everyone else’s data). Specs and later TDD replace it; do not add accounts on top of whole-store PUT.

## Non-goals (out of this architecture)

Client Firestore writes, Express, React Router, Redux, per-user Gemini keys, background jobs, file pickers, one JSON catalog as production storage.

## Failure

- Missing/invalid token: `401`.
- ACL deny: `403` with a fixed error string (to be named in the auth/persistence feature spec).
- Profile cap: register/first-login fails; no orphan Auth user.
- Firestore unavailable: API error; do not fall back to `budgets.json` in production.
- One-shot migration of `data/budgets.json`: assign those budgets to the moderator, then stop using the file.
