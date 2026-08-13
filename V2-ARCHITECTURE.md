# AntiochiaArchive v2 foundation

This document describes the v2 foundation built in three steps, all layered
locally alongside the stable v1.0 production system without changing,
migrating, or depending on any v1 production data:

1. **Domain schema, validation layer, read-only API skeleton, store
   abstraction** — the v2 domain types, relationship model, public/private
   serialization boundary, and an `/api/v2` read-only API backed by
   `EmptyV2Store`.
2. **FirestoreV2Store, local test support, and a v1 -> v2 migration dry
   run** — a real (but read-only, unselected-by-default) Firestore store
   implementation, a deterministic in-memory store for tests, and a CLI that
   maps the current 23-record v1 archive into a proposed v2 shape for
   review — entirely in memory, with zero writes anywhere.
3. **A local real-data v2 runtime** — `LocalMappedV2Store`, selected with
   `V2_DATA_STORE=local`, which runs the same validated v1 -> v2 mapper from
   step 2 at startup and serves the resulting 23 entities through the real
   `/api/v2` HTTP endpoints, entirely in memory, for local development only.
   See "Local real-data v2 runtime" below.

**No step migrates production data.** No Firestore document has ever been
read or written by this work, no Cloud Storage resource was created, and
`data/archive.json` is only ever read, never written, by any part of v2.
Everything described below lives under `backend/v2/` and
`backend/scripts/migrate-v1-to-v2.js`, and is additive.

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

Four implementations exist:

- **`EmptyV2Store`** (`backend/v2/stores/emptyV2Store.js`) — holds no data and
  never contacts Firestore or Cloud Storage. Returns valid, correctly-shaped
  empty results (`{ items: [], nextCursor: null, count: 0 }` / `null` for a
  single lookup). This is the default.
- **`MemoryV2Store`** (`backend/v2/stores/memoryV2Store.js`) — a deterministic
  in-process store used by tests (and safe for local demos): pass fixture
  `entities`/`relationships` to `createMemoryV2Store({ entities, relationships })`.
  It mirrors `FirestoreV2Store`'s filter/pagination contract exactly,
  including rejecting the same deferred filters (see "Filter implementation"
  below), so tests written against it exercise real store-selection
  semantics rather than a permissive stand-in. It never touches Firestore.
- **`FirestoreV2Store`** (`backend/v2/stores/firestoreV2Store.js`) — the
  real, read-only Firestore-backed implementation, described below. It is
  never constructed or contacted unless explicitly selected.
- **`LocalMappedV2Store`** (`backend/v2/stores/localMappedV2Store.js`) — maps
  the real `data/archive.json` through the same validated mapper as the
  dry-run CLI, into a `MemoryV2Store` instance, at startup. Local-only, never
  contacts Firestore or Cloud Storage. See "Local real-data v2 runtime"
  below.

### Firestore v2 collections

`FirestoreV2Store` reads from exactly two collections, both new and separate
from v1's `archive/{category}` documents:

- **`v2Entities/{entityId}`** — one document per mapped v2 entity, keyed by
  the entity's own `id` (so v1 IDs like `h1`, `st1`, `b1` remain stable
  document keys if/when a real migration ever runs). Per the v2 blueprint's
  "do not denormalize full related records" rule, each document carries only
  the entity's own fields plus a handful of **indexable top-level fields**
  used for filtering: `id`, `slug`, `entityType`, `status`, `languages`,
  `tags`, `storyCategory`, `genre`, `originalLanguage`, `dialect`,
  `createdAt`, `updatedAt`. It never embeds a related community/belief/place
  as a nested object.
- **`v2Relationships/{relationshipId}`** — one document per relationship edge,
  keyed by the relationship's own `id`, with `sourceId`/`targetId` used for
  lookups in both directions (see "Relationship reads" below).

Two private collections are **documented but not used yet** — no code reads
or writes them, and they exist only as a named placeholder for a future,
separately reviewed task:

- **`v2Consents/`** — would hold real consent records validated by
  `backend/v2/schemas/consent.js`. Never joined into a public response.
- **`v2Editorial/`** — would hold moderation/editorial-workflow state (e.g.
  review assignments, internal notes) that must never reach a public
  serializer.

No Cloud Storage bucket or object was created by this or any prior v2 step.

### Store selection (`V2_DATA_STORE`)

`V2_DATA_STORE` selects the implementation and **defaults to `empty`**
unless explicitly overridden:

```
V2_DATA_STORE=empty      # default — no data, no external contact
V2_DATA_STORE=memory     # deterministic in-process store, no external contact
V2_DATA_STORE=local      # maps data/archive.json into memory at startup — local dev only, no external contact
V2_DATA_STORE=firestore  # real Firestore reads against v2Entities/v2Relationships
```

This is deliberately **not** coupled to v1's `DATA_STORE` — a production
deployment can run `DATA_STORE=firestore` for v1 while v2 stays on
`V2_DATA_STORE=empty` (the actual production default today), and switching
v2 to Firestore, or a developer opting into `local`, is a separate, explicit
decision each time. `initializeV2Store()` only ever calls
`initializeFirestore()` (which requires `GOOGLE_CLOUD_PROJECT` and
constructs, but does not yet query, a Firestore client) when `firestore` was
explicitly selected — proven by
`backend/test/v2/stores/v2StoreSelection.test.js`, which asserts that
selecting `firestore` without `GOOGLE_CLOUD_PROJECT` fails exactly the way
v1's Firestore initialization already does, that selecting `local` succeeds
without `GOOGLE_CLOUD_PROJECT` (proving it never reaches Firestore either),
and that the default path never attempts it.

### Firestore query construction, cursor pagination, and index safety

`FirestoreV2Store` always orders by `FieldPath.documentId()` and paginates
with `.startAfter(cursorDocSnapshot)` — never offset/page-number pagination.
The `cursor` returned to an API client is an opaque base64url token wrapping
the last document's ID; a client can only replay it, never construct one
itself. An invalid or stale cursor (e.g. referencing a deleted document) is
rejected with a safe `V2QueryError`, not silently ignored.

Each page fetch requests `limit + 1` documents to detect whether a next page
exists, without ever scanning the full collection. If Firestore reports a
missing composite index (`FAILED_PRECONDITION`, gRPC code 9), the store
wraps it into the same safe `V2QueryError` rather than falling back to an
unindexed scan — the caller gets a clear "an index is required" message
instead of either a raw Firestore error or a silent full scan.

### Filter implementation

Filters are split into two groups, per the instruction to prefer correctness
over premature optimization:

- **Directly translatable today** (equality/array-contains clauses against
  the indexable fields above): `entityType`, `status`, `storyCategory`,
  `originalLanguage`, `dialect`, `musicGenre` (mapped to the `genre` field),
  `tag` (an `array-contains` clause against `tags`).
- **Deliberately deferred**: `communityId`, `beliefId`, `placeId`. These are
  *not* denormalized onto the entity document — doing so would violate the
  "do not denormalize full related records" rule and would silently go stale
  the moment a relationship changes. Rather than pretend to filter and
  quietly return unfiltered (or wrong) results, both `FirestoreV2Store` and
  `MemoryV2Store` reject a request containing any of these three filters
  with a `V2QueryError` explaining that they require a relationship-driven
  query not implemented yet, surfaced by the route as `400`.

### Relationship reads

`listRelationships()` supports filtering by a controlled `type`.
`getRelatedEntities(id)` issues **two** equality queries — one on `sourceId`,
one on `targetId` — because Firestore cannot `OR` across two different
fields in a single query. The two result sets are merged and de-duplicated
client-side, then the related entity documents are fetched with a single
batched `getAll(...)` call (not one read per relationship, avoiding N+1).
The documented tradeoff: this always issues both direction queries even when
only one has matches, trading a small constant amount of extra read volume
for correctness and simplicity over a more complex single-query scheme.

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
| `GET /api/v2/media` | Paginated `media` list (empty by default; 6 under `V2_DATA_STORE=local`) |

With the default `EmptyV2Store`, every list above is empty. Under
`V2_DATA_STORE=local` (see "Local real-data v2 runtime" below), these same
endpoints serve the 23 real mapped entities: `structures` returns 8,
`stories`/`music`/`historical-contexts` return 3 each, `media` returns 6, and
`communities`/`beliefs`/`places`/`proverbs` remain `0` because no such
content has been authored yet.

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

`backend/v2/validators/filters.js` validates query fields at the route layer
before any store is touched: `entityType`, `communityId`, `beliefId`,
`placeId`, `language`, `dialect`, `storyCategory`, `musicGenre`, `tag`,
`status`. An unsupported field or an invalid controlled value (e.g. an
`entityType` outside `ENTITY_TYPES`) is rejected with `400` before it ever
reaches the store. With the default `EmptyV2Store`, a validated filter is
accepted but has no data to apply to. With `FirestoreV2Store`/`MemoryV2Store`,
see "Filter implementation" above for exactly which validated filters are
applied vs. deliberately rejected as not-yet-supported.

## V1 -> V2 migration: dry-run mapper

`backend/v2/migration/` is a **pure, in-memory** mapping layer with no
filesystem, Firestore, or Cloud Storage access of its own:

- **`v1ToV2Mapping.js`** — maps a single v1 record (given its source
  category) into a proposed v2 entity object, and `mapV1ArchiveToV2Entities(archive)`
  maps an entire v1 archive object. Pure function of its input; never
  mutates the archive it's given (enforced by
  `backend/test/v2/migration/v1ToV2Mapping.test.js`).
- **`detectRelatedRecords.js`** — the "potential duplicate" heuristic (see
  below).
- **`buildMigrationReport.js`** — runs the mapper, validates every mapped
  entity against the real v2 schemas (`backend/v2/schemas/index.js`), and
  assembles the full report (counts, validation results, ID/slug integrity,
  media/source preservation stats, duplicate warnings).

**`backend/scripts/migrate-v1-to-v2.js`** is the CLI entry point:

```
node backend/scripts/migrate-v1-to-v2.js
```

reads the local `data/archive.json`, maps and validates it in memory, and
prints the report. It performs **zero writes** of any kind. `--apply` is not
implemented — passing it prints a clear rejection message and exits non-zero
without reading anything. `--output <path>` optionally writes the report as
JSON to a path outside `data/archive.json` (refused if it would point at
`data/archive.json`, and refused if the target already exists unless
`--force` is also passed).

### V1 category mapping

| v1 category | v2 `entityType` | Notes |
| --- | --- | --- |
| `history` | `historicalContext` | `body` -> `summary`, `era` -> `period.label` |
| `stories` | `story` | `body` -> `summary`; `storyCategory` deliberately left unset (see below) |
| `structures` | `structure` | `desc` -> `summary`, `categoryKey` -> `structureType`/`tags` |
| `beliefs` | **`structure`** | See "Belief-site handling" below — never `belief` |
| `music` | `music` | `categoryKey` -> free-form `genre` (no hardcoded taxonomy) |
| `gallery` | `media` | See "Gallery/media mapping" below |

Every mapper also attaches migration-only preview fields — `sourceVersion:
"v1.0"`, `sourceCategory`, `sourceRecordId`, a preserved `media` preview
(image/src + imageMetadata, with an explicit `isPlaceholder` flag), and the
record's existing `sources` array verbatim. These are not part of any core
entity schema's required fields (schema validation is allowlist-based on
known fields, so extra fields never fail validation), and — being unlisted —
they are automatically excluded if such an entity were ever run through
`publicSerializer.js`. `storyCategory` is deliberately left unset for every
migrated story: v1 has no equivalent classification field, and guessing one
would be inventing editorial data rather than migrating it.

### Belief-site handling

**v1's `beliefs` category holds individual sites** — Habib-i Neccar Shrine,
St. Pierre Cave Church, Antioch Synagogue, the Shrine of Khidr — not broad
belief traditions. Mapping every one of these to `entityType: "structure"`
(never `"belief"`) is a deliberate correctness rule enforced by
`mapBeliefSiteRecord()`, not an oversight. Each mapped record also carries:

- `tags` including `"beliefSite"` and `"migratedFromV1Beliefs"`, so these
  records remain easy to find for a future editorial pass.
- A `migrationNote` explaining that a broader belief-tradition entity (e.g. a
  specific faith or living tradition, if authored later after review) should
  relate to this structure via a `hasSite` relationship record — never by
  re-typing the record itself as `"belief"`.

This dry run creates **zero** `belief` entities, and zero `community`,
`place`, or `proverb` entities — see "No production migration yet" below.

### Gallery/media mapping

v1's `gallery` category holds presentation/media records, not a separate
cultural subject. Each gallery record maps to `entityType: "media"` with
`derivativeStoragePaths` from `src`, `mediaRole` set to
`aiGeneratedIllustration` when `imageMetadata.aiGenerated` is true and
`realArchiveMedia` otherwise, and `rightsStatus: "cleared"` when the record
already carries reviewed license metadata (reflecting v1's existing
editorial review, not a new determination made by this tool) or `"unknown"`
otherwise.

The mapped record does **not** synthesize a new structure/story from what
the photo depicts — that would be inventing an entity from an image, which
this task explicitly forbids. If a gallery image appears to depict an
existing record (e.g. `g4`, a photo of the Habib-i Neccar minaret), that is
only ever surfaced as a `POTENTIAL_DUPLICATE_OR_RELATED_ENTITY` warning with
a suggested `depicts` relationship type — never as actual migration data.
Gallery `title`/`caption` text is preserved on the mapped entity as
migration-preview fields; they are not yet part of the core `media` schema's
validated fields or its public serializer allowlist, which is a follow-up
decision, not something this dry run resolves.

### No automatic deduplication

The v1 archive represents some physical sites under more than one category
— e.g. Habib-i Neccar appears in `structures` (`st1`), `beliefs` (`b1`), and
`gallery` (`g4`); St. Pierre appears in `structures` (`st2`), `beliefs`
(`b2`), and `gallery` (`g2`). `detectRelatedRecords.js` flags these as
`POTENTIAL_DUPLICATE_OR_RELATED_ENTITY` using a **slug-token overlap
heuristic**: it lowercases and splits each record's slug on `-`, drops short
tokens (length < 3) and a small stopword list (`ve`, `antakya`, `antik`,
`tarihi`, `eski`, `kadim`, ...), and flags any pair of records from
**different** source categories that still share a token (e.g. `habib`,
`neccar`, `pierre`, `asi`, `nehri`, `kurtulus`, `roma`).

This is a heuristic, not an exhaustive semantic match — documented tradeoff:
it will miss thematically related records that don't share a distinctive
slug token (e.g. `st4` "Traditional Antioch Houses" vs. `s1`/`g1`'s specific
Kurtuluş Street courtyard house, which share no slug token), and it may
occasionally over-flag a loose thematic overlap (e.g. `h2`'s general
"Mosaic of Cultures" history entry against `g3`'s specific Oceanus/Tethys
mosaic photo, both containing "mozaigi"). Either way, **no record is ever
merged, dropped, or silently combined** — every flagged pair is reported for
a human to review and, if appropriate, express later as an explicit
relationship record. All 23 input IDs remain 23 distinct mapped entities
regardless of how many duplicate warnings are raised.

### No production migration yet

This step produces **zero** actual v2 Firestore documents, **zero** Cloud
Storage objects, and **zero** new cultural entity types (no `community`,
`belief`, `place`, or `proverb` records — those require separately reviewed
content work, per the task that requested this step). `--apply` remains
unimplemented by design. The dry-run report and optional `--output` file are
the only artifacts this tool produces, and both live outside
`data/archive.json` and outside any datastore.

### Migration safety rules (summary)

1. Read `data/archive.json` only; never write it.
2. Map every record in memory only; never call Firestore or Cloud Storage.
3. Preserve all 23 v1 IDs and slugs — never merge, drop, or invent a record.
4. Preserve existing TR/EN/AR title/content, image/src, imageMetadata, and
   `sources[]` without rewriting the cultural prose itself.
5. Map `beliefs`-category records to `structure`, never to `belief`.
6. Never fabricate a `community`, `belief`, `place`, or `proverb` entity.
7. Flag same-site/cross-category overlaps for editorial review; never
   auto-deduplicate.
8. Validate every mapped entity against the real v2 schemas; report — never
   suppress — a validation failure.
9. `--apply` is explicitly rejected; there is no write path in this tool.

## Local real-data v2 runtime

`LocalMappedV2Store` (`backend/v2/stores/localMappedV2Store.js`) turns the
dry-run mapper from a report-only tool into a real, queryable `/api/v2`
runtime, for local development only. It is selected with:

```
V2_DATA_STORE=local
```

**Production-safe default is unchanged**: `V2_DATA_STORE` still defaults to
`empty` everywhere. `local` is never assumed — an operator or developer must
set it explicitly, exactly like `memory` or `firestore`.

### What it does at startup

`initialize()` runs entirely in memory, in this order:

1. Reads `data/archive.json` from disk (respecting `ARCHIVE_JSON_PATH` if
   set, mirroring `backend/stores/fileStore.js`'s own path resolution — but
   without importing that module, since v2 store selection stays independent
   of v1's `DATA_STORE`).
2. Validates the loaded JSON as a v1 archive with the existing
   `assertValidArchive()` (`backend/dataModel.js`).
3. Maps every record through `mapV1ArchiveToV2Entities()`, the same mapper
   the dry-run CLI uses — no separate/duplicate mapping logic.
4. Validates every mapped entity against the real v2 schemas
   (`validateEntity()`, `backend/v2/schemas/index.js`).
5. Loads the validated entities into a `MemoryV2Store` and exposes the
   standard `V2Store` interface on top of it.

**On any invalid mapped record, `initialize()` throws** — naming the
offending v1 record id, its source category, and the schema validation
error — instead of silently dropping it. A broken local runtime fails loudly
at startup; it never serves a partial or silently-truncated entity set.

### Exact local entity counts

Running against the current 23-record `data/archive.json`:

| `entityType` | count |
| --- | --- |
| `historicalContext` | 3 |
| `story` | 3 |
| `structure` | 8 (4 from v1 `structures` + 4 from v1 `beliefs`, all belief-site structures) |
| `music` | 3 |
| `media` | 6 |
| `community` | 0 |
| `belief` | 0 |
| `place` | 0 |
| `proverb` | 0 |
| `source` | 0 |

**23 total.** This step creates no new cultural entity — every count above
comes directly from the existing, already-reviewed mapper (see "Belief-site
handling" and "No production migration yet" above): `community`, `belief`,
`place`, and `proverb` stay at zero until a separately reviewed content task
authors them. Seven of the 23 mapped records have no real image in v1
(`h2`, `s3`, `b3`, `m1`, `m2`, `m3`, `g1`) and remain valid entities with no
fabricated media — see "Public media representation" below.

### Public vs. private migration fields

The mapper (step 2) attaches migration-provenance fields to every mapped
entity: `sourceVersion`, `sourceCategory`, `sourceRecordId`, `migrationNote`
(belief-site records only), a raw `media` preview array, and a verbatim
`sources` array. This step makes an explicit, deliberate decision about each
one rather than leaving it to accident:

| Field | Decision | Reasoning |
| --- | --- | --- |
| `sourceVersion`, `sourceCategory`, `sourceRecordId` | **A — internal-only** | Editorial/migration provenance, not cultural content; no product reason for a public client to see "this came from v1 record st1." Already excluded by `publicSerializer.js`'s allowlist; this step keeps it that way. |
| `migrationNote` | **A — internal-only** | An editorial instruction to a future human reviewer ("relate this via `hasSite`, never re-type as belief"), not reader-facing text. |
| `sources` (verbatim v1 `sources[]`) | **A — internal-only** | v2 has its own, separate `source` entity type and `sourceIds` reference-array convention (see "Source vs. media rights" above); re-exposing the raw v1 array would pre-empt that design instead of migrating into it. A future task can turn these into real `source` entities. |
| `media` (raw preview array, incl. `isPlaceholder`, `date`, `originalUrl`, `accessedAt`) | **B — transformed** | The array shape and internal-only fields (`isPlaceholder`) are migration bookkeeping, but the underlying image is real, already-published v1 content the frontend already serves today. The public serializer derives a safe, minimal object from it rather than exposing the array as-is (see below) — never both. |

No migration-only field is ever exposed unmodified; `publicSerializer.js`
remains allowlist-based, so a newly added private field cannot leak by
being forgotten in a denylist.

### Public media representation

`backend/v2/serializers/publicSerializer.js` derives a `media` field for
`structure`, `story`, `historicalContext`, and `music` entities from their
internal migration-preview array, when — and only when — a real (non-
placeholder) image exists:

```json
"media": {
  "path": "/images/structures/habib-i-neccar-camii-antakya-2018.webp",
  "alt": { "tr": "...", "en": "...", "ar": "..." },
  "caption": { "tr": "...", "en": "...", "ar": "..." },
  "source": "Wikimedia Commons",
  "author": "Nedim Ardoğa",
  "license": "CC BY-SA 4.0",
  "rightsNote": "Attribution required. ShareAlike requirements apply to adaptations.",
  "aiGenerated": false
}
```

A placeholder record (no real v1 image) gets **no `media` key at all** —
never a fabricated one. `path` is the same root-relative public path v1
already serves from `public/images/`; it is not a filesystem path, an
image-staging path, a checksum, or `media.originalStoragePath` (which stays
private on the `media` entity type, per the existing allowlist).

`media`-entityType entities (from v1 `gallery`) already expose their own
public `derivativeStoragePaths`/`source`/`author`/`license`/`rightsStatus`/
`rightsNote`/`aiGenerated` fields; this step additionally surfaces `alt` and
`caption` text (previously only present in the internal preview) directly on
those entities, without duplicating the rest of the summary shape used by
the other four types.

### Side-by-side v1/v2 local testing

`V2_DATA_STORE` and `DATA_STORE` are independent (see "Store selection"
above), so both can be set at once for local development:

```
DATA_STORE=file
V2_DATA_STORE=local
```

With this configuration, `GET /api/archive` continues to serve v1's
unchanged 23-record archive from `backend/dataStore.js`'s `fileStore`, while
`GET /api/v2/*` serves the same 23 records re-shaped into v2 entities from
`LocalMappedV2Store` — two independent read paths over the same underlying
`data/archive.json`, neither one affecting the other.
`backend/test/v2/localStoreRoutes.test.js` asserts this explicitly: with
`V2_DATA_STORE=local` active, `GET /api/archive` still returns exactly 23
v1 records via the untouched v1 code path.

### Relationships remain empty

`LocalMappedV2Store` is constructed with `relationships: []`. The 10
`POTENTIAL_DUPLICATE_OR_RELATED_ENTITY` warnings the dry-run report
surfaces (e.g. `st1`/`b1`/`g4` all describing Habib-i Neccar) are **not**
converted into relationship records by this step — that remains a
separate, editorially reviewed decision. Any relationship-listing endpoint
therefore returns an empty page under `V2_DATA_STORE=local`, exactly as it
does under `EmptyV2Store`.

### Local Docker / environment setup

`backend/.env.example` documents `V2_DATA_STORE` alongside `DATA_STORE`; it
is commented out (defaulting to `empty`) so a fresh checkout never
accidentally serves mapped data. To opt in locally:

```
# backend/.env (developer-local only — never committed)
DATA_STORE=file
V2_DATA_STORE=local
```

or, when running the existing `docker compose up antiochia-archive-web
antiochia-archive-backend` development flow, export it before invoking
Compose:

```
V2_DATA_STORE=local docker compose up antiochia-archive-web antiochia-archive-backend
```

`docker-compose.yml`'s `antiochia-archive-backend` service declares
`V2_DATA_STORE=${V2_DATA_STORE:-empty}` alongside its existing
`DATA_STORE=${DATA_STORE:-file}` and `MAIL_MODE=${MAIL_MODE:-mock}`
passthroughs — a host-exported `V2_DATA_STORE` reaches the container, and it
still defaults to `empty` when unset, so existing Compose runs are
unaffected unless a developer explicitly exports it first. No production
deployment default changes.

## What is deliberately NOT implemented

- No real v2 Firestore document has been written (`FirestoreV2Store` is
  read-only and is not the selected store by default).
- No Cloud Storage bucket, upload, or media-serving path.
- No write/create/update/delete endpoints under `/api/v2`.
- No actual community, belief, place, or proverb records anywhere — not in
  Firestore, not in the local mapped runtime, not in any datastore. The one
  exception to "nothing is written or migrated" is `LocalMappedV2Store`
  itself (`V2_DATA_STORE=local`), which holds real `structure`/`story`/
  `music`/`historicalContext`/`media` records **in an in-process, local-only
  memory store**, rebuilt from `data/archive.json` on every startup — never
  persisted to Firestore, a file, or any other datastore. See "Local
  real-data v2 runtime" above.
- No actual relationships between entities (`v2Relationships` is an empty,
  documented collection shape; `LocalMappedV2Store` also holds zero
  relationships).
- No real consent records — `consent.js` is validation only; `v2Consents`
  and `v2Editorial` are documented, unused collection names.
- No admin/editorial UI for v2.
- No language-specific (`/tr/`, `/en/`, `/ar/`) routing for v2 entities.
- No `--apply` mode for the migration CLI.

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

`FirestoreV2Store` (see "Store abstraction" above) is now implemented
against `v2Entities`/`v2Relationships`, but it is read-only and holds no
data — no write path exists, and switching production to
`V2_DATA_STORE=firestore` remains a separate, explicit decision this step
does not make. Follow-on work this store deliberately leaves open:

- A write path (create/update), still gated by `requireAdmin` the same way
  v1's `PUT /api/archive` is, and still writing only to `v2Entities`/
  `v2Relationships`.
- Resolving the deferred `communityId`/`beliefId`/`placeId` filters via an
  actual relationship-driven query (e.g. fetch relationships first, then
  batch-`getAll` the matching entities), once real relationship data exists
  to query.
- Deciding whether `v2Entities` should stay one collection (current design)
  or split per `entityType` once real query/index patterns are known.
- A real `v2Consents`/`v2Editorial` implementation, kept out of any public
  read path.

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
  alongside the existing `initializeDataStore()` call at startup — unchanged
  by this step.
- All existing v1 backend tests continue to pass unmodified; a new
  `backend/test/v2/v1Compatibility.test.js` explicitly asserts the
  `GET /api/archive` response shape and content are unaffected.
- `data/archive.json`, `data/submissions.json`, and all frontend/build
  scripts are untouched. `backend/scripts/migrate-v1-to-v2.js` only ever
  *reads* `data/archive.json`, and only when `--apply` is not passed.
- The v1 Firestore migration script
  (`backend/scripts/migrate-json-to-firestore.js`) and the new
  `backend/scripts/migrate-v1-to-v2.js` are entirely separate tools: the
  former migrates v1 JSON into v1's own `archive`/`submissions` collections
  and can write with `--apply`; the latter maps v1 into a *proposed* v2
  shape for review and never writes anywhere.
