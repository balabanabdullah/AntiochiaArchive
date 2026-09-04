/**
 * Pure mode-aware copy decisions for the entity editor modal — split from
 * admin-panel.js's DOM-touching renderEditor(), the same way music.js/
 * environment-badge.js/slug-utils.js separate their decision logic from
 * rendering. This is what makes the copy directly unit-testable (see
 * test/editor-mode-copy.test.js) without a browser/DOM.
 *
 * "COMMIT ÖNCESİ / SON UX CLEANUP" round: direct SQLite/no-code mode
 * (isDirect: true) writes straight to the live runtime content database —
 * an edit can persist immediately, and for an already-published record
 * reaches the public site immediately too. The legacy editorial-proposal
 * mode (isDirect: false) never has that effect: every write there really
 * is a draft/proposal, unchanged from before this round. Every function
 * here takes `isDirect` explicitly rather than reading any global/flag of
 * its own — the caller always passes admin-panel.js's own
 * isDirectContentAuthority() result, so there is exactly one source of
 * truth for which mode is active, never a second competing flag.
 */
(function exposeEditorModeCopy(root) {
  "use strict";

  /**
   * The entity-editor modal's heading prefix. The caller appends
   * " — <title-or-id>" for an existing record, or " — <type label>" for a
   * new one — both DOM/localization-dependent, so not part of this pure
   * decision.
   */
  function resolveEditorHeadingPrefix({ isDirect, isNew }) {
    if (isNew) return "Yeni Kayıt";
    return isDirect ? "Kaydı Düzenle" : "Değişiklik Öner";
  }

  /**
   * The "Public Impact" banner shown above the entity editor form.
   * Editorial-proposal mode's message never varies — every write there is
   * a draft/proposal with zero direct effect, regardless of the record's
   * own status. Direct mode reports the truth per the record's actual
   * situation: a new record is always born a Draft; an existing status-
   * bearing record's message depends on whether it is currently published,
   * archived, or draft/inReview.
   *
   * A statusless type (media/source — STATUS_LESS_TYPES, see
   * contentService.js) has no draft/published field, but "COMMIT ÖNCESİ /
   * FINAL PRE-COMMIT HYGIENE PASS" round: that does NOT mean it is
   * automatically public. A media record's real public exposure depends on
   * its rights/serving/linking rules (see media/mediaStorage.js and
   * wherever a media id is actually referenced from public-facing content);
   * a source record's is likewise governed by its own usage rules, not by
   * the mere absence of a status field. The banner must stay neutral about
   * that outcome rather than asserting a fact this module cannot verify —
   * `entityType` picks the one type-specific message the brief calls for
   * (media); every other statusless type gets the generic neutral wording.
   *
   * Returns { cssClass, text } — `text` may contain a single <strong>
   * phrase, the only markup ever embedded (mirrors the original
   * hand-written banner this replaces).
   */
  function resolvePublicImpactBanner({ isDirect, isNew = false, status = null, statusless = false, entityType = null } = {}) {
    if (!isDirect) {
      return {
        cssClass: "admin-storage-banner-durable",
        text: `GENEL ETKİ: <strong>Yok</strong> — bu form yalnızca bir taslak/öneri oluşturur; herkese açık site hemen değişmez.`,
      };
    }
    if (statusless) {
      if (entityType === "media") {
        return {
          cssClass: "admin-storage-banner-ephemeral",
          text: `PUBLIC ETKİ: Medya kaydı doğrudan kaydedilir. Dosyanın public görünürlüğü kullanım hakkı, bağlantı ve medya erişim kurallarına bağlıdır.`,
        };
      }
      return {
        cssClass: "admin-storage-banner-ephemeral",
        text: `PUBLIC ETKİ: Bu kayıt türünde Taslak/Yayında durumu kullanılmaz. Değişiklik kaydedilir; public görünürlük ilgili kullanım ve erişim kurallarına bağlıdır.`,
      };
    }
    if (isNew) {
      // createEntity() forces status: "draft" regardless of input — a new
      // direct-mode record can never be born published, so this is a
      // fact, not a caveat.
      return {
        cssClass: "admin-storage-banner-durable",
        text: `PUBLIC ETKİ: Yeni kayıt <strong>Taslak</strong> olarak oluşturulur. "Yayınla" işlemi yapılana kadar public sitede görünmez.`,
      };
    }
    if (status === "published") {
      return {
        cssClass: "admin-storage-banner-ephemeral",
        text: `PUBLIC ETKİ: Bu kayıt <strong>yayında</strong>. Kaydettiğiniz içerik değişiklikleri yayındaki kayda yansır.`,
      };
    }
    if (status === "archived") {
      return {
        cssClass: "admin-storage-banner-durable",
        text: `PUBLIC ETKİ: Bu kayıt <strong>arşivlenmiş</strong> durumda. Değişiklikler public sitede görünmez.`,
      };
    }
    // draft / inReview
    return {
      cssClass: "admin-storage-banner-durable",
      text: `PUBLIC ETKİ: Bu kayıt henüz <strong>yayında değil</strong>. Değişiklikler public sitede görünmez.`,
    };
  }

  /** The entity-editor submit button's label — see admin-panel.js's submitEditorDirect()/submitEditor() for what each label actually triggers. */
  function resolveSubmitButtonLabel({ isDirect, isNew, flat }) {
    if (!isDirect) return isNew ? "Taslak Olarak Kaydet" : "Değişiklik Önerisi Kaydet";
    if (isNew) return flat ? "Oluştur" : "Taslak Olarak Oluştur"; // source/media have no draft state
    return "Kaydet";
  }

  root.AntiochiaArchiveEditorModeCopy = Object.freeze({
    resolveEditorHeadingPrefix, resolvePublicImpactBanner, resolveSubmitButtonLabel,
  });
})(typeof window !== "undefined" ? window : globalThis);
