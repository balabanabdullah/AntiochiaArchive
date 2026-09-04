-- "UX refinement" round, Issue 2 (Sections 12-15): safe slug-change history
-- for a published (or ever-published) cultural entity. When an admin
-- changes such an entity's slug, its OLD slug is recorded here rather than
-- simply overwritten and forgotten — the runtime detail route
-- (v2/routes/v2DetailRoutes.js) 301-redirects a request for any recorded
-- old_slug straight to the entity's CURRENT slug, so an already-shared or
-- indexed public URL never goes dead.
--
-- old_slug is globally UNIQUE (not just per-entity) so a historical slug
-- stays permanently reserved: no other entity, ever, may claim a slug that
-- used to point somewhere else (Section 14 — "reuse of a historical slug
-- by another record" must be prevented). The slug-uniqueness check on
-- create/slug-change (see contentService.js) checks this table in
-- addition to the live entities.slug column.
CREATE TABLE entity_slug_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  old_slug    TEXT NOT NULL,
  new_slug    TEXT NOT NULL,
  changed_at  TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_entity_slug_history_old_slug ON entity_slug_history (old_slug);
CREATE INDEX idx_entity_slug_history_entity_id ON entity_slug_history (entity_id);
