# Persistence modes

The backend owns all data access. Browser code always reads archive records from
`GET /api/archive`; it never reads a static archive snapshot and never connects
to Firestore directly. Admin writes and JSON backups also use the selected
backend datastore through the API.

## Local file mode

`DATA_STORE=file` is the default for local Node and Docker Compose development.
In this mode:

- `data/archive.json` is the archive store and the initial Firestore seed/reference source.
- `data/submissions.json` is private local-development storage and a Firestore migration source.
- `ARCHIVE_JSON_PATH` and `SUBMISSIONS_JSON_PATH` may override those paths.

Neither file is copied into the public frontend build. These JSON files are not
durable production storage on Cloud Run.

## Production Firestore mode

Set `DATA_STORE=firestore` and `GOOGLE_CLOUD_PROJECT` for the backend. The
`archive` collection contains the six category documents (`history`, `stories`,
`structures`, `beliefs`, `music`, and `gallery`), each with an `items` array.
The `submissions` collection stores one private submission per document.

Firestore is authoritative whenever `DATA_STORE=firestore`. The process uses
Application Default Credentials: a developer ADC login locally, or the attached
Cloud Run service identity in production. The application does not load or need
a service-account key file.

## Runtime source of truth

- Production: Firestore → Express → `GET /api/archive` → public pages.
- Local file mode: `data/archive.json` → Express → `GET /api/archive` → public pages.
- Admin: `GET` and protected `PUT /api/archive` use the same selected datastore.
- Backups: protected export endpoints read the same selected datastore.
- Static frontend: contains no authoritative archive dataset and has no stale
  JSON fallback. An API failure is shown as unavailable to the visitor.

## Explicit migration

Validate the JSON sources without contacting Firestore:

```text
npm run migrate:firestore -- --dry-run
```

Migrate once after configuring ADC and `GOOGLE_CLOUD_PROJECT`:

```text
npm run migrate:firestore -- --apply
```

The command refuses to replace existing archive documents. Use `--force` only
with `--apply`, and only after deliberately confirming that the JSON archive
should replace Firestore. Running the command without either `--dry-run` or
`--apply` fails without connecting to Firestore.
Submission IDs are preserved and existing IDs are skipped, so reruns do not
silently duplicate visitor records. The source JSON files are never deleted.

## Editorial draft persistence (admin/editorial panel)

Separate from everything above: `EDITORIAL_DATA_STORE` selects where
**editorial drafts/proposals** (created via `/api/admin/editorial/drafts`)
are held. This is purely administrative staging — see
`backend/admin/editorialStore.js`'s header — and is never the source for
`GET /api/v2/...` or any public page; a draft cannot become visible to the
public no matter what this variable is set to.

**Explicit restart-persistence contract:**

| `EDITORIAL_DATA_STORE` | Where drafts live | Survives a backend restart/redeploy? | Intended for |
|---|---|---|---|
| `memory` (default) | The Node process's RAM | **No — every draft is lost.** | Local development and tests only. |
| `firestore` | A dedicated `editorialDrafts` Firestore collection, via the same ADC/service-account credentials the `firestore` `DATA_STORE` mode already uses — no new secret, no new project. | **Yes.** | Production. |

The admin dashboard (`GET /api/admin/editorial/dashboard`) reports the active
mode as `editorialStoreName`, and the panel UI shows it plainly (e.g.
"Editorial Storage: Memory (Temporary)") so an editor is never left assuming
durability the current deployment doesn't provide.

**Enabling durable storage in production** requires only setting
`EDITORIAL_DATA_STORE=firestore` on the `antiochia-archive-backend` Cloud Run
service (a deploy-time env var change) — the attached service account already
holds `roles/datastore.user` at the project level (the same role that lets
`DATA_STORE=firestore` read/write the `archive`/`submissions` collections
today), and Firestore IAM has no per-collection scoping, so no IAM change is
needed. This is a deliberate operator action, not a default.
