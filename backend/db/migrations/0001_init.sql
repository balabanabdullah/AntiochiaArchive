-- Initial schema for the local-first runtime content database.
-- All timestamps are ISO-8601 UTC strings (e.g. "2026-08-27T12:00:00.000Z"),
-- matching the format already used throughout the JSON stores/editorial
-- store, never a SQLite-native datetime type, so a value read back from any
-- of the three storage backends (JSON file, Firestore, SQLite) looks
-- identical to a caller. No BLOB columns anywhere — media bytes live on the
-- filesystem via backend/media/mediaStorage.js; this database holds
-- metadata only.

-- Cultural entities (community/belief/place/structure/story/music/proverb/
-- historicalContext/media/source) — ONE table for every entityType, exactly
-- like the existing JSON stores already keep them in one flat array. `data`
-- is the full, already-schema-validated entity object (see
-- backend/v2/schemas/index.js's validateEntity) serialized as JSON; id/
-- entity_type/slug/status/timestamps are duplicated into real columns
-- purely so the repository can filter/sort/paginate with real SQL indexes
-- instead of deserializing every row's JSON to check a field.
CREATE TABLE entities (
  id            TEXT PRIMARY KEY,
  entity_type   TEXT NOT NULL,
  slug          TEXT,
  status        TEXT,
  data          TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  published_at  TEXT
);

CREATE INDEX idx_entities_type ON entities (entity_type);
CREATE INDEX idx_entities_status ON entities (status);
CREATE INDEX idx_entities_type_status ON entities (entity_type, status);
CREATE INDEX idx_entities_updated_at ON entities (updated_at);
-- Partial unique index: media/source rows have no slug (see
-- backend/v2/schemas/media.js and source.js), so slug uniqueness is only
-- enforced where a slug actually exists.
CREATE UNIQUE INDEX idx_entities_slug_unique ON entities (slug) WHERE slug IS NOT NULL;

-- Relationship edges between two entities. Foreign keys are real (PRAGMA
-- foreign_keys=ON in sqliteConnection.js), so a relationship can never
-- outlive the entities it connects — deleting an entity that still has
-- relationship edges fails loudly (see contentService.js's dependency
-- check before permanent delete) rather than leaving an orphan edge.
CREATE TABLE relationships (
  id                    TEXT PRIMARY KEY,
  type                  TEXT NOT NULL,
  source_id             TEXT NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  source_type           TEXT NOT NULL,
  target_id             TEXT NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  target_type           TEXT NOT NULL,
  status                TEXT,
  note                  TEXT,
  evidence_source_ids   TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX idx_relationships_source ON relationships (source_id);
CREATE INDEX idx_relationships_target ON relationships (target_id);
CREATE INDEX idx_relationships_type ON relationships (type);

-- CMS pages (Section 15) — a first-class entity type of its own, distinct
-- from the cultural `entities` table above (a Page is a website page, not a
-- piece of cultural heritage data, and carries fields — content, SEO,
-- navigation placement — that no cultural entity schema has).
CREATE TABLE pages (
  id                   TEXT PRIMARY KEY,
  slug                 TEXT NOT NULL UNIQUE,
  status               TEXT NOT NULL DEFAULT 'draft',
  data                 TEXT NOT NULL,
  show_in_navigation   INTEGER NOT NULL DEFAULT 0,
  navigation_group     TEXT,
  navigation_order     INTEGER,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  published_at         TEXT
);

CREATE INDEX idx_pages_status ON pages (status);
CREATE INDEX idx_pages_navigation ON pages (show_in_navigation, navigation_group, navigation_order);

-- Unified audit/history log for every meaningful content action (Section 10,
-- 27, 28) — entity edits, page changes, relationship changes, source/media
-- linking, bulk actions, backup/restore. before_json/after_json are the full
-- object state (or NULL for create/delete respectively) so an admin can see
-- a real before/after diff without knowing SQL or JSON.
CREATE TABLE audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type   TEXT NOT NULL,
  target_id     TEXT NOT NULL,
  action        TEXT NOT NULL,
  actor         TEXT NOT NULL,
  before_json   TEXT,
  after_json    TEXT,
  note          TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX idx_audit_target ON audit_log (target_type, target_id, created_at);
CREATE INDEX idx_audit_created_at ON audit_log (created_at);

-- Backup snapshot metadata (Section 29-31). The actual snapshot files
-- (database copy + media manifest) live under backend/var/backups/<id>/ —
-- this table is only a queryable index over them, never the storage itself,
-- so "list backups" never has to walk the filesystem.
CREATE TABLE backups (
  id                          TEXT PRIMARY KEY,
  created_at                  TEXT NOT NULL,
  reason                      TEXT NOT NULL,
  db_sha256                   TEXT NOT NULL,
  media_manifest_sha256       TEXT,
  media_file_count            INTEGER NOT NULL DEFAULT 0,
  relative_path               TEXT NOT NULL
);

CREATE INDEX idx_backups_created_at ON backups (created_at);
