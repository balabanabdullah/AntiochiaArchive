// "COMMIT ÖNCESİ / SON UX CLEANUP" round: pure mode-aware entity-editor
// copy logic (public/js/editor-mode-copy.js), tested directly without a
// browser/DOM — the same split-module pattern established for
// environment-badge.js and slug-utils.js.
//
// Manual QA found the direct SQLite editor still showing legacy editorial-
// proposal wording ("Değişiklik Öner — ss", "bu form yalnızca bir taslak/
// öneri oluşturur; herkese açık site hemen değişmez") even though a direct-
// mode save can persist immediately and, for a published record, reach the
// public site immediately. These tests pin the corrected, mode-aware
// decisions so that regression can't silently return.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const modulePath = pathToFileURL(path.resolve(import.meta.dirname, "../public/js/editor-mode-copy.js")).href;
await import(modulePath);
const { resolveEditorHeadingPrefix, resolvePublicImpactBanner, resolveSubmitButtonLabel } = globalThis.AntiochiaArchiveEditorModeCopy;

/* ---------------------------------------------------------------------- */
/* Heading prefix                                                          */
/* ---------------------------------------------------------------------- */

test("editorial-proposal mode: existing record heading is 'Değişiklik Öner', unchanged from before this round", () => {
  assert.equal(resolveEditorHeadingPrefix({ isDirect: false, isNew: false }), "Değişiklik Öner");
});

test("direct mode: existing record heading is 'Kaydı Düzenle', never the proposal wording", () => {
  assert.equal(resolveEditorHeadingPrefix({ isDirect: true, isNew: false }), "Kaydı Düzenle");
});

test("a NEW record's heading is always 'Yeni Kayıt', in either mode", () => {
  assert.equal(resolveEditorHeadingPrefix({ isDirect: true, isNew: true }), "Yeni Kayıt");
  assert.equal(resolveEditorHeadingPrefix({ isDirect: false, isNew: true }), "Yeni Kayıt");
});

/* ---------------------------------------------------------------------- */
/* Public Impact banner                                                    */
/* ---------------------------------------------------------------------- */

test("editorial-proposal mode: banner always says zero public impact, regardless of isNew/status/statusless — the legacy workflow is untouched", () => {
  const expected = {
    cssClass: "admin-storage-banner-durable",
    text: `GENEL ETKİ: <strong>Yok</strong> — bu form yalnızca bir taslak/öneri oluşturur; herkese açık site hemen değişmez.`,
  };
  assert.deepEqual(resolvePublicImpactBanner({ isDirect: false }), expected);
  assert.deepEqual(resolvePublicImpactBanner({ isDirect: false, isNew: true }), expected);
  assert.deepEqual(resolvePublicImpactBanner({ isDirect: false, status: "published" }), expected);
  assert.deepEqual(resolvePublicImpactBanner({ isDirect: false, statusless: true }), expected);
});

test("direct mode, published record: banner says content changes reflect on the live record immediately — never 'no public impact'", () => {
  const { cssClass, text } = resolvePublicImpactBanner({ isDirect: true, status: "published" });
  assert.equal(cssClass, "admin-storage-banner-ephemeral");
  assert.match(text, /yayında/);
  assert.match(text, /yayındaki kayda yansır/);
  assert.ok(!text.includes("taslak/öneri"), "must never reuse the editorial-proposal phrase in direct mode");
});

test("direct mode, draft/inReview record: banner says changes are not public yet", () => {
  for (const status of ["draft", "inReview"]) {
    const { text } = resolvePublicImpactBanner({ isDirect: true, status });
    assert.match(text, /yayında değil/, `status=${status}`);
    assert.match(text, /public sitede görünmez/, `status=${status}`);
  }
});

test("direct mode, archived record: banner says changes are not public", () => {
  const { text } = resolvePublicImpactBanner({ isDirect: true, status: "archived" });
  assert.match(text, /arşivlenmiş/);
  assert.match(text, /public sitede görünmez/);
});

test("direct mode, new record: banner says the record is created as Draft and stays non-public until Yayınla — takes priority over any passed status", () => {
  const { cssClass, text } = resolvePublicImpactBanner({ isDirect: true, isNew: true, status: "published" });
  assert.equal(cssClass, "admin-storage-banner-durable");
  assert.match(text, /Taslak/);
  assert.match(text, /Yayınla/);
  assert.match(text, /public sitede görünmez/);
});

/**
 * "FINAL PRE-COMMIT HYGIENE PASS" round: a statusless type (media/source)
 * having no draft/published FIELD does not mean it is automatically
 * public — a media record's real exposure depends on its rights/serving/
 * linking rules (see mediaUploadService.js's own, already-correct "Yalnızca
 * 'Temiz (Yayına Hazır)' olarak işaretlenen medya herkese açık..." copy),
 * and a source record's on its own usage rules. The banner must never
 * claim a fact it cannot verify — these tests pin the corrected, neutral
 * wording and guard against the "always public"/"immediately visible to
 * everyone" claim ever coming back.
 */
test("direct mode, statusless SOURCE: banner is neutral about public visibility, takes priority over isNew and status, and never claims automatic public exposure", () => {
  const asNew = resolvePublicImpactBanner({ isDirect: true, isNew: true, statusless: true, entityType: "source" });
  const asExisting = resolvePublicImpactBanner({ isDirect: true, status: "published", statusless: true, entityType: "source" });
  for (const { cssClass, text } of [asNew, asExisting]) {
    assert.equal(cssClass, "admin-storage-banner-ephemeral");
    assert.match(text, /Taslak\/Yayında durumu kullanılmaz/);
    assert.match(text, /erişim kurallarına bağlıdır/);
    assert.ok(!/her zaman herkese açıktır|otomatik olarak (herkese açık|public)/i.test(text), "must never assert automatic public exposure");
    assert.ok(!/hemen yansır/.test(text), "must not claim an immediate public effect it cannot verify");
  }
});

test("direct mode, statusless MEDIA: banner mentions rights/linking/access rules, not an unconditional 'always public' claim", () => {
  const { cssClass, text } = resolvePublicImpactBanner({ isDirect: true, statusless: true, entityType: "media" });
  assert.equal(cssClass, "admin-storage-banner-ephemeral");
  assert.match(text, /kullanım hakkı/);
  assert.match(text, /erişim kurallarına bağlıdır/);
  assert.ok(!/her zaman herkese açıktır/.test(text), "must never claim media is always public regardless of rights");
});

test("statusless banner never claims automatic public exposure for ANY entityType, including an unrecognized/omitted one", () => {
  for (const entityType of [null, undefined, "source", "somethingUnexpected"]) {
    const { text } = resolvePublicImpactBanner({ isDirect: true, statusless: true, entityType });
    assert.ok(!/her zaman herkese açıktır|immediately visible|otomatik olarak (herkese açık|public)/i.test(text), `entityType=${entityType}: "${text}"`);
  }
});

test("direct mode never mentions proposals, external apply, or 'canonical untouched' anywhere", () => {
  const statuses = [null, "draft", "inReview", "published", "archived"];
  for (const status of statuses) {
    const { text } = resolvePublicImpactBanner({ isDirect: true, status });
    assert.ok(!/taslak\/öneri|apply|canonical/i.test(text), `status=${status}: "${text}"`);
  }
  const { text: newText } = resolvePublicImpactBanner({ isDirect: true, isNew: true });
  assert.ok(!/taslak\/öneri|apply|canonical/i.test(newText));
  const { text: statuslessText } = resolvePublicImpactBanner({ isDirect: true, statusless: true });
  assert.ok(!/taslak\/öneri|apply|canonical/i.test(statuslessText));
});

/* ---------------------------------------------------------------------- */
/* Submit button label                                                     */
/* ---------------------------------------------------------------------- */

test("editorial-proposal mode: submit label stays 'Taslak Olarak Kaydet' / 'Değişiklik Önerisi Kaydet', unchanged", () => {
  assert.equal(resolveSubmitButtonLabel({ isDirect: false, isNew: true, flat: false }), "Taslak Olarak Kaydet");
  assert.equal(resolveSubmitButtonLabel({ isDirect: false, isNew: false, flat: false }), "Değişiklik Önerisi Kaydet");
});

test("direct mode, existing record: submit label is plain 'Kaydet' — never the proposal wording, regardless of flat", () => {
  assert.equal(resolveSubmitButtonLabel({ isDirect: true, isNew: false, flat: false }), "Kaydet");
  assert.equal(resolveSubmitButtonLabel({ isDirect: true, isNew: false, flat: true }), "Kaydet");
});

test("direct mode, new record: 'Taslak Olarak Oluştur' for a status-bearing type, plain 'Oluştur' for a statusless one (media/source have no draft state)", () => {
  assert.equal(resolveSubmitButtonLabel({ isDirect: true, isNew: true, flat: false }), "Taslak Olarak Oluştur");
  assert.equal(resolveSubmitButtonLabel({ isDirect: true, isNew: true, flat: true }), "Oluştur");
});

/* ---------------------------------------------------------------------- */
/* Regression guard: admin-panel.js must actually delegate to this module  */
/* for the editor heading/banner/submit-button, not reintroduce a          */
/* hardcoded, mode-blind literal that could silently bring the bug back.   */
/* ---------------------------------------------------------------------- */

test("regression guard: renderEditor() computes its heading/banner/submit-button copy via AntiochiaArchiveEditorModeCopy, not a hardcoded literal", async () => {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const source = await readFile(resolve(import.meta.dirname, "../public/js/admin-panel.js"), "utf8");

  const editorBlock = source.slice(source.indexOf("function renderEditor()"), source.indexOf("async function openEditorForNew"));
  assert.match(editorBlock, /AntiochiaArchiveEditorModeCopy\.resolveEditorHeadingPrefix\(/);
  assert.match(editorBlock, /AntiochiaArchiveEditorModeCopy\.resolveSubmitButtonLabel\(/);

  const bannerFn = source.slice(source.indexOf("function publicImpactBannerHtml("), source.indexOf("function fieldsFor("));
  assert.match(bannerFn, /AntiochiaArchiveEditorModeCopy\.resolvePublicImpactBanner\(/);

  // The old mode-blind literals must be gone from renderEditor() itself —
  // any occurrence of these strings must come only from the shared copy
  // module, not be re-typed directly into the DOM-rendering code.
  assert.ok(!editorBlock.includes("Değişiklik Öner —"), "the modal heading must not hardcode the proposal wording for every mode");
  assert.ok(!bannerFn.includes("bu form yalnızca bir taslak/öneri oluşturur"), "the banner text must come from the mode-aware copy module, not be inlined here");
  assert.ok(!source.includes("her zaman herkese açıktır"), "the false 'always public' statusless claim must not exist anywhere in admin-panel.js");
  assert.match(editorBlock, /publicImpactBannerHtml\(\{\s*isNew,\s*statusless:\s*true,\s*entityType\s*\}\)/, "the statusless banner call must pass entityType through so media gets its own accurate copy");
});
