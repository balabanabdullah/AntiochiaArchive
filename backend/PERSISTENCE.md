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

## Runtime content database (SQLite) — the no-code CMS

`V2_DATA_STORE=sqlite` is a fourth, genuinely **writable** option alongside
`empty`/`memory`/`firestore`/`local` (see `v2/stores/v2Store.js`). It exists
to close the one gap the editorial-draft workflow above deliberately never
closes: an admin pressing **Yayınla** (Publish) writes `status = "published"`
straight into this database, in one transaction, and the very next
`GET /api/v2/...` request sees it — no draft export, no
`scripts/apply-editorial-changes.js`, no git commit, no rebuild, no
redeploy. See `admin/contentService.js`'s header for the full contract, and
`test/admin/contentService.test.js` for the literal
create→publish→public-read-sees-it assertion that proves it.

**Storage layout** (all under `backend/var/`, gitignored, reproducible from
canonical JSON — never a source of truth to version-control):

```
backend/var/
├── database/antiochia.db     # SQLITE_DB_PATH — entities, relationships, pages, audit_log, backups
├── storage/                  # LOCAL_STORAGE_ROOT — media/mediaStorage.js (images/, audio/, documents/, originals/, temp/)
├── backups/                  # BACKUP_ROOT — admin/backupService.js snapshots
└── exports/
```

**Enabling it:**

```text
cd backend
npm run migrate:sqlite -- --dry-run   # reports real counts, writes nothing
npm run migrate:sqlite -- --apply     # imports data/archive.json + data/v2/*.json (idempotent, count-verified)
V2_DATA_STORE=sqlite npm start
```

The migration reuses `v2/stores/localMappedV2Store.js`'s own merge pipeline
(v1 mapping, legacy-replacement suppression, native v2 validation,
relationship referential integrity) rather than re-deriving any of it, so
the imported dataset is guaranteed identical in content to what `local` mode
already serves today.

**What changes for the admin panel:** `GET /api/admin/editorial/dashboard`
reports `contentAuthority: "direct"` when this mode is active (`"editorial"`
otherwise), and the panel UI switches its Publish/Archive/Restore/Create
actions to call `/api/admin/content/*` directly instead of creating a draft
— see `admin/adminContentRoutes.js`. The existing `/api/admin/editorial/*`
draft workflow is completely untouched and keeps working exactly as before
for any deployment that does NOT set `V2_DATA_STORE=sqlite`.

**Revision history / audit trail:** every content mutation (create, edit,
publish, unpublish, archive, restore, delete, relationship change, page
change) is recorded in the `audit_log` table with a before/after snapshot —
see `db/repositories/auditRepository.js`. This is the "who/when/what" this
persistence mode provides without inventing per-person identity in a
currently single-admin system (`actor` is a fixed system string, e.g.
`"admin-session"`, never a fabricated name).

**Backups:** `admin/backupService.js` uses `better-sqlite3`'s own online
backup API (safe under concurrent WAL writes) plus a SHA-256'd media
manifest. A restore always takes a fresh "pre-restore" safety snapshot of
the current state first, and verifies the target backup's file hash before
applying anything. **This machine remains a single point of failure until
backups are additionally copied off of it** (a different disk, cloud
storage, etc.) — that copy step is not automated by this round and must be
done by an operator.

**CMS pages:** admin-created pages (`pages` table, `admin/pageService.js`)
resolve publicly at `GET /sayfa/<slug>/` (full server-rendered HTML with
real SEO/OG/JSON-LD tags, `backend/pages/pageRenderer.js`) and
`GET /api/pages/<slug>` (JSON). Both require `nginx/default.conf`'s
`/sayfa/` proxy block to actually be **deployed** to the frontend container
before they're reachable in production — that is one of two pieces of
infrastructure that need a one-time deploy (the other is `/archive-v2/`
below); every page/entity create/edit/publish/archive *after* that deploy
needs no further deploys. Draft/`inReview`/archived pages and unknown
slugs all 404 identically.

**Cultural entity detail pages, made runtime-authoritative:**
`GET /archive-v2/<slug>/` was previously ONLY servable from static files
generated at build time (`scripts/generate-v2-detail-pages.js`) — a
brand-new or just-edited SQLite entity had no public page until the next
`npm run build`. `backend/v2/routes/v2DetailRoutes.js` is a store-agnostic
runtime route (`v2/render/entityDetailRenderer.js`) that reads whichever
V2Store is currently authoritative and always renders fresh.

*Shared template, not a second design* (fixed in the "correctness pass"
round — the first version of this route hand-rolled its own separate,
visually minimal HTML shell, a real regression risk). The runtime renderer
now calls the exact same template function the static generator uses
(`backend/v2/render/detailTemplate.js`'s `generateV2DetailDocument`,
re-exported by `scripts/v2-archive-release.js` for the build script's
unchanged use) — real header/nav/footer/design system, identical
information architecture, for both a build-time and a runtime page. The
only runtime-specific piece is resolving the CURRENT content-hashed asset
filenames (`v2/render/detailAssetManifest.js`): since this backend is a
separate deployable with no filesystem access to `dist/index.html` (see
`backend/Dockerfile`'s build-context note), it fetches the live frontend's
own `index.html` over HTTP (cached in memory for
`DETAIL_ASSET_MANIFEST_CACHE_MS`, default 5 minutes; serves the last-known
manifest on a transient fetch failure rather than erroring). A total
resolution failure (no cache yet, fetch fails) returns 503, deliberately
not 404 — a 404 would trigger nginx's static-file fallback below, which
could serve a stale page.

*Routing mode* (re-evaluated in the "correctness pass" round — the first
version always went backend-first, unconditionally, in every deployment):
`nginx/default.conf`'s `/archive-v2/` location branches on the
`ARCHIVE_V2_ROUTING_MODE` environment variable, selected once at container
startup (`nginx/10-select-archive-v2-mode.sh`; can't be a runtime nginx
`if` — `try_files` is rejected inside one):
- `backend-first` (the image's default): every request tries the backend
  first, falling back to the pre-built static file only on a genuine
  backend 404. Required whenever `V2_DATA_STORE=sqlite` is authoritative —
  the static file is never even consulted for a slug the active store
  already recognizes, so a SQLite edit can never be shadowed by a stale
  file. Trade-off: every request round-trips to the backend.
- `static-first`: the original, pre-existing behavior — nginx serves the
  pre-built static file directly when one exists, backend only as
  fallback. Appropriate ONLY for a confirmed non-SQLite deployment
  (local/firestore/memory), where "stale" cannot happen since that data is
  fixed per-deploy anyway; restores the original request-time performance.

**Media preview bridging:** a runtime-created entity's image, linked via
the newer `mediaIds`/`illustrationMediaIds` fields (resolved through a
separate `media` entity and the rights gate), is bridged onto the shared
template's older `entity.media[0]` preview shape
(`entityDetailRenderer.js`'s `bridgeLegacyMediaPreview`) so it renders
identically to a migration-era image — without this, the shared template's
`mediaMarkup()` (which only ever knew the old shape) would always show the
placeholder for a runtime-uploaded image. Only for the 4 entity types the
template already supports an image for (historicalContext/story/structure/
music — place/belief/community/proverb show the same placeholder in the
*static* build too, an existing template constraint, not a runtime
narrowing) and only for a rights-cleared image; never overrides an
already-migrated `entity.media`.

**Runtime sitemap:** `GET /sitemap-index.xml` references `/sitemap.xml`
(build-time, `scripts/generate-sitemap.js` — **truly static system routes
only**: v1 detail/category pages, v2/discovery category HTML pages) plus
`GET /sitemap-runtime.xml` (`backend/v2/render/runtimeSitemap.js`) that
lists every currently published entity and page, re-queried live on every
request in whichever store is authoritative. Submit only
`/sitemap-index.xml` to Search Console once (and see `public/robots.txt`'s
`Sitemap:` line, which also points there) — new/archived/restored content
never requires touching Search Console again.

*A real staleness bug, found and fixed this round:* the static
`sitemap.xml` used to ALSO bake every public v2 entity's URL in at build
time. Archiving a runtime entity that existed at the last build removed it
from `/sitemap-runtime.xml` (correct) while it remained listed in
`sitemap.xml` until the next deploy (stale) — so `/sitemap-index.xml`'s
union still served that URL. Fixed by removing entity URLs from the static
file entirely; see `scripts/generate-sitemap.js`'s header and
`test/generate-sitemap.test.js`.

**Media upload — genuinely streaming, not memory-buffered:** the Admin
media-upload endpoint (`POST /api/admin/content/media/upload`,
`backend/admin/mediaUploadService.js`) uses `multer.diskStorage` (NOT
`memoryStorage` — a "no-code CMS" round design that was corrected this
round) so an incoming upload is written straight to a `temp/` file as it
streams in; the process never holds a whole upload in one JS Buffer.
SHA-256 is computed by streaming the on-disk temp file in chunks
(`mediaStorage.js`'s `hashFileStreaming`); magic-byte signature validation
reads only the first 64 bytes (`readFileHead`); finalization is an atomic
same-filesystem rename plus one OS-level `fs.copyFileSync` (`finalizeFromTemp`)
— never a second Buffer write. Every failure path (invalid signature, size
limit, duplicate, schema validation, a DB failure after the file is already
finalized) deletes the temp/finalized file; `sweepStaleTempFiles()` (run
once on every SQLite runtime startup) is a defense-in-depth cleanup for a
temp file orphaned by a client disconnecting mid-upload with no explicit
error event.
