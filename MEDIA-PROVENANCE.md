# Media and Provenance Policy

This document defines the metadata and review workflow that AntiochiaArchive
will use when verified sources and real archival media are added. The current
22 archive records have not been populated or migrated as part of this change.
An empty or missing field is not evidence of a fact.

## Record sources

Every archive record may contain an optional `sources` array. Existing records
without this field remain valid.

```json
{
  "sources": [
    {
      "id": "source-550e8400-e29b-41d4-a716-446655440000",
      "type": "book",
      "title": "",
      "author": "",
      "publisher": "",
      "year": "",
      "url": "https://example.org/source",
      "locator": "",
      "accessedAt": "",
      "language": "",
      "rights": "",
      "note": ""
    }
  ]
}
```

The controlled source types are:

- `book`
- `article`
- `archive`
- `oralHistory`
- `photograph`
- `institutionalRecord`
- `website`
- `other`

New source rows receive a stable `source-<UUID>` identifier. Array position is
not an identity. Source fields are optional because useful bibliographic fields
vary by source type, but editors must not publish invented or unverified values.
External source URLs accept only HTTP or HTTPS.

## Image metadata

The existing record-level `image` and gallery `src` fields remain the asset path
or URL. Optional descriptive and rights information belongs in one coherent
`imageMetadata` object:

```json
{
  "image": "/images/example.jpg",
  "imageMetadata": {
    "alt": { "tr": "", "en": "", "ar": "" },
    "caption": { "tr": "", "en": "", "ar": "" },
    "source": "",
    "author": "",
    "license": "",
    "date": "",
    "originalUrl": "https://example.org/original",
    "accessedAt": "",
    "rightsNote": "",
    "aiGenerated": false
  }
}
```

All fields are optional. `originalUrl` accepts only HTTP or HTTPS. Asset fields
accept HTTP/HTTPS or a safe root-relative local path such as
`/images/habib-i-neccar-camii-antakya.jpg`; executable or embedded schemes such
as `javascript:` and `data:` are rejected.

For meaningful images, the public renderer chooses alt text in this order:

1. the requested localized `imageMetadata.alt` value;
2. another available localized alt value;
3. the localized record title.

Decorative SVG placeholders remain hidden from assistive technology. A real
gallery image can expose a localized caption and non-empty attribution in the
lightbox. Empty attribution fields are never rendered.

## Rights and license review

An image may be published only after its identity, rights holder, license terms,
and required attribution have been reviewed. Potentially usable categories
include public-domain works, CC0, CC BY, CC BY-SA, and another license whose
terms have been explicitly reviewed as compatible with this project. Creative
Commons licenses have different conditions, and only a rights holder can grant
a license; see the official [CC license overview](https://creativecommons.org/share-your-work/cclicenses/)
and [public-domain tools](https://creativecommons.org/public-domain/).

Use this decision label for All Rights Reserved, unclear ownership, or an
unknown license:

> DO NOT PUBLISH UNTIL RIGHTS VERIFIED.

Do not infer permission from search-engine availability. Google Images
thumbnails, social-media copies, and arbitrary hotlinks are discovery aids, not
proof of identity, provenance, or reuse rights. This workflow is operational
guidance, not a legal guarantee.

## Research and publishing workflow

1. Research a candidate image from an identifiable source.
2. Verify the depicted subject and contextual claims.
3. Verify the rights holder, license, and attribution requirements.
4. Download the best legitimate original or high-quality copy.
5. Preserve the original source URL and access date.
6. Record accurate multilingual alt text, caption, source, author, license,
   date, and rights notes without filling unknown facts.
7. Create an optimized web derivative while retaining the reviewed original.
8. Publish the asset through the selected storage path.
9. Link `image` or `src` to the archive record and review the public result.

## Attribution

Attribution is assembled only from populated metadata, for example:

```text
Photo: Author · Source: Institution · License: CC BY-SA 4.0
```

The current reusable formatter is intended primarily for a gallery lightbox or
a future record-detail view, where the information is readable without
overloading collection cards. License-specific wording and links must follow
the actual reviewed license.

## AI-generated media

AI-generated imagery is not archival evidence. Do not use it as though it
documents a person, place, structure, object, or event. If a future illustrative
asset is intentionally AI-generated, set `imageMetadata.aiGenerated` to `true`.
The public renderer will then display a clear TR/EN/AR illustrative-image label.
A missing flag is treated as false/unknown; it is never used to infer that an
image is AI-generated.

## File naming

Use lowercase, descriptive, hyphen-separated names with no spaces or camera
identifiers. Examples of format only:

- `habib-i-neccar-camii-antakya.jpg`
- `st-pierre-church-antakya.jpg`
- `uzun-carsi-antakya-1950.jpg`

Include a date only when it has been verified. Do not invent one to make a name
more descriptive.

## Future asset storage

For a small, deliberately curated set, optimized derivatives can live in
`public/images/` and deploy with the frontend. This is simple, versioned with
the application, and suitable while media volume and update frequency are low.

Google Cloud Storage becomes worthwhile when the archive grows, originals and
derivatives need independent retention, multiple editors or publishing jobs
manage media, or media should deploy independently of the frontend. Cloud
Storage is Google Cloud's managed object-storage service; if adopted, use
uniform bucket-level access in preference to per-object ACLs in most cases and
define retention/lifecycle behavior deliberately. See the official
[Cloud Storage overview](https://cloud.google.com/storage/docs/introduction),
[access-control guidance](https://cloud.google.com/storage/docs/access-control),
and [object lifecycle documentation](https://cloud.google.com/storage/docs/lifecycle).
No bucket or upload workflow is implemented by this change.

## Editorial policy still required

A future public methodology page should describe the real, approved process for
editorial review, source verification, oral-history consent, image rights, and
corrections. It must be published only after those practices are defined; this
schema alone must not be represented as an institutional review policy.
