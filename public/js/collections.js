/**
 * Collections — a presentation layer only. Every definition below is a pure
 * filter over fields the public serializer already exposes (entityType,
 * tags, structureType, slug — see backend/v2/serializers/publicSerializer.js);
 * nothing here writes to, or is read from, data/v2. A collection is never
 * added unless its member count was verified against the real canonical
 * dataset first (see the counts noted per entry below, and the FRONTEND
 * round report) — no collection asserts a new historical relationship
 * (e.g. no "belief x place" collection: that would require a public
 * relationship record, and today there are zero published ones).
 */
(function exposeCollections(root) {
  "use strict";

  const ANCIENT_ERA_TAGS = Object.freeze(["Seleucid", "Hellenistic", "Roman", "late-antique", "early-Christianity"]);
  const SACRED_STRUCTURE_KEYWORDS = Object.freeze(["church", "mosque", "sacred", "monastery", "synagogue", "shrine"]);

  // titleKey/descKey resolve into public/lang.js's `collections.items.<id>`.
  // Verified counts against the current public dataset (2026): sacred-places
  // 6, ancient-antioch 5, samandag 4, antioch-through-time 22,
  // stories-of-antioch 11.
  const COLLECTION_DEFINITIONS = Object.freeze([
    {
      id: "sacred-places",
      icon: "◈",
      match: (entity) => entity.entityType === "structure"
        && SACRED_STRUCTURE_KEYWORDS.some((keyword) => (entity.structureType || "").toLowerCase().includes(keyword)),
    },
    {
      id: "ancient-antioch",
      icon: "◇",
      match: (entity) => entity.entityType === "historicalContext"
        && (entity.tags || []).some((tag) => ANCIENT_ERA_TAGS.includes(tag)),
    },
    {
      id: "samandag",
      icon: "◐",
      match: (entity) => entity.entityType === "place" && String(entity.slug || "").includes("samandag"),
    },
    {
      id: "antioch-through-time",
      icon: "◷",
      match: (entity) => entity.entityType === "historicalContext",
    },
    {
      id: "stories-of-antioch",
      icon: "❝",
      match: (entity) => entity.entityType === "story",
    },
  ]);

  /**
   * Resolves every collection against a public entity array. Pure: returns
   * [{ id, icon, members }], skipping (not zero-padding) any collection that
   * matched nothing — a collection with 0 real members never renders, per
   * the "don't invent a collection the data can't support" rule.
   */
  function resolveCollections(entities, definitions = COLLECTION_DEFINITIONS) {
    return definitions
      .map((def) => ({ id: def.id, icon: def.icon, members: (entities || []).filter(def.match) }))
      .filter((collection) => collection.members.length > 0);
  }

  root.AntiochiaArchiveCollections = Object.freeze({
    COLLECTION_DEFINITIONS,
    resolveCollections,
  });
})(typeof window !== "undefined" ? window : globalThis);
