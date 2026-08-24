import assert from "node:assert/strict";
import test from "node:test";
import {
  V2_DETAIL_TYPES,
  V2_TYPE_INFO,
  collectPublicV2Entities,
  generateV2DetailDocument,
  v2DetailPath,
  v2EntityFact,
  v2SitemapUrls,
  validatePublicV2Entities,
} from "../scripts/v2-archive-release.js";

function fixtureStore(entities) {
  return () => ({
    async initialize() {},
    async listEntities({ limit }) {
      return { items: entities.slice(0, limit), nextCursor: null };
    },
  });
}

const FIXTURE_ENTITIES = [
  {
    id: "structure-0005", slug: "hz-hizir-ziyareti-samandag", entityType: "structure", status: "published",
    title: { tr: "Hz. Hızır", en: "Shrine of Khidr", ar: "مقام الخضر" },
    summary: { en: "A sacred visitation site." }, structureType: "sacred visitation site",
    media: {
      path: "/images/structures/example.webp",
      alt: { en: "Alt text" }, caption: { en: "A caption." },
      author: "Author Name", source: "Example Archive", license: "Public Domain",
      aiGenerated: false,
    },
  },
  {
    id: "belief-0002", slug: "sunni-islam-hatay", entityType: "belief", status: "published",
    title: { en: "Sunni Islam" }, summary: { en: "Summary." }, tags: ["Islam"],
  },
  {
    id: "music-0001", slug: "fann-oral-poetry", entityType: "music", status: "published",
    title: { en: "Fann" }, summary: { en: "Summary." }, genre: "oral poetry",
  },
  // Never public, never eligible for a detail page — excluded upstream by isPublic().
  { id: "story-0099", slug: "hidden-lead", entityType: "story", status: "inReview", title: { en: "Hidden" }, summary: {} },
  // Statusless media entity: always "public" per isPublic(), but has no slug
  // and is not in V2_DETAIL_TYPES — must never get a detail page.
  { id: "media-0001", entityType: "media", path: "/images/x.webp" },
];

test("collectPublicV2Entities returns only published, slug-bearing, detail-page-eligible entities (never draft/inReview, never media/source)", async () => {
  const entities = await collectPublicV2Entities({ createStore: fixtureStore(FIXTURE_ENTITIES) });
  const ids = entities.map((entity) => entity.id).sort();
  assert.deepEqual(ids, ["belief-0002", "music-0001", "structure-0005"]);
  assert.ok(entities.every((entity) => V2_DETAIL_TYPES.includes(entity.entityType)));
});

test("collectPublicV2Entities returns the public-serializer shape, not the raw internal record (never leaks editorialNotes/researchExtensions/etc.)", async () => {
  const withInternalFields = [{
    ...FIXTURE_ENTITIES[0],
    editorialNotes: "internal only",
    researchExtensions: { secret: true },
    consentRef: "should-never-leave-the-server",
  }];
  const [entity] = await collectPublicV2Entities({ createStore: fixtureStore(withInternalFields) });
  assert.equal(entity.editorialNotes, undefined);
  assert.equal(entity.researchExtensions, undefined);
  assert.equal(entity.consentRef, undefined);
  assert.equal(entity.id, "structure-0005");
});

test("v2EntityFact returns the correct type-specific fact per entity type", () => {
  assert.equal(v2EntityFact({ entityType: "structure", structureType: "mosque" }), "mosque");
  assert.equal(v2EntityFact({ entityType: "music", genre: "folk" }), "folk");
  assert.equal(v2EntityFact({ entityType: "story", storyCategory: "historicalMemory" }), "historicalMemory");
  assert.equal(v2EntityFact({ entityType: "story", tags: ["fallback-tag"] }), "fallback-tag");
  assert.equal(v2EntityFact({ entityType: "historicalContext", period: { label: { en: "Seleucid Era" } } }, "en"), "Seleucid Era");
  assert.equal(
    v2EntityFact({ entityType: "place", title: { en: "Antakya" }, officialName: { en: "Antakya" } }, "en"),
    "",
    "must not repeat officialName when identical to title",
  );
  assert.equal(
    v2EntityFact({ entityType: "place", title: { en: "Antakya" }, officialName: { en: "Antioch on the Orontes" } }, "en"),
    "Antioch on the Orontes",
  );
  assert.equal(v2EntityFact({ entityType: "community" }), "", "community has no single extra fact field");
});

test("validatePublicV2Entities rejects duplicate slugs, invalid slugs, and entity types with no detail-page mapping", () => {
  assert.throws(() => validatePublicV2Entities([
    { id: "a", slug: "same-slug", entityType: "belief" },
    { id: "b", slug: "same-slug", entityType: "place" },
  ]), /Duplicate v2 slug/);
  assert.throws(() => validatePublicV2Entities([{ id: "a", slug: "Not Valid Slug!", entityType: "belief" }]), /invalid or missing slug/);
  assert.throws(() => validatePublicV2Entities([{ id: "a", slug: "ok-slug", entityType: "media" }]), /no detail-page mapping/);
});

test("v2DetailPath and v2SitemapUrls produce the separate /archive-v2/ namespace, never colliding with v1's /archive/", () => {
  const entity = { id: "belief-0002", slug: "sunni-islam-hatay", entityType: "belief" };
  assert.equal(v2DetailPath(entity), "/archive-v2/sunni-islam-hatay/");
  const urls = v2SitemapUrls([entity]);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /\/archive-v2\/sunni-islam-hatay\/$/);
});

test("generateV2DetailDocument produces a canonical, single-H1, correctly-breadcrumbed page per type", () => {
  for (const entity of FIXTURE_ENTITIES.filter((item) => V2_DETAIL_TYPES.includes(item.entityType) && item.status === "published")) {
    const html = generateV2DetailDocument({
      entity,
      stylesheet: "/assets/style-test.css",
      langScript: "/assets/lang-test.js",
      v2ApiScript: "/assets/archive-v2-api-test.js",
      appScript: "/assets/script-test.js",
    });
    const typeInfo = V2_TYPE_INFO[entity.entityType];
    assert.match(html, new RegExp(`<link rel="canonical" href="https://[^"]+${v2DetailPath(entity)}">`));
    assert.equal((html.match(/<h1\b/g) || []).length, 1, `${entity.id} must have exactly one H1`);
    assert.match(html, /"@type":"WebPage"/);
    assert.match(html, new RegExp(`href="${typeInfo.href}"`));
    assert.doesNotMatch(html, new RegExp(`href="${v2DetailPath(entity)}"`), "must not self-link");
    assert.match(html, new RegExp(`data-entity-id="${entity.id}"`));
    assert.match(html, /data-related-entities-section/);
    assert.match(html, /related-entities-section[^>]* hidden /, "related-entities section must ship hidden by default");
    // Every other page (index.html, pages/*.html) has a header search box —
    // a detail page must too, or the site-wide search feature silently has
    // no entry point on its 99 most-visited pages.
    assert.match(html, /id="search-input"/, `${entity.id} is missing the header search box`);
    assert.match(html, /class="search-input-field"/, `${entity.id} is missing the mobile-nav search box`);
  }
});

test("generateV2DetailDocument shows the real media image when present, and the intentional placeholder when absent", () => {
  const withMedia = generateV2DetailDocument({
    entity: FIXTURE_ENTITIES[0],
    stylesheet: "/s.css", langScript: "/l.js", v2ApiScript: "/v2.js", appScript: "/a.js",
  });
  assert.match(withMedia, /<img class="record-detail-image"/);
  assert.match(withMedia, /src="\/images\/structures\/example\.webp"/);
  assert.doesNotMatch(withMedia, /record-detail-placeholder/);

  const withoutMedia = generateV2DetailDocument({
    entity: FIXTURE_ENTITIES[1],
    stylesheet: "/s.css", langScript: "/l.js", v2ApiScript: "/v2.js", appScript: "/a.js",
  });
  assert.doesNotMatch(withoutMedia, /<img class="record-detail-image"/);
  assert.match(withoutMedia, /record-detail-placeholder/);
});

test("generateV2DetailDocument never renders a literal sentinel placeholder value", () => {
  // The real serializer strips sentinels before this ever runs, but the
  // generator itself must not introduce a new leak path if a sentinel-ish
  // string slipped through for any reason.
  const entity = {
    id: "belief-0099", slug: "sentinel-check", entityType: "belief", status: "published",
    title: { en: "Fine Title" }, summary: { en: "Fine summary." },
  };
  const html = generateV2DetailDocument({
    entity, stylesheet: "/s.css", langScript: "/l.js", v2ApiScript: "/v2.js", appScript: "/a.js",
  });
  assert.doesNotMatch(html, /NEEDS VERIFICATION|UNRESOLVED|NOT YET RESEARCHED/);
});

test("a coordinate-bearing place gets a real 'View on Map' <a> CTA linking by canonical id, never a disabled placeholder", () => {
  const entity = {
    id: "place-0099", slug: "sample-place", entityType: "place", status: "published",
    title: { en: "Sample Place" }, summary: { en: "S" },
    coordinates: { latitude: 36.2, longitude: 36.16 },
  };
  const html = generateV2DetailDocument({ entity, stylesheet: "/s.css", langScript: "/l.js", v2ApiScript: "/v2.js", appScript: "/a.js" });
  assert.match(html, /<a class="record-location-link" data-map-cta href="\/pages\/map\.html\?entity=place-0099"/);
  assert.doesNotMatch(html, /disabled/);
  assert.match(html, /location-pin-icon/);
  assert.match(html, /data-i18n="map\.viewOnMapCta"/);
  assert.match(html, /aria-label="View Sample Place on the map"/);
});

test("a coordinate-less public entity renders no map CTA at all — never a disabled/placeholder link", () => {
  const entity = { id: "place-0098", slug: "no-coords", entityType: "place", status: "published", title: { en: "T" }, summary: { en: "S" } };
  const html = generateV2DetailDocument({ entity, stylesheet: "/s.css", langScript: "/l.js", v2ApiScript: "/v2.js", appScript: "/a.js" });
  assert.doesNotMatch(html, /record-location-section/);
  assert.doesNotMatch(html, /data-map-cta/);
});

test("a music entity with audioMediaIds gets a hidden, client-populated audio-section placeholder and loads music.js; one without gets neither", () => {
  const withAudio = {
    id: "music-0099", slug: "sample-track", entityType: "music", status: "published",
    title: { en: "Sample Track" }, summary: { en: "S" }, audioMediaIds: ["media-0001"],
  };
  const htmlWith = generateV2DetailDocument({
    entity: withAudio, stylesheet: "/s.css", langScript: "/l.js", v2ApiScript: "/v2.js", musicScript: "/m.js", appScript: "/a.js",
  });
  assert.match(htmlWith, /data-music-audio-section/);
  assert.match(htmlWith, /<section class="record-detail-section record-audio-section" data-music-audio-section hidden/);
  assert.match(htmlWith, /<script src="\/m\.js"><\/script>/);

  const withoutAudio = { ...withAudio, id: "music-0098", audioMediaIds: [] };
  const htmlWithout = generateV2DetailDocument({
    entity: withoutAudio, stylesheet: "/s.css", langScript: "/l.js", v2ApiScript: "/v2.js", musicScript: "/m.js", appScript: "/a.js",
  });
  assert.doesNotMatch(htmlWithout, /data-music-audio-section/);
  assert.doesNotMatch(htmlWithout, /<script src="\/m\.js"><\/script>/, "music.js must not load on a page with nothing for it to do");
});

test("musicScript is never loaded on a non-music detail page, even when provided", () => {
  const entity = { id: "place-0097", slug: "not-music", entityType: "place", status: "published", title: { en: "T" }, summary: { en: "S" } };
  const html = generateV2DetailDocument({ entity, stylesheet: "/s.css", langScript: "/l.js", v2ApiScript: "/v2.js", musicScript: "/m.js", appScript: "/a.js" });
  assert.doesNotMatch(html, /\/m\.js/);
});

test("a music entity's lyrics/transcript/translation are server-rendered as real text on first paint, escaped, and omitted per-field when absent", () => {
  const entity = {
    id: "music-0096", slug: "with-lyrics", entityType: "music", status: "published",
    title: { en: "T" }, summary: { en: "S" },
    lyrics: { en: "Line one <script>alert(1)</script>" },
    translations: { en: "English rendering of the lyrics" },
  };
  const html = generateV2DetailDocument({ entity, stylesheet: "/s.css", langScript: "/l.js", v2ApiScript: "/v2.js", appScript: "/a.js" });
  assert.match(html, /record-music-text-section/);
  assert.match(html, /data-i18n="music\.lyrics"/);
  assert.match(html, /Line one &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /data-i18n="music\.translation"/);
  assert.doesNotMatch(html, /data-i18n="music\.transcript"/, "an absent field must render no subsection at all");
});

test("a music entity with none of lyrics/transcript/translations renders no text section at all", () => {
  const entity = { id: "music-0095", slug: "no-text", entityType: "music", status: "published", title: { en: "T" }, summary: { en: "S" } };
  const html = generateV2DetailDocument({ entity, stylesheet: "/s.css", langScript: "/l.js", v2ApiScript: "/v2.js", appScript: "/a.js" });
  assert.doesNotMatch(html, /record-music-text-section/);
});

test("dialect/originalLanguage render as metadata rows only for an entity that actually carries them, never fabricated", () => {
  const entity = {
    id: "music-0094", slug: "with-dialect", entityType: "music", status: "published",
    title: { en: "T" }, summary: { en: "S" }, dialect: "Hatay Arabic (local)", originalLanguage: "ar",
  };
  const html = generateV2DetailDocument({ entity, stylesheet: "/s.css", langScript: "/l.js", v2ApiScript: "/v2.js", appScript: "/a.js" });
  assert.match(html, /data-i18n="detail\.dialect"/);
  assert.match(html, />Hatay Arabic \(local\)</);
  assert.match(html, /data-i18n="detail\.originalLanguage"/);
  assert.match(html, />AR</);

  const withoutDialect = { ...entity, id: "music-0093", dialect: undefined, originalLanguage: undefined };
  const htmlWithout = generateV2DetailDocument({ entity: withoutDialect, stylesheet: "/s.css", langScript: "/l.js", v2ApiScript: "/v2.js", appScript: "/a.js" });
  assert.doesNotMatch(htmlWithout, /detail\.dialect/);
  assert.doesNotMatch(htmlWithout, /detail\.originalLanguage/);
});

test("metadata panel (period/type/evidence) is entirely omitted when the entity carries none of those fields", () => {
  const entity = { id: "belief-0100", slug: "no-metadata", entityType: "belief", status: "published", title: { en: "T" }, summary: { en: "S" } };
  const html = generateV2DetailDocument({ entity, stylesheet: "/s.css", langScript: "/l.js", v2ApiScript: "/v2.js", appScript: "/a.js" });
  assert.doesNotMatch(html, /record-metadata-section/);
});

test("metadata panel renders exactly the fields this entity's public shape carries — period for historicalContext, evidence badge only when evidenceType is set", () => {
  const entity = {
    id: "hist-0099", slug: "period-check", entityType: "historicalContext", status: "published",
    title: { en: "T" }, summary: { en: "S" }, period: { label: { en: "Roman" } }, evidenceType: "verifiedHistorical",
  };
  const html = generateV2DetailDocument({ entity, stylesheet: "/s.css", langScript: "/l.js", v2ApiScript: "/v2.js", appScript: "/a.js" });
  assert.match(html, /record-metadata-section/);
  assert.match(html, />Roman</);
  assert.match(html, /data-i18n="detail\.evidenceType\.verifiedHistorical"/);
  assert.doesNotMatch(html, /detail\.typeLabel/, "historicalContext has no structureType/genre/storyCategory to show as Type");
});

test("names section is omitted for an entity with no alternate/historical/local names, and renders historicalNames when present", () => {
  const noNames = generateV2DetailDocument({
    entity: { id: "place-0099", slug: "no-names", entityType: "place", status: "published", title: { en: "T" }, summary: { en: "S" } },
    stylesheet: "/s.css", langScript: "/l.js", v2ApiScript: "/v2.js", appScript: "/a.js",
  });
  assert.doesNotMatch(noNames, /record-names-section/);

  const withNames = generateV2DetailDocument({
    entity: {
      id: "place-0098", slug: "with-names", entityType: "place", status: "published", title: { en: "T" }, summary: { en: "S" },
      historicalNames: [{ name: "Antiocheia" }, { name: "Antiochia" }],
    },
    stylesheet: "/s.css", langScript: "/l.js", v2ApiScript: "/v2.js", appScript: "/a.js",
  });
  assert.match(withNames, /record-names-section/);
  assert.match(withNames, /Antiocheia, Antiochia/);
});

test("a story's storyPlaceId resolves to a real linkable place title when that place is passed in `entities`, and is safely omitted otherwise", () => {
  const place = { id: "place-0001", slug: "antakya", entityType: "place", status: "published", title: { en: "Antakya" }, summary: {} };
  const story = {
    id: "story-0050", slug: "place-linked-story", entityType: "story", status: "published",
    title: { en: "T" }, summary: { en: "S" }, storyPlaceId: "place-0001",
  };
  const withPlace = generateV2DetailDocument({
    entity: story, entities: [place], stylesheet: "/s.css", langScript: "/l.js", v2ApiScript: "/v2.js", appScript: "/a.js",
  });
  assert.match(withPlace, /<a href="\/archive-v2\/antakya\/">Antakya<\/a>/);

  const withoutEntities = generateV2DetailDocument({
    entity: story, stylesheet: "/s.css", langScript: "/l.js", v2ApiScript: "/v2.js", appScript: "/a.js",
  });
  assert.doesNotMatch(withoutEntities, /archive-v2\/antakya/);
});

test("share controls always render WhatsApp/X links and a hidden native-share button, never a tracking script", () => {
  const html = generateV2DetailDocument({
    entity: { id: "music-0099", slug: "share-check", entityType: "music", status: "published", title: { en: "A Song" }, summary: { en: "S" } },
    stylesheet: "/s.css", langScript: "/l.js", v2ApiScript: "/v2.js", appScript: "/a.js",
  });
  assert.match(html, /record-share-whatsapp" href="https:\/\/wa\.me\/\?text=/);
  assert.match(html, /record-share-x" href="https:\/\/twitter\.com\/intent\/tweet\?/);
  assert.match(html, /record-share-native"[^>]* hidden/);
});

test("explore-more ships as an empty, client-populated container — never a baked cross-entity link (which could go stale or self-link)", () => {
  const entity = { id: "story-0051", slug: "explore-more-check", entityType: "story", status: "published", title: { en: "T" }, summary: { en: "S" } };
  const html = generateV2DetailDocument({ entity, stylesheet: "/s.css", langScript: "/l.js", v2ApiScript: "/v2.js", appScript: "/a.js" });
  assert.match(html, /data-explore-more data-entity-id="story-0051" data-entity-type="story"/);
  assert.match(html, /<div class="record-explore-more-grid" data-explore-more-grid><\/div>/);
});

test("REAL DATA: collectPublicV2Entities against the canonical data/ files matches the reviewed per-type public counts", async () => {
  const entities = await collectPublicV2Entities();
  const counts = {};
  for (const entity of entities) counts[entity.entityType] = (counts[entity.entityType] || 0) + 1;

  assert.deepEqual(counts, {
    historicalContext: 22,
    community: 12,
    belief: 8,
    place: 124,
    structure: 15,
    story: 11,
    music: 7,
  });
  assert.equal(entities.length, 199);

  // No oralHistoryLead-shaped story or non-detail-page type ever reaches this set.
  assert.ok(entities.every((entity) => V2_DETAIL_TYPES.includes(entity.entityType)));
  assert.ok(!entities.some((entity) => entity.storyRecordType === "oralHistoryLead"));

  const validation = validatePublicV2Entities(entities);
  assert.equal(validation.count, 199);
});

test("REAL DATA: every published place coordinate is a real, sane number pair — never guessed, never 0/0, never outside the Hatay region", async () => {
  const entities = await collectPublicV2Entities();
  const withCoords = entities.filter((entity) => entity.coordinates != null);

  // Exactly the reviewed, source-verified set as of this round — a regression guard against a
  // coordinate silently appearing (or disappearing) without going through the same research process.
  // 18 from the prior verified-coordinates round + 100 published Hatay local-toponym places.
  assert.equal(withCoords.length, 118);
  assert.ok(withCoords.every((entity) => entity.entityType === "place"));

  for (const entity of withCoords) {
    const { latitude, longitude } = entity.coordinates;
    assert.equal(typeof latitude, "number");
    assert.equal(typeof longitude, "number");
    assert.ok(Number.isFinite(latitude) && Number.isFinite(longitude), `${entity.id} has a non-finite coordinate`);
    assert.ok(!(latitude === 0 && longitude === 0), `${entity.id} has a null-island (0,0) placeholder coordinate`);
    // Hatay province, Turkey — every real place/structure this archive covers falls in this box.
    assert.ok(latitude >= 35.8 && latitude <= 36.7, `${entity.id} latitude ${latitude} falls outside the Hatay region`);
    assert.ok(longitude >= 35.8 && longitude <= 36.6, `${entity.id} longitude ${longitude} falls outside the Hatay region`);
  }
});

test("REAL DATA: no two published places carry a near-duplicate coordinate (each verified point is its own, not copy-pasted)", async () => {
  const entities = await collectPublicV2Entities();
  const withCoords = entities.filter((entity) => entity.coordinates != null);

  for (let i = 0; i < withCoords.length; i++) {
    for (let j = i + 1; j < withCoords.length; j++) {
      const a = withCoords[i].coordinates;
      const b = withCoords[j].coordinates;
      // ~0.0005 degrees is roughly 50m at this latitude — the near-duplicate threshold this round's
      // instructions called out ("50m içinde onlarca farklı yapı aynı coordinate'i almışsa uyar").
      const isNearDuplicate = Math.abs(a.latitude - b.latitude) < 0.0005 && Math.abs(a.longitude - b.longitude) < 0.0005;
      assert.ok(!isNearDuplicate, `${withCoords[i].id} and ${withCoords[j].id} carry near-duplicate coordinates`);
    }
  }
});

test("REAL DATA: no published structure carries a coordinates field — the schema/serializer don't support one yet, so nothing should silently leak through", async () => {
  const entities = await collectPublicV2Entities();
  const structures = entities.filter((entity) => entity.entityType === "structure");
  assert.equal(structures.length, 15);
  assert.ok(structures.every((entity) => entity.coordinates === undefined));
});

test("REAL DATA: public projection carries no internal sentinel placeholder text (UNKNOWN / NEEDS VERIFICATION / TODO / TBD / etc.)", async () => {
  const entities = await collectPublicV2Entities();
  const SENTINEL_RE = /(UNKNOWN|NEEDS(?: LOCAL)? VERIFICATION|NEEDS PRECISE[A-Z \-]*|NEEDS SOURCE-EXACT[A-Z \-]*|NO RELIABLE SOURCE FOUND|NOT YET RESEARCHED|UNRESOLVED|\bTODO\b|\bTBD\b)/i;

  function collectStrings(value, out) {
    if (typeof value === "string") { out.push(value); return; }
    if (Array.isArray(value)) { value.forEach((v) => collectStrings(v, out)); return; }
    if (value && typeof value === "object") { for (const v of Object.values(value)) collectStrings(v, out); }
  }

  for (const entity of entities) {
    const strings = [];
    collectStrings(entity, strings);
    const leaks = strings.filter((s) => SENTINEL_RE.test(s));
    assert.deepEqual(leaks, [], `${entity.id} leaks a sentinel placeholder into public output`);
  }
});

test("REAL DATA: the fixed 'entity'-as-jargon artefacts (this round's content-quality pass) do not regress in public output", async () => {
  const entities = await collectPublicV2Entities();
  const ARTEFACT_RE = /\bentity(?:'\w+)?\b/; // bare English "entity", with or without a Turkish possessive suffix

  // Field-level, not entity-level: several of these records still have a *separate*,
  // known, not-yet-fixed English fragment left in the editorial review queue (e.g.
  // belief-0007.summary.en) — this regression guard only covers the fields actually
  // fixed this round, matching tmp/content-quality-audit.json's safeAutofixApplied list.
  const knownFixedFields = [
    ["belief-0001", "summary", "tr"],
    ["belief-0003", "summary", "tr"],
    ["belief-0007", "summary", "tr"],
    ["belief-0009", "summary", "tr"],
    ["comm-0010", "summary", "tr"],
    ["comm-0010", "summary", "en"],
    ["place-0001", "summary", "tr"],
    ["place-0002", "summary", "tr"],
    ["place-0011", "summary", "tr"],
    ["story-0008", "summary", "en"],
  ];
  for (const [id, field, lang] of knownFixedFields) {
    const entity = entities.find((e) => e.id === id);
    if (!entity) continue; // not every fixed record is necessarily public under every future dataset state
    const text = entity[field]?.[lang];
    if (text === undefined) continue;
    assert.ok(!ARTEFACT_RE.test(text), `${id}.${field}.${lang} regressed a fixed 'entity' authoring artefact back into public output`);
  }
});
