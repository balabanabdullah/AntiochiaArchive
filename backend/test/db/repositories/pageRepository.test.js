import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { initializeSqlite, closeSqlite } from "../../../db/sqliteConnection.js";
import { applyPendingMigrations } from "../../../db/migrate.js";
import {
  insertPage, updatePageRow, deletePageRow, getPageByIdRow, getPageBySlugRow, pageSlugExists,
  listPagesRows, listNavigationPagesRows,
} from "../../../db/repositories/pageRepository.js";

async function withTempDb(t, run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antiochia-page-repo-"));
  initializeSqlite({ path: path.join(dir, "test.db") });
  applyPendingMigrations({ verbose: false });
  t.after(async () => {
    closeSqlite();
    await fs.rm(dir, { recursive: true, force: true });
  });
  return run();
}

test("insertPage persists a page and getPageBySlugRow finds it", async (t) => {
  await withTempDb(t, () => {
    const stored = insertPage({ id: "page-1", slug: "hakkimizda", status: "draft", title: { tr: "Hakkımızda" } });
    assert.equal(stored.status, "draft");
    assert.equal(stored.showInNavigation, false);
    assert.deepEqual(getPageBySlugRow("hakkimizda"), stored);
    assert.equal(pageSlugExists("hakkimizda"), true);
  });
});

test("updatePageRow stamps publishedAt exactly once, on the transition INTO published", async (t) => {
  await withTempDb(t, () => {
    const created = insertPage({ id: "page-1", slug: "s", status: "draft", title: { tr: "T" } });
    assert.equal(created.publishedAt, undefined);

    const published = updatePageRow("page-1", { ...created, status: "published" });
    assert.ok(published.publishedAt);

    const editedAgain = updatePageRow("page-1", { ...published, title: { tr: "T2" } });
    assert.equal(editedAgain.publishedAt, published.publishedAt, "publishedAt must not change on a same-status edit");
  });
});

test("deletePageRow removes the row", async (t) => {
  await withTempDb(t, () => {
    insertPage({ id: "page-1", slug: "s", status: "draft", title: { tr: "T" } });
    assert.equal(deletePageRow("page-1"), true);
    assert.equal(getPageByIdRow("page-1"), null);
  });
});

test("listPagesRows filters by status; listNavigationPagesRows only returns published+showInNavigation, ordered", async (t) => {
  await withTempDb(t, () => {
    insertPage({ id: "page-a", slug: "a", status: "published", title: { tr: "A" }, showInNavigation: true, navigationGroup: "main", navigationOrder: 2 });
    insertPage({ id: "page-b", slug: "b", status: "published", title: { tr: "B" }, showInNavigation: true, navigationGroup: "main", navigationOrder: 1 });
    insertPage({ id: "page-c", slug: "c", status: "draft", title: { tr: "C" }, showInNavigation: true, navigationGroup: "main", navigationOrder: 0 });
    insertPage({ id: "page-d", slug: "d", status: "published", title: { tr: "D" }, showInNavigation: false });

    assert.equal(listPagesRows({ status: "published" }).length, 3);
    assert.equal(listPagesRows({}).length, 4);

    const nav = listNavigationPagesRows();
    assert.deepEqual(nav.map((p) => p.id), ["page-b", "page-a"], "published+nav-visible only, ordered by navigationOrder");
  });
});
