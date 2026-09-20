# Feature: Session-bound API and agent-tool access

## Overview

- **Status:** Done
- **Created:** 2026-09-20
- **Affected Subsystems:** HTTP adapter, ACL, in-memory repo, From-text / agent tools — see [auth-accounts.md](auth-accounts.md), [persistence.md](persistence.md)

## Problem Statement

Budget data must stay private to the signed-in household member. A missing UI control, a model “I cannot help” string, or a `userId` field in JSON is not authorization. Identity must come from a **verified server session** (Firebase ID token). Agent tools and HTTP handlers must share the same deny rules. Tool arguments must be validated. Runs must be bounded by step count, wall time, and request size. Tests use synthetic UIDs and must not print secrets.

## Current Behavior

`dispatchHttpRequest` verifies `Authorization: Bearer` and builds an actor from `verifyIdToken` plus the profile. Per-budget routes and `POST /api/suggest-entries` use `canRead` / `canWrite` / `canUseFromText`. There is **no** `/api/agent/run`, **no** per-user agent memory, **no** request-size cap, and **no** step/time bound. `MemoryRepo.getBudgetDoc` returns any document; only `getBudget(repo, actor, id)` applies ACL. Tool-shaped callers could pass `userId` / `ownerId` in the body; handlers must ignore those for identity.

## Proposed Change

1. Shared `decideBudgetAccess(actor, budget, action)` — the only way HTTP and tools allow read/write/delete/share.
2. Actor is `actorFromVerifiedSession(uid, profile, isModerator)` from the token. Request JSON `userId`, `ownerId`, `uid`, `email`, `isModerator` never become the actor.
3. `POST /api/agent/run` executes an allowlisted tool list with the session actor. Tools: `get_budget`, `save_budget`, `remember`, `recall`.
4. Agent memory is keyed by **session uid** only; Bob cannot recall Alice’s keys.
5. Caps: request body `MAX_REQUEST_BYTES` (65536), `AGENT_MAX_STEPS` (8), `AGENT_MAX_MS` (5000).
6. Responses never include `GEMINI_API_KEY` or the Bearer token. Deny bodies stay `{ "error": "<fixed string>" }` (or per-step the same `error` field).

## Acceptance Criteria

### AC1: Anonymous cannot GET another user’s budget
**Given** MemoryRepo has hidden budget `"b1"` owned by `"uid-alice"`; no `Authorization` header
**When** `GET /api/budgets/b1`
**Then** status `401`, body exactly `{"error":"Sign in required."}`; `verifyIdToken` is not called

### AC2: Anonymous cannot PUT that budget
**Given** the same hidden `"b1"` with `expenseEntries` `[]`; no `Authorization`
**When** `PUT /api/budgets/b1` with a JSON body that adds one expense
**Then** status `401`, body `{"error":"Sign in required."}`; stored `expenseEntries` is still `[]`

### AC3: Anonymous cannot run agent tools
**Given** the same `"b1"`; no `Authorization`
**When** `POST /api/agent/run` with `{"steps":[{"tool":"get_budget","arguments":{"budgetId":"b1"}}]}`
**Then** status `401`, body `{"error":"Sign in required."}`; no step `value` is returned

### AC4: Bob cannot GET Alice’s hidden budget (API)
**Given** profiles alice and bob; hidden `"b1"` owner alice, `grants` `[]`; Bob’s Bearer token
**When** `GET /api/budgets/b1`
**Then** status `404`, body exactly `{"error":"Not found."}`; the body does not contain `"Summer"` or `"incomeEntries"`

### AC5: Bob cannot PUT Alice’s hidden budget (API)
**Given** `"b1"` as in AC4 with `expenseEntries` `[]`
**When** Bob `PUT /api/budgets/b1` with a changed `expenseEntries` array of length 1
**Then** status `404`, body `{"error":"Not found."}`; stored `expenseEntries` length is `0`

### AC6: Bob cannot read Alice’s budget through `get_budget` even if arguments claim Alice
**Given** AC4 data; Bob’s token
**When** `POST /api/agent/run` body `{"userId":"uid-alice","steps":[{"tool":"get_budget","arguments":{"budgetId":"b1","userId":"uid-alice","ownerId":"uid-alice"}}]}`
**Then** HTTP status `200`; `steps` length `1`; `steps[0].ok` is `false`; `steps[0].status` is `404`; `steps[0].error` is `Not found.`; `steps[0]` has no `value` key; body string does not include `Summer`

### AC7: Bob cannot change Alice’s budget through `save_budget`
**Given** AC4 data
**When** Bob `POST /api/agent/run` with tool `save_budget` arguments `{ "budgetId":"b1","userId":"uid-alice","expenseEntries":[{ "id":"e1","categoryId":"c1","comment":"hack","amountCents":1,"date":null }] }`
**Then** `steps[0].ok` is `false`; `steps[0].status` is `404`; `steps[0].error` is `Not found.`; stored `expenseEntries` length is `0`

### AC8: Create ignores body `ownerId`
**Given** Bob’s token and profile
**When** `POST /api/budgets` body `{"name":"Mine","ownerId":"uid-alice"}`
**Then** status `201`; stored `ownerId` is `"uid-bob"` (not `"uid-alice"`)

### AC9: Save ignores body `ownerId` (no transfer)
**Given** Alice owns `"b1"`
**When** Alice `PUT /api/budgets/b1` with `"ownerId":"uid-bob"` and otherwise the current document
**Then** status `200`; stored `ownerId` is still `"uid-alice"`

### AC10: `decideBudgetAccess` is the shared deny
**Given** actor bob, hidden budget owner alice, `grants` `[]`
**When** `decideBudgetAccess(bob, budget, "read")` then `"write"`
**Then** both `{ ok: false, status: 404, error: "Not found." }`
**Given** bob grant `browse`
**When** `"read"` then `"write"`
**Then** read `{ ok: true }`; write `{ ok: false, status: 403, error: "Not allowed." }`

### AC11: Invalid tool arguments
**Given** Alice’s token; she owns `"b1"`
**When** `POST /api/agent/run` with `{"steps":[{"tool":"get_budget","arguments":{"budgetId":1}}]}`
**Then** `steps[0].ok` is `false`; `steps[0].status` is `400`; `steps[0].error` is `Invalid tool arguments.`

### AC12: Step bound
**Given** Alice’s token
**When** `POST /api/agent/run` with `steps` length `9`, each `get_budget` `"b1"`
**Then** status `400`, body `{"error":"Too many steps."}`; `getBudgetDoc` / save is not used to mutate; `saveBudgetCalls` is unchanged from before the request

### AC13: Time bound
**Given** Alice’s token; `maxAgentMs` `5`; `nowMs` returns `0` then `10` then `20`
**When** `POST /api/agent/run` with two `remember` steps (keys `a` then `b`)
**Then** `steps[0].ok` is `true`; `steps[1].ok` is `false`; `steps[1].error` is `Time limit exceeded.`; `recall` of `b` as Alice is not found

### AC14: Request size bound
**Given** a body whose UTF-8 byte length is `65537`; `verifyIdToken` mock that throws if invoked
**When** `POST /api/agent/run` or `PUT /api/budgets/b1` with that body (token header may be present)
**Then** status `413`, body `{"error":"Request too large."}`; `verifyIdToken` is not called; repo `saveBudgetCalls` unchanged

### AC15: Memory is per session uid
**Given** Alice `remember` key `"note"` value `"alice-only"` succeeds
**When** Bob `recall` key `"note"` (same string)
**Then** Bob’s step `ok` is `false`, `status` `404`, `error` `Not found.`; Alice `recall` `"note"` returns value `"alice-only"`

### AC16: Secrets stay out of agent output
**Given** `geminiApiKey` `"secret-gemini-value"`; Alice `get_budget` on her `"b1"` named `"Summer"`
**When** `POST /api/agent/run` succeeds
**Then** the response `body` string does not include `secret-gemini-value` and does not include `Bearer alice`

### AC17: ACL is not a model refusal
**Given** Bob, hidden `"b1"` owner alice; `geminiCaller.generateJson` would return `"I cannot help with that."` if called
**When** Bob `POST /api/suggest-entries` with `"budgetId":"b1"` and valid suggest fields
**Then** status `404`, body exactly `{"error":"Not found."}`; `generateJson` is not called (the deny is the HTTP contract, not the model string)

## Files to Modify

| File | Change |
|---|---|
| `src/serverAccess.ts` | New: `MAX_REQUEST_BYTES`, `AGENT_MAX_STEPS`, `AGENT_MAX_MS`, `decideBudgetAccess`, `actorFromVerifiedSession`, `redactSecrets`. |
| `src/agentMemory.ts` | New: per-uid `remember` / `recall`. |
| `src/agentTools.ts` | New: validate args; `executeAgentRun` using session actor + `decideBudgetAccess`. |
| `src/repo.ts` | `getBudget` / `saveWritableBudget` / delete / sharing use `decideBudgetAccess`. |
| `src/httpDispatch.ts` | Size cap first; `POST /api/agent/run`; suggest uses shared write check; ignore body identity fields. |
| `src/server.ts` | Stop reading the body after `MAX_REQUEST_BYTES`; pass a process-wide `AgentMemoryStore`. |
| `src/sessionBoundAccess.test.ts` | New: AC1–AC17 with synthetic alice/bob. |
| `src/serverAccess.test.ts` | AC10 helper cases. |

## Risk

- **What could break:** Existing suggest/ACL tests if deny strings change; large legitimate PUT of a budget with many rows hitting 64KiB (household MVP rows stay small).
- **Rollback:** Delete the new files and the `/api/agent/run` branch; restore `httpDispatch` size check.
- **Dependencies:** Same fake `verifyIdToken` as auth tests; no live Firebase, no live Gemini.

## Testing Strategy (MANDATORY)

| Function | Case | Given | When | Then | Mocks |
|----------|------|-------|------|------|-------|
| dispatchHttpRequest | AC1 anon GET | hidden b1 | GET no header | 401 Sign in required. | verify not called |
| dispatchHttpRequest | AC2 anon PUT | hidden b1 | PUT expense | 401; entries [] | fake repo |
| dispatchHttpRequest | AC3 anon agent | hidden b1 | POST agent/run | 401 | fake repo |
| dispatchHttpRequest | AC4 Bob GET | hidden alice | GET as bob | 404 exact JSON | tokens bob |
| dispatchHttpRequest | AC5 Bob PUT | hidden alice | PUT as bob | 404; unchanged | tokens bob |
| executeAgentRun | AC6 Bob get_budget | claimed userId alice | run as bob | step 404; no value | tokens bob |
| executeAgentRun | AC7 Bob save_budget | claimed userId alice | run as bob | step 404; unchanged | tokens bob |
| dispatchHttpRequest | AC8 create owner | bob token | POST ownerId alice | ownerId bob | fake repo |
| dispatchHttpRequest | AC9 no transfer | alice owner | PUT ownerId bob | ownerId alice | fake repo |
| decideBudgetAccess | AC10 matrix | bob hidden / browse | read/write | 404 / 403 | none |
| executeAgentRun | AC11 bad args | budgetId number | run | step 400 | alice token |
| dispatchHttpRequest | AC12 steps | 9 steps | POST run | 400 Too many steps. | alice |
| executeAgentRun | AC13 time | two remember | clock jump | second Time limit exceeded. | nowMs |
| dispatchHttpRequest | AC14 size | 65537 bytes | POST/PUT | 413; verify unused | throwing verify |
| AgentMemoryStore | AC15 memory | alice remember | bob recall | 404; alice sees value | none |
| dispatchHttpRequest | AC16 secrets | key secret-gemini-value | get_budget | body omits secret | alice |
| dispatchHttpRequest | AC17 not refusal | bob suggest | POST suggest | 404; caller unused | gemini mock |

### Coverage target

- Minimum: 80% of `serverAccess.ts`, `agentTools.ts`, `agentMemory.ts`
- Critical: 100% of AC1–AC7 and AC17 (anonymous + cross-user API and tools)

### Test data

- Alice `uid-alice` / Bob `uid-bob` (synthetic; not real emails in live Auth)
- Budget id `b1`, name `Summer`
- `geminiApiKey` `secret-gemini-value` in tests only; assert it is absent from output

## Related Documentation

- **Tier 1:** [specs/architecture.md](../architecture.md)
- **Features:** [auth-accounts.md](auth-accounts.md), [from-text.md](from-text.md), [persistence.md](persistence.md)
- **Patterns:** Bearer on Node; UI hide ≠ ACL; model text ≠ ACL

## Spec Readiness checklist

- [x] Every AC has a precise expected value
- [x] Another person could write a test from each AC without asking
- [x] Every AC can fail
- [x] Error and edge cases have ACs of their own
- [x] Every AC appears in the testing strategy table
