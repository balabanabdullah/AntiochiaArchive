# AntiochiaArchive semantic and AI-search readiness

This document describes the current implementation and a cautious path toward
source-backed entity discovery, semantic retrieval, stable citation, and an
application-level cultural knowledge graph. It does not promise search ranking,
AI citation, or rich-result eligibility. Machine-readable claims must remain
visible, accurate, and supported by the archive.

## Current implementation

The production site is a Vite multi-page application served by Nginx. Public
HTML includes unique titles, descriptions, canonical URLs, Open Graph metadata,
real navigation links, a sitemap, and crawlable category pages. Admin and
submission pages are `noindex,nofollow`, and protected APIs remain excluded in
`robots.txt`.

The homepage now publishes a small Schema.org `WebSite` JSON-LD object. History,
Stories, Structures, Beliefs, Music, and Gallery each publish a
`CollectionPage` plus a `BreadcrumbList`. The data describes only the visible
page purpose and real Home-to-collection hierarchy. No archive records, people,
events, sources, organizations, counts, ratings, or affiliations are invented.

The site already uses `header`, `nav`, `main`, `section`, `article`, `aside`, and
`footer` elements extensively. Visible category breadcrumbs are navigation
landmarks, and all independently rendered archive cards use `article`. Each
public page has one primary `h1` and a logical supporting heading structure.

### Static content and JavaScript content

Before JavaScript runs, each collection page exposes its purpose through a
unique title, primary heading, concise hero summary, navigation, filters, call
to action, and footer. These existing summaries are accurate and sufficient;
duplicating them as extra SEO text would reduce clarity.

The 23 current records are rendered into collection cards from the API. `public/script.js`
loads the authoritative `GET /api/archive` response once, selects the active
TR/EN/AR values, and renders:

- 3 history records;
- 3 stories;
- 4 structures;
- 4 belief/tradition records;
- 3 music records; and
- 6 gallery records.

Search, filters, localized card text, gallery captions, and the lightbox depend
on JavaScript. Every record also has a crawlable `/archive/{slug}/` page whose
default content is present directly in HTML. `/api/archive` remains the only
public runtime data source for collection cards: in production it reads
Firestore, while local file mode
reads `data/archive.json` behind the same API. There is no parallel public
archive snapshot. Detail pages are generated deterministically from the reviewed
local release snapshot, which is synchronized with Firestore through a
controlled backup-and-merge release procedure.

## Current archive entity model

The archive API exposes a six-category object. The local seed/reference file is
`data/archive.json`. The current dataset uses unique
prefixed IDs (`h1`, `s1`, `st1`, `b1`, `m1`, `g1`, and related values). Every
record also has a globally unique stable `slug` and controlled `entityType`,
validated at build time and by the backend archive validator.

| Meaning | Current fields |
| --- | --- |
| Identity | immutable `id`, stable public `slug`, controlled `entityType` |
| Top-level collection | enclosing `history`, `stories`, `structures`, `beliefs`, `music`, or `gallery` array |
| Filter subtype | `categoryKey` |
| Multilingual identity | `title.tr`, `title.en`, `title.ar` |
| Multilingual description | `body` or `desc`; gallery uses `caption` |
| Labels and periods | `era`, `tag`, or gallery `category` |
| Media reference | `image` or `src` |
| Placeholder visual metadata | `svgType`, `svgColor`, `svgBg` |
| Small visual marker | `icon` or `badge` |

The model preserves multilingual content well and is flexible enough for the
current card UI. It does not contain stable slugs, controlled entity types,
alternate names, verified places, date ranges, relationships, citations, media
provenance, rights, or editorial status.

## Recommended optional entity model

Add fields only to records for which verified data exists. Do not insert empty
properties into all records, and keep existing fields readable for backward
compatibility.

```json
{
  "id": "immutable-internal-id",
  "slug": "stable-public-slug",
  "entityType": "structure",
  "categoryKey": "existing-filter-value",
  "title": { "tr": "...", "en": "...", "ar": "..." },
  "alternateNames": { "tr": [], "en": [], "ar": [] },
  "description": { "tr": "...", "en": "...", "ar": "..." },
  "location": { "placeId": "...", "name": { "tr": "...", "en": "...", "ar": "..." } },
  "coordinates": { "latitude": 0, "longitude": 0 },
  "period": { "label": { "tr": "...", "en": "...", "ar": "..." }, "start": "...", "end": "..." },
  "relationships": [],
  "sources": [],
  "media": []
}
```

Recommended rules:

- `id` is immutable and never derived from a translated title.
- `slug` is stable, lowercase, URL-safe, and retained through title changes.
- `entityType` comes from a controlled archive vocabulary, not automatically
  from `categoryKey`.
- location, coordinates, and date bounds are omitted unless verified. Sensitive
  or private locations require an editorial disclosure policy.
- multilingual values keep the current `{tr,en,ar}` pattern.
- future fields remain optional so old Firestore documents and file mode keep
  working without a bulk migration.

## Controlled entity vocabulary

The archive vocabulary should describe the record first; Schema.org mapping is
a separate publishing decision.

| Archive type | Intended use | Possible Schema.org mapping | Mapping quality |
| --- | --- | --- | --- |
| `place` | A geographically identifiable place | `Place` | Direct when identity/location is verified |
| `structure` | A specific building, monument, bridge, or built work | `LandmarksOrHistoricalBuildings`, otherwise `Place` | Conditional; do not use for generic architecture themes |
| `story` | An oral history, testimony, memory, or narrative record | `CreativeWork` | Approximate until authorship/provenance is known |
| `tradition` | A belief, practice, feast, craft, or other living tradition | `CreativeWork` | Approximate; Schema.org has no necessary one-to-one archive class here |
| `music` | A composition, recording, performance memory, or musical tradition | `MusicComposition`, `MusicRecording`, or `CreativeWork` | Conditional on what the record actually represents |
| `artifact` | A documented object or visual work | `CreativeWork` or a verified subtype | Approximate unless the object type is known |
| `historicalContext` | A period summary or historical theme | `CreativeWork` | Approximate; never label it `Event` unless it documents a specific event |
| `person` | A sourced, public biographical entity | `Person` | Direct, but no current record should be converted automatically |
| `community` | A documented cultural or social community | No automatic mapping | `Organization` is valid only for an actual organization |

One record can later use a primary archive type plus tags. Avoid forcing a
structure mentioned inside a story to become the story's own entity type.

## Relationship model

`relatedIds: ["id-1", "id-2"]` is easy to add, but it cannot explain why two
records are related. Prefer a small typed model once controlled relationship
terms and editorial validation exist:

```json
{
  "relationships": [
    {
      "targetId": "another-record-id",
      "type": "locatedIn",
      "sourceIds": ["source-id-if-needed"]
    }
  ]
}
```

Candidate terms are `locatedIn`, `partOf`, `depicts`, `documents`,
`associatedWith`, and a deliberately broad `relatedTo`. Every target must exist;
direction and inverse behavior must be documented; unsupported relationships
must not be inferred from similar names. `relatedIds` can be a transitional
field, but typed relationships are the better long-term representation.

## Source and citation model

The archive schema and admin editor support optional record-level sources. The
current 23 cultural records are not mass-populated with citations; add source
values only after human verification.

```json
{
  "sources": [
    {
      "id": "source-stable-id",
      "type": "book",
      "title": "...",
      "author": "...",
      "publisher": "...",
      "year": "...",
      "url": "https://...",
      "locator": "page, folio, collection, or catalog reference",
      "accessedAt": "YYYY-MM-DD",
      "language": "tr",
      "rights": "...",
      "note": "..."
    }
  ]
}
```

The implemented controlled source types are `book`, `article`, `archive`,
`oralHistory`, `photograph`, `institutionalRecord`, `website`, and `other`.
Source IDs use a stable `source-<UUID>` pattern. Fields remain optional because
useful metadata varies by source type. Oral histories and private collections
also need consent, access, and rights handling outside the public citation
object.

Source metadata improves human verification, historical reliability, academic
reuse, provenance tracking, entity reconciliation, and the quality of evidence
available to search or answer systems. It can support future citations, but it
does not guarantee ranking or inclusion in AI answers.

## Static entity detail pages

The v1.0 build emits one static page per record at `/archive/{slug}/`. The
post-build generator consumes only `data/archive.json`, validates all IDs, slugs,
entity types, media paths, sitemap entries, and internal links, and writes pages
only inside `dist/`. It never reads private submissions or browser credentials.
Each page has directly crawlable English default content, a self-canonical URL,
Open Graph metadata, conservative `WebPage` JSON-LD, media provenance when
available, and Home/collection links. The current client-side language switcher
enhances the same URL for TR, EN, and AR, including RTL.

Firestore remains the authoritative production store for collection-card
runtime data. The controlled release process takes backups, merges approved
fields by immutable record ID, writes once, and verifies that the API and static
release snapshot agree. Never use the full private submissions backup as a
public build input.

Stable detail pages matter because they provide durable citation targets,
shareable URLs, focused internal links, clearer entity boundaries, source
attribution, long-tail discovery, predictable semantic retrieval, and nodes for
a future knowledge graph. They do not guarantee search placement.

## Internal linking findings

Primary desktop, mobile, and footer navigation uses real anchor links to all six
public collections. Visible breadcrumbs now use semantic `nav` elements and
match the structured breadcrumb hierarchy. The homepage brand now links to the
real home URL, and a contribution link uses a truthful label.

Every collection card links to its stable detail page. Detail pages link back to
Home and their parent collection. Record-to-record contextual links remain
intentionally absent because no reviewed relationship data exists.

## Image semantics and future media model

The current archive contains 16 reviewed real record images and 7 intentional
archive placeholders. Generated SVGs remain decorative and hidden from assistive
technology. The optional `imageMetadata` model stores reviewed provenance for
the legacy `image` and `src` asset fields:

```json
{
  "image": "/images/reviewed-example.jpg",
  "imageMetadata": {
    "alt": { "tr": "...", "en": "...", "ar": "..." },
    "caption": { "tr": "...", "en": "...", "ar": "..." },
    "source": "...",
    "author": "...",
    "license": "...",
    "date": "...",
    "originalUrl": "https://...",
    "accessedAt": "...",
    "rightsNote": "...",
    "aiGenerated": false
  }
}
```

The renderer uses localized metadata alt text, then another available metadata
language, then the localized record title. It supports localized lightbox
captions, non-empty attribution, and an explicit multilingual illustrative label
only when `aiGenerated` is `true`. Do not infer dates, people, locations, or
licenses from an image. See `MEDIA-PROVENANCE.md` for the operational workflow.

## Multilingual search limitations

TR, EN, and AR currently share one URL. JavaScript changes visible text,
`lang`, and RTL direction, but the initial HTML and page metadata are English.
There are no distinct language URLs, self-canonicals per language, or valid
`hreflang` alternatives. A crawler may therefore understand the English default
more reliably than client-selected Turkish or Arabic.

A later migration can use `/tr/...`, `/en/...`, and `/ar/...` with:

- server-delivered content in the declared language;
- a self-referencing canonical for every language page;
- reciprocal `hreflang="tr"`, `hreflang="en"`, and `hreflang="ar"` links;
- a deliberate `x-default` destination;
- translated titles, descriptions, Open Graph fields, and JSON-LD; and
- the same immutable entity ID across translations.

Do not publish `hreflang` until those real URLs exist. Neutral stable slugs are
simpler for cross-language entity reconciliation, although localized slugs can
be supported with an explicit mapping and redirects.

## Crawling, answer systems, and trust

`robots.txt` allows public HTML and reviewed image assets while excluding API,
admin, and submission paths from general indexing. Authentication remains the
security boundary; robots rules are not access control. The v1.0 sitemap exposes
the homepage, six completed collections, the methodology page, and all 23 record
detail pages (31 URLs total). No crawler-only text, doorway pages, fake FAQs,
`ai.txt`, or speculative `geo.txt` is needed.

An optional `llms.txt` may later summarize public documentation, but it is not a
standard requirement for visibility and must not replace crawlable pages,
sources, or sitemaps.

The homepage clearly states the archive's cultural-memory purpose and content
organization. Reviewed real images expose their available provenance and rights
metadata, and the public methodology page explains the project's conservative
handling of sources, uncertain claims, image rights, AI imagery, and correction
review. Record-level historical citation coverage is still incomplete, and image
provenance is not treated as evidence for a record's cultural claims. The project
does not claim institutional affiliation, credentials, or review practices that
have not been established.

## Application-level knowledge graph

Firestore can remain the persistence layer. Immutable record IDs form nodes;
typed `relationships` form edges; source IDs and media IDs connect evidence and
representations. The backend can resolve these references and later produce
search indexes or graph-shaped API responses without introducing a graph
database.

Conceptually, verified data could express:

```text
Place --contains--> Structure
Story --documents--> Place
Music --associatedWith--> Community
Media --depicts--> Structure
```

These are relationship patterns, not claims about current records. Build graph
validation for missing targets, duplicate edges, invalid relationship terms,
and source requirements before publishing relationships.

## AI search / GEO strategy

The strategy is entity-first and evidence-first:

1. preserve authentic multilingual descriptions;
2. assign durable IDs, types, and URLs;
3. attach verified citations and media provenance;
4. encode reviewed relationships;
5. expose the same facts visibly and in accurate semantic markup;
6. publish language-specific pages when routing supports them;
7. generate static entity pages from a reviewed snapshot; and
8. measure ordinary search discovery without claiming AI-ranking guarantees.

## Current limitations

- collection cards require JavaScript and `/api/archive`, while every record has
  a static default-language detail page;
- record-level historical citation coverage remains incomplete and image
  provenance is not a substitute for record-level evidence;
- seven records intentionally retain reviewed placeholders;
- multilingual content shares one canonical URL;
- no record-level relationships or knowledge graph exist;
- the public methodology describes established project practice but no formal
  oral-history consent workflow exists yet; and
- no search analytics or webmaster-tool verification is configured in code.

## Priority roadmap

### P1 — deepen trustworthy records

1. Populate optional record-level citations only after human verification.
2. Continue replacing held placeholders with rights-cleared source images.
3. Define and publish an oral-history consent process before accepting media.

### P2 — publish discoverable entity pages

1. Add reviewed typed relationships and contextual internal links.
2. Add more specific record-level structured data only where evidence supports it.
3. Attach a custom domain and update canonicals, Open Graph URLs, and sitemap.
4. Add a dedicated Open Graph image with documented rights.
5. Configure Google Search Console, Bing Webmaster Tools, and privacy-conscious
   search analytics.

### P3 — multilingual and graph expansion

1. Introduce `/tr/`, `/en/`, and `/ar/` routes with reciprocal `hreflang`.
2. Prerender or statically generate all public language/entity combinations.
3. Expand typed relationships into an application-level cultural knowledge
   graph with reconciliation and integrity checks.
4. Add optional public machine-readable documentation only when it reflects the
   actual published archive.

## Validation and references

Run `npm run validate:seo` to check public metadata, one primary `h1`, canonical
and Open Graph URLs, private-page `noindex`, JSON-LD parsing, expected Schema.org
types, breadcrumb structure, and production URL integrity.

The implementation follows the official definitions for
[`WebSite`](https://schema.org/WebSite),
[`CollectionPage`](https://schema.org/CollectionPage), and
[`BreadcrumbList`](https://schema.org/BreadcrumbList). Future type decisions
should be rechecked against the current Schema.org vocabulary and relevant
search-engine structured-data policies before publication.
