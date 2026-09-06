# Architecture (MVP)

## Goal

The smallest structure that can ship the PRD: one local process, one JSON file, pure domain logic, a thin UI. No accounts, no cloud, no extra services.

## Shape

```
Browser UI  →  /api/store (same origin)  →  data/budgets.json
     ↑                    ↑
  React views        load / save whole file
     ↑
  src/*.ts pure functions (money, names, budgets, categories, entries, report)
```

Two screens only: **Home** (list) and **Budget** (header + four tabs). No client router library: `currentBudgetId: string | null` in React state.

## Layers

1. **Domain** — Types (`Budget`, `Category`, `Entry`, `DateParts`, `StoreFile`) and pure functions. No `window`, no `fs`. Return `{ ok: true, value } | { ok: false, error: string }` with the spec’s exact `error` strings. Mutators take the in-memory store and return a new store (or mutate a single working copy in tests — either is fine if tests stay deterministic). Ids: opaque strings (`crypto.randomUUID()` at the UI/store edge, injectable in tests).
2. **Store** — `loadStore` / `saveStore` read and write the entire `{ version: 1, budgets: [] }` document. Every successful domain mutation is followed by save. Path is fixed: `data/budgets.json` under the app working directory (the “app data folder” for this MVP).
3. **HTTP adapter** — Vite middleware: `GET /api/store` and `PUT /api/store` with the JSON body. The UI never touches the filesystem.
4. **UI** — Calls domain functions, then PUT. Confirmations are `window.confirm` with the spec’s exact messages.

## Data isolation

Each `Budget` owns its arrays. Copy deep-clones and remaps ids. Functions that accept `budgetId` only change that object.

## Non-goals (out of this architecture)

Auth, sync, file pickers, per-budget files, background jobs, caches, Redux, a separate production API server, charts, PDF.

## Failure

Corrupt `budgets.json`: load returns `{ ok: false, error: "Could not read budgets.json." }` and does not write. Missing file: create `{"version":1,"budgets":[]}`.
