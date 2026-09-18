# Architecture (MVP)

## Goal

The smallest structure that can ship the PRD: one local process, one JSON file, pure domain logic, a thin UI. No accounts. The only outbound cloud call is Gemini, proxied through the same Vite process so the API key never reaches the browser.

## Shape

```
Browser UI  →  /api/store (same origin)  →  data/budgets.json
     ↑         →  /api/suggest-entries     →  Gemini gemini-3.6-flash
  React views        load / save whole file     (API key only on Node)
     ↑
  src/*.ts pure functions (money, names, budgets, categories, entries, report, suggest)
```

Two screens only: **Home** (list) and **Budget** (header + five tabs). No client router library: `currentBudgetId: string | null` in React state.

## Layers

1. **Domain** — Types (`Budget`, `Category`, `Entry`, `DateParts`, `StoreFile`) and pure functions. No `window`, no `fs`. Return `{ ok: true, value } | { ok: false, error: string }` with the spec’s exact `error` strings. Mutators take the in-memory store and return a new store (or mutate a single working copy in tests — either is fine if tests stay deterministic). Ids: opaque strings (`crypto.randomUUID()` at the UI/store edge, injectable in tests).
2. **Store** — `loadStore` / `saveStore` read and write the entire `{ version: 1, budgets: [] }` document. Every successful domain mutation is followed by save. Path is fixed: `data/budgets.json` under the app working directory (the “app data folder” for this MVP).
3. **HTTP adapter** — Shared `dispatchHttpRequest`: `GET`/`PUT` `/api/store` and `POST` `/api/suggest-entries`. Wired in Vite middleware (`npm start`) and in `src/server.ts` (`npm run build` then `npm run serve`). Gemini key is read from the environment / `.env` on Node only. The UI never touches the filesystem and never sees the key.
4. **UI** — Calls domain functions, then PUT. From-text `Apply` calls `applySuggestedItems` (add category/entry only), then persist. Confirmations are `window.confirm` with the spec’s exact messages.

## Data isolation

Each `Budget` owns its arrays. Copy deep-clones and remaps ids. Functions that accept `budgetId` only change that object.

## Non-goals (out of this architecture)

Auth, sync, file pickers, per-budget files, background jobs, caches, Redux, charts, PDF.

## Failure

Corrupt `budgets.json`: load returns `{ ok: false, error: "Could not read budgets.json." }` and does not write. Missing file: create `{"version":1,"budgets":[]}`.
