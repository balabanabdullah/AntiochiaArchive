# AntiochiaArchive v1.0 release guide

## Release architecture

Production uses two Cloud Run services in `europe-west1`:

1. `antiochia-app` serves the Vite/Nginx frontend on port 8080.
2. Nginx proxies same-origin `/api/*` to `antiochia-archive-backend`.
3. Express reads and writes the six-category archive in Firestore using its
   attached service account.

The v1.0 archive has 23 records: history 3, stories 3, structures 4, beliefs 4,
music 3, and gallery 6. Every record has an immutable ID, stable slug,
controlled entity type, and static `/archive/{slug}/` detail page. Sixteen
records have reviewed real imagery; seven intentionally retain placeholders.

## Major release features

- TR/EN/AR interface and Arabic RTL.
- API-authoritative runtime archive with Firestore production persistence.
- Search, category filters, gallery lightbox, and accessible media fallbacks.
- Image provenance/rights metadata and conservative attribution.
- Crawlable static record pages, canonicals, Open Graph metadata, `WebPage`
  JSON-LD, sitemap, methodology page, and a true HTTP 404 experience.
- Protected archive editing, private submissions, and read-only JSON exports.

## Security and backup model

Archive writes, submission reads/deletes, and backup exports require
`Authorization: Bearer <ADMIN_TOKEN>`. Production injects the token from Secret
Manager. Backups are no-store responses; full/submission backups contain private
visitor information and must remain outside Git and be stored securely.

Before any production archive replacement:

1. download authenticated archive and full backups outside the repository;
2. validate JSON, six categories, and current record count;
3. refetch the current production archive;
4. merge by immutable record ID while preserving production cultural fields;
5. validate IDs, slugs, entity types, media URLs, and expected counts;
6. perform one authenticated `PUT /api/archive`;
7. read back and compare semantically.

If readback fails, restore the pre-write archive backup with one authenticated
PUT, then verify it. Never use the Firestore migration script as an automatic
rollback mechanism.

## Deployment commands

Run only from a clean, validated `main` branch and preserve the existing service
configuration:

```powershell
git push origin main

gcloud.cmd run deploy antiochia-archive-backend --source backend --project antiochia-archive --region europe-west1 --platform managed --update-env-vars "V2_DATA_STORE=local,ARCHIVE_JSON_PATH=/app/data/archive.json,V2_ENTITIES_JSON_PATH=/app/data/v2/entities.json,V2_RELATIONSHIPS_JSON_PATH=/app/data/v2/relationships.json,V2_LEGACY_REPLACEMENTS_JSON_PATH=/app/data/v2/legacyReplacements.json"

gcloud.cmd run deploy antiochia-app --source . --project antiochia-archive --region europe-west1 --platform managed --port 8080 --allow-unauthenticated --update-env-vars "BACKEND_UPSTREAM=https://antiochia-archive-backend-6939593871.europe-west1.run.app"
```

When deploying the backend, first inspect the existing Cloud Run service and
preserve its service account, Secret Manager bindings, environment variables,
ingress, and authentication settings. Do not put secret values on a command line.
Do not change `DATA_STORE` — v1 stays on Firestore.

**Before every backend deploy:** run `npm test` inside `backend/` and confirm
`backend/test/v2/dataBundleDrift.test.js` passes. `backend/data/*.json` is a
committed, bundled copy of the canonical `data/*.json` files used by the v2
local-read-only store in production (see `V2-ARCHITECTURE.md` "Production v2
data path") — if it has drifted from the canonical files, re-sync it and
commit that as its own reviewed change before deploying, or production will
silently serve stale v2 content.

## Intentional v1.0 limitations

- Seven archive records retain intentional placeholders pending suitable media.
- There is no custom domain; canonicals use the current frontend Cloud Run URL.
- TR/EN/AR share one canonical URL; language-specific routes and `hreflang` are
  post-v1.0 work.
- Administration uses one environment-backed administrator token, not accounts.
- Visitor media uploads, contribution map/location collection, audio playback,
  comments, ratings, and social features are not enabled.
- Record-level historical citation coverage remains an editorial work in
  progress; image provenance is not treated as historical evidence.

## Manual post-v1.0 operations

Custom-domain mapping, canonical/sitemap updates, Google Search Console, Bing
Webmaster Tools, and optional privacy-conscious analytics require owner access
and are not release blockers. If a slug must ever change, add an explicit
permanent redirect rather than silently replacing the published URL.
