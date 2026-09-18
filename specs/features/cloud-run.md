# Feature: Docker image and Cloud Run deploy

Status: Done

## Problem Statement

The Node process already listens on `PORT` / `0.0.0.0` and serves `dist/` plus `/api`. There is no container definition or operator runbook, so the app cannot be built as `linux/amd64`, pushed to Artifact Registry, or run on Cloud Run with Secret Manager and a dedicated runtime service account.

## Proposed Change

Add a multi-stage Dockerfile (Vite build, then `npm run serve`), a `.dockerignore` that keeps secrets and the JSON catalog out of the image, a Cloud Build file that tags Artifact Registry, and a runbook covering Artifact Registry, Cloud Run, Secret Manager, the runtime SA, Firebase authorized domains, and local Docker vs emulators.

Firebase web config stays runtime env (`FIREBASE_WEB_*` → `GET /api/config`). Do not bake `VITE_*` or `.env` into the image.

## Acceptance Criteria

### AC1: Multi-stage Dockerfile
**Given** the repository root `Dockerfile`
**When** the file is read
**Then** it contains a build stage named `builder` that runs `npm ci` and `npm run build`, a later `FROM` runtime stage, `COPY --from=builder` of `/app/dist` to `./dist`, a `COPY` of `src` into the runtime image, `EXPOSE 8080`, and a `CMD` that is exactly `["npm","run","serve"]`

### AC2: Image does not bake secrets
**Given** the repository root `Dockerfile`
**When** the file is read
**Then** it does not contain the substring `COPY .env`, does not contain `GEMINI_API_KEY=`, does not contain `MODERATOR_EMAIL=`, and does not contain `service-account` or `GOOGLE_APPLICATION_CREDENTIALS`

### AC3: .dockerignore excludes secrets and catalog
**Given** the repository root `.dockerignore`
**When** its non-comment lines are collected
**Then** the set includes `.env`, `node_modules`, `.git`, and `data/budgets.json`

### AC4: Cloud Build tags Artifact Registry
**Given** the repository root `cloudbuild.yaml`
**When** the file is read
**Then** it contains `--platform=linux/amd64` and the image substitution value contains `docker.pkg.dev/` and `/budgetapp`

### AC5: Runbook names Artifact Registry and Cloud Run
**Given** `specs/runbooks/cloud-run.md`
**When** the file is read
**Then** it contains `REGION-docker.pkg.dev/`, `gcloud run deploy`, and `--allow-unauthenticated`

### AC6: Runbook names Secret Manager mappings
**Given** `specs/runbooks/cloud-run.md`
**When** the file is read
**Then** it contains `Secret Manager`, `GEMINI_API_KEY`, `MODERATOR_EMAIL`, and `--set-secrets`

### AC7: Runbook names runtime SA roles
**Given** `specs/runbooks/cloud-run.md`
**When** the file is read
**Then** it contains `roles/datastore.user`, `roles/secretmanager.secretAccessor`, and `roles/firebaseauth.admin`

### AC8: Runbook names Firebase authorized domains and public web config env
**Given** `specs/runbooks/cloud-run.md`
**When** the file is read
**Then** it contains `Authorized domains`, `.run.app`, `FIREBASE_WEB_API_KEY`, `FIREBASE_WEB_AUTH_DOMAIN`, and `FIREBASE_WEB_PROJECT_ID`

### AC9: Runbook distinguishes local Docker from emulators
**Given** `specs/runbooks/cloud-run.md`
**When** the file is read
**Then** it contains `firebase emulators:start`, `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `host.docker.internal`, and the sentence `Day-to-day local development does not use Docker.`

### AC10: tsx is a production dependency
**Given** `package.json`
**When** `dependencies` and `devDependencies` are read
**Then** `tsx` is listed under `dependencies` (so `npm ci --omit=dev` can still `npm run serve`)

## Files to Modify

| File | Change |
|---|---|
| `Dockerfile` | Multi-stage Node image; serve `dist/` + `src/` with `tsx` |
| `.dockerignore` | Exclude `.env`, git, `node_modules`, `data/budgets.json`, credential files |
| `cloudbuild.yaml` | `linux/amd64` build tagged for Artifact Registry |
| `specs/runbooks/cloud-run.md` | Operator steps: registry, Cloud Run, secrets, SA, Auth domains, local Docker vs emulators |
| `package.json` | Move `tsx` to `dependencies` |
| `src/cloudRun.test.ts` | Named tests for AC1–AC10 |
| `specs/tech-stack.md` | Point at Dockerfile and runbook |
| `specs/architecture.md` | Note Cloud Run container |
| `.env.example` | Already documents Cloud Run secret names; leave aligned |

## Risk

- What could break: a fat image if `.dockerignore` is wrong; leaking `.env` if `COPY .` is used without ignore; Cloud Run crash if `tsx` stays dev-only; Auth login fail if `.run.app` is not an authorized domain.
- Rollback: delete Dockerfile, `.dockerignore`, `cloudbuild.yaml`, and the runbook; move `tsx` back to `devDependencies`.

## Testing Strategy (MANDATORY)

| Function | Case | Given | When | Then |
|---|---|---|---|---|
| Dockerfile text | AC1 stages | repo root | read Dockerfile | builder `npm ci`/`build`, runtime copies dist+src, EXPOSE 8080, CMD npm run serve |
| Dockerfile text | AC2 no secrets | repo root | read Dockerfile | no COPY .env, no baked Gemini/moderator/SA |
| .dockerignore | AC3 | repo root | parse lines | `.env`, `node_modules`, `.git`, `data/budgets.json` |
| cloudbuild.yaml | AC4 | repo root | read yaml | linux/amd64 and docker.pkg.dev budgetapp image |
| runbook | AC5 | specs/runbooks/cloud-run.md | read | Artifact Registry + gcloud run deploy |
| runbook | AC6 | same | read | Secret Manager + GEMINI_API_KEY + MODERATOR_EMAIL |
| runbook | AC7 | same | read | three IAM roles |
| runbook | AC8 | same | read | authorized domains + FIREBASE_WEB_* |
| runbook | AC9 | same | read | emulators vs Docker notes |
| package.json | AC10 | package.json | parse | tsx in dependencies |

## Spec Readiness checklist

- [x] Every AC has a precise expected value — no "works correctly"
- [x] Another person could write a test from each AC without asking
- [x] Every AC can fail — one that cannot fail proves nothing
- [x] Error and edge cases have ACs of their own
- [x] Every AC appears in the testing strategy table
