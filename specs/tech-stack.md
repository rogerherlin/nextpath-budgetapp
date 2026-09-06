# Tech stack (MVP)

## Choice

| Piece | Choice | Why |
|---|---|---|
| Language | TypeScript, `strict`, ES modules, no `any` | Matches AGENTS.md |
| UI | React 19 + Vite 5 | Fast refresh, one HTML page, enough for two screens; Vite 5 runs on Node 18 |
| Tests | Vitest 2 | `npm test` = `vitest run` |
| Typecheck | `tsc --noEmit` | AGENTS.md |
| Run | `npm start` = `vite` | One dev server |
| Persistence | Node `fs` via a Vite plugin, file `data/budgets.json` | Same origin, no extra process, no picker |
| UI tests later | Vitest + `jsdom` | No browser runner until needed |

No Next.js, no Electron/Tauri, no database, no CSS framework, no form library, no state library. Styling: one `src/styles.css`.

## Commands

- `npm test` — Vitest, `passWithNoTests: true` until the first spec test exists.
- `npx tsc --noEmit` — project references none; include `src` and Vite env types.
- `npm start` — Vite on default port 5173.

## Layout on disk

```
index.html
vite.config.ts          # React plugin + /api/store middleware + Vitest
tsconfig.json
tsconfig.node.json      # vite.config.ts
package.json
data/.gitkeep           # budgets.json created at runtime; gitignore the JSON
src/main.tsx
src/App.tsx
src/vite-env.d.ts
```

Domain files from feature specs are added during TDD, not in the empty scaffold.

## Persistence adapter (when implemented)

`vite.config.ts` middleware: `GET`/`PUT` `/api/store`. PUT body is the full `StoreFile`. Root path: `join(process.cwd(), "data", "budgets.json")`.

## Libraries we will not add for MVP

Express, React Router, Redux, Tailwind, date-fns, decimal.js (integer cents instead), i18n, auth SDKs, charts.
