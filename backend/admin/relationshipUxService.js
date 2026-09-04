// Context-aware, human-friendly relationship building ("no-code CMS UX"
// round, Part B). The PRODUCT RULE this whole module exists to satisfy: a
// nontechnical Admin must never need to know a relationship's internal
// vocabulary name (hasSite/hasBelief/locatedIn/...), which entity is the
// canonical "source" vs "target", a raw entity id, or that direction even
// exists as a concept. The Admin only ever says "this record relates to
// that one, in this human way" — this module resolves everything technical
// server-side.
//
// RELATIONSHIP_EDGES below is the compatibility matrix, derived from two
// real sources, not invented: (1) backend/v2/constants/vocabularies.js's
// actual RELATIONSHIP_TYPES (every relationshipType used below is a real,
// existing enum value — none invented), and (2) the REAL relationship data
// already in data/v2/relationships.json, all 81 rows of which are exactly
// {story,music} --associatedWith--> {community,place} — confirmed by
// direct inspection, not assumed. Those four real pairings are encoded
// below with the SAME direction the real data already uses (the cultural
// "expression" record — story/music — is always the technical source, the
// broader community/place is always the target). Every OTHER pairing here
// is new capability this round adds, chosen for exactly one canonical
// direction per real-world fact — e.g. "a belief HAS a sacred structure"
// (hasSite: belief -> structure) and "a community HAS a belief"
// (hasBelief: community -> belief) are each modeled ONCE, not also as a
// second, redundant inverse edge — matching Section 11's explicit "avoid
// duplicates such as X AND its own inverse" rule.
//
// Each edge is only ever surfaced as ONE relationshipType per pairing —
// `practicedBy` is deliberately not used here (it would just be a second,
// redundant phrasing of the same real-world fact `hasBelief` already
// covers) and remains available only through the existing raw/"Gelişmiş"
// relationship form.

import { getEntityByIdRow, allEntitiesRaw } from "../db/repositories/entityRepository.js";
import { listRelationshipsRows } from "../db/repositories/relationshipRepository.js";
import { ENTITY_TYPES } from "../v2/constants/vocabularies.js";
import { createRelationship, ContentValidationError, ContentConflictError, ContentNotFoundError } from "./contentService.js";

function titleOf(entity) {
  if (!entity) return "";
  return entity.title?.tr || entity.title?.en || entity.title?.ar || entity.id;
}

// Every cultural entity type "depicts" (media) / "documents" (source) may
// reasonably reference — deliberately excludes media/source themselves
// (a source documenting another source, or media depicting media, is not
// a case this round needs to support) and page (pages are not part of the
// v2 relationship graph at all).
const REFERENCEABLE_TYPES = Object.freeze(
  ENTITY_TYPES.filter((type) => !["media", "source"].includes(type)),
);

/**
 * One entry per real-world FACT this round supports, each with exactly one
 * canonical (subjectType, relationshipType, objectType) direction. `verb`
 * renders a plain-language sentence from the CURRENT entity's perspective —
 * always called as verb(currentTitle, otherTitle), regardless of whether
 * the current entity happens to be the technical subject or object,
 * because that is what "human-readable, direction-agnostic" means to the
 * admin looking at ONE record's editor.
 */
function buildEdges() {
  const edges = [
    {
      relationshipType: "hasSite", subjectType: "belief", objectType: "structure",
      subjectActionLabel: "Kutsal yapı/alan ekle", objectActionLabel: "İnançla ilişkilendir",
      verbAsSubject: (t, o) => `${t} inancı, ${o} ile ilişkilendirilecek (kutsal alan).`,
      verbAsObject: (t, o) => `${t} yapısı ${o} ile ilişkilendirilecek.`,
    },
    {
      relationshipType: "hasBelief", subjectType: "community", objectType: "belief",
      subjectActionLabel: "İnançla ilişkilendir", objectActionLabel: "Toplulukla ilişkilendir",
      verbAsSubject: (t, o) => `${t} topluluğu, ${o} inancıyla ilişkilendirilecek.`,
      verbAsObject: (t, o) => `${t} inancı, ${o} topluluğuyla ilişkilendirilecek.`,
    },
    {
      relationshipType: "locatedIn", subjectType: "structure", objectType: "place",
      subjectActionLabel: "Bulunduğu yeri seç", objectActionLabel: "Yapıyla ilişkilendir",
      verbAsSubject: (t, o) => `${t}, ${o} konumunda bulunacak şekilde işaretlenecek.`,
      verbAsObject: (t, o) => `${t} konumunda ${o} bulunacak şekilde işaretlenecek.`,
    },
    {
      relationshipType: "associatedWith", subjectType: "structure", objectType: "community",
      subjectActionLabel: "Toplulukla ilişkilendir", objectActionLabel: "Yapıyla ilişkilendir",
      verbAsSubject: (t, o) => `${t} yapısı, ${o} topluluğuyla ilişkilendirilecek.`,
      verbAsObject: (t, o) => `${t} topluluğu, ${o} yapısıyla ilişkilendirilecek.`,
    },
    {
      relationshipType: "associatedWith", subjectType: "community", objectType: "place",
      subjectActionLabel: "Bulunduğu yeri seç", objectActionLabel: "Toplulukla ilişkilendir",
      verbAsSubject: (t, o) => `${t} topluluğu, ${o} ile ilişkilendirilecek.`,
      verbAsObject: (t, o) => `${t}, ${o} topluluğuyla ilişkilendirilecek.`,
    },
    {
      relationshipType: "associatedWith", subjectType: "story", objectType: "structure",
      subjectActionLabel: "Yapıyla ilişkilendir", objectActionLabel: "Hikâyeyle ilişkilendir",
      verbAsSubject: (t, o) => `${t} hikâyesi, ${o} yapısıyla ilişkilendirilecek.`,
      verbAsObject: (t, o) => `${t} yapısı, ${o} hikâyesiyle ilişkilendirilecek.`,
    },
    {
      relationshipType: "associatedWith", subjectType: "story", objectType: "belief",
      subjectActionLabel: "İnançla ilişkilendir", objectActionLabel: "Hikâyeyle ilişkilendir",
      verbAsSubject: (t, o) => `${t} hikâyesi, ${o} inancıyla ilişkilendirilecek.`,
      verbAsObject: (t, o) => `${t} inancı, ${o} hikâyesiyle ilişkilendirilecek.`,
    },
    // Real data: story --associatedWith--> community / place (19 + 29 rows).
    {
      relationshipType: "associatedWith", subjectType: "story", objectType: "community",
      subjectActionLabel: "Toplulukla ilişkilendir", objectActionLabel: "Hikâyeyle ilişkilendir",
      verbAsSubject: (t, o) => `${t} hikâyesi, ${o} topluluğuyla ilişkilendirilecek.`,
      verbAsObject: (t, o) => `${t} topluluğu, ${o} hikâyesiyle ilişkilendirilecek.`,
    },
    {
      relationshipType: "associatedWith", subjectType: "story", objectType: "place",
      subjectActionLabel: "Bulunduğu yeri seç", objectActionLabel: "Hikâyeyle ilişkilendir",
      verbAsSubject: (t, o) => `${t} hikâyesi, ${o} ile ilişkilendirilecek.`,
      verbAsObject: (t, o) => `${t}, ${o} hikâyesiyle ilişkilendirilecek.`,
    },
    // Real data: music --associatedWith--> community / place (28 + 5 rows).
    {
      relationshipType: "associatedWith", subjectType: "music", objectType: "community",
      subjectActionLabel: "Toplulukla ilişkilendir", objectActionLabel: "Müzikle ilişkilendir",
      verbAsSubject: (t, o) => `${t} müziği, ${o} topluluğuyla ilişkilendirilecek.`,
      verbAsObject: (t, o) => `${t} topluluğu, ${o} müziğiyle ilişkilendirilecek.`,
    },
    {
      relationshipType: "associatedWith", subjectType: "music", objectType: "place",
      subjectActionLabel: "Bulunduğu yeri seç", objectActionLabel: "Müzikle ilişkilendir",
      verbAsSubject: (t, o) => `${t} müziği, ${o} ile ilişkilendirilecek.`,
      verbAsObject: (t, o) => `${t}, ${o} müziğiyle ilişkilendirilecek.`,
    },
    {
      relationshipType: "associatedWith", subjectType: "proverb", objectType: "community",
      subjectActionLabel: "Toplulukla ilişkilendir", objectActionLabel: "Atasözüyle ilişkilendir",
      verbAsSubject: (t, o) => `${t} atasözü, ${o} topluluğuyla ilişkilendirilecek.`,
      verbAsObject: (t, o) => `${t} topluluğu, ${o} atasözüyle ilişkilendirilecek.`,
    },
    {
      relationshipType: "associatedWith", subjectType: "proverb", objectType: "place",
      subjectActionLabel: "Bulunduğu yeri seç", objectActionLabel: "Atasözüyle ilişkilendir",
      verbAsSubject: (t, o) => `${t} atasözü, ${o} ile ilişkilendirilecek.`,
      verbAsObject: (t, o) => `${t}, ${o} atasözüyle ilişkilendirilecek.`,
    },
    {
      relationshipType: "associatedWith", subjectType: "historicalContext", objectType: "place",
      subjectActionLabel: "Bulunduğu yeri seç", objectActionLabel: "Tarihsel bağlamla ilişkilendir",
      verbAsSubject: (t, o) => `${t} tarihsel bağlamı, ${o} ile ilişkilendirilecek.`,
      verbAsObject: (t, o) => `${t}, ${o} tarihsel bağlamıyla ilişkilendirilecek.`,
    },
  ];

  // media "depicts" X / source "documents" X — one edge per referenceable
  // type, generated rather than hand-duplicated 2x8 times.
  for (const objectType of REFERENCEABLE_TYPES) {
    edges.push({
      relationshipType: "depicts", subjectType: "media", objectType,
      subjectActionLabel: "Konu/kayıtla ilişkilendir", objectActionLabel: "Medya ekle",
      verbAsSubject: (t, o) => `Bu medya, ${o} kaydını gösterecek şekilde ilişkilendirilecek.`,
      verbAsObject: (t, o) => `${t} kaydı, seçilen medyada gösterilecek şekilde ilişkilendirilecek.`,
    });
    edges.push({
      relationshipType: "documents", subjectType: "source", objectType,
      subjectActionLabel: "Konu/kayıtla ilişkilendir", objectActionLabel: "Kaynak ekle",
      verbAsSubject: (t, o) => `Bu kaynak, ${o} kaydını belgeleyecek şekilde ilişkilendirilecek.`,
      verbAsObject: (t, o) => `${t} kaydı, seçilen kaynakla belgelenecek şekilde ilişkilendirilecek.`,
    });
  }

  return edges;
}

const RELATIONSHIP_EDGES = Object.freeze(buildEdges());

// "UX refinement" round, Issue 1/Section 3: a short (2-4 word) Turkish noun
// phrase describing what the OTHER entity IS to the one currently being
// viewed — indexed by relationshipType (not by specific pairing), matching
// the brief's own examples exactly. "asSubject"/"asObject" here means
// "the CURRENT entity is the technical source/target of the stored row" —
// the label always describes the OTHER side. Every key is a real
// RELATIONSHIP_TYPES value; anything without a specific entry (e.g. a
// pairing that ever used a type not listed here) falls back to the
// generic "İlişkili kayıt" via relationLabelFor()'s own default.
const RELATION_LABELS = Object.freeze({
  hasSite: { asSubject: "İnanç yapısı / kutsal alanı", asObject: "İnanç" },
  hasBelief: { asSubject: "İnanç ilişkisi", asObject: "Topluluk" },
  locatedIn: { asSubject: "Bulunduğu yer", asObject: "Bu yerdeki kayıt" },
  associatedWith: { asSubject: "İlişkili kayıt", asObject: "İlişkili kayıt" },
  depicts: { asSubject: "Gösterilen kayıt", asObject: "Medya" },
  documents: { asSubject: "Belgelenen kayıt", asObject: "Kaynak" },
});

function relationLabelFor(relationshipType, perspective) {
  return RELATION_LABELS[relationshipType]?.[perspective] || "İlişkili kayıt";
}

function actionKeyFor(edge, perspective) {
  return `${edge.relationshipType}:${edge.subjectType}-${edge.objectType}:${perspective}`;
}

function findAction(actionKey) {
  for (const edge of RELATIONSHIP_EDGES) {
    if (actionKeyFor(edge, "asSubject") === actionKey) return { edge, perspective: "asSubject" };
    if (actionKeyFor(edge, "asObject") === actionKey) return { edge, perspective: "asObject" };
  }
  return null;
}

/**
 * Section 9/14: the buttons an entity editor shows for its OWN type — each
 * one already carries which entity type the resulting search must be
 * filtered to (Section 14: "do not show irrelevant entity types").
 */
export function getAvailableRelationshipActions(entityType) {
  const actions = [];
  for (const edge of RELATIONSHIP_EDGES) {
    if (edge.subjectType === entityType) {
      actions.push({ actionKey: actionKeyFor(edge, "asSubject"), buttonLabel: edge.subjectActionLabel, targetType: edge.objectType });
    }
    if (edge.objectType === entityType) {
      actions.push({ actionKey: actionKeyFor(edge, "asObject"), buttonLabel: edge.objectActionLabel, targetType: edge.subjectType });
    }
  }
  return actions;
}

/** Resolves an actionKey against the CURRENT entity's real, stored type — never trusts a client-claimed type for this check (Section 22: "source/target ids cannot be spoofed into invalid type pairing"). */
function resolveAction(actionKey, currentEntityType) {
  const found = findAction(actionKey);
  if (!found) throw new ContentValidationError(`Unknown relationship action '${actionKey}'.`);
  const { edge, perspective } = found;
  const currentExpectedType = perspective === "asSubject" ? edge.subjectType : edge.objectType;
  const targetExpectedType = perspective === "asSubject" ? edge.objectType : edge.subjectType;
  if (currentEntityType !== currentExpectedType) {
    throw new ContentValidationError(`Action '${actionKey}' is not valid for entity type '${currentEntityType}'.`);
  }
  return { edge, perspective, targetExpectedType };
}

function localNamesOf(entity) {
  return Array.isArray(entity.localNames) ? entity.localNames.map((n) => n?.name).filter(Boolean) : [];
}

/**
 * Section 13/14/15: searchable target selection. Matches TR/EN/AR title,
 * slug, local names (place), or a raw id as an advanced fallback — never
 * requires the admin to already know an id. Filtered to exactly the
 * expected target type; excludes the entity currently being edited
 * (`excludeId`, preventing a self-relationship) and, by default, archived
 * records (Section 15 — "do not accidentally expose ... as normal
 * targets"); pass `includeArchived: true` for the rare case a caller
 * explicitly wants them, always clearly labeled by the caller.
 */
export function searchRelationshipTargets({ entityType, query = "", excludeId = null, includeArchived = false, limit = 20 }) {
  if (!ENTITY_TYPES.includes(entityType)) {
    throw new ContentValidationError(`entityType must be one of: ${ENTITY_TYPES.join(", ")}.`);
  }
  const needle = query.trim().toLowerCase();
  const isStatusLess = entityType === "media" || entityType === "source";

  const candidates = allEntitiesRaw().filter((entity) => {
    if (entity.entityType !== entityType) return false;
    if (entity.id === excludeId) return false;
    if (!isStatusLess && entity.status === "archived" && !includeArchived) return false;
    return true;
  });

  function haystack(entity) {
    const parts = [
      entity.title?.tr, entity.title?.en, entity.title?.ar,
      entity.slug, entity.id,
      ...localNamesOf(entity),
    ];
    return parts.filter(Boolean).join(" ␟ ").toLowerCase();
  }

  const matched = needle ? candidates.filter((entity) => haystack(entity).includes(needle)) : candidates;

  // Cheap relevance ordering: a title that STARTS WITH the query ranks
  // above one that merely contains it elsewhere.
  const scored = matched.map((entity) => {
    const title = titleOf(entity).toLowerCase();
    const score = needle && title.startsWith(needle) ? 0 : 1;
    return { entity, score };
  });
  scored.sort((a, b) => a.score - b.score || titleOf(a.entity).localeCompare(titleOf(b.entity)));

  return scored.slice(0, limit).map(({ entity }) => ({
    id: entity.id,
    entityType: entity.entityType,
    title: titleOf(entity),
    status: entity.status ?? null,
    localName: localNamesOf(entity)[0] || null,
  }));
}

/** Shared by the preview endpoint and createSimpleRelationship() — resolves everything a normal admin would otherwise need to know by hand. */
function resolvePreview({ currentEntityId, actionKey, targetEntityId }) {
  const currentEntity = getEntityByIdRow(currentEntityId);
  if (!currentEntity) throw new ContentNotFoundError(`Entity '${currentEntityId}' was not found.`);
  const targetEntity = getEntityByIdRow(targetEntityId);
  if (!targetEntity) throw new ContentNotFoundError(`Entity '${targetEntityId}' was not found.`);
  if (currentEntityId === targetEntityId) throw new ContentValidationError("A record cannot be related to itself.");

  const { edge, perspective, targetExpectedType } = resolveAction(actionKey, currentEntity.entityType);
  if (targetEntity.entityType !== targetExpectedType) {
    throw new ContentValidationError(`Action '${actionKey}' requires a '${targetExpectedType}' target, but '${targetEntityId}' is '${targetEntity.entityType}'.`);
  }

  const isCurrentSubject = perspective === "asSubject";
  const sourceEntity = isCurrentSubject ? currentEntity : targetEntity;
  const targetEntityCanonical = isCurrentSubject ? targetEntity : currentEntity;
  const sentence = isCurrentSubject
    ? edge.verbAsSubject(titleOf(currentEntity), titleOf(targetEntity))
    : edge.verbAsObject(titleOf(currentEntity), titleOf(targetEntity));

  return {
    type: edge.relationshipType,
    sourceId: sourceEntity.id,
    targetId: targetEntityCanonical.id,
    sourceType: sourceEntity.entityType,
    targetType: targetEntityCanonical.entityType,
    sentence,
  };
}

/** Section 17: plain-language preview before saving — no raw JSON, no enum name required. */
export function previewSimpleRelationship({ currentEntityId, actionKey, targetEntityId }) {
  const resolved = resolvePreview({ currentEntityId, actionKey, targetEntityId });
  return { sentence: resolved.sentence, alreadyExists: relationshipAlreadyExists(resolved) };
}

function relationshipAlreadyExists({ type, sourceId, targetId }) {
  // Scale-appropriate for this dataset (mirrors contentService.js's own
  // dashboard-scale listEntitiesRows({limit:5000}) pattern) — a dedicated
  // indexed lookup is a documented follow-up if relationship volume ever
  // demands it, not a correctness gap today.
  const { items } = listRelationshipsRows({ limit: 5000 });
  return items.some((r) => r.type === type && r.sourceId === sourceId && r.targetId === targetId);
}

/**
 * Section 9/10/11/16: the one function the "İlişki Ekle" UI actually
 * calls. Resolves direction + technical relationship type server-side,
 * refuses a spoofed type pairing, refuses a duplicate, and only then
 * delegates to contentService.js's existing createRelationship() — this
 * module never inserts a row itself, so there is exactly one write path.
 */
export function createSimpleRelationship({ currentEntityId, actionKey, targetEntityId, actor }) {
  const resolved = resolvePreview({ currentEntityId, actionKey, targetEntityId });
  if (relationshipAlreadyExists(resolved)) {
    throw new ContentConflictError("Bu ilişki zaten mevcut.");
  }
  const stored = createRelationship({ type: resolved.type, sourceId: resolved.sourceId, targetId: resolved.targetId, actor });
  return { relationship: stored, sentence: resolved.sentence };
}

/**
 * "UX refinement" round, Issue 1: the entity editor's relationship card
 * list — backend-expanded (Section 5: "prefer a backend-expanded
 * relationship response ... do not perform N+1 fetches"), a single HTTP
 * round trip from the browser. The N "other entity" lookups this does
 * internally are cheap, indexed, in-process SQLite primary-key reads
 * (the same getEntityByIdRow() every other write path in this codebase
 * already calls synchronously) — not a second HTTP request each, which is
 * the actual cost Section 5 is concerned about. The relationships table
 * itself stays fully normalized (ids only) — nothing here writes a
 * resolved title back into it.
 *
 * A relationship whose other-side row cannot be resolved (Section 6 — a
 * genuinely broken/dangling reference) is still returned, with
 * `otherEntity: null` and `missingTargetId` set, so the caller can render
 * an explicit warning instead of quietly falling back to a raw id as if
 * nothing were wrong.
 */
export function listRelationshipsForEntity(entityId) {
  const entity = getEntityByIdRow(entityId);
  if (!entity) throw new ContentNotFoundError(`Entity '${entityId}' was not found.`);

  const { items } = listRelationshipsRows({ limit: 5000 });
  const related = items.filter((r) => r.sourceId === entityId || r.targetId === entityId);

  return related.map((r) => {
    const isCurrentSource = r.sourceId === entityId;
    const otherId = isCurrentSource ? r.targetId : r.sourceId;
    const otherType = isCurrentSource ? r.targetType : r.sourceType;
    const other = getEntityByIdRow(otherId);
    const perspective = isCurrentSource ? "asSubject" : "asObject";
    return {
      relationshipId: r.id,
      relationshipType: r.type,
      relationLabel: relationLabelFor(r.type, perspective),
      otherEntity: other ? { id: other.id, entityType: other.entityType, title: titleOf(other), status: other.status ?? null } : null,
      missingTargetId: other ? null : otherId,
      missingTargetType: other ? null : otherType,
      removalSentence: other ? `${titleOf(entity)} ↔ ${titleOf(other)} ilişkisi kaldırılacak.` : null,
    };
  });
}
