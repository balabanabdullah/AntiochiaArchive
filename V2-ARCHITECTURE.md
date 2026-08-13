# AntiochiaArchive v2 foundation

This document describes the v2 foundation built in five steps, all layered
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
4. **Local editorial entity + relationship data infrastructure** — a
   committed, currently-empty pair of files (`data/v2/entities.json`,
   `data/v2/relationships.json`) plus a validating loader/merger
   (`backend/v2/localData/nativeV2DataSource.js`) that lets
   `LocalMappedV2Store` combine the 23 mapped v1 records with future
   hand-authored, source-reviewed v2-native entities and relationships —
   collision-checked and referentially validated, still entirely local and
   in-memory. This step is infrastructure only: it authors zero real
   community/belief/place/proverb records. See "Local editorial entity +
   relationship data infrastructure" below.
5. **A cultural-dataset import PREVIEW pipeline** — a normalization tool
   (`backend/v2/importPreview/`) that reads externally-supplied canonical
   research text (never committed — see "Cultural dataset import preview"
   below), transforms it into the v2 entity/relationship/source/media
   shape under a strict no-invention policy, validates every record with
   the real v2 schemas, and writes the result to an ignored `tmp/`
   directory for human review. It never writes `data/v2/entities.json` or
   `data/v2/relationships.json` — going from preview to those committed
   files remains a separate, explicit, human-reviewed step every time.

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
  dry-run CLI, merges in any validated, collision-checked entities and
  referentially-valid relationships from `data/v2/entities.json` /
  `data/v2/relationships.json`, and loads the result into a `MemoryV2Store`
  instance, at startup. Local-only, never contacts Firestore or Cloud
  Storage. See "Local real-data v2 runtime" and "Local editorial entity +
  relationship data infrastructure" below.

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
| `GET /api/v2/relationships` | Paginated relationship-edge list, optionally filtered by a controlled `type` (empty) |
| `GET /api/v2/entities/:id/related` | Entities related to `:id`, each paired with the connecting relationship where identifiable (empty) |

With the default `EmptyV2Store`, every list above is empty. Under
`V2_DATA_STORE=local` (see "Local real-data v2 runtime" and "Local editorial
entity + relationship data infrastructure" below), these same endpoints
serve the 23 real mapped entities: `structures` returns 8,
`stories`/`music`/`historical-contexts` return 3 each, `media` returns 6,
`communities`/`beliefs`/`places`/`proverbs` remain `0` because no such
content has been authored yet, and `relationships` remains `0` because
`data/v2/relationships.json` is still empty.

Every list endpoint above — including the per-type ones — and the single-
entity/relationship lookups only ever return records whose `status` is
exactly `"published"` (see "Publication visibility" below); a `media`/
`source` entity, which has no `status` concept at all, is always eligible.

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

### Relationships: empty by data, not by design

As originally built, `LocalMappedV2Store` was constructed with
`relationships: []` — no relationship-loading capability existed yet. Step 4
("Local editorial entity + relationship data infrastructure", below) adds
that capability via `data/v2/relationships.json`, but the file itself still
starts empty and stays empty in this step. The 10
`POTENTIAL_DUPLICATE_OR_RELATED_ENTITY` warnings the dry-run report surfaces
(e.g. `st1`/`b1`/`g4` all describing Habib-i Neccar) are **not** converted
into relationship records by this or any step so far — that remains a
separate, editorially reviewed decision. `GET /api/v2/relationships` and
`GET /api/v2/entities/:id/related` therefore still return empty results
under `V2_DATA_STORE=local` today, for the same reason `EmptyV2Store`
returns empty results: no relationship data exists yet, not because the
capability is missing.

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

## Local editorial entity + relationship data infrastructure

This step turns `LocalMappedV2Store` from "the 23 mapped v1 records only"
into a real merge point for future hand-authored v2-native content, without
authoring any of that content yet. **`data/v2/entities.json` and
`data/v2/relationships.json` are committed to the repository and stay
empty** (`{ "entities": [] }` / `{ "relationships": [] }`) — this step is
infrastructure and validation only.

```
data/archive.json
        |
        v
   v1 mapper (step 2)
        |
        v
  23 mapped entities  ---+
                          |
data/v2/entities.json     |
        |                 |
        v                 |
  native v2 entities       +--> merged entity set
  (validated, collision-  |
   checked against the    |
   mapped set above)      |
                          |
data/v2/relationships.json
        |
        v
  native relationships
  (validated, referential
   integrity checked
   against the merged
   entity set above)
        |
        v
   MemoryV2Store  -->  /api/v2
```

### Native v2 data files

| File | Shape | Notes |
| --- | --- | --- |
| `data/v2/entities.json` | `{ "entities": [ ...v2 entity objects... ] }` | Any `ENTITY_TYPES` value is allowed — `community`/`belief`/`place`/`proverb` included, since this is the mechanism a future *separately reviewed content task* will use to add them. |
| `data/v2/relationships.json` | `{ "relationships": [ ...v2 relationship objects... ] }` | One edge per authored relationship (see "Relationship direction" below). |

Both are plain JSON, not browser assets — they live under `data/`, never
`public/`, exactly like `data/archive.json` and `data/submissions.json`.
Neither is ever written by any part of v2; both are read-only inputs.

### Loader/merger module

`backend/v2/localData/nativeV2DataSource.js` exports two pure, read-only
async functions, both used by `LocalMappedV2Store.initialize()`:

- **`loadNativeEntities({ filePath, mappedEntities })`** — reads
  `data/v2/entities.json` (or `V2_ENTITIES_JSON_PATH`, see "Config paths"
  below), validates every entity against the real v2 schemas
  (`validateEntity()`), and checks each one's `id` and `slug` (when present)
  for collisions against `mappedEntities` and against other native entities
  in the same file. Throws — naming the array index, id, and reason — on the
  first invalid entity or collision. Never silently drops a record.
- **`loadNativeRelationships({ filePath, entities })`** — reads
  `data/v2/relationships.json` (or `V2_RELATIONSHIPS_JSON_PATH`), validates
  every relationship's shape with the existing `validateRelationship()`
  (`backend/v2/schemas/relationship.js`), then checks referential integrity
  against the full merged `entities` set (mapped + native) passed in:
  `sourceId`/`targetId` must resolve to a known entity, and
  `sourceType`/`targetType` must match that entity's actual `entityType`.
  Throws on the first orphan reference, type mismatch, or duplicate
  relationship id. Never silently drops a relationship.

### Merge pipeline (`LocalMappedV2Store.initialize()`)

Extends the pipeline described in "Local real-data v2 runtime" above:

1. Read `data/archive.json` and validate it as a v1 archive.
2. Map its 23 records to v2 entities (step 2's mapper) and validate each one.
3. Read `data/v2/entities.json`.
4. Validate every native entity against the real v2 schemas.
5. Check every native entity's id/slug for collisions against the mapped set
   (step 2) and against other native entities.
6. Merge: `entities = mappedEntities.concat(nativeEntities)`.
7. Read `data/v2/relationships.json`.
8. Validate every relationship's shape (`validateRelationship()`).
9. Validate referential integrity against the full merged `entities` set
   from step 6.
10. Load the merged entities and validated relationships into a
    `MemoryV2Store` and expose the standard `V2Store` interface on top.

Every step happens in memory, on every process startup — nothing is cached
to disk, and no step here ever contacts Firestore or Cloud Storage.

### Collision handling

A native entity's `id` must not equal any of the 23 mapped v1 ids (e.g.
`b4`), and — where the native entity has a `slug` — that slug must not equal
any mapped entity's slug either. Both checks also apply within the native
file itself (two native entities cannot share an id or a slug). Any
collision **fails startup** with a clear error naming the colliding id/slug;
it is never resolved by silently renaming, dropping, or preferring one
record over the other.

### Referential integrity

A native relationship's `sourceId`/`targetId` must resolve to *some* known
entity — mapped or native — in the merged set, and its declared
`sourceType`/`targetType` must equal that entity's actual `entityType`. An
orphan relationship (referencing an id that doesn't exist) or a
type-mismatched one (e.g. declaring `sourceType: "belief"` for an id that is
actually a `community`) **fails startup**, exactly like an invalid entity —
it is never silently dropped or "fixed" by trusting the declared type over
the real one. This is intentionally allowed to reference a *mapped* v1
record: e.g. a native `belief` entity's relationship may declare
`targetId: "b4", targetType: "structure"`, since `b4` is one of the four
migrated belief-site structures (see "Belief-site handling" above) — the
architecture is capable of this today; no such relationship is actually
authored by this step.

### Relationship direction

Relationship edges are recorded exactly as authored — **no inverse edge is
ever synthesized automatically**. Authoring
`community --hasBelief--> belief` does not implicitly create
`belief --practicedBy--> community`; both directions must be authored
explicitly if both are intended. This mirrors the existing relationship
model's philosophy (see "Relationship model" above: relationships are
explicit edge records, never inferred) and keeps the merge pipeline a pure
function of its committed inputs.

## Legacy replacement layer

The v1 -> v2 migration mapper (see "V1 category mapping" above) maps all 23
`data/archive.json` records into v2 entities exactly once each, with no
attempt at deduplication against future canonical research content — that
was deliberate at the time (a pure, stateless mapper), but it means that once
a *canonical*, source-reviewed v2-native record is authored for a
real-world site a mapped v1 record already covers (e.g. a mosque, a shrine),
naively adding the canonical record to `data/v2/entities.json` would either:

- **fail startup outright**, if the canonical record's `id`/`slug` happens to
  equal the mapped record's (`loadNativeEntities`'s existing collision check,
  "Collision handling" above) — or, worse,
- **silently succeed with two representations of the same real-world entity**
  side by side, if the id/slug happen to differ (they often do: v1 slugs and
  canonical research slugs were authored independently, at different times,
  by different processes).

Neither outcome is acceptable, and slug/id equality alone is not a reliable
signal either way: two *different* real-world sites can coincidentally share
no words, and the *same* real-world site can be described by a mapped v1
record and a canonical research record with completely unrelated slugs. This
was proven concretely during the pre-promotion identity reconciliation of the
first real canonical research batch (see
`tmp/v2-import-preview/legacy-reconciliation.json`, gitignored — not
committed): of the 7 mapped v1 records the reconciliation confirmed a
canonical replacement for, the existing slug-only collision detector caught
only 5. It silently missed two real semantic duplicates:

- **`structure-0020` vs. legacy `st4`** ("Traditional Antioch Houses"): v1's
  slug is `antakya-evleri`; the canonical research record's slug is
  `geleneksel-antakya-evleri` — completely different strings, zero collision,
  yet an explicit PART 2 research editorial note ("v1 st4 maps here.")
  confirms they are the same real-world subject. Before this layer existed,
  promoting `structure-0020` as-is would have silently produced two
  representations of the same houses with no warning at all.
- **The St. Pierre case, `structure-0003` vs. legacy `st2`**: v1's structure
  record `st2` has slug `st-pierre-kilisesi`; the canonical structure's slug
  is `st-pierre-magara-kilisesi`. These also don't collide. (v1's *belief*
  record `b2` happens to share the canonical slug exactly and was already
  blocked — but that was luck, not detection of `st2`'s duplication. PART 5's
  duplicate/entity-resolution log — resolution-0003 — explicitly unifies both
  v1 records, structure `st2` and belief `b2`, into the one canonical
  `structure-0003`, a documented many-to-one supersession.)

### Design: native-over-mapped overlay

`data/v2/legacyReplacements.json` is a small, git-tracked, human-reviewed
list of confirmed supersession decisions — migration/identity-control
metadata, not cultural content:

```json
{
  "replacements": [
    {
      "legacyMappedEntityId": "st1",
      "canonicalNativeEntityId": "structure-0001",
      "reason": "..."
    }
  ]
}
```

Every entry requires all three fields (`backend/v2/localData/legacyReplacements.js`
rejects unknown fields outright — deliberately stricter than the general v2
entity schemas, since this is small hand-curated metadata where an unknown
field is far more likely an authoring mistake than a forward-compatible
extension). `reason` is mandatory and non-empty specifically so that a
many-to-one mapping (two legacy ids superseded by the same canonical id, like
the St. Pierre `st2`+`b2` -> `structure-0003` case) is a *documented*
decision by construction, not an accidental duplicate slipping through
unnoticed.

**A replacement entry never suppresses anything by itself.** It only takes
effect once classified:

| Classification | Condition | Effect |
| --- | --- | --- |
| **Active** | `canonicalNativeEntityId` is present in the currently loaded native `data/v2/entities.json` | The named `legacyMappedEntityId` is suppressed from the merged v2 view. |
| **Pending** | `canonicalNativeEntityId` is *not yet* present | No suppression — the legacy mapped record stays exactly as visible as before. |
| **Invalid** | malformed shape, unknown field, missing/empty `reason`, malformed canonical id, `legacyMappedEntityId` not in the real 23-record mapped baseline, self-replacement, or a `legacyMappedEntityId` listed more than once (contradictory) | `loadLegacyReplacements()` throws at startup — never silently dropped or downgraded to pending. |

This lets the replacement map be authored and reviewed *ahead of* the
canonical entity's own promotion into `data/v2/entities.json`, without ever
making v2 content disappear early. Today, `data/v2/entities.json` is still
`{ "entities": [] }`, so **all 7 committed replacement entries currently
classify as pending** — the merged v2 view is unchanged: the same 23 mapped
v1 records as before, with `structure-0001`..`structure-0005` and
`structure-0020` still absent.

### Where suppression happens (`LocalMappedV2Store.initialize()`)

```
data/archive.json --> v1 mapper --> 23 mapped entities ---------+
                                                                  |
data/v2/legacyReplacements.json --> loadLegacyReplacements()     |
        |                                  |                     |
        v                                  v                     |
  (validated: shape, mapped-baseline    classifyLegacyReplacements(
   membership, no dupes/self-refs)       replacements, nativeEntities)
                                                |
                                    active / pending split
                                                |
                                                v
                          survivingMappedEntities = mappedEntities
                            minus {active[].legacyMappedEntityId}
                                                |
data/v2/entities.json --> native entities  ----+--> merged entity set
                                                |
                                                v
                                    data/v2/relationships.json
                                    (referential integrity checked
                                     against the merged set above,
                                     exactly as before)
                                                |
                                                v
                                          MemoryV2Store --> /api/v2
```

Suppression is applied *before* the entity merge and *before* relationship
loading — a suppressed legacy entity never reaches the served entity set,
the relationship-resolution pool, or `MemoryV2Store` at all. A relationship
that targeted a now-suppressed legacy id would correctly fail referential
integrity as an orphan, exactly as if that id had never existed — this is
why relationships must be re-authored (or already authored) against the
*canonical* id once a replacement goes active, never left pointing at the
suppressed legacy id.

`LocalMappedV2Store` exposes `getLegacyReplacementClassification()` after
`initialize()` for introspection/tests: `{ active, pending,
activeLegacyIdsToSuppress }`.

### Canonical IDs always win

When a replacement is active:

- the canonical research id (e.g. `structure-0001`) is exposed, never
  renamed or renumbered;
- only the *specific* mapped-v1 entity(ies) an entry names as superseded are
  suppressed — every other mapped record, related-but-distinct or otherwise,
  stays exactly as before, side by side;
- the old v1 id is never copied onto the canonical record as its primary
  id — if a future audit trail is wanted, it belongs in an optional alias
  field on the native entity (e.g. `tags`/`migrationNote`, both already
  free-form — see `v1ToV2Mapping.js`'s `mapBeliefSiteRecord`), never as a
  substitute for the canonical primary id.

Once every one of the 7 committed replacements eventually goes active, final
v2 will expose exactly one representation of each of the 7 real-world sites
(Habib-i Neccar Mosque, Habib-i Neccar Shrine, St. Pierre, Antakya Synagogue,
Samandağ Khidr Shrine, and the traditional Antakya houses ensemble) — never
two.

### v1 API isolation

The legacy replacement mechanism applies **only** to the in-memory v2 merged
view built by `LocalMappedV2Store.initialize()`. It never touches, and
cannot touch:

- `data/archive.json` — read-only input, same as always;
- `GET /api/archive` (v1) — served entirely by `backend/stores/fileStore.js`
  and `backend/routes/*`, which import nothing from `backend/v2/*` and have
  no awareness that `legacyReplacements.json` exists;
- v1 record ids, slugs, or content — never deleted, mutated, or renumbered.

`GET /api/archive` continues to return the same 23 records regardless of how
many legacy replacements are active in v2 — proven by
`backend/test/v2/v1Compatibility.test.js`'s existing "contract is unchanged"
assertion, which this step's tests (`localMappedV2StoreMerge.test.js`) keep
passing alongside new active-suppression coverage.

### Import-preview collision detection

`backend/v2/importPreview/buildImportPreview.js` (the whole-research-batch
dry-run tool, separate from real promotion into `data/v2/entities.json`) now
also loads `data/v2/legacyReplacements.json` and consults it during its own
id/slug collision checks against the mapped v1 baseline:

- a research candidate colliding with a mapped v1 entity is **excluded**
  (`idCollision`/`slugCollision`, exactly as before) *unless* a confirmed
  replacement entry names that exact mapped entity as superseded by that
  exact candidate — in which case the candidate is **included** instead, and
  annotated in `report.legacyReplacementAudit`;
- collisions **between two candidates in the same research batch** always
  hard-fail regardless of the replacement map — the map only ever concerns
  the mapped v1 baseline, never batch-internal duplicates;
- a candidate that is a confirmed replacement target but has **no raw id/slug
  collision at all** (the `structure-0020`-vs-`st4` case) is still surfaced
  in `report.legacyReplacementAudit.appliedInThisBatch` with
  `resolvedViaCollision: false`, so it's never silently indistinguishable
  from an unrelated brand-new record;
- **semantic replacement is never inferred from title/name similarity** —
  only an explicit, reviewed `legacyReplacements.json` entry can bypass a
  mapped-v1 collision, at any point in this pipeline.

Because this preview never includes the 23 mapped v1 records in its own
output to begin with (they exist only as its collision baseline), it never
itself suppresses anything — the audit exists purely so the preview
accurately foreshadows what the real `LocalMappedV2Store` merge will produce
once these same research candidates and this same replacement map are
promoted together.

### Human review is mandatory

`legacyReplacements.json` is never machine-generated from name/slug
similarity, and no code path in this repository writes to it. Every entry
that exists today was populated *only* from decisions already reviewed and
recorded in `tmp/v2-import-preview/legacy-reconciliation.json`'s
`supersededByCanonical` classification (itself grounded in explicit PART 2
editorial cross-references and the PART 5 duplicate/entity-resolution log —
never inferred from name similarity alone, per that reconciliation's own
methodology). Adding a new entry always means a person reviewed the specific
evidence for that specific real-world entity and recorded why — the mandatory
`reason` field exists to make that review visible and auditable in the
committed file itself, not just in a separate report.

### Config paths

```
V2_ENTITIES_JSON_PATH            # default: data/v2/entities.json
V2_RELATIONSHIPS_JSON_PATH       # default: data/v2/relationships.json
V2_LEGACY_REPLACEMENTS_JSON_PATH # default: data/v2/legacyReplacements.json
```

These mirror v1's existing `ARCHIVE_JSON_PATH` override pattern
(`backend/stores/fileStore.js`) and are resolved with `path.resolve()`
exactly the same way. They are **operator/developer-controlled local
configuration**, not user input reachable from any HTTP request — no route
or query parameter ever influences these paths, so there is no client-facing
path-traversal surface. Neither path, nor any other filesystem path, is ever
included in an `/api/v2` response (`GET /api/v2` continues to expose only
`version`/`status`/`supportedEntityTypes`, per `backend/test/v2/routes.test.js`'s
existing secret/path-leak assertions).

The default (relative to `backend/v2/localData/`) only resolves correctly
when running the backend directly from the repository, where `data/v2/`
sits three directories up. `backend/Dockerfile` copies only the `backend/`
directory into the image (`/app`), not the repository's top-level `data/`
— exactly the same reason `ARCHIVE_JSON_PATH` is explicitly overridden in
`docker-compose.yml` today. So `docker-compose.yml`'s
`antiochia-archive-backend` service also always sets
`V2_ENTITIES_JSON_PATH=/appdata/private/v2/entities.json`,
`V2_RELATIONSHIPS_JSON_PATH=/appdata/private/v2/relationships.json`, and
`V2_LEGACY_REPLACEMENTS_JSON_PATH=/appdata/private/v2/legacyReplacements.json`,
pointing at the same `./data:/appdata/private` bind mount `ARCHIVE_JSON_PATH`
already uses — all three variables are only ever *read* when
`V2_DATA_STORE=local` is explicitly set, so they are inert at the default
`V2_DATA_STORE=empty`.

### Missing file behavior

`data/v2/entities.json`, `data/v2/relationships.json`, and
`data/v2/legacyReplacements.json` are all committed to the repository, so a
**missing** file is treated as a configuration or repository problem, not an
empty dataset: `loadNativeEntities`/`loadNativeRelationships`/
`loadLegacyReplacements` throw a clear, explicit error identifying the
expected path rather than silently falling back to `[]`. This deliberately
mirrors "fails loudly" from "Local real-data v2 runtime" above — a broken
local editorial runtime must be obvious at startup, never a silent empty
result that looks the same as "no content authored yet".

### Relationship API

Two new read-only endpoints (no write path exists for either):

- **`GET /api/v2/relationships`** — paginated list of relationship edges,
  optionally filtered by a controlled `type` (one of `RELATIONSHIP_TYPES`).
  Uses its own small query parser (`parseRelationshipListRequest` in
  `backend/v2/routes/v2Routes.js`), not `validators/filters.js`, since that
  module's filter surface is entity-oriented.
- **`GET /api/v2/entities/:id/related`** — see "Related entity API" below.

### Related entity API

Returns each related entity paired with the relationship edge that connects
it to `:id`, rather than a bare entity array:

```json
{
  "success": true,
  "data": [
    { "relationship": { "id": "...", "type": "hasSite", "sourceId": "...", "targetId": "..." }, "entity": { "id": "...", "entityType": "structure", ... } }
  ],
  "meta": { "version": "v2", "count": 1, "limit": 20, "cursor": null, "nextCursor": null }
}
```

Both `relationship` and `entity` are passed through the same allowlist
serializers as every other public response (`serializePublicRelationship`,
`serializePublicEntity`) — never a raw internal record. Entity pagination
reuses the store's existing `getRelatedEntities(id, { limit, cursor })`
cursor contract unchanged. Relationship pairing is a **documented, bounded
best-effort enrichment**: it separately fetches at most one page
(`MAX_PAGE_LIMIT` = 100) of relationship edges touching `:id` and matches
them client-side in the route handler, rather than extending the `V2Store`
interface itself (out of scope for an infrastructure-only step). In a
future deployment with more than 100 relationship edges on a single entity,
a small number of pairs could show `relationship: null` while the related
entity is still returned correctly — an accepted tradeoff for this local/dev
step, in the same spirit as `FirestoreV2Store`'s already-documented
two-direction-query tradeoff for `getRelatedEntities` (see "Relationship
reads" above).

### Publication visibility

Every public list endpoint and single-record lookup (`/api/v2/entities`,
every per-type list, `/api/v2/entities/:id`, `/api/v2/relationships`,
`/api/v2/entities/:id/related`) now filters to records whose `status` is
**exactly** `"published"` before serializing a response — `draft`,
`inReview`, `archived`, and a missing/absent `status` are all treated as
*not yet public*. A direct lookup of a non-public id returns the same
`{ success: false, error: "Entity not found." }` 404 as a truly unknown id,
never a different status code that would let a client distinguish "doesn't
exist" from "exists but isn't published yet".

This filtering happens **only at the route layer**
(`backend/v2/routes/v2Routes.js`), never inside `MemoryV2Store` or
`LocalMappedV2Store` itself — store-level code (and the tests that exercise
it directly, e.g. `backend/test/v2/stores/localMappedV2StoreMerge.test.js`)
can still read every record regardless of status, which is what a future
editorial/admin path will need.

**`media` and `source` entities are exempt from this rule**: neither schema
defines a `status`/`PUBLICATION_STATUS` field at all (`media.js` and
`source.js` both deliberately skip `validateBaseEntity`), matching how v1's
gallery/source content was already always public. They remain visible
exactly as before this step.

All 23 mapped v1 entities already carry `status: "published"` (set
explicitly by every mapper function except the gallery/media one, which is
covered by the exemption above), so this new filtering changes no existing
count or response.

### Editorial workflow

This step establishes the intended standard workflow for every future
cultural record, from research to (eventual) production:

```
researched content
  -> source review (reviewed citations, per "Source requirement" below)
  -> authored as a native v2 entity (data/v2/entities.json, status: "draft" while in progress)
  -> relationship authored/reviewed if it connects to other entities (data/v2/relationships.json)
  -> validated (validateEntity() / validateRelationship(), collision + referential integrity checks)
  -> local preview (V2_DATA_STORE=local, /api/v2, status flipped to "published" when ready)
  -> eventual Firestore migration (a separate, explicit, reviewed step — see
     "Future Firestore v2 strategy" below; still unimplemented)
```

Nothing in this step performs the last step (Firestore migration) — it only
makes the earlier steps possible to exercise locally, end to end, before
that decision is made.

### Source requirement (documented, not yet enforced)

No current v2 schema requires a `source`/`sourceIds` reference on
`community`/`belief` entities, and this step does not add such a
requirement to the validators. It documents the **future editorial rule**
this workflow is meant to support: historical claims and community/belief
descriptions should carry a reviewed `source` reference (or `sourceIds`,
per the existing `structure`/`story`/`music`/`proverb` convention) before
being marked `status: "published"`. Enforcing this in the schema layer is
left to the future content task that actually authors sourced records — it
is not implemented here, and no source is fabricated to satisfy it.

### No cultural content authored in this task

`data/v2/entities.json` and `data/v2/relationships.json` remain exactly
`{ "entities": [] }` and `{ "relationships": [] }` — verified by
`backend/test/v2/localData/nativeV2DataSource.test.js` and by the content
safety review in this step's validation pass. Every fixture used to exercise
the merge/collision/referential-integrity/API code paths
(`community-test-1`, `belief-test-1`, `place-test-1`, and similar) is
obviously fictional, lives only inside test files or temporary files created
and destroyed by a single test run, and is never written to the committed
`data/v2/*.json` files. No Arab Alawite, Sunni, Orthodox, Jewish, Armenian,
Arab Christian, Turkish, Kurdish, or any other real community/belief/place
record is introduced anywhere by this step.

## Cultural dataset import preview

`backend/v2/importPreview/` turns externally-supplied canonical cultural
research (a "master dataset" — historical contexts, communities, beliefs,
places, structures, stories, music, media, sources, and relationships,
authored and reviewed outside this repository) into a validated, normalized
**preview** of what a real v2 import would look like — without actually
importing anything. This is infrastructure and validation tooling, not a
one-off script: it is meant to be re-run every time a new or revised
research batch is supplied.

**This is not a production import path.** It never writes
`data/v2/entities.json` or `data/v2/relationships.json` (the committed,
currently-empty native data files described above), never contacts
Firestore or Cloud Storage, and never pushes or deploys anything. Promoting
reviewed preview output into the committed native data files remains a
separate, explicit, human decision every time — this tool only makes that
decision safer to make by front-loading validation.

### Where the research input lives

Canonical research text is supplied as six files under a repository-root
`research-input/` directory, which is **git-ignored** (see `.gitignore`) and
therefore never committed:

```
research-input/antiochiaarchive_master_dataset_part1.txt              (metadata, historicalContext, community, belief)
research-input/antiochiaarchive_master_dataset_part2.txt              (place, structure)
research-input/antiochiaarchive_master_dataset_part3.txt              (story, music — authoritative for these two types)
research-input/antiochiaarchive_master_dataset_part4_regenerated.txt  (media, sources, relationships — supersedes any older part4/5)
research-input/antiochiaarchive_master_dataset_part5_regenerated.txt  (duplicate/entity resolution log, rights issues, unresolved questions, quality report)
research-input/registry_recovery.txt                                  (source/media registry recovery, relationship evidence corrections)
```

The tooling (`backend/v2/importPreview/`) IS committed; the research text it
reads is not. Running the CLI without `research-input/` present fails
loudly (see "Missing input" below) rather than silently treating the
dataset as empty.

### Pipeline

`backend/v2/importPreview/researchParser.js` — a pure text -> structured-
data parser, no policy applied:

- PART 1-3 use fenced ` ```yaml id="..." ` code blocks, one per record.
- PART 4/5 and the registry-recovery file use a
  `====...====\nSECTION TITLE\n====...====` header followed by a stream of
  YAML documents separated by `---` lines. The last document in several
  real sections is followed by loose prose with no `---` before the next
  boundary (e.g. a trailing normalization-rules note after the last source
  record) — `parseYamlStream()` recovers from this generically by retrying
  with progressively fewer trailing lines rather than dropping the record.
  The source files also mix LF and CRLF line endings within the same file;
  every entry point normalizes this first.
- `registry_recovery.txt` mixes narrative prose with YAML-shaped blocks in
  a way that isn't a uniform stream, so `parseRegistryRecovery()` is a
  targeted (not generic) parser for its specific known sub-sections.

`backend/v2/importPreview/normalizeResearch.js` — transforms a parsed
record into the v2 shape under the no-invention policy described below.
Never validates against the real schemas itself (that's the next step) and
never writes anything.

`backend/v2/importPreview/buildImportPreview.js` — the orchestrator:

1. Maps the real `data/archive.json` (23 v1 records) via the existing
   `mapAndValidateArchive()` — the collision baseline. Never writes it.
2. Reads and parses the six research files.
3. Merges K. SOURCES / J. MEDIA ASSETS with `registry_recovery.txt`'s
   identity-restored and context-only supplements (keyed by id), and
   applies its relationship evidence corrections (e.g. `relationship-0049`
   -> `evidenceSourceIds: [source-0030]`).
4. Normalizes every record, applies the publication-status policy, checks
   id/slug collisions against the mapped v1 set (and within the batch),
   and validates every entity/relationship with the **real** v2 schema
   validators (`validateEntity()`, `validateRelationship()` —
   the same ones `LocalMappedV2Store` uses).
5. Anything that fails validation, collides, or references something that
   was itself excluded is **excluded with a recorded reason** — never
   silently dropped, never force-included as invalid data. The included
   sets therefore have zero invalid records by construction.

`backend/scripts/build-v2-import-preview.js` is the CLI entry point:

```
node backend/scripts/build-v2-import-preview.js [--research-dir <path>] [--out <dir>]
```

Defaults: `research-input/` for input, `tmp/v2-import-preview/` (also
git-ignored) for output — `entities.json`, `relationships.json`,
`sources.json`, `media.json`, `report.json`. Exits non-zero only if a
record failed schema validation or normalization outright (collisions and
orphan-relationship exclusions are expected, reported outcomes, not
failures).

### Missing input

Both the six research files (input) and the `tmp/` output directory are
git-ignored, so a fresh checkout has neither. `buildImportPreview()` reads
all six files eagerly and throws a clear "Missing research input file(s)"
error naming exactly which ones are absent if any are missing — it never
substitutes an empty dataset for a missing file, mirroring the same
fail-loudly rule already used for `data/v2/entities.json`/
`relationships.json` (see "Missing file behavior" above).

### No-invention policy

Every uncertainty marker the research vocabulary defines (`UNKNOWN`,
`NEEDS VERIFICATION` and other `NEEDS ...` variants, `NO RELIABLE SOURCE
FOUND`, `NOT YET RESEARCHED`, `UNRESOLVED`) is recognized by
`isSentinel()` and is **never** passed through as if it were real content:

- A sentinel value inside a multilingual field (`title`, `summary`,
  `officialName`, `etymology`, ...) drops just that language key — e.g. a
  `title.ar` of `"NEEDS VERIFICATION"` is omitted, not published as literal
  placeholder text; the field survives with whatever real languages remain.
- A sentinel element inside a string array (`tags`, `historicalNames`, ...)
  is filtered out; a sentinel scalar field (`music.subgenre`, which is
  literally `"UNKNOWN"` on every research record) is omitted entirely.
- `place.coordinates` is a sentinel string on every one of the 28 research
  place records (`NEEDS VERIFICATION` / `NOT APPLICABLE AS SINGLE POINT`)
  — no record has real numeric coordinates, so the field is always omitted
  (the schema requires `{latitude, longitude}` if present at all; passing
  the sentinel through would fail validation even if this rule didn't
  exist).
- Research fields with no current v2 schema equivalent — `confidence`,
  embedded association arrays like `associatedCommunities`/
  `beliefConnections`/`locatedIn` (the architecture requires these to be
  relationship records, not embedded fields; see "Relationship model"
  above), `dates`, and similar — are preserved losslessly on a
  `researchExtensions` object rather than dropped or force-fit into a
  schema field that doesn't match. `researchExtensions` is never on any
  type's public serializer allowlist, so it can never leak publicly
  regardless of an entity's status; unlike the sentinel-stripping above
  (which protects schema-validated, potentially-public fields),
  `researchExtensions` preserves raw research values verbatim, including
  uncertainty markers, since it is purely an internal editorial reference.
- Type mismatches are transformed, never guessed past ambiguity: research
  `period` (a free string or `{start, end}`) becomes the schema's
  `period.label.en`; research `officialName`/`etymology` (plain strings)
  become `{tr: ...}`/`{en: ...}`; research `historicalNames` (plain
  strings) become `[{name: ...}]`; a numeric `source.year` becomes a
  string. Where the research value doesn't map unambiguously to a
  controlled vocabulary (e.g. `source.type: "digitalMemoryProject"` has no
  clean `SOURCE_TYPES` equivalent), the field is **omitted**, not guessed.

### Research status vs. publication status

Research `status: "published"` is **never copied blindly** into the
preview. `applyPublicationStatusPolicy()`:

- Never upgrades `draft`/`inReview`/`archived` — only ever downgrades.
- Keeps `status: "published"` only when *every* sourceId the entity cites
  is one of the small set of sources restored to identity level by
  `registry_recovery.txt` (`source-0030`, `source-0046`, `source-0056` in
  the batch this pipeline has processed so far — see "Unresolved source
  policy" below). Otherwise it downgrades to `"inReview"`.
- Otherwise leaves the research status as-is.

In practice, because almost every source citation in this research batch
is bibliographically unresolved, this downgrades the great majority of
research-labeled `"published"` records to `"inReview"` — nothing in the
preview is publicly visible (per the existing publication-visibility rule:
only `status === "published"` is public) unless its full citation trail is
already resolved.

### Oral history lead policy

The research's `story` records carry a `storyRecordType` field —
`publishedOralHistorySource` (a citation to an already-published memory
project, not a reproduced individual testimony) or `ORAL_HISTORY_LEAD` (a
**future interview topic — no interview has been recorded yet**). No
schema change was made to represent this distinction; it didn't block safe
exclusion from the public API:

- `storyRecordType` is normalized (camelCase: `oralHistoryLead` /
  `publishedOralHistorySource`) and carried as an extra field on the
  `story` entity. It is not on `story`'s public serializer allowlist, so it
  can never leak even if some future code path forgot the status check.
- Independently, `applyPublicationStatusPolicy()` **forces** `status:
  "draft"` for any record with `storyRecordType: "ORAL_HISTORY_LEAD"`,
  regardless of whatever status the research itself assigned. This is a
  second, independent guarantee — not just the allowlist.
- Net effect: none of the 39 oral-history-lead records in this batch can
  ever reach the public story API. This was achievable with the *existing*
  schema and the existing publication-visibility route filter; introducing
  a first-class `recordType` schema field remains a documented option for
  a future task if the editorial workflow needs to query on it directly,
  but was not necessary for safe import and was not implemented here.

### Unresolved source policy

`source.type`/`title`/`author`/etc. sentinel values are omitted exactly
like any other field (see "No-invention policy" above) — no bibliography is
ever fabricated for an unresolved source. Three tiers exist in the research
batch processed so far:

1. **Identity-level restored** (`source-0030`, `source-0046`,
   `source-0056`): real `title`/`type`/`year`/etc. recovered. These are the
   only sources that can keep an entity's `status: "published"`.
2. **Context-only** (recovered via `registry_recovery.txt`'s
   "PART 3'TEN GERİ KAZANILAN..." section — 19 in this batch): a short
   `recoveredContext` note and `supportsEntityIds` survive as
   `researchExtensions`, but no bibliographic identity — still treated as
   unresolved for the publication-status policy.
3. **Bibliographically unresolved but referenced** (49 in this batch, from
   `registry_recovery.txt`'s `unresolvedSourceIds` list) and **not
   recoverable even at the ID level** (72 in this batch, per
   `registry_recovery.txt`'s final counts) — neither is fabricated. The
   pipeline never invents a `source-NNNN` id to fill a registry gap.

Every `source` entity the pipeline produces still passes the real
`validateSourceEntity()` schema — omission, not invalid data, is how
unresolved fields are represented.

### Recovered vs. missing media policy

Every media record recovered in this batch (20, against a research-declared
39) currently has `safeToPublish: false` and `rightsStatus:
"NEEDS_VERIFICATION"` or a restricted license — **zero** have cleared
rights. The pipeline reflects this directly, never invents a clearance:

- `rightsStatus` maps `NEEDS_VERIFICATION` -> `"pendingReview"` and
  `RESTRICTED_NONCOMMERCIAL_NO_DERIVATIVES` -> `"restricted"` — **never**
  `"cleared"` for any record in this batch, by construction (there is no
  mapping target that produces `"cleared"`).
- `mediaType` (research: `historicalPhoto`/`photo`) maps to the schema's
  `"image"`; `mediaRole` is always `"realArchiveMedia"` (none are
  AI-generated in this batch).
  `originalStoragePath`/`derivativeStoragePaths` are never set — no
  record has a real file yet (only a `proposedFilename`, kept in
  `researchExtensions`); inventing a storage path would misrepresent
  content that doesn't exist on disk.
- The 19 media records the research declares but could not recover (even
  at the ID level) are never fabricated — the preview's media count is
  exactly what was recovered, not the originally-declared 39.
- Existing v1 media provenance (`public/images/`, `MEDIA-PROVENANCE.md`,
  the already-reviewed `imageMetadata` on `data/archive.json` records) is
  **never** touched, overwritten, or downgraded by this pipeline — it only
  ever reads `data/archive.json` for id/slug collision detection, exactly
  like `LocalMappedV2Store`.

### What this preview validates and reports

`report.json` (see `backend/v2/importPreview/buildImportPreview.js`
`buildReport()`) records, for the batch processed: input counts per type;
normalized (included) counts per type; excluded counts and, per excluded
record, an explicit reason (`idCollision`, `slugCollision`, `schemaInvalid`,
`orphanSource`/`orphanTarget`, `sourceTypeMismatch`/`targetTypeMismatch`,
or `normalizationError`); the publication-status downgrade list;
oral-history-lead vs. public-story-candidate classification; and a
`specialCases` section covering the entity-type edge cases the research
surfaced (a `crossTraditionPractice`-labeled belief, historical-population
"communities", `heritageEnsemble` structures, and the research's own
observation that individual mosaic artifacts may eventually need a
dedicated entity type) — each with an explicit recommendation and whether a
schema change was actually made (no broad schema change was made by this
step; every case above validates against the existing schemas as-is).

## What is deliberately NOT implemented

- No real v2 Firestore document has been written (`FirestoreV2Store` is
  read-only and is not the selected store by default).
- No Cloud Storage bucket, upload, or media-serving path.
- No write/create/update/delete endpoints under `/api/v2`.
- No actual community, belief, place, or proverb records anywhere — not in
  Firestore, not in the local mapped runtime, not in any datastore.
  `data/v2/entities.json` is committed and readable, and the *capability* to
  merge such records in exists as of this step (see "Local editorial entity
  + relationship data infrastructure" above), but the file itself stays
  `{ "entities": [] }`. The one exception to "nothing is written or
  migrated" is `LocalMappedV2Store` itself (`V2_DATA_STORE=local`), which
  holds real `structure`/`story`/`music`/`historicalContext`/`media`
  records **in an in-process, local-only memory store**, rebuilt from
  `data/archive.json` on every startup — never persisted to Firestore, a
  file, or any other datastore. See "Local real-data v2 runtime" above.
- No actual relationships between entities — `v2Relationships` (Firestore)
  remains an empty, documented collection shape, and `data/v2/relationships.json`
  (local) is committed but stays `{ "relationships": [] }`. The *capability*
  to validate and merge relationship edges — including referential integrity
  and the explicit no-auto-inverse rule — exists as of this step; no edge is
  actually authored.
- No real consent records — `consent.js` is validation only; `v2Consents`
  and `v2Editorial` are documented, unused collection names.
- No admin/editorial UI for v2.
- No language-specific (`/tr/`, `/en/`, `/ar/`) routing for v2 entities.
- No `--apply` mode for the migration CLI.
- No production import path for the cultural-dataset preview pipeline
  (`backend/v2/importPreview/`) — it never writes `data/v2/entities.json`
  or `data/v2/relationships.json`; it only writes preview JSON under the
  git-ignored `tmp/v2-import-preview/`. Promoting reviewed preview output
  into the committed native data files is a separate, explicit, manual step
  this tooling does not perform.
- No real community/belief/place record from the cultural-dataset preview
  has been promoted into `data/v2/entities.json` — those files remain
  exactly `{ "entities": [] }` / `{ "relationships": [] }` after this step,
  same as after the previous one.

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
