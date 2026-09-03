// Repository for the `pages` table — first-class CMS pages (Section 15).
// `data` holds every multilingual/content/SEO field as one JSON object;
// slug/status/navigation placement/timestamps are real columns so the
// public route layer can do "find the published page at this slug" and
// "list nav-visible pages in order" with plain indexed SQL.

import { getSqlite } from "../sqliteConnection.js";

function nowIso() {
  return new Date().toISOString();
}

function rowToPage(row) {
  if (!row) return null;
  const data = JSON.parse(row.data);
  return {
    ...data,
    id: row.id,
    slug: row.slug,
    status: row.status,
    showInNavigation: Boolean(row.show_in_navigation),
    navigationGroup: row.navigation_group ?? undefined,
    navigationOrder: row.navigation_order ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at ?? undefined,
  };
}

export function insertPage(page) {
  const db = getSqlite();
  const now = nowIso();
  db.prepare(`
    INSERT INTO pages (id, slug, status, data, show_in_navigation, navigation_group, navigation_order, created_at, updated_at, published_at)
    VALUES (@id, @slug, @status, @data, @showInNavigation, @navigationGroup, @navigationOrder, @createdAt, @updatedAt, @publishedAt)
  `).run({
    id: page.id,
    slug: page.slug,
    status: page.status || "draft",
    data: JSON.stringify(page),
    showInNavigation: page.showInNavigation ? 1 : 0,
    navigationGroup: page.navigationGroup ?? null,
    navigationOrder: page.navigationOrder ?? null,
    createdAt: now,
    updatedAt: now,
    publishedAt: page.status === "published" ? now : null,
  });
  return getPageByIdRow(page.id);
}

export function updatePageRow(id, page) {
  const db = getSqlite();
  const updatedAt = nowIso();
  const existing = db.prepare("SELECT published_at, status FROM pages WHERE id = ?").get(id);
  const becamePublished = page.status === "published" && existing?.status !== "published";
  const publishedAt = becamePublished ? updatedAt : existing?.published_at ?? null;
  db.prepare(`
    UPDATE pages
    SET slug = @slug, status = @status, data = @data, show_in_navigation = @showInNavigation,
        navigation_group = @navigationGroup, navigation_order = @navigationOrder,
        updated_at = @updatedAt, published_at = @publishedAt
    WHERE id = @id
  `).run({
    id,
    slug: page.slug,
    status: page.status,
    data: JSON.stringify(page),
    showInNavigation: page.showInNavigation ? 1 : 0,
    navigationGroup: page.navigationGroup ?? null,
    navigationOrder: page.navigationOrder ?? null,
    updatedAt,
    publishedAt,
  });
  return getPageByIdRow(id);
}

export function deletePageRow(id) {
  const db = getSqlite();
  return db.prepare("DELETE FROM pages WHERE id = ?").run(id).changes > 0;
}

export function getPageByIdRow(id) {
  const db = getSqlite();
  return rowToPage(db.prepare("SELECT * FROM pages WHERE id = ?").get(id));
}

export function getPageBySlugRow(slug) {
  const db = getSqlite();
  return rowToPage(db.prepare("SELECT * FROM pages WHERE slug = ?").get(slug));
}

export function pageSlugExists(slug) {
  const db = getSqlite();
  return Boolean(db.prepare("SELECT 1 FROM pages WHERE slug = ?").get(slug));
}

export function listPagesRows({ status } = {}) {
  const db = getSqlite();
  const rows = status
    ? db.prepare("SELECT * FROM pages WHERE status = ? ORDER BY id ASC").all(status)
    : db.prepare("SELECT * FROM pages ORDER BY id ASC").all();
  return rows.map(rowToPage);
}

/** Published, nav-visible pages, ordered for a navigation menu (Section 19). */
export function listNavigationPagesRows() {
  const db = getSqlite();
  const rows = db.prepare(`
    SELECT * FROM pages
    WHERE status = 'published' AND show_in_navigation = 1
    ORDER BY navigation_group ASC, navigation_order ASC, id ASC
  `).all();
  return rows.map(rowToPage);
}
