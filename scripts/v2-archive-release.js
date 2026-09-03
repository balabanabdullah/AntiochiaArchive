// Static-release pipeline for the v2 cultural-entity archive, parallel to
// archive-release.js (v1). Only the 7 cultural entity types that actually
// carry a slug (historicalContext/community/belief/place/structure/story/
// music) get a static detail page — media/source entities have no slug at
// all (see backend/v2/schemas/media.js) and are never linked to directly.
//
// collectPublicV2Entities() runs the exact same merge/suppress pipeline the
// live backend uses (createLocalMappedV2Store, reading the canonical
// repo-root data/ files) and applies the exact same publication-visibility
// rule (isPublic, from backend/v2/serializers/publicVisibility.js) and
// public-field allowlist (serializePublicEntity) the live API applies — a
// static page can never show a field, or an entity, the API itself would
// not serve. Everything else in this module is pure and synchronous, so it
// can be unit-tested against fixtures without touching disk (see
// test/v2-archive-release.test.js).

import { createLocalMappedV2Store } from "../backend/v2/stores/localMappedV2Store.js";
import { isPublic } from "../backend/v2/serializers/publicVisibility.js";
import { serializePublicEntity } from "../backend/v2/serializers/publicSerializer.js";
import { PRODUCTION_ORIGIN } from "./archive-release.js";
// The actual detail-page TEMPLATE (generateV2DetailDocument and every markup
// helper it calls, plus V2_TYPE_INFO/v2DetailPath/v2EntityFact) now lives in
// backend/v2/render/detailTemplate.js, not here — see that file's header
// comment for why (the runtime renderer, backend/v2/render/
// entityDetailRenderer.js, needs the identical template and can only reach
// code that ships inside the backend's own Docker image; this scripts/
// directory is not part of that image). Re-exported below so every existing
// caller of this module (scripts/generate-v2-detail-pages.js,
// test/v2-archive-release.test.js) keeps working with zero changes to its
// own imports — "correctness pass" round, Section 3: "do not maintain two
// visually-divergent detail implementations."
export { V2_TYPE_INFO, v2DetailPath, v2EntityFact, generateV2DetailDocument } from "../backend/v2/render/detailTemplate.js";
import { V2_TYPE_INFO, v2DetailPath } from "../backend/v2/render/detailTemplate.js";

// Path segment -> domain entityType, mirroring backend/v2/routes/v2Routes.js's
// TYPE_ROUTES (media/source excluded: they are never standalone detail-page
// content — see backend/v2/schemas/media.js). proverb has 0 public records
// today (see V2-ARCHITECTURE.md "No production migration yet") but is
// included here as static-generation infrastructure: a published proverb
// gets a real detail page the moment one exists, with zero further code
// changes, exactly like every other type in this list.
export const V2_DETAIL_TYPES = Object.freeze(Object.keys(V2_TYPE_INFO));

/**
 * Runs the live merge/suppress pipeline (createLocalMappedV2Store) and
 * returns the public, serialized, detail-page-eligible entities — the exact
 * set (and exact field shape) GET /api/v2/entities would serve today,
 * filtered to the 7 types that have a static page at all. Accepts an
 * injectable store factory so callers (tests) can supply a fixture store
 * instead of reading the real data/ files from disk.
 */
export async function collectPublicV2Entities({ createStore = createLocalMappedV2Store } = {}) {
  const store = createStore();
  await store.initialize();
  const page = await store.listEntities({ limit: 100000 });
  return page.items
    .filter(isPublic)
    .filter((entity) => V2_DETAIL_TYPES.includes(entity.entityType))
    .map(serializePublicEntity)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function validatePublicV2Entities(entities) {
  const slugs = new Set();
  for (const entity of entities) {
    if (!SLUG_PATTERN.test(String(entity.slug || ""))) {
      throw new TypeError(`${entity.id} has an invalid or missing slug.`);
    }
    if (slugs.has(entity.slug)) throw new TypeError(`Duplicate v2 slug: ${entity.slug}.`);
    slugs.add(entity.slug);
    if (!V2_TYPE_INFO[entity.entityType]) {
      throw new TypeError(`${entity.id} has an entityType with no detail-page mapping: ${entity.entityType}.`);
    }
  }
  return { slugs, count: entities.length };
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function v2SitemapUrls(entities) {
  validatePublicV2Entities(entities);
  return entities.map((entity) => `${PRODUCTION_ORIGIN}${v2DetailPath(entity)}`);
}
