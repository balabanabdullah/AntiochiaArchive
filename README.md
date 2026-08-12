# AntiochiaArchive

AntiochiaArchive is a multilingual digital cultural-memory archive for
Antioch/Antakya. It uses vanilla HTML, CSS, and JavaScript with a Vite multi-page
build, an Express API, Nginx, and Google Cloud Firestore in production.

## Architecture

The browser uses same-origin `/api/*` requests. Nginx proxies those requests to
the Express backend; the browser never talks to Firestore directly. Public
collection cards always load from `GET /api/archive`. A deterministic post-build
step generates crawlable `/archive/{slug}/` pages from the reviewed local release
snapshot in `data/archive.json`.

- Production datastore: `DATA_STORE=firestore` with Cloud Run service identity.
- Local/offline datastore: `DATA_STORE=file`, using `data/archive.json` and
  `data/submissions.json` through the API.
- Administration: environment/Secret Manager `ADMIN_TOKEN`, sent only as a
  bearer header and stored by the browser only in `sessionStorage`.

## Local setup

Requirements: Node.js 20.19 or later.

```powershell
npm.cmd ci
Push-Location backend
npm.cmd ci
Pop-Location
Copy-Item backend/.env.example backend/.env
npm.cmd run dev
```

Run the backend separately from `backend/` with `npm.cmd start`. Vite proxies
`/api` and `/health` to `http://localhost:5000` by default.

## Docker

```powershell
docker compose config
docker compose up antiochia-archive-web antiochia-archive-backend --build
```

The production-like Nginx frontend is available with the
`antiochia-archive-nginx` service on port 8080. Compose deliberately defaults to
file mode; file mode is not durable Cloud Run storage.

## Validation and build

```powershell
npm.cmd test
npm.cmd run validate:seo
npm.cmd run validate:archive-source
npm.cmd run build
Push-Location backend
npm.cmd test
Pop-Location
```

The build emits hashed CSS/JS, all MPA pages, a real 404 page, and one static
detail page for every archive record. Build output is confined to ignored
`dist/` and does not mutate tracked source data.

## Deployment overview

The production frontend and backend are separate Cloud Run services in
`europe-west1`. The frontend receives `BACKEND_UPSTREAM`; the backend receives
`DATA_STORE=firestore`, project configuration, its service account, and secrets
through Cloud Run/Secret Manager. See [V1-RELEASE.md](V1-RELEASE.md) for the
release, backup, controlled archive synchronization, and rollback procedure.

Never commit `.env`, service-account keys, administrator tokens, submission
backups, or the ignored `image-staging/` research directory.
