# AntiochiaArchive v2 foundation

This document describes the first v2 implementation step: a domain schema,
validation layer, read-only API skeleton, and store abstraction added
locally alongside the stable v1.0 production system. It does not change,
migrate, or depend on any v1 production data.

**This change does not migrate production data.** No Firestore document was
read or written, no Cloud Storage resource was created, and `data/archive.json`
is untouched. Everything described below lives under `backend/v2/` and is
additive.

## Why a separate v2 tree

v1.0 models the archive as six flat category arrays (`history`, `stories`,
`structures`, `beliefs`, `music`, `gallery`) with a shared, loosely-typed
item shape (`backend/dataModel.js`). That shape is stable and must keep
working — it is production. v2 introduces a proper entity/relationship
domain model without touching that shape, so the two can be developed,
tested, and eventually migrated between independently.

## Domain entity types

`backend/v2/constants/vocabularies.js` defines the controlled `ENTITY_TYPES`:

| Type | Represents |
| --- | --- |
| `community` | A documented cultural or social community |
| `belief` | A broad belief/tradition, not an individual site |
| `place` | A geographically identifiable place or neighborhood |
| `structure` | A specific building, monument, or sacred site |
| `story` | An oral history, testimony, or narrative record |
| `music` | A composition, recording, or musical tradition |
| `proverb` | A proverb or saying with cultural meaning |
| `historicalContext` | A period summary or historical theme |
| `media` | A first-class media asset (image/audio/video/document) |
| `source` | A historical/editorial citation record |

**`community` and `belief` are deliberately separate entities.** A community
is never modeled as "a religion," and a belief document never embeds a
community. The schemas in `backend/v2/schemas/community.js` and `belief.js`
actively reject an embedded `beliefs`/`sites`/`structures` field — any
association between a community, a belief, and the physical sites where it
is practiced must be expressed as an explicit relationship record, not as
nested data. The same embedding rule applies to `structure` (see
`backend/v2/schemas/structure.js`), which rejects embedded
`community`/`belief`/`place` objects and instead carries `mediaIds` and
`sourceIds` reference arrays.

Every entity (except `media` and `source`, which have their own simpler
shapes) shares a base shape validated by
`backend/v2/schemas/shared.js#validateBaseEntity`:

```
id, slug, entityType, status, title, summary, alternateNames,
languages, tags, createdAt, updatedAt
```

Multilingual fields keep the existing v1 convention of `{ tr, en, ar }`
objects. No language is required to be populated — only that a required
field like `title` has at least one non-empty language value, matching how
v1's `dataModel.js` already treats multilingual text as "shape-valid, not
completeness-required."

## Relationship model

`backend/v2/schemas/relationship.js` defines one shared edge schema used for
every cross-entity association:

```
id, type, sourceId, sourceType, targetId, targetType,
evidenceSourceIds, note, status
```

`RELATIONSHIP_TYPES` is controlled but extensible: `associatedWith`,
`locatedIn`, `hasBelief`, `practicedBy`, `hasSite`, `narratedBy`,
`originatesFrom`, `performedBy`, `spokenIn`, `documents`, `depicts`,
`relatedTo`. Validation enforces:

- `sourceType`/`targetType` must be a supported `ENTITY_TYPES` value.
- `type` must be a supported `RELATIONSHIP_TYPES` value.
- `id`, `sourceId`, `targetId` are required, non-empty strings.
- `sourceId !== targetId` by default (a self-relationship must be opted into
  explicitly with `{ allowSelfRelationship: true }`).

No actual relationship records exist yet — this is validation only, ready
for a future editorial workflow to populate.

## Media as a first-class entity

`backend/v2/schemas/media.js` treats media as its own entity rather than an
attachment on a record, matching where v1's `imageMetadata` model was
already heading (see `MEDIA-PROVENANCE.md`). It carries:

```
id, mediaType, mediaRole, originalStoragePath, derivativeStoragePaths,
mimeType, size, duration, width, height, checksum, source, author,
license, rightsStatus, rightsNote, aiGenerated, createdAt
```

`mediaRole` distinguishes at least `realArchiveMedia` and
`aiGeneratedIllustration`, carrying forward v1's existing
`imageMetadata.aiGenerated` labeling requirement. No Cloud Storage
integration exists yet — `originalStoragePath`/`derivativeStoragePaths` are
just validated strings today.

## Source vs. media rights: a deliberate distinction

`backend/v2/schemas/source.js` (a record's historical/editorial citation —
book, article, oral history, institutional record) is kept separate from a
media asset's `rightsStatus`/`license`/`author` fields. A source answers
"where does this claim come from?"; media rights answer "who may reuse this
image, and under what terms?" Conflating the two was a known risk called out
in `SEO-GEO.md`'s discussion of provenance; v2 keeps them as distinct
entities from the start.

## Consent and the public/private boundary

`backend/v2/schemas/consent.js` is a **private-only** schema
(`consentStatus`, `displayNamePermission`, `audioPublicationPermission`,
`transcriptPermission`, `photoPermission`, `anonymizationMode`). No consent
data is ever meant to leave the backend in a public response. A `story` may
carry an opaque `consentRef` pointing at a private consent record, but the
public serializer strips even that reference — only the backend's own
(not-yet-built) admin/editorial path would ever resolve it.

`backend/v2/serializers/publicSerializer.js` enforces this with an
**allowlist**, not a denylist: each entity type has an explicit list of
fields that may appear in a public response, built from the common base
fields plus that type's own public fields (e.g. `story` allows `transcript`
and `translations`, but never `narratorRef` or `consentRef`; `media` allows
`derivativeStoragePaths`, but never `originalStoragePath` or `checksum`).
Anything not on the list — private consent data, editorial notes,
contributor PII, moderation-only fields, internal admin metadata,
credentials, or storage internals — is silently dropped rather than
individually denylisted, so a newly added private field cannot leak by
being forgotten in a denylist. This boundary is covered by
`backend/test/v2/serializer.test.js`.

## Store abstraction

`backend/v2/stores/v2Store.js` mirrors the pluggable-store pattern v1 already
uses in `backend/dataStore.js`. The interface:

```
initialize()
listEntities({ limit, cursor, filters })
getEntityById(id)
listByType(type, { limit, cursor, filters })
listRelationships({ limit, cursor, filters })
getRelatedEntities(id, { limit, cursor, filters })
```

The only implementation today is `EmptyV2Store`
(`backend/v2/stores/emptyV2Store.js`), which holds no data and never
contacts Firestore or Cloud Storage. It returns valid, correctly-shaped
empty results (`{ items: [], nextCursor: null, count: 0 }` /
`null` for a single lookup) so the full API contract — success envelope,
pagination metadata, 404 handling — can be exercised end-to-end before any
real v2 persistence exists.

## API v2 contract

Mounted at `/api/v2` in `backend/server.js`, additively — no existing route
was changed, moved, or removed.

| Endpoint | Behavior today |
| --- | --- |
| `GET /api/v2` | Safe metadata: `version`, `status`, `supportedEntityTypes` |
| `GET /api/v2/entities` | Paginated list across all entity types (empty) |
| `GET /api/v2/entities/:id` | Single entity, or the established `{ success: false, error: "Entity not found." }` 404 |
| `GET /api/v2/communities` | Paginated `community` list (empty) |
| `GET /api/v2/beliefs` | Paginated `belief` list (empty) |
| `GET /api/v2/places` | Paginated `place` list (empty) |
| `GET /api/v2/structures` | Paginated `structure` list (empty) |
| `GET /api/v2/stories` | Paginated `story` list (empty) |
| `GET /api/v2/music` | Paginated `music` list (empty) |
| `GET /api/v2/proverbs` | Paginated `proverb` list (empty) |
| `GET /api/v2/historical-contexts` | Paginated `historicalContext` list (empty) |

Every list response uses the same envelope as v1's `/api/archive`:

```json
{ "success": true, "data": [], "meta": { "version": "v2", "count": 0, "limit": 20, "cursor": null, "nextCursor": null } }
```

`GET /api/v2` exposes only `version`, `status`, and `supportedEntityTypes` —
never environment variables, service accounts, Firestore paths, secret
names, or filesystem paths. There are **no write endpoints** in v2 yet.

### Pagination contract

`backend/v2/validators/pagination.js` defines cursor-oriented pagination
now, deliberately not offset/page-number pagination:

- `limit`: positive integer, default 20, maximum 100.
- `cursor`: opaque non-empty string, store-defined.

`EmptyV2Store` accepts a `cursor` (request shape is still validated) but has
no data to page through, so it always returns `nextCursor: null`.

### Filter contract

`backend/v2/validators/filters.js` validates (but, with no store data, does
not yet apply) query fields: `entityType`, `communityId`, `beliefId`,
`placeId`, `language`, `dialect`, `storyCategory`, `musicGenre`, `tag`,
`status`. An unsupported field or an invalid controlled value (e.g. an
`entityType` outside `ENTITY_TYPES`) is rejected with `400` before it ever
reaches the store.

## What is deliberately NOT implemented

- No Firestore v2 collection, document, or read/write path.
- No Cloud Storage bucket, upload, or media-serving path.
- No write/create/update/delete endpoints under `/api/v2`.
- No actual community, belief, place, structure, story, music, proverb,
  historicalContext, media, or source records — the schemas validate a
  shape; no cultural content was authored or migrated.
- No actual relationships between entities.
- No real consent records — `consent.js` is validation only.
- No admin/editorial UI for v2.
- No language-specific (`/tr/`, `/en/`, `/ar/`) routing for v2 entities.

## Migration boundary

v1.0's `/api/archive`, its Firestore `archive`/`submissions` collections,
its file-mode JSON store, its backup/export endpoints, and its release
procedure (see `README.md`, `backend/PERSISTENCE.md`, `backend/BACKUPS.md`,
`V1-RELEASE.md`) are entirely untouched by this change and remain the sole
production source of truth. v2 does not read from or write to any of them.
When a future step migrates v1 records into the v2 shape, that will be an
explicit, reviewed, opt-in transform (mirroring the existing
backup-merge-validate-write-verify discipline in `V1-RELEASE.md`), not an
automatic or implicit one.

## Future Firestore v2 strategy

The store abstraction exists specifically so a `firestoreV2Store`
implementation can be added later — most likely a `v2Entities` collection
keyed by immutable `id` (or one collection per `entityType`, still to be
decided against real query patterns) and a `v2Relationships` collection
keyed by relationship `id`, indexed by `sourceId`/`targetId`. `V2_DATA_STORE`
is already read by `backend/v2/stores/v2Store.js` as the selection variable,
mirroring v1's `DATA_STORE`, so switching stores will not require route or
controller changes. No such collection exists yet, and none should be
created without a separate, explicit decision.

## Future Cloud Storage strategy

`media.originalStoragePath`/`derivativeStoragePaths` are shaped to
eventually point at Cloud Storage objects, following the same threshold
already documented in `MEDIA-PROVENANCE.md`: local `public/images/` remains
fine for a small curated set, and Cloud Storage becomes worthwhile once
volume, independent retention, multi-editor workflows, or independent media
deployment are actually needed. No bucket, credential, or upload workflow is
implemented by this change.

## Compatibility with v1

- `GET /api/archive`, the admin `PUT /api/archive`, submissions routes, and
  backup routes are byte-for-byte unchanged in behavior.
- `backend/dataModel.js`, `backend/dataStore.js`, `backend/stores/*.js`, and
  the v1 `ENTITY_TYPES`/`SOURCE_TYPES` constants were not modified — v2
  defines its own independent copies in `backend/v2/constants/vocabularies.js`
  so the two vocabularies can evolve separately without risk of collision.
- `backend/server.js` gained exactly two additive lines of substance: an
  `app.use("/api/v2", v2Router)` mount and an `initializeV2Store()` call
  alongside the existing `initializeDataStore()` call at startup.
- All existing v1 backend tests continue to pass unmodified; a new
  `backend/test/v2/v1Compatibility.test.js` explicitly asserts the
  `GET /api/archive` response shape and content are unaffected.
- `data/archive.json`, `data/submissions.json`, and all frontend/build
  scripts are untouched.
