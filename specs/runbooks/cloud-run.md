# Cloud Run runbook

One container serves the Vite `dist/` UI and the Node `/api` from `src/server.ts`. Artifact Registry stores the image; **Cloud Run** is the process that answers HTTPS. Pushing an image and stopping there does not make the app reachable.

Firebase web config is **not** baked into the bundle. Cloud Run sets `FIREBASE_WEB_API_KEY`, `FIREBASE_WEB_AUTH_DOMAIN`, and `FIREBASE_WEB_PROJECT_ID`; the browser loads them from `GET /api/config`.

## Artifact Registry

Prefer Artifact Registry over `gcr.io` (GCR is only a store, and Google is winding it down).

Create a Docker repository once:

```text
gcloud artifacts repositories create budgetapp \
  --repository-format=docker \
  --location=REGION \
  --project=PROJECT_ID
```

Image tag shape: `REGION-docker.pkg.dev/PROJECT_ID/budgetapp/budgetapp`

Build and push (linux/amd64, required if you build on Apple Silicon):

```text
gcloud builds submit --config=cloudbuild.yaml --project=PROJECT_ID
```

Or locally:

```text
docker build --platform=linux/amd64 -t REGION-docker.pkg.dev/PROJECT_ID/budgetapp/budgetapp .
docker push REGION-docker.pkg.dev/PROJECT_ID/budgetapp/budgetapp
```

GCR equivalent if you must: `gcr.io/PROJECT_ID/budgetapp` then `gcloud run deploy --image gcr.io/PROJECT_ID/budgetapp`.

## Runtime service account

Do not put a service-account JSON in the image. Cloud Run uses Application Default Credentials of the **runtime** service account.

```text
gcloud iam service-accounts create budgetapp-run \
  --display-name="BudgetApp Cloud Run" \
  --project=PROJECT_ID
```

Grant:

- `roles/datastore.user` — Firestore reads/writes via Admin SDK
- `roles/secretmanager.secretAccessor` — Secret Manager env
- `roles/firebaseauth.admin` — Admin Auth `verifyIdToken` plus `deleteUser` when the 10-profile cap rejects a sign-up

```text
PROJECT_NUMBER=$(gcloud projects describe PROJECT_ID --format='value(projectNumber)')
SA=budgetapp-run@PROJECT_ID.iam.gserviceaccount.com

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:${SA}" \
  --role=roles/datastore.user

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:${SA}" \
  --role=roles/secretmanager.secretAccessor

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:${SA}" \
  --role=roles/firebaseauth.admin
```

## Secret Manager

Create secrets (values never in git or the image):

```text
printf '%s' 'YOUR_GEMINI_KEY' | gcloud secrets create gemini-api-key --data-file=-
printf '%s' 'moderator@example.com' | gcloud secrets create moderator-email --data-file=-
```

The Cloud Run SA must be able to access those secret versions (`roles/secretmanager.secretAccessor` above). Map them at deploy time with `--set-secrets`.

## Cloud Run

Public Firebase web config is ordinary env (not secret). `--allow-unauthenticated` exposes the **UI**; every `/api/*` except `/api/health` and `/api/config` still requires a Firebase ID token.

```text
gcloud run deploy budgetapp \
  --image=REGION-docker.pkg.dev/PROJECT_ID/budgetapp/budgetapp \
  --region=REGION \
  --project=PROJECT_ID \
  --allow-unauthenticated \
  --service-account=budgetapp-run@PROJECT_ID.iam.gserviceaccount.com \
  --set-secrets=GEMINI_API_KEY=gemini-api-key:latest,MODERATOR_EMAIL=moderator-email:latest \
  --set-env-vars=FIREBASE_WEB_API_KEY=WEB_API_KEY,FIREBASE_WEB_AUTH_DOMAIN=PROJECT_ID.firebaseapp.com,FIREBASE_WEB_PROJECT_ID=PROJECT_ID
```

Cloud Run injects `PORT` (default listen in-app is 8080) and `GOOGLE_CLOUD_PROJECT`. Health is TCP on `PORT`; `GET /api/health` returns `{"ok":true}`.

Rotate `MODERATOR_EMAIL` by adding a new secret version and redeploying (or updating the secret mapping). A typo locks the moderator out.

## Firebase authorized domains

In Firebase console → Authentication → Settings → **Authorized domains**, add the Cloud Run host (`SERVICE-HASH-REGION.a.run.app` or your mapped domain). The Auth `authDomain` stays `PROJECT_ID.firebaseapp.com`; the Cloud Run origin is only an authorized domain.

Enable Email/password. Deploy `firestore.rules` (`allow read, write: if false`) so only the Admin SDK writes data.

## Local Docker vs emulators

Day-to-day local development does not use Docker. Use:

```text
firebase emulators:start
```

Auth on `127.0.0.1:9099`, Firestore on `127.0.0.1:8085` (see `firebase.json`), then `npm start` with `.env`:

```text
FIRESTORE_EMULATOR_HOST=127.0.0.1:8085
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
```

Optional: `npm run build` && `PORT=8080 npm run serve` on the host against the same emulators.

**Docker against production Firebase** (real project, ADC or no emulator hosts):

```text
docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -e GEMINI_API_KEY=… \
  -e MODERATOR_EMAIL=… \
  -e FIREBASE_WEB_API_KEY=… \
  -e FIREBASE_WEB_AUTH_DOMAIN=… \
  -e FIREBASE_WEB_PROJECT_ID=… \
  -e GOOGLE_CLOUD_PROJECT=PROJECT_ID \
  REGION-docker.pkg.dev/PROJECT_ID/budgetapp/budgetapp
```

Pass credentials via the environment or a mounted ADC file **outside** the image. Never `COPY` `.env`.

**Docker against emulators** (emulators on the host):

```text
docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -e FIRESTORE_EMULATOR_HOST=host.docker.internal:8085 \
  -e FIREBASE_AUTH_EMULATOR_HOST=host.docker.internal:9099 \
  -e FIREBASE_WEB_API_KEY=fake \
  -e FIREBASE_WEB_AUTH_DOMAIN=localhost \
  -e FIREBASE_WEB_PROJECT_ID=demo-budgetapp \
  --add-host=host.docker.internal:host-gateway \
  budgetapp:local
```

On Linux, `--add-host=host.docker.internal:host-gateway` is required so `host.docker.internal` reaches the emulator ports. Do not point a Cloud Run service at emulators.
