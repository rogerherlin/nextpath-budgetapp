# Feature: Node HTTP server (no Vite)

Status: Done

## Problem Statement

`npm start` only runs the Vite dev server. There is no command that serves the built UI and the existing `/api/store` and `/api/suggest-entries` routes from a Node `http` server, which is what a local “production” run and a later container/Cloud Run process need.

## Proposed Change

Add `src/httpDispatch.ts` (pure request routing, testable without listen) and `src/server.ts` (Node `http.createServer`, listen). After `vite build`, `npm run serve` listens on `PORT` (default `8080`) and serves `dist/` plus the same store and Gemini behaviour as the Vite plugin. No Express. Vite remains for `npm start` and `npm run build`.

## Acceptance Criteria

### AC1: GET /api/store
**Given** `loadStore` would return `{ ok: true, value: { version: 1, budgets: [] } }`
**When** `dispatchHttpRequest` is called with `method` `"GET"` and `pathname` `"/api/store"`
**Then** the result `status` is `200`, `Content-Type` is `application/json`, and `body` is exactly `{"version":1,"budgets":[]}`

### AC2: GET /api/store load failure
**Given** `loadStore` would return `{ ok: false, error: "Could not read budgets.json." }`
**When** `dispatchHttpRequest` is called with `method` `"GET"` and `pathname` `"/api/store"`
**Then** the result `status` is `500` and `body` is exactly `{"error":"Could not read budgets.json."}`

### AC3: PUT /api/store valid
**Given** a writable store path
**When** `dispatchHttpRequest` is called with `method` `"PUT"`, `pathname` `"/api/store"`, and `body` `{"version":1,"budgets":[]}`
**Then** the result `status` is `200` and `body` is exactly `{"version":1,"budgets":[]}` and the store file contains that JSON

### AC4: PUT /api/store invalid
**Given** any store path
**When** `dispatchHttpRequest` is called with `method` `"PUT"`, `pathname` `"/api/store"`, and `body` `{}`
**Then** the result `status` is `400` and `body` is exactly `{"error":"Invalid store."}` and the store file is not written

### AC5: POST /api/suggest-entries missing key
**Given** `geminiApiKey` `""`
**When** `dispatchHttpRequest` is called with `method` `"POST"`, `pathname` `"/api/suggest-entries"`, and a valid suggest JSON body
**Then** the result `status` is `503` and `body` is exactly `{"error":"Gemini API key is missing."}`

### AC6: Serve index.html for GET /
**Given** `distDir` contains `index.html` with contents `<!doctype html>ok`
**When** `dispatchHttpRequest` is called with `method` `"GET"` and `pathname` `"/"`
**Then** the result `status` is `200`, `Content-Type` is `text/html; charset=utf-8`, and `body` is `<!doctype html>ok`

### AC7: Missing UI build
**Given** `distDir` does not exist
**When** `dispatchHttpRequest` is called with `method` `"GET"` and `pathname` `"/"`
**Then** the result `status` is `503` and `body` is exactly `{"error":"UI build is missing. Run npm run build."}`

### AC8: Reject path traversal
**Given** `distDir` contains only `index.html`
**When** `dispatchHttpRequest` is called with `method` `"GET"` and `pathname` `"/../package.json"`
**Then** the result `status` is `404` and `body` is exactly `{"error":"Not found."}`

### AC9: Default listen port
**Given** `process.env.PORT` is unset
**When** `listenPort()` is called
**Then** the return value is `8080`

### AC10: PORT env
**Given** `process.env.PORT` is `"3000"`
**When** `listenPort()` is called
**Then** the return value is `3000`

## Files to Modify

| File | Change |
|---|---|
| `src/httpDispatch.ts` | Route `/api/store`, `/api/suggest-entries`, and `dist/` files |
| `src/httpDispatch.test.ts` | Named tests for AC1–AC10 |
| `src/server.ts` | `http.createServer` + listen; load `GEMINI_API_KEY` from the environment |
| `src/envFile.ts` | Read `.env` into `process.env` if a key is not already set (do not write `.env`) |
| `vite.config.ts` | Call the same dispatch for API routes |
| `package.json` | `"build": "vite build"`, `"serve": "tsx src/server.ts"`; add `tsx` |
| `specs/architecture.md` | Note optional Node serve path |
| `specs/tech-stack.md` | Document `build` / `serve` |

## Risk

- What could break: Vite plugin behaviour if dispatch differs; serving files outside `dist/` if path join is wrong.
- Rollback: delete server files and scripts; restore the Vite plugin body.

## Testing Strategy (MANDATORY)

| Function | Case | Given | When | Then |
|---|---|---|---|---|
| `dispatchHttpRequest` | AC1 | empty store load ok | GET `/api/store` | 200 `{"version":1,"budgets":[]}` |
| `dispatchHttpRequest` | AC2 | load error | GET `/api/store` | 500 exact error JSON |
| `dispatchHttpRequest` | AC3 | valid PUT body | PUT `/api/store` | 200 and file written |
| `dispatchHttpRequest` | AC4 | `{}` | PUT `/api/store` | 400, no write |
| `dispatchHttpRequest` | AC5 | empty API key | POST suggest | 503 missing key |
| `dispatchHttpRequest` | AC6 | dist with index.html | GET `/` | 200 html |
| `dispatchHttpRequest` | AC7 | missing dist | GET `/` | 503 build missing |
| `dispatchHttpRequest` | AC8 | traversal URL | GET `/../package.json` | 404 |
| `listenPort` | AC9 | PORT unset | call | `8080` |
| `listenPort` | AC10 | PORT `3000` | call | `3000` |

## Spec Readiness checklist

- [x] Every AC has a precise expected value — no "works correctly"
- [x] Another person could write a test from each AC without asking
- [x] Every AC can fail — one that cannot fail proves nothing
- [x] Error and edge cases have ACs of their own
- [x] Every AC appears in the testing strategy table
