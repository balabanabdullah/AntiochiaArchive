// Runtime cultural-entity detail renderer — the fix for the "no-code CMS"
// round's critical gap: /archive-v2/:slug/ was previously ONLY servable
// from static files generated at build time (scripts/generate-v2-detail-
// pages.js), so a brand-new or edited SQLite entity had no public detail
// page until the next `npm run build`. This module renders the SAME entity
// data any GET /api/v2/entities/:id request would return, as a full
// standalone HTML document, straight from whichever V2Store is currently
// active — no rebuild, no regeneration script, ever.
//
// "correctness pass" round, Section 3: the PREVIOUS version of this file
// hand-rolled its own separate minimal HTML shell (no real header/nav/
// footer, an invented `?lang=` URL scheme the real site has never used).
// That was a real, serious regression risk — an admin publishing through
// SQLite would get a visually and structurally divergent page from every
// existing static entity. This version instead calls the exact same
// template function the static generator uses
// (backend/v2/render/detailTemplate.js's generateV2DetailDocument, shared
// with scripts/v2-archive-release.js — see that module's header for why it
// physically lives inside backend/), resolving the live frontend's current
// asset filenames over HTTP (detailAssetManifest.js) instead of build-time
// dist/index.html scraping. A runtime-rendered page and a build-time-
// rendered page for the same slug are now the same template end to end.

import { isPublic } from "../serializers/publicVisibility.js";
import { serializePublicEntity } from "../serializers/publicSerializer.js";
import { generateV2DetailDocument, V2_TYPE_INFO } from "./detailTemplate.js";
import { resolveDetailAssets } from "./detailAssetManifest.js";

// Only these 8 types ever had a static detail page (see
// scripts/v2-archive-release.js's V2_DETAIL_TYPES) — media/source have no
// slug at all and are never linked to directly.
export const DETAIL_ELIGIBLE_TYPES = Object.freeze(Object.keys(V2_TYPE_INFO));

// The 4 entity types the shared template's mediaMarkup() actually knows how
// to show an image for (via the legacy, migration-era entity.media[0]
// preview shape — see publicSerializer.js's MEDIA_PREVIEW_HOST_TYPES,
// duplicated here rather than imported since that constant is intentionally
// private to the serializer module). place/belief/community/proverb render
// the same "image pending" placeholder in the STATIC build too — this is an
// existing constraint of the shared template, not something the runtime
// path narrows further.
const MEDIA_PREVIEW_HOST_TYPES = Object.freeze(["historicalContext", "story", "structure", "music"]);

/**
 * No indexed slug lookup exists on the V2Store interface (every store keeps
 * entities in one flat, id-keyed collection — see memoryV2Store.js) — this
 * scans the current (bounded, in the hundreds today) entity set once per
 * request. Acceptable for "high read, low/moderate write" traffic; a
 * dedicated indexed lookup is a documented follow-up if traffic ever
 * demands it, not a correctness gap.
 */
export async function findPublicEntityBySlug(store, slug) {
  const page = await store.listEntities({ limit: 100000 });
  const entity = page.items.find((item) => item.slug === slug);
  if (!entity || !isPublic(entity) || !DETAIL_ELIGIBLE_TYPES.includes(entity.entityType)) return null;
  return entity;
}

/** Every currently public, detail-page-eligible entity, serialized — the same set collectPublicV2Entities() computes at build time, but read live from whichever store is active. Used for the shared template's storyPlaceId cross-link lookup. */
async function listPublicDetailEntities(store) {
  const page = await store.listEntities({ limit: 100000 });
  return page.items
    .filter(isPublic)
    .filter((entity) => DETAIL_ELIGIBLE_TYPES.includes(entity.entityType))
    .map(serializePublicEntity);
}

/**
 * Bridges the newer, SQLite-native media model (mediaIds/illustrationMediaIds
 * -> separate `media` entities, resolved and rights-gated at request time)
 * onto the shared template's older, migration-era `entity.media[0]` preview
 * shape (a plain object embedded directly on the entity) — without this, a
 * runtime-created entity whose image was linked through the Admin media
 * widget would always show the "Image pending archival review" placeholder,
 * even with a genuinely uploaded, rights-cleared image attached. Never
 * overrides an entity that already carries a real `media` array (migrated
 * legacy data keeps whatever it already has); only ever adds one when
 * genuinely absent, and only for the same 4 types the template's
 * mediaMarkup() reads. The rights gate is enforced here, not left to the
 * template: an uncleared media id is silently skipped, exactly like
 * referencedMediaHtml() (audio/related-media rendering) does elsewhere.
 */
async function bridgeLegacyMediaPreview(store, rawEntity) {
  if (rawEntity.media || !MEDIA_PREVIEW_HOST_TYPES.includes(rawEntity.entityType)) return rawEntity;
  const ids = [
    ...(Array.isArray(rawEntity.illustrationMediaIds) ? rawEntity.illustrationMediaIds : []),
    ...(Array.isArray(rawEntity.mediaIds) ? rawEntity.mediaIds : []),
  ];
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    const media = await store.getEntityById(id);
    if (!media || media.entityType !== "media" || media.mediaType !== "image" || media.rightsStatus !== "cleared") continue;
    return {
      ...rawEntity,
      media: [{
        path: `/media/${encodeURIComponent(media.id)}`,
        alt: undefined,
        caption: undefined,
        source: media.source,
        author: media.author,
        license: media.license,
        rightsNote: media.rightsNote,
        aiGenerated: Boolean(media.aiGenerated),
      }],
    };
  }
  return rawEntity;
}

/**
 * Renders the full HTML document for a published entity, using the exact
 * shared template the static generator uses. Callers (v2/routes/
 * v2DetailRoutes.js) are responsible for the public-visibility gate — this
 * trusts `entity` is already known-public.
 */
export async function renderEntityDetailHtml(store, rawEntity) {
  const [bridged, entities, assets] = await Promise.all([
    bridgeLegacyMediaPreview(store, rawEntity),
    listPublicDetailEntities(store),
    resolveDetailAssets(),
  ]);
  const entity = serializePublicEntity(bridged);
  return generateV2DetailDocument({ entity, entities, ...assets });
}
