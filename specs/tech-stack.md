# Tech stack

## Choice

| Piece | Choice | Why |
|---|---|---|
| Language | TypeScript, `strict`, ES modules, no `any` | Matches AGENTS.md |
| UI | React 19 + Vite 5 | Fast refresh; two screens + login; Vite 5 on Node 18 |
| Tests | Vitest 2 | `npm test` = `vitest run` |
| Typecheck | `tsc --noEmit` | AGENTS.md |
| Run (dev) | `npm start` = Vite + API middleware; Firebase **Auth + Firestore emulators** | Same Admin SDK as prod |
| Run (prod-like) | `npm run build` then `npm run serve` = Node `http` on `PORT` or 8080 | Cloud Run shape (`0.0.0.0`) |
| Auth | Firebase Auth email/password: **client Auth SDK** in the browser; **Admin SDK** token verify on Node | Identity without rolling our own passwords |
| Persistence | Firestore Native via **Firebase Admin SDK** on Node only | Shared store for Cloud Run; no ephemeral container disk |
| Firestore rules | Deny all client `read`/`write` | Admin SDK is the only writer |
| From-text LLM | `@google/generative-ai`, model `gemini-3.6-flash` | Called only from Node |
| Secrets (local) | gitignored `.env`: `GEMINI_API_KEY`, `MODERATOR_EMAIL`, emulator hosts; public Firebase web config via `/api/config` or non-secret env | Key must not ship in the client bundle |
| Secrets (Cloud Run) | Secret Manager → env (`GEMINI_API_KEY`, `MODERATOR_EMAIL`); runtime SA + ADC for Firestore | No JSON key in the image; do not `COPY` `.env` |
| Container | One Dockerfile: `dist/` + Node `/api` | Same origin; GCR/Artifact Registry stores the image; **Cloud Run** serves it |
| UI tests | Vitest + `jsdom` | Login gate and grant-based actions without a browser runner |

No Next.js, no Electron/Tauri, no Express, no CSS framework, no form library, no Redux, no client Firestore data SDK. Styling: one `src/styles.css`. File `data/budgets.json` is legacy / one-shot migration, not the production adapter.

## Commands

- `npm test` — Vitest.
- `npx tsc --noEmit` — include `src` and Vite env types.
- `npm start` — Vite on default port 5173; point Admin SDK at emulators (`FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`).
- `npm run build` — Vite writes `dist/`.
- `npm run serve` — Node `src/server.ts` (tsx) on `PORT` or 8080; needs `dist/`.
- `firebase emulators:start` — Auth + Firestore for local/dev (when wired).
- `docker build --platform=linux/amd64 -t budgetapp:local .` — production image; see [runbooks/cloud-run.md](runbooks/cloud-run.md).

## Layout on disk (target additions)

```
index.html
vite.config.ts          # React plugin + /api via dispatchHttpRequest + Vitest
src/server.ts           # Node http server for npm run serve / Cloud Run
src/httpDispatch.ts     # Auth-gated API + static dist/; no unauthenticated /api/store
Dockerfile              # Multi-stage: vite build then npm run serve
.dockerignore           # .env, data/budgets.json, credentials, node_modules, .git
cloudbuild.yaml         # linux/amd64 image → Artifact Registry
specs/runbooks/cloud-run.md
.env.example            # GEMINI_API_KEY, MODERATOR_EMAIL, public Firebase web config placeholders
tsconfig.json
package.json
src/main.tsx
src/App.tsx
```

`Dockerfile` + `.dockerignore` (exclude `.env`, `data/budgets.json`, credentials) + `cloudbuild.yaml`. Operator steps: [specs/runbooks/cloud-run.md](runbooks/cloud-run.md). Prefer `GET /api/config` for public `apiKey` / `authDomain` / `projectId` so one image works across emulator and prod.

## HTTP (target)

All `/api/*` except health and public config require `Authorization: Bearer <Firebase ID token>`.

| Method | Path | Role |
|---|---|---|
| GET | `/api/config` | Public Firebase web config |
| POST | `/api/register` or first-login profile | Enforce max 10 profiles |
| GET | `/api/me` | Current profile |
| GET | `/api/budgets` | Summaries the viewer may list |
| GET/POST/PATCH/DELETE | `/api/budgets/:id` | Full doc / mutate / delete per ACL |
| | grant/visibility endpoints | Owner or moderator |
| POST | `/api/suggest-entries` | `canUseFromText` (or moderator) **and** `canWrite` |
| GET/PATCH | `/api/admin/users` | Moderator: list, From-text flag |

`GET`/`PUT` `/api/store` are **removed**. PUT body is never the full catalog.

## Libraries we will not add

Express, React Router, Redux, Tailwind, date-fns, decimal.js (integer cents), i18n, charts, client Firestore for documents.

## Libraries we will add (with the auth/persistence specs)

Firebase JS **Auth** (client), Firebase **Admin** (server), Firestore through Admin only. Emulator Suite for local.
