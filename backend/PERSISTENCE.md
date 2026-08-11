# Persistence modes

The backend owns all data access. Browser code continues to use the existing
`/api/*` routes and never connects to Firestore directly.

## Local file mode

`DATA_STORE=file` is the default for local Node and Docker Compose development.
In this mode:

- `public/archive.json` is the archive store and the initial Firestore seed/reference source.
- `data/submissions.json` is private local-development storage and a Firestore migration source.
- `ARCHIVE_JSON_PATH` and `SUBMISSIONS_JSON_PATH` may override those paths.

These JSON files are not durable production storage on Cloud Run.

## Production Firestore mode

Set `DATA_STORE=firestore` and `GOOGLE_CLOUD_PROJECT` for the backend. The
`archive` collection contains the six category documents (`history`, `stories`,
`structures`, `beliefs`, `music`, and `gallery`), each with an `items` array.
The `submissions` collection stores one private submission per document.

Firestore is authoritative whenever `DATA_STORE=firestore`. The process uses
Application Default Credentials: a developer ADC login locally, or the attached
Cloud Run service identity in production. The application does not load or need
a service-account key file.

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
