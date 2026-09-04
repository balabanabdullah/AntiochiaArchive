-- "COMMIT ÖNCESİ" round, Section 2/3/4: generalizes the entity-only
-- entity_slug_history table (migration 0002) into one shared slug-history/
-- redirect table serving BOTH cultural entities (/archive-v2/:slug/) and
-- CMS pages (/sayfa/:slug/) — one generic alias/history service, not two
-- unrelated ones, per the explicit product instruction. Partitioned by
-- `domain` so identical slug text may exist independently in each
-- namespace (they are genuinely different public URLs — see
-- v2/render/runtimeSitemap.js's own existing comment on this), while
-- staying collision-safe WITHIN a namespace via a UNIQUE(domain, old_slug)
-- index — see db/repositories/slugHistoryRepository.js.
--
-- record_id carries no FK (unlike the old entity_id -> entities(id) FK)
-- because it must name either an entities.id or a pages.id depending on
-- `domain`, and SQLite has no polymorphic foreign key. This is a small,
-- deliberate tightening versus the previous ON DELETE CASCADE behavior: a
-- slug's reservation now survives even a later permanent hard-delete of the
-- record that used it, which is strictly safer — a hard-deleted record's
-- old slug can never be silently handed to some unrelated new record.
CREATE TABLE slug_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  domain      TEXT NOT NULL CHECK (domain IN ('entity', 'page')),
  record_id   TEXT NOT NULL,
  old_slug    TEXT NOT NULL,
  new_slug    TEXT NOT NULL,
  changed_at  TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_slug_history_domain_old_slug ON slug_history (domain, old_slug);
CREATE INDEX idx_slug_history_domain_record_id ON slug_history (domain, record_id);

-- Carry forward any redirect history already recorded by migration 0002
-- against a user's real local database — never silently dropped.
INSERT INTO slug_history (domain, record_id, old_slug, new_slug, changed_at)
SELECT 'entity', entity_id, old_slug, new_slug, changed_at FROM entity_slug_history;

DROP TABLE entity_slug_history;
