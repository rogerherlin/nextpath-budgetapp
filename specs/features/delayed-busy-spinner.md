# Feature: Delayed busy spinner

## Overview
- **Status:** Done
- **Created:** 2026-09-20
- **Affected subsystems:** Browser UI, client HTTP

## Problem Statement

Browser calls to the Node API (and Firebase Auth) can take seconds. The MVP UI shows no busy state, so a long Suggest or hydrate looks like a dead click. Users asked for a **visible spinner on every client network call**, shown only **after a short delay** so fast round-trips do not flicker.

## Current Behavior

`specs/ui-ux.md` says MVP may ignore spinners. Client modules call `fetch` directly. `FromTextTab` does not track in-flight Suggest. `App` shows a blank `<main />` or the login form while Auth/hydrate is pending. `src/styles.css` has no spinner animation.

## Proposed Change

One in-flight counter for all browser network work. After **400ms** of continuous in-flight work, show a fixed overlay with a teal CSS spinner and status text `Loading.`. When the last call finishes (success or failure), hide the overlay immediately. Fast calls that finish before 400ms never show it. Overlapping calls do not restart the delay.

## Acceptance Criteria

### AC1: Fast call does not show the spinner
**Given** `BusyOverlay` is mounted and no work is in flight
**When** `clientFetch` starts and the mocked `fetch` resolves in 0ms, then 399ms elapse
**Then** `document.querySelector(".busy-overlay")` is `null`

### AC2: Slow call shows spinner after 400ms
**Given** `BusyOverlay` is mounted and a `clientFetch` promise is still unresolved
**When** 400ms elapse
**Then** an element with class `busy-overlay` is in the document; it contains an element with class `spinner`; a `status` role with text exactly `Loading.` is present

### AC3: Overlay hides when the last call finishes
**Given** the overlay from AC2 is visible
**When** that `fetch` resolves
**Then** `document.querySelector(".busy-overlay")` is `null`

### AC4: Overlapping calls do not restart the delay
**Given** call A has been in flight for 400ms (overlay visible)
**When** call B starts at that moment and call A then resolves while B is still in flight
**Then** `document.querySelector(".busy-overlay")` is still present (no second 400ms wait)

### AC5: Failed fetch still clears busy
**Given** `BusyOverlay` is mounted and `clientFetch` is in flight for 400ms (overlay visible)
**When** the mocked `fetch` rejects
**Then** `document.querySelector(".busy-overlay")` is `null`

### AC6: Browser HTTP goes through `clientFetch`
**Given** the client source files `src/App.tsx`, `src/authClient.ts`, `src/clientStore.ts`, `src/ui/LoginScreen.tsx`, `src/ui/BudgetScreen.tsx`, `src/ui/FromTextTab.tsx`
**When** each file is read
**Then** none of them contains the substring `fetch(`; each file that previously called `fetch` imports `clientFetch` from `src/clientFetch.ts` (or `../clientFetch`)

### AC7: Auth credential calls increment the same counter
**Given** `BusyOverlay` is mounted
**When** `signInWithPassword` is invoked and the Firebase Auth promise stays unresolved for 400ms
**Then** `.busy-overlay` is present; when that promise resolves, `.busy-overlay` is `null`

## Files to Modify

| File | Change |
|------|--------|
| `specs/ui-ux.md` | Feedback: delayed spinner for client network work (400ms) |
| `src/busy.ts` | In-flight counter, `BUSY_SPINNER_DELAY_MS` `400`, `trackBusy`, subscribe |
| `src/clientFetch.ts` | `clientFetch` wraps `globalThis.fetch` with `trackBusy` |
| `src/ui/BusyOverlay.tsx` | Overlay after delay while counter > 0 |
| `src/App.tsx` | Render `BusyOverlay`; use `clientFetch` |
| `src/authClient.ts` | `clientFetch` for `/api/config`; `trackBusy` on sign-in, register, sign-out |
| `src/clientStore.ts` | `clientFetch` |
| `src/ui/LoginScreen.tsx` | `clientFetch` |
| `src/ui/BudgetScreen.tsx` | `clientFetch` |
| `src/ui/FromTextTab.tsx` | `clientFetch` |
| `src/styles.css` | `.busy-overlay`, `.spinner` |
| `src/busy.test.tsx` | AC1–AC5, AC7 |
| `src/clientFetch.test.ts` | AC6 source scan |

## Risk Assessment
- **What could break:** Tests that hang `fetch` longer than 400ms may see extra `Loading.` in the document; fake timers in other suites if we leak them; persist PUTs in a loop keep the overlay up for a long hydrate.
- **Rollback:** Revert this feature’s files; restore direct `fetch`.
- **Dependencies:** None beyond existing client `fetch` and Firebase Auth.

## Testing Strategy (MANDATORY)

### Unit Tests

| Function | Test Case | Given | When | Then | Mocks |
|----------|-----------|-------|------|------|-------|
| BusyOverlay + clientFetch | AC1 fast | overlay mounted | fetch resolves immediately; advance 399ms | no `.busy-overlay` | fake timers, stub fetch |
| BusyOverlay + clientFetch | AC2 slow | overlay mounted | fetch pending; advance 400ms | overlay, `.spinner`, status `Loading.` | fake timers, hanging fetch |
| BusyOverlay + clientFetch | AC3 hide | AC2 visible | resolve fetch | overlay gone | fake timers |
| BusyOverlay + clientFetch | AC4 overlap | A visible 400ms | start B, resolve A | overlay still present | fake timers |
| BusyOverlay + clientFetch | AC5 reject | overlay visible | reject fetch | overlay gone | fake timers |
| client source | AC6 scan | listed files | read text | no `fetch(`; `clientFetch` imported | fs |
| BusyOverlay + signIn | AC7 auth | overlay mounted | hanging Auth sign-in 400ms then resolve | overlay then gone | fake timers, mock firebase/auth |

### Integration Tests

| Scenario | Method | Input | Expected Output | Status Code |
|----------|--------|-------|-----------------|-------------|
| n/a | — | Client-only overlay | — | — |

### E2E Tests

| User Journey | Steps | Expected Outcome |
|-------------|-------|------------------|
| n/a for this feature | Overlay proven in jsdom with fake timers | — |

### Coverage Target
- Minimum: 80% of `src/busy.ts`, `src/clientFetch.ts`, `src/ui/BusyOverlay.tsx`
- Critical paths: AC1–AC5 100%

### Test Data
- Hanging `fetch` via deferred `Promise`
- `BUSY_SPINNER_DELAY_MS` is exactly `400`

## Related Documentation
- **Tier 1:** [specs/ui-ux.md](../ui-ux.md), [specs/architecture.md](../architecture.md)
- **Tier 2:** [specs/service-readiness.md](../service-readiness.md) (AC-L1–L3; this feature uses a delayed spinner, not immediate `Loading.` text on Auth bootstrap)
- **Tier 3:** none
- **Patterns:** Bearer `fetch` from the browser to `/api/*` only

## Spec Readiness checklist
- [x] Every AC has Given/When/Then with a precise expected value
- [x] Files to modify are listed with specific changes
- [x] Risk assessment identifies what could break
- [x] Testing strategy is comprehensive (unit + integration + E2E)
- [x] Every functional requirement has corresponding test case(s)
- [x] Error conditions and edge cases are covered in tests
- [x] Coverage target is defined
- [x] Related Documentation links
- [x] Spec is grounded in existing docs
