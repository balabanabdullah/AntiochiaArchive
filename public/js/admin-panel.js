/**
 * v2 Admin panel — supports TWO distinct backend architectures, selected by
 * the backend-authoritative `contentAuthority` flag (see refreshDashboard()'s
 * GET /dashboard fetch and isDirectContentAuthority() below — never a
 * hostname guess, never a second competing flag):
 *
 *   - Editorial-proposal mode (contentAuthority !== "direct", the original
 *     workflow): this module never assumes it can publish anything — every
 *     write is a "create draft" or "propose edit" or a draft-status
 *     transition. The only path from a draft to the live public site is
 *     human-mediated — export the approved package, then a developer runs
 *     scripts/apply-editorial-changes.js against the real repository and
 *     goes through the normal review/commit/deploy process. Talks to
 *     /api/admin/editorial/* via admin-session.js. See that script's header
 *     for the full reasoning. Still the only workflow in production today.
 *
 *   - Direct SQLite/no-code mode (contentAuthority === "direct", only ever
 *     active when the backend's runtime content store is sqlite — a local/
 *     dev configuration, not production): writes go straight to the live
 *     runtime content database via /api/admin/content/* (contentService.js/
 *     pageService.js) — an edit can persist immediately, and for an
 *     already-published record reaches the public site immediately too, no
 *     draft/export/apply step involved. Every "COMMIT ÖNCESİ SON UX
 *     CLEANUP" round fix in this file exists to make the UI say so
 *     truthfully instead of reusing the editorial flow's proposal wording.
 *
 * Both modes share the same session-cookie + CSRF admin-session.js client
 * (never a token in this file).
 */
(function initAdminPanel(root) {
  "use strict";
  if (typeof document === "undefined") return;

  const Session = root.AntiochiaAdminSession;
  if (!Session) return;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  const ENTITY_TYPE_LABELS = Object.freeze({
    historicalContext: "Tarihsel Bağlam", community: "Topluluk", belief: "İnanç", place: "Yer",
    structure: "Yapı", story: "Hikâye", music: "Müzik", proverb: "Atasözü / Deyim",
    media: "Medya", source: "Kaynak",
  });

  const STATUS_LABELS = Object.freeze({
    published: "Yayında", inReview: "İncelemede", draft: "Taslak", archived: "Arşivlendi",
  });

  const DRAFT_STATUS_LABELS = Object.freeze({
    draft: "Taslak", readyForReview: "İncelemeye Hazır", approved: "Onaylandı", rejected: "Reddedildi", applied: "Uygulandı",
  });

  function statusBadge(status, labels = STATUS_LABELS) {
    const label = labels[status] || status || "—";
    return `<span class="admin-badge admin-badge-${escapeHtml(status || "unknown")}">${escapeHtml(label)}</span>`;
  }

  function localized(value, fallback = "") {
    if (!value || typeof value !== "object") return fallback;
    return value.tr || value.en || value.ar || fallback;
  }

  function toast(message, type = "success") {
    const container = document.getElementById("admin-toast-container");
    if (!container) return;
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  /* ---------------------------------------------------------------------- */
  /* Legacy V1 / Canonical V2 distinction (Section 17-18 of the round brief) */
  /* ---------------------------------------------------------------------- */

  /**
   * A v1-mapped entity always carries migration provenance (see
   * backend/v2/migration/v1ToV2Mapping.js's migrationProvenance()) —
   * sourceVersion/sourceRecordId are never set on a hand-authored v2-native
   * entity. This is the same signal the backend itself uses to distinguish
   * the two, so the badge can never disagree with reality.
   */
  function isLegacyEntity(entity) {
    return Boolean(entity && (entity.sourceVersion || entity.sourceRecordId));
  }

  function originBadgeHtml(entity) {
    return isLegacyEntity(entity)
      ? `<span class="admin-badge admin-badge-legacy" title="Bu kayıt eski (v1) arşiv veri setinden geliyor.">LEGACY V1</span>`
      : `<span class="admin-badge admin-badge-canonical" title="Bu kayıt güncel canonical v2 veri setine ait.">CANONICAL V2</span>`;
  }

  /* ---------------------------------------------------------------------- */
  /* Backend error -> editor-facing Turkish translation (Section 42)         */
  /* ---------------------------------------------------------------------- */

  const KNOWN_ERROR_TRANSLATIONS = Object.freeze([
    [/An edit proposal must never set status to 'published' directly.*$/i,
      "Değişiklik önerileri doğrudan “Yayında” durumuna geçirilemez. Önce inceleme ve onay sürecini tamamlayın."],
    [/A (create|new record) (change|proposal) must never (set status to 'published'|default to 'published').*$/i,
      "Yeni kayıtlar doğrudan “Yayında” durumunda oluşturulamaz. Taslak veya İncelemede olarak kaydedin."],
    [/'(id|entityType|slug)' cannot be changed by an edit (proposal|change)\.?/i,
      "Kimlik (ID), kayıt türü ve slug bir değişiklik önerisiyle değiştirilemez."],
    [/slug must be lowercase letters\/digits.*$/i,
      "Slug yalnızca küçük harf, rakam ve tek tire ile ayrılmış gruplar içerebilir (ör. “yeni-kayit”)."],
    [/^id '.*' already exists.*$/i, "Bu kimlik (ID) zaten kullanılıyor — başka bir kimlik seçin."],
    [/^slug '.*' already exists.*$/i, "Bu URL zaten kullanılıyor — başka bir adres seçin."],
    [/^The new slug is the same as the current slug\.?$/i, "Girilen adres, mevcut adresle aynı."],
    [/^'.*' entities do not have a slug\.?$/i, "Bu kayıt türünün web adresi (slug) yoktur."],
    [/^The entity being edited was not found\.?$/i, "Düzenlenmek istenen kayıt bulunamadı. Sayfayı yenileyip tekrar deneyin."],
    [/^entityType must be one of:.*$/i, "Geçerli bir kayıt türü seçin."],
    [/^type must be one of:.*$/i, "Geçerli bir kayıt türü seçin."],
    [/^status must be one of:.*$/i, "Geçerli bir durum seçin."],
    [/^proposedChanges must be an object\.?$/i, "Gönderilen değişiklik verisi geçersiz. Sayfayı yenileyip tekrar deneyin."],
    [/^entityId is required for an edit proposal\.?$/i, "Düzenlenecek kaydın kimliği eksik. Sayfayı yenileyip tekrar deneyin."],
    [/^Only a draft\/readyForReview change may have its content edited\.?$/i,
      "Yalnızca “Taslak” veya “İncelemeye Hazır” durumundaki değişikliklerin içeriği düzenlenebilir."],
    [/^Cannot move a '.*' draft to '.*'\.?$/i, "Bu durum geçişine izin verilmiyor. Sayfayı yenileyip güncel durumu kontrol edin."],
    [/^Yönetici oturumu gerekli.*$/i, "Oturumunuzun süresi dolmuş olabilir. Lütfen tekrar giriş yapın."],
    [/^CSRF doğrulaması başarısız.*$/i, "Güvenlik doğrulaması başarısız oldu. Sayfayı yenileyip tekrar deneyin."],
  ]);

  /**
   * Converts a raw backend error string into editor-facing Turkish. Falls
   * back to the original text (still shown, never swallowed) when nothing
   * matches — routine field-level schema errors are numerous and mostly
   * self-explanatory (e.g. "place.title must include at least one non-empty
   * language value."), so only the confusing *workflow-policy* errors named
   * in the round brief are hand-translated; the original is always logged to
   * the console for a developer to inspect.
   */
  function translateAdminError(rawMessage) {
    const raw = String(rawMessage || "").trim();
    for (const [pattern, translation] of KNOWN_ERROR_TRANSLATIONS) {
      if (pattern.test(raw)) return translation;
    }
    return raw || "Bilinmeyen bir hata oluştu.";
  }

  function reportError(error, context) {
    console.error(context ? `[AdminPanel] ${context}:` : "[AdminPanel]", error);
    return translateAdminError(error?.message);
  }

  /* ---------------------------------------------------------------------- */
  /* Environment safety badge (manual QA round)                              */
  /* ---------------------------------------------------------------------- */

  /**
   * Renders into both the login-screen and post-login topbar containers
   * (only one is ever visible at a time, but both stay in sync) — never
   * derived from window.location/hostname, only from the backend's own
   * authoritative /session response (see backend/admin/adminRoutes.js's
   * getEnvironmentInfo(), itself driven by the same K_SERVICE signal the
   * SQLite-on-Cloud-Run safety guard already uses). A real user opening
   * production while meaning to test locally (this round's actual finding)
   * sees this immediately, before ever typing a key.
   *
   * Manual QA round (2nd pass): environment identification is safety-
   * sensitive, so an UNKNOWN state must never look like "no badge at all" —
   * a real user could read a blank badge area as "must be fine" exactly the
   * way the original bug went unnoticed. Whenever the environment can't be
   * determined (the metadata request failed entirely, OR a response came
   * back without the field at all — e.g. from a backend that predates this
   * feature, which is exactly what a stale/misrouted backend process on
   * this machine reproduced during manual QA), this renders a visible
   * amber warning instead of clearing the container. Never falls back to
   * guessing from window.location/hostname.
   */
  function renderEnvironmentBadge(sessionInfo) {
    const targets = [document.getElementById("admin-env-badge-login"), document.getElementById("admin-env-badge-panel")];
    // Defensive fallback if public/js/environment-badge.js itself failed to
    // load — still never renders blank; same fail-safe outcome as an
    // unrecognized environment value.
    const { cssClass, label } = root.AntiochiaArchiveEnvironmentBadge
      ? root.AntiochiaArchiveEnvironmentBadge.resolveEnvironmentBadge(sessionInfo || {})
      : { cssClass: "unknown", label: "ORTAM DOĞRULANAMADI" };
    const html = `<span class="admin-env-badge admin-env-badge-${cssClass}">${escapeHtml(label)}</span>`;
    targets.forEach((el) => { if (el) el.innerHTML = html; });
  }

  /* ---------------------------------------------------------------------- */
  /* Login gate                                                              */
  /* ---------------------------------------------------------------------- */

  async function showPanel() {
    document.getElementById("admin-login-gate").hidden = true;
    const shell = document.getElementById("admin-panel-shell");
    shell.hidden = false;
    await refreshDashboard();
  }

  function showLoginGate(message) {
    document.getElementById("admin-panel-shell").hidden = true;
    document.getElementById("admin-login-gate").hidden = false;
    const errorEl = document.getElementById("admin-login-error");
    if (message) { errorEl.textContent = message; errorEl.hidden = false; } else { errorEl.hidden = true; }
    document.getElementById("admin-login-token").value = "";
    document.getElementById("admin-login-token").focus();
  }

  function initLoginGate() {
    const form = document.getElementById("admin-login-form");
    const tokenInput = document.getElementById("admin-login-token");
    const toggleBtn = document.getElementById("admin-login-toggle-visibility");

    toggleBtn.addEventListener("click", () => {
      const isPassword = tokenInput.type === "password";
      tokenInput.type = isPassword ? "text" : "password";
      toggleBtn.textContent = isPassword ? "Gizle" : "Göster";
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        await Session.login(tokenInput.value);
        await showPanel();
      } catch (error) {
        showLoginGate(error.message || "Yönetici anahtarı geçersiz.");
      } finally {
        submitBtn.disabled = false;
      }
    });

    document.getElementById("admin-logout-btn").addEventListener("click", async () => {
      await Session.logout();
      showLoginGate();
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Sidebar navigation                                                      */
  /* ---------------------------------------------------------------------- */

  function initSidebarNav() {
    document.querySelectorAll("[data-admin-view]").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.adminView, btn.dataset.adminType || null, btn));
    });
    document.getElementById("admin-mobile-nav-toggle")?.addEventListener("click", () => {
      document.querySelector(".admin-sidebar").classList.toggle("is-open");
    });
  }

  /**
   * `activeBtn` is the specific sidebar button clicked — several buttons can
   * share the same `data-admin-view` (e.g. "Kayıtlar" and every per-type
   * shortcut like "Yerler" all open the "records" view), so highlighting by
   * `view` alone would light up all of them at once. Only the one actually
   * clicked gets `.active`.
   */
  function switchView(view, type, activeBtn) {
    document.querySelectorAll("[data-admin-view]").forEach((btn) => {
      const isActive = btn === activeBtn;
      btn.classList.toggle("active", isActive);
      if (isActive) btn.setAttribute("aria-current", "page"); else btn.removeAttribute("aria-current");
    });
    document.querySelectorAll("[data-admin-panel]").forEach((panel) => { panel.hidden = panel.dataset.adminPanel !== view; });
    document.querySelector(".admin-sidebar")?.classList.remove("is-open");

    if (view === "dashboard") refreshDashboard();
    else if (view === "records") loadRecords({ type: type || "" });
    else if (view === "media") loadMedia();
    else if (view === "sources") loadSources();
    else if (view === "relationships") loadRelationships();
    else if (view === "pages") loadPages();
    else if (view === "drafts") loadDrafts();
    else if (view === "backups") loadSqliteBackups();
    // submissions/backups/v1legacy panels are wired by their own init functions.
  }

  /* ---------------------------------------------------------------------- */
  /* Dashboard                                                                */
  /* ---------------------------------------------------------------------- */

  /** Never silently implies durability the active deployment doesn't have — read directly from the backend's actual selected store on every dashboard load. */
  function editorialStoreBannerHtml(storeName) {
    const isDurable = storeName === "firestore";
    const label = isDurable ? "Firestore (Kalıcı)" : "Bellek (Geçici — Yeniden Başlatmada Kaybolur)";
    return `<p class="admin-storage-banner admin-storage-banner-${isDurable ? "durable" : "ephemeral"}">
      Editoryal Taslak Depolama: <strong>${escapeHtml(label)}</strong>
    </p>`;
  }

  // Manual QA round: "runtime storage label" — this is a genuinely
  // DIFFERENT concept from editorialStoreBannerHtml() above (the draft/
  // proposal store's own durability) and must never be conflated with it —
  // this is what actually backs PUBLIC runtime content (what a visitor's
  // browser reads). Every value getSelectedV2StoreName() can return, kept
  // in sync with backend/v2/stores/v2Store.js's own driver map — an
  // unrecognized value falls back to showing the raw name rather than
  // silently claiming something untrue.
  const RUNTIME_CONTENT_STORE_LABELS = Object.freeze({
    sqlite: "SQLite (Yerel)",
    local: "Yerel JSON (data/v2/*.json)",
    firestore: "Firestore",
    memory: "Bellek (Geçici)",
    empty: "Boş (Veri Yok)",
  });
  const MEDIA_STORAGE_DRIVER_LABELS = Object.freeze({
    local: "Yerel Dosya Sistemi",
  });

  function runtimeStorageBannerHtml({ runtimeContentStore, mediaStorageDriver }) {
    const contentLabel = RUNTIME_CONTENT_STORE_LABELS[runtimeContentStore] || runtimeContentStore || "Bilinmiyor";
    const contentIsSqlite = runtimeContentStore === "sqlite";
    let html = `<p class="admin-storage-banner ${contentIsSqlite ? "admin-storage-banner-durable" : "admin-storage-banner-ephemeral"}">
      İçerik Depolama: <strong>${escapeHtml(contentLabel)}</strong>
    </p>`;
    if (mediaStorageDriver) {
      const mediaLabel = MEDIA_STORAGE_DRIVER_LABELS[mediaStorageDriver] || mediaStorageDriver;
      html += `<p class="admin-storage-banner admin-storage-banner-durable">
        Medya Depolama: <strong>${escapeHtml(mediaLabel)}</strong>
      </p>`;
    }
    return html;
  }

  // "editorial" (default): every write is a draft/proposal — see
  // admin/editorialStore.js. "direct": V2_DATA_STORE=sqlite is active and
  // Yayınla/Arşivle/Geri Yükle act immediately through
  // admin/contentService.js — see the "no-code CMS" round's report. Read
  // from the dashboard response so the UI never has to guess.
  let contentAuthority = "editorial";
  function isDirectContentAuthority() { return contentAuthority === "direct"; }

  async function refreshDashboard() {
    const container = document.getElementById("admin-dashboard-cards");
    const banner = document.getElementById("admin-storage-banner");
    if (!container) return;
    container.innerHTML = `<p class="admin-muted">Yükleniyor…</p>`;
    try {
      const { data } = await Session.request("/dashboard");
      contentAuthority = data.contentAuthority || "editorial";
      renderEnvironmentBadge(data);
      document.querySelectorAll("[data-admin-view='pages']").forEach((el) => { el.hidden = !isDirectContentAuthority(); });
      if (banner) {
        banner.innerHTML = runtimeStorageBannerHtml(data)
          + editorialStoreBannerHtml(data.editorialStoreName)
          + (isDirectContentAuthority()
            ? `<p class="admin-storage-banner admin-storage-banner-durable">İçerik Yetkisi: <strong>Doğrudan (SQLite) — Yayınla/Arşivle/Geri Yükle anında etkilidir.</strong></p>`
            : `<p class="admin-storage-banner admin-storage-banner-ephemeral">İçerik Yetkisi: <strong>Editoryal Taslak — değişiklikler onay + harici uygulama gerektirir.</strong></p>`);
      }
      const cards = [
        ["Toplam Kayıt", data.totalEntities],
        ["Yayında (Public)", data.publicEntities],
        ["Taslak", data.byStatus.draft || 0],
        ["İncelemede", data.byStatus.inReview || 0],
        ["Arşivlenmiş", data.byStatus.archived || 0],
        ["Editoryal Değişiklik (Toplam)", data.editorialDrafts.total],
        ...Object.entries(ENTITY_TYPE_LABELS).map(([type, label]) => [label, data.byType[type] || 0]),
      ];
      container.innerHTML = cards.map(([label, count]) => `
        <article class="admin-dashboard-card">
          <span class="admin-dashboard-card-count">${escapeHtml(count)}</span>
          <span class="admin-dashboard-card-label">${escapeHtml(label)}</span>
        </article>`).join("");
    } catch (error) {
      container.innerHTML = `<p class="admin-error">${escapeHtml(reportError(error, "dashboard"))}</p>`;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Records — shared table for "Kayıtlar" + every per-type nav shortcut     */
  /* ---------------------------------------------------------------------- */

  let recordsFilter = { type: "", status: "", q: "", origin: "" };

  /**
   * "Arşivleme Teklifi Oluştur" is deliberately its own action, distinct
   * from picking "Arşivlendi" out of the generic status dropdown inside the
   * editor (Section 19-20 of the round brief): it always shows the same
   * explicit non-deletion confirmation copy and always produces an
   * edit-kind draft — never a direct mutation — so an editor can never
   * mistake it for delete.
   */
  function recordActionsHtml(entity) {
    const isPublic = entity.status === "published";
    const id = escapeHtml(entity.id);
    const type = escapeHtml(entity.entityType);
    const editBtn = `<button type="button" class="btn-admin btn-admin-secondary admin-row-action" data-action="propose-edit" data-id="${id}" data-type="${type}">${isPublic && !isDirectContentAuthority() ? "Değişiklik Öner" : "Düzenle"}</button>`;

    let statusBtns = "";
    if (isDirectContentAuthority() && entity.status) {
      // Section 38: an admin must be able to publish/archive/restore a
      // record from this list with zero terminal/Git — these buttons call
      // /api/admin/content directly and take effect immediately.
      if (entity.status === "draft" || entity.status === "inReview") {
        statusBtns += `<button type="button" class="btn-admin btn-admin-primary admin-row-action" data-action="direct-publish" data-id="${id}">Yayınla</button>`;
      }
      if (entity.status === "published") {
        statusBtns += `<button type="button" class="btn-admin btn-admin-secondary admin-row-action" data-action="direct-archive" data-id="${id}">Arşivle</button>`;
      }
      if (entity.status === "archived") {
        statusBtns += `<button type="button" class="btn-admin btn-admin-secondary admin-row-action" data-action="direct-restore" data-id="${id}">Geri Yükle</button>`;
      }
    } else if (isPublic) {
      statusBtns = `<button type="button" class="btn-admin btn-admin-secondary admin-row-action" data-action="archive-proposal" data-id="${id}" data-type="${type}">Arşivleme Teklifi Oluştur</button>`;
    }

    return `
      <button type="button" class="btn-admin btn-admin-secondary admin-row-action" data-action="view" data-id="${id}">Görüntüle</button>
      ${editBtn}
      ${statusBtns}`;
  }

  /**
   * Direct-mode publish/archive/restore (Section 38) — immediate, through
   * admin/contentService.js, never a draft. `fromArchived` picks the
   * dedicated /restore endpoint (recorded in the audit log as "restore",
   * not "publish"/"unpublish") whenever the record is actually coming out
   * of archived — matching why contentService.js keeps restoreEntity as
   * its own function instead of reusing the plain transition one.
   */
  async function directTransition(id, toStatus, { confirmText, successText, fromArchived = false } = {}) {
    if (confirmText && !confirm(confirmText)) return;
    try {
      const endpoint = fromArchived ? `/entities/${encodeURIComponent(id)}/restore` : `/entities/${encodeURIComponent(id)}/transition`;
      await Session.requestContent(endpoint, { method: "POST", body: JSON.stringify({ toStatus }) });
      toast(successText || "Durum güncellendi.");
      loadRecords();
      refreshDashboard();
    } catch (error) {
      toast(reportError(error, "directTransition"), "error");
    }
  }

  async function loadRecords(filter = {}, view = "records") {
    recordsFilter = { ...recordsFilter, ...filter };
    if (view === "records") switchActiveTypeFilter(recordsFilter.type);

    const tbody = document.getElementById("admin-records-tbody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="admin-muted">Yükleniyor…</td></tr>`;
    try {
      const params = new URLSearchParams();
      if (recordsFilter.type) params.set("type", recordsFilter.type);
      if (recordsFilter.status) params.set("status", recordsFilter.status);
      if (recordsFilter.q) params.set("q", recordsFilter.q);
      const { data: fetched } = await Session.request(`/entities?${params.toString()}`);
      // Legacy/Canonical origin filter is client-side: the admin API has no
      // notion of "origin", only the actual entity payload does (see
      // isLegacyEntity above) — filtering at this layer keeps the backend
      // contract untouched.
      const data = recordsFilter.origin === "legacy" ? fetched.filter(isLegacyEntity)
        : recordsFilter.origin === "canonical" ? fetched.filter((e) => !isLegacyEntity(e))
        : fetched;
      if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="admin-muted">Kayıt bulunamadı.</td></tr>`;
        return;
      }
      tbody.innerHTML = data.map((entity) => `
        <tr>
          <td class="cell-title">${escapeHtml(localized(entity.title, entity.slug || entity.id))}</td>
          <td class="cell-id">${escapeHtml(entity.id)}<br>${originBadgeHtml(entity)}</td>
          <td>${escapeHtml(ENTITY_TYPE_LABELS[entity.entityType] || entity.entityType)}</td>
          <td>${statusBadge(entity.status)}</td>
          <td>${escapeHtml((entity.updatedAt || entity.createdAt || "").slice(0, 10) || "—")}</td>
          <td class="admin-row-actions">${recordActionsHtml(entity)}</td>
        </tr>`).join("");

      tbody.querySelectorAll("[data-action='view']").forEach((btn) => btn.addEventListener("click", () => viewEntity(btn.dataset.id)));
      tbody.querySelectorAll("[data-action='propose-edit']").forEach((btn) => btn.addEventListener("click", () => openEditorForExisting(btn.dataset.id, btn.dataset.type)));
      tbody.querySelectorAll("[data-action='archive-proposal']").forEach((btn) => btn.addEventListener("click", () => proposeArchive(btn.dataset.id, btn.dataset.type)));
      tbody.querySelectorAll("[data-action='direct-publish']").forEach((btn) => btn.addEventListener("click", () => directTransition(btn.dataset.id, "published", { successText: "Kayıt yayınlandı." })));
      tbody.querySelectorAll("[data-action='direct-archive']").forEach((btn) => btn.addEventListener("click", () => directTransition(btn.dataset.id, "archived", {
        confirmText: "Bu kayıt public siteden kaldırılacak ancak silinmeyecektir. Daha sonra geri yükleyebilirsiniz.\n\nDevam edilsin mi?",
        successText: "Kayıt arşivlendi.",
      })));
      tbody.querySelectorAll("[data-action='direct-restore']").forEach((btn) => btn.addEventListener("click", () => directTransition(btn.dataset.id, "published", {
        confirmText: "Kayıt 'Yayında' durumuna geri yüklenecek. Devam edilsin mi?",
        successText: "Kayıt geri yüklendi.",
        fromArchived: true,
      })));
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="6" class="admin-error">${escapeHtml(reportError(error, "loadRecords"))}</td></tr>`;
    }
  }

  /**
   * Checks for an already-active (not rejected) archive proposal for this
   * exact entity before creating a new one — reuses the existing, already
   * entityType-filterable GET /drafts endpoint (no new backend route), then
   * narrows to this entityId/field client-side since the admin API has no
   * per-entity draft filter. Best-effort: a proposal created concurrently by
   * another editor between this check and the POST below could still race,
   * but that is the same inherent limit any check-then-act UI has without a
   * new backend uniqueness constraint, which this pass does not add.
   */
  async function findActiveArchiveProposal(id, entityType) {
    const { data } = await Session.request(`/drafts?entityType=${encodeURIComponent(entityType)}`);
    return data.find((d) => (
      d.kind === "edit" && d.entityId === id && d.status !== "rejected" && d.proposedChanges?.status === "archived"
    )) || null;
  }

  async function proposeArchive(id, entityType) {
    try {
      const existing = await findActiveArchiveProposal(id, entityType);
      if (existing) {
        toast(`Bu kayıt için zaten bir arşivleme teklifi var (durum: ${DRAFT_STATUS_LABELS[existing.status] || existing.status}). "Değişiklikler" ekranından inceleyin.`, "error");
        return;
      }
    } catch (error) {
      toast(reportError(error, "findActiveArchiveProposal"), "error");
      return;
    }

    const confirmed = confirm(
      "Bu işlem kaydı silmez. Canonical veri ve public site hemen değişmez. Yalnızca arşivleme için editoryal teklif oluşturulur.\n\n"
      + "Bu teklif, normal Taslak → İncelemeye Hazır → Onaylandı → Harici Uygulama akışını izler.\n\nDevam edilsin mi?",
    );
    if (!confirmed) return;
    try {
      await Session.request("/drafts", {
        method: "POST",
        body: JSON.stringify({ kind: "edit", entityType, entityId: id, proposedChanges: { status: "archived" } }),
      });
      toast("Arşivleme teklifi taslak olarak oluşturuldu.");
      loadDrafts();
      loadRecords();
    } catch (error) {
      toast(reportError(error, "proposeArchive"), "error");
    }
  }

  // Entity-type shortcuts (Tümü/Yer/Yapı/...) are filter TOGGLES, not
  // navigation to a different page — aria-current is reserved for the
  // sidebar's actual current-page links (see switchView above).
  // aria-pressed is the correct state for a toggle button.
  function switchActiveTypeFilter(type) {
    document.querySelectorAll("[data-records-type-filter]").forEach((btn) => {
      const isActive = btn.dataset.recordsTypeFilter === (type || "all");
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });
  }

  function initRecordsFilters() {
    const typeBar = document.getElementById("admin-records-type-filters");
    if (typeBar) {
      typeBar.innerHTML = `<button type="button" class="tab-btn active" aria-pressed="true" data-records-type-filter="all">Tümü</button>` + Object.entries(ENTITY_TYPE_LABELS).map(([type, label]) => (
        `<button type="button" class="tab-btn" aria-pressed="false" data-records-type-filter="${type}">${escapeHtml(label)}</button>`
      )).join("");
      typeBar.querySelectorAll("[data-records-type-filter]").forEach((btn) => {
        btn.addEventListener("click", () => loadRecords({ type: btn.dataset.recordsTypeFilter === "all" ? "" : btn.dataset.recordsTypeFilter }));
      });
    }

    document.getElementById("admin-records-status-filter")?.addEventListener("change", (e) => loadRecords({ status: e.target.value }));
    document.getElementById("admin-records-origin-filter")?.addEventListener("change", (e) => loadRecords({ origin: e.target.value }));
    const searchInput = document.getElementById("admin-records-search");
    let debounce;
    searchInput?.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => loadRecords({ q: searchInput.value }), 250);
    });
    document.getElementById("admin-records-new-btn")?.addEventListener("click", () => openEditorForNew(recordsFilter.type || "place"));
  }

  async function viewEntity(id) {
    try {
      const { data } = await Session.request(`/entities/${encodeURIComponent(id)}`);
      alert(`${localized(data.title, data.slug || data.id)}\n\n${JSON.stringify(data, null, 2)}`.slice(0, 4000));
    } catch (error) {
      toast(reportError(error, "viewEntity"), "error");
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Entity editor — schema-aware core fields + place/music specifics        */
  /* ---------------------------------------------------------------------- */

  let editorState = { mode: "create", entityType: "place", baseEntity: null, suggestedId: null };
  let editorMap = null;
  let editorMarker = null;
  let editorDirty = false;
  let editorTriggerEl = null;

  /* ---------------------------------------------------------------------- */
  /* Safe automatic id + slug suggestion ("no-code CMS UX" round, Part A)    */
  /* ---------------------------------------------------------------------- */

  /** Turkish/diacritic-aware slugify — see public/js/slug-utils.js (pure, unit-tested there) for the actual logic. Never called for an already-published record's slug (Section 5: never silently change a live slug). */
  const { slugify } = AntiochiaArchiveSlugUtils;

  /** GET /next-id — informational only; the backend never trusts this value blindly (see contentService.js's own id derivation/collision handling). Returns null on any failure so the caller can fall back to a manually-typed id, exactly like before this feature existed. */
  async function fetchSuggestedId(entityType) {
    try {
      const { data } = await Session.requestContent(`/next-id?entityType=${encodeURIComponent(entityType)}`);
      return data.suggestedId;
    } catch {
      return null;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Context-aware simple relationships ("no-code CMS UX" round, Part B).    */
  /* Lives inside the entity editor modal — a completely separate, simpler   */
  /* widget from the technical "İlişkiler" admin page (initRelationshipForm  */
  /* below), which remains available as the "Gelişmiş" path (Section 19).   */
  /* ---------------------------------------------------------------------- */

  let relationshipWidgetActionInFlight = null; // the action currently showing its search box, or null

  function relEntityLabel() {
    const { entityType, baseEntity } = editorState;
    return isFlatEntityType(entityType) ? (baseEntity?.id || "bu kayıt") : localized(baseEntity?.title || {}, "bu kayıt");
  }

  /**
   * Existing relationships (EDIT mode only — a not-yet-saved record has
   * none) rendered as human chips. "UX refinement" round, Issue 1: this
   * used to call a single-entity GET route that does not exist in this
   * router (`/api/admin/content/entities/:id` — only the LIST route and
   * PATCH/transition/restore exist there; the single-GET route lives under
   * the *other* namespace, `/api/admin/editorial/entities/:id`), so every
   * lookup 404'd, was swallowed by its own `.catch(() => null)`, and
   * silently fell back to showing the raw id as if that were normal — the
   * exact bug manual QA found. Fixed by calling ONE backend-expanded
   * endpoint (Section 5: no N+1 fetches from the browser) that already
   * resolves everything server-side.
   */
  async function loadExistingRelationshipChips() {
    const container = document.getElementById("admin-rel-existing-list");
    if (!container || editorState.mode !== "edit") return;
    const entity = editorState.baseEntity;
    try {
      const { data } = await Session.requestContent(`/entities/${encodeURIComponent(entity.id)}/relationships`);
      if (!data.length) { container.innerHTML = `<p class="admin-muted">Henüz ilişki eklenmemiş.</p>`; return; }
      container.innerHTML = data.map((r) => {
        if (!r.otherEntity) {
          // Section 6: never silently show only the raw id as if this were a normal chip.
          return `<div class="admin-rel-chip admin-rel-chip-missing">
            <span><span class="admin-rel-chip-label">⚠ Kayıt bulunamadı</span><span class="admin-rel-chip-rawid">ID: ${escapeHtml(r.missingTargetId)}</span></span>
            <button type="button" class="btn-admin btn-admin-danger" data-remove-rel-chip="${escapeHtml(r.relationshipId)}" data-remove-rel-sentence="">Kaldır</button>
          </div>`;
        }
        const kindLabel = ENTITY_TYPE_LABELS[r.otherEntity.entityType] || "İLİŞKİLİ KAYIT";
        return `<div class="admin-rel-chip">
          <span>
            <span class="admin-rel-chip-label">${escapeHtml(kindLabel)}</span>
            ${escapeHtml(r.otherEntity.title)}
            <span class="admin-rel-chip-context">${escapeHtml(r.relationLabel)}</span>
            <span class="admin-rel-chip-rawid">${escapeHtml(r.otherEntity.id)}</span>
          </span>
          <button type="button" class="btn-admin btn-admin-danger" data-remove-rel-chip="${escapeHtml(r.relationshipId)}" data-remove-rel-sentence="${escapeHtml(r.removalSentence || "")}">Kaldır</button>
        </div>`;
      }).join("");
      container.querySelectorAll("[data-remove-rel-chip]").forEach((btn) => btn.addEventListener("click", async () => {
        const sentence = btn.dataset.removeRelSentence;
        const message = `Bu işlem yalnızca ilişkiyi kaldırır.\nİki kayıt da silinmez.${sentence ? `\n\n${sentence}` : ""}`;
        if (!confirm(message)) return;
        try {
          await Session.requestContent(`/relationships/${encodeURIComponent(btn.dataset.removeRelChip)}`, { method: "DELETE" });
          toast("İlişki kaldırıldı.");
          loadExistingRelationshipChips();
        } catch (error) {
          toast(reportError(error, "removeRelationshipFromEditor"), "error");
        }
      }));
    } catch (error) {
      container.innerHTML = `<p class="admin-error">${escapeHtml(reportError(error, "loadExistingRelationshipChips"))}</p>`;
    }
  }

  /** CREATE mode: relationships staged locally (no real id to attach to yet) — created for real, sequentially, right after the entity itself is successfully saved (Section 20). */
  function renderPendingRelationshipChips() {
    const container = document.getElementById("admin-rel-pending-list");
    if (!container) return;
    const pending = editorState.pendingRelationships || [];
    if (!pending.length) { container.innerHTML = ""; return; }
    container.innerHTML = `<p class="admin-muted">Kaydettikten sonra eklenecek:</p>` + pending.map((p, i) => `
      <div class="admin-rel-chip">
        <span><span class="admin-rel-chip-label">${escapeHtml(ENTITY_TYPE_LABELS[p.targetType] || "")}</span>${escapeHtml(p.targetTitle)}</span>
        <button type="button" class="btn-admin btn-admin-danger" data-remove-pending-rel="${i}">Kaldır</button>
      </div>`).join("");
    container.querySelectorAll("[data-remove-pending-rel]").forEach((btn) => btn.addEventListener("click", () => {
      editorState.pendingRelationships.splice(Number(btn.dataset.removePendingRel), 1);
      renderPendingRelationshipChips();
    }));
  }

  function closeRelationshipSearchBox() {
    relationshipWidgetActionInFlight = null;
    const box = document.getElementById("admin-rel-search-box");
    if (box) box.remove();
  }

  /** The inline "İnanç ara..." box Section 10's acceptance case describes — opened by clicking one action button, replacing any other currently-open one. */
  function openRelationshipSearchBox(action) {
    closeRelationshipSearchBox();
    relationshipWidgetActionInFlight = action;
    const mount = document.getElementById("admin-rel-search-mount");
    if (!mount) return;
    const box = document.createElement("div");
    box.id = "admin-rel-search-box";
    box.className = "admin-rel-search-box";
    const targetLabel = ENTITY_TYPE_LABELS[action.targetType] || action.targetType;
    box.innerHTML = `
      <label class="form-label">${escapeHtml(targetLabel)} ara...</label>
      <input class="form-input" id="admin-rel-search-input" placeholder="${escapeHtml(targetLabel)} ara..." autocomplete="off">
      <div class="admin-rel-search-results" id="admin-rel-search-results"></div>
    `;
    mount.appendChild(box);
    const input = box.querySelector("#admin-rel-search-input");
    input.focus();

    let debounceTimer = null;
    async function runSearch() {
      const resultsEl = box.querySelector("#admin-rel-search-results");
      try {
        const { data } = await Session.requestContent(
          `/entities/search?type=${encodeURIComponent(action.targetType)}&q=${encodeURIComponent(input.value)}${editorState.baseEntity ? `&excludeId=${encodeURIComponent(editorState.baseEntity.id)}` : ""}`,
        );
        if (!data.length) { resultsEl.innerHTML = `<p class="admin-muted">Sonuç bulunamadı.</p>`; return; }
        resultsEl.innerHTML = data.map((r) => `<button type="button" class="admin-rel-search-result" data-rel-result-id="${escapeHtml(r.id)}" data-rel-result-title="${escapeHtml(r.title)}">${escapeHtml(r.title)}${r.localName ? ` <span class="admin-muted">(${escapeHtml(r.localName)})</span>` : ""}</button>`).join("");
        resultsEl.querySelectorAll("[data-rel-result-id]").forEach((btn) => btn.addEventListener("click", () => selectRelationshipTarget(action, btn.dataset.relResultId, btn.dataset.relResultTitle)));
      } catch (error) {
        resultsEl.innerHTML = `<p class="admin-error">${escapeHtml(reportError(error, "relationshipSearch"))}</p>`;
      }
    }
    input.addEventListener("input", () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(runSearch, 200); });
    runSearch();
  }

  /** Selecting a search result shows the plain-language preview (Section 17) and a confirm/cancel pair — never auto-saves on click. */
  async function selectRelationshipTarget(action, targetId, targetTitle) {
    const box = document.getElementById("admin-rel-search-box");
    if (!box) return;

    if (editorState.mode === "edit") {
      let preview;
      try {
        preview = await Session.requestContent(
          `/relationships/simple-preview?currentEntityId=${encodeURIComponent(editorState.baseEntity.id)}&actionKey=${encodeURIComponent(action.actionKey)}&targetEntityId=${encodeURIComponent(targetId)}`,
        ).then((r) => r.data);
      } catch (error) {
        toast(reportError(error, "relationshipPreview"), "error");
        return;
      }
      box.querySelector("#admin-rel-search-results").innerHTML = `
        <p class="admin-rel-preview-sentence">${escapeHtml(preview.sentence)}</p>
        ${preview.alreadyExists ? `<p class="admin-error">Bu ilişki zaten mevcut.</p>` : `
          <button type="button" class="btn-admin btn-admin-primary" id="admin-rel-confirm-save">Kaydet</button>
          <button type="button" class="btn-admin btn-admin-secondary" id="admin-rel-confirm-cancel">İptal</button>`}
      `;
      if (!preview.alreadyExists) {
        box.querySelector("#admin-rel-confirm-save").addEventListener("click", async () => {
          try {
            await Session.requestContent("/relationships/simple", {
              method: "POST",
              body: JSON.stringify({ currentEntityId: editorState.baseEntity.id, actionKey: action.actionKey, targetEntityId: targetId }),
            });
            toast("İlişki eklendi.");
            closeRelationshipSearchBox();
            loadExistingRelationshipChips();
          } catch (error) {
            toast(reportError(error, "createRelationshipSimple"), "error");
          }
        });
        box.querySelector("#admin-rel-confirm-cancel").addEventListener("click", closeRelationshipSearchBox);
      }
    } else {
      // CREATE mode: the record does not exist yet, so there is nothing to
      // preview server-side against — stage it locally instead (Section
      // 20: "save entity first, then create relationships"), using the
      // action's own plain label rather than the precise canonical
      // sentence (which needs a real saved entity to resolve direction).
      box.querySelector("#admin-rel-search-results").innerHTML = `
        <p class="admin-rel-preview-sentence">${escapeHtml(relEntityLabel())} → ${escapeHtml(action.buttonLabel)}: ${escapeHtml(targetTitle)}</p>
        <button type="button" class="btn-admin btn-admin-primary" id="admin-rel-confirm-save">Ekle</button>
        <button type="button" class="btn-admin btn-admin-secondary" id="admin-rel-confirm-cancel">İptal</button>
      `;
      box.querySelector("#admin-rel-confirm-save").addEventListener("click", () => {
        editorState.pendingRelationships.push({ actionKey: action.actionKey, targetId, targetTitle, targetType: action.targetType });
        renderPendingRelationshipChips();
        closeRelationshipSearchBox();
      });
      box.querySelector("#admin-rel-confirm-cancel").addEventListener("click", closeRelationshipSearchBox);
    }
  }

  /** Section 9: the "İlişki Ekle" button row, one per human action this entity type supports — never the raw relation vocabulary. */
  async function initRelationshipWidget() {
    const mount = document.getElementById("admin-rel-widget-mount");
    if (!mount) return;
    mount.innerHTML = `
      <label class="form-label">İlişkiler</label>
      <div id="admin-rel-existing-list" class="admin-rel-chip-list"></div>
      <div id="admin-rel-pending-list" class="admin-rel-chip-list"></div>
      <p class="form-help">İlişki Ekle</p>
      <div class="admin-rel-actions" id="admin-rel-action-buttons"></div>
      <div id="admin-rel-search-mount"></div>
    `;
    if (editorState.mode === "edit") loadExistingRelationshipChips(); else renderPendingRelationshipChips();
    try {
      const { data } = await Session.requestContent(`/relationship-actions?entityType=${encodeURIComponent(editorState.entityType)}`);
      const buttons = document.getElementById("admin-rel-action-buttons");
      if (!data.length) { buttons.innerHTML = `<p class="admin-muted">Bu kayıt türü için ilişki eylemi tanımlı değil.</p>`; return; }
      buttons.innerHTML = data.map((action) => `<button type="button" class="btn-admin btn-admin-secondary" data-rel-action="${escapeHtml(action.actionKey)}">${escapeHtml(action.buttonLabel)}</button>`).join("");
      buttons.querySelectorAll("[data-rel-action]").forEach((btn) => btn.addEventListener("click", () => {
        const action = data.find((a) => a.actionKey === btn.dataset.relAction);
        openRelationshipSearchBox(action);
      }));
    } catch (error) {
      document.getElementById("admin-rel-action-buttons").innerHTML = `<p class="admin-error">${escapeHtml(reportError(error, "loadRelationshipActions"))}</p>`;
    }
  }

  /** Called by submitEditorDirect() right after a successful CREATE — Section 20's "clear progress/error handling", never a silently-misleading UI state. */
  async function createPendingRelationshipsAfterSave(newEntityId) {
    const pending = editorState.pendingRelationships || [];
    if (!pending.length) return;
    let succeeded = 0;
    const failures = [];
    for (const p of pending) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await Session.requestContent("/relationships/simple", {
          method: "POST",
          body: JSON.stringify({ currentEntityId: newEntityId, actionKey: p.actionKey, targetEntityId: p.targetId }),
        });
        succeeded += 1;
      } catch (error) {
        failures.push(`${p.targetTitle}: ${error.message}`);
      }
    }
    if (failures.length) {
      toast(`${succeeded}/${pending.length} ilişki eklendi. Başarısız olanlar: ${failures.join("; ")}`, "error");
    } else {
      toast(`Kayıt oluşturuldu ve ${succeeded} ilişki eklendi.`);
    }
  }

  /**
   * Public Impact indicator (Section 44 of the round brief; made mode-aware
   * in the "COMMIT ÖNCESİ / SON UX CLEANUP" round). In the legacy editorial-
   * proposal flow, every write this modal can make really is a draft/
   * proposal, never a direct canonical mutation — that copy stays exactly
   * as it was, unchanged, and remains true there. In direct SQLite/no-code
   * mode (isDirectContentAuthority()) a save persists straight to the
   * runtime content database via contentService.js, and for an already-
   * published record reaches the public site immediately — so the banner
   * must say so, truthfully, per the record's actual status, using the
   * SAME contentAuthority signal every other direct-mode branch in this
   * file already reads (no second/competing flag).
   */
  function publicImpactBannerHtml({ isNew = false, status = null, statusless = false, entityType = null } = {}) {
    const { cssClass, text } = AntiochiaArchiveEditorModeCopy.resolvePublicImpactBanner({
      isDirect: isDirectContentAuthority(), isNew, status, statusless, entityType,
    });
    return `<p class="admin-storage-banner ${cssClass}" style="margin-bottom: var(--sp-3);">${text}</p>`;
  }

  function fieldsFor(entityType) {
    const common = ["title", "summary", "status", "tags"];
    if (entityType === "place") return [...common, "officialName", "coordinates", "localNames", "historicalNames", "alternateNames"];
    if (entityType === "music") return [...common, "genre", "subgenre", "originalLanguage", "dialect", "lyrics", "transcript", "translations", "audioMediaIds", "rightsStatus"];
    if (entityType === "proverb") return [...common, "originalText", "language", "dialect", "transliteration", "literalMeaning", "culturalMeaning", "translations"];
    if (entityType === "structure") return [...common, "structureType"];
    if (entityType === "story") return [...common, "storyCategory", "originalLanguage", "dialect", "transcript", "translations"];
    return common;
  }

  /**
   * source/media are NOT base entities (backend/v2/schemas/shared.js's
   * validateBaseEntity is deliberately not reused by either — see
   * source.js's/media.js's own headers): no slug, no multilingual title, no
   * publication `status`, no tags. Reusing the common create/edit form for
   * them would silently submit the wrong shape (an object where a plain
   * string is required) and fail schema validation every time — so they get
   * their own field set and collectors instead of flowing through
   * collectCommonFields()/typeSpecificFieldsHtml().
   */
  function isFlatEntityType(entityType) {
    return entityType === "source" || entityType === "media";
  }

  const SOURCE_TYPES_LIST = Object.freeze(["book", "article", "archive", "oralHistory", "photograph", "institutionalRecord", "website", "other"]);
  const MEDIA_TYPES_LIST = Object.freeze(["image", "audio", "video", "document"]);
  const MEDIA_ROLES_LIST = Object.freeze(["realArchiveMedia", "aiGeneratedIllustration"]);
  const RIGHTS_STATUS_LIST = Object.freeze(["unknown", "pendingReview", "cleared", "restricted", "doNotPublish"]);

  function selectOptionsHtml(values, labels, selected, { includeEmpty = false } = {}) {
    const empty = includeEmpty ? `<option value="">—</option>` : "";
    return empty + values.map((v) => `<option value="${v}" ${v === selected ? "selected" : ""}>${escapeHtml(labels[v] || v)}</option>`).join("");
  }

  // Section 7: editorial classification of evidentiary weight — explicitly
  // NOT a truth/accuracy rating (see backend/v2/schemas/source.js's
  // qualityClassification docs). Enum values are the exact
  // SOURCE_QUALITY_CLASSIFICATIONS from backend/v2/constants/vocabularies.js —
  // only the DISPLAYED label is Turkish.
  const SOURCE_QUALITY_LIST = Object.freeze(["primary", "academic", "institutional", "localHistory", "oralHistory", "popular", "unverified"]);
  const SOURCE_QUALITY_LABELS = Object.freeze({
    primary: "Birincil Kaynak", academic: "Akademik", institutional: "Kurumsal",
    localHistory: "Yerel Tarih", oralHistory: "Sözlü Tarih", popular: "Popüler Kaynak", unverified: "Doğrulanmamış",
  });

  function sourceFieldsHtml(entity = {}) {
    return `
      <div class="form-group">
        <label class="form-label" for="field-source-quality">Kaynak Kalite Sınıflandırması</label>
        <select class="form-select" id="field-source-quality">${selectOptionsHtml(SOURCE_QUALITY_LIST, SOURCE_QUALITY_LABELS, entity.qualityClassification || "", { includeEmpty: true })}</select>
        <small class="form-help">Kaynak türü, bilginin doğruluk garantisi değildir; editoryal sınıflandırmadır. Sistem otomatik olarak kalite ataması yapmaz — bu alanı yalnızca siz belirlersiniz.</small>
      </div>
      <div class="form-row-two">
        <div class="form-group"><label class="form-label" for="field-source-type">Tür / Type</label>
          <select class="form-select" id="field-source-type">${selectOptionsHtml(SOURCE_TYPES_LIST, SOURCE_TYPE_LABELS, entity.type || "other")}</select></div>
        <div class="form-group"><label class="form-label" for="field-source-title">Başlık / Title</label><input class="form-input" id="field-source-title" value="${escapeHtml(entity.title || "")}"></div>
        <div class="form-group"><label class="form-label" for="field-source-author">Yazar / Author</label><input class="form-input" id="field-source-author" value="${escapeHtml(entity.author || "")}"></div>
        <div class="form-group"><label class="form-label" for="field-source-publisher">Yayıncı / Publisher</label><input class="form-input" id="field-source-publisher" value="${escapeHtml(entity.publisher || "")}"></div>
        <div class="form-group"><label class="form-label" for="field-source-year">Yıl / Year</label><input class="form-input" id="field-source-year" value="${escapeHtml(entity.year || "")}"></div>
        <div class="form-group"><label class="form-label" for="field-source-url">URL</label><input class="form-input" type="url" id="field-source-url" placeholder="https://…" value="${escapeHtml(entity.url || "")}"></div>
        <div class="form-group"><label class="form-label" for="field-source-locator">Konum / Locator</label><input class="form-input" id="field-source-locator" placeholder="Sayfa, folyo, katalog no." value="${escapeHtml(entity.locator || "")}"></div>
        <div class="form-group"><label class="form-label" for="field-source-accessed-at">Erişim Tarihi / Access Date</label><input class="form-input" type="date" id="field-source-accessed-at" value="${escapeHtml(entity.accessedAt || "")}"></div>
        <div class="form-group"><label class="form-label" for="field-source-language">Dil / Language</label><input class="form-input" id="field-source-language" placeholder="tr, en, ar…" value="${escapeHtml(entity.language || "")}"></div>
        <div class="form-group"><label class="form-label" for="field-source-rights">Haklar / Rights</label><input class="form-input" id="field-source-rights" value="${escapeHtml(entity.rights || "")}"></div>
      </div>
      <div class="form-group"><label class="form-label" for="field-source-note">Not / Note</label><textarea class="form-textarea" id="field-source-note">${escapeHtml(entity.note || "")}</textarea></div>`;
  }

  function collectSourceFields() {
    const out = { type: val("field-source-type") || "other" };
    const quality = val("field-source-quality");
    if (quality) out.qualityClassification = quality;
    for (const [id, field] of [
      ["field-source-title", "title"], ["field-source-author", "author"], ["field-source-publisher", "publisher"],
      ["field-source-year", "year"], ["field-source-url", "url"], ["field-source-locator", "locator"],
      ["field-source-accessed-at", "accessedAt"], ["field-source-language", "language"],
      ["field-source-rights", "rights"], ["field-source-note", "note"],
    ]) {
      const value = val(id);
      if (value) out[field] = value;
    }
    return out;
  }

  function mediaFieldsHtml(entity = {}) {
    return `
      <div class="form-row-two">
        <div class="form-group"><label class="form-label" for="field-media-type">Medya Türü / Type</label>
          <select class="form-select" id="field-media-type" required>${selectOptionsHtml(MEDIA_TYPES_LIST, MEDIA_TYPE_LABELS, entity.mediaType || "image")}</select></div>
        <div class="form-group"><label class="form-label" for="field-media-role">Köken / Role</label>
          <select class="form-select" id="field-media-role" required>${selectOptionsHtml(MEDIA_ROLES_LIST, MEDIA_ROLE_LABELS, entity.mediaRole || "realArchiveMedia")}</select></div>
        <div class="form-group"><label class="form-label" for="field-media-rights-status">Haklar Durumu / Rights Status</label>
          <select class="form-select" id="field-media-rights-status">${selectOptionsHtml(RIGHTS_STATUS_LIST, RIGHTS_STATUS_LABELS, entity.rightsStatus || "unknown")}</select>
          <small class="form-help">"Temiz (Yayına Hazır)" dışındaki her durum, yayın için uyarı üretir.</small></div>
        <div class="form-group"><label class="form-label" for="field-media-source">Kaynak / Source</label><input class="form-input" id="field-media-source" value="${escapeHtml(entity.source || "")}"></div>
        <div class="form-group"><label class="form-label" for="field-media-author">Yazar / Author</label><input class="form-input" id="field-media-author" value="${escapeHtml(entity.author || "")}"></div>
        <div class="form-group"><label class="form-label" for="field-media-license">Lisans / License</label><input class="form-input" id="field-media-license" value="${escapeHtml(entity.license || "")}"></div>
      </div>
      <div class="form-group"><label class="form-label" for="field-media-rights-note">Haklar Notu / Rights Note</label><textarea class="form-textarea" id="field-media-rights-note">${escapeHtml(entity.rightsNote || "")}</textarea></div>
      <label class="checkbox-row" for="field-media-ai-generated">
        <input type="checkbox" id="field-media-ai-generated" ${entity.aiGenerated ? "checked" : ""}>
        <span>Yapay zekâ ile oluşturulmuş / AI-generated</span>
      </label>
      <p class="admin-readonly-value">Dosya: <code>${escapeHtml(entity.originalFilename || entity.originalStoragePath || "(dosya yok)")}</code> — bu ekrandan değiştirilemez; yeni dosya için "＋ Yeni Medya" ile ayrı bir kayıt yükleyin.</p>`;
  }

  function collectMediaFields() {
    const out = {
      mediaType: val("field-media-type"),
      mediaRole: val("field-media-role"),
      aiGenerated: document.getElementById("field-media-ai-generated")?.checked === true,
    };
    const rightsStatus = val("field-media-rights-status");
    if (rightsStatus) out.rightsStatus = rightsStatus;
    for (const [id, field] of [
      ["field-media-storage-path", "originalStoragePath"], ["field-media-source", "source"],
      ["field-media-author", "author"], ["field-media-license", "license"], ["field-media-rights-note", "rightsNote"],
    ]) {
      const value = val(id);
      if (value) out[field] = value;
    }
    return out;
  }

  function multilingualInputHtml(fieldId, label, values = {}, tag = "input") {
    const el = (lang) => tag === "textarea"
      ? `<textarea class="form-textarea" data-ml-field="${fieldId}" data-ml-lang="${lang}">${escapeHtml(values[lang] || "")}</textarea>`
      : `<input class="form-input" type="text" data-ml-field="${fieldId}" data-ml-lang="${lang}" value="${escapeHtml(values[lang] || "")}">`;
    return `<div class="form-group">
      <label class="form-label">${escapeHtml(label)}</label>
      <div class="admin-ml-tabs">
        <div><span class="admin-ml-tag">TR</span>${el("tr")}</div>
        <div><span class="admin-ml-tag">EN</span>${el("en")}</div>
        <div><span class="admin-ml-tag">AR</span>${el("ar")}</div>
      </div>
    </div>`;
  }

  function collectMultilingual(fieldId) {
    const result = {};
    document.querySelectorAll(`[data-ml-field="${fieldId}"]`).forEach((input) => {
      if (input.value.trim()) result[input.dataset.mlLang] = input.value.trim();
    });
    return Object.keys(result).length ? result : undefined;
  }

  function nameListEditorHtml(fieldId, label, entries = []) {
    const rows = entries.map((entry, i) => nameRowHtml(fieldId, i, entry)).join("");
    return `<div class="form-group" data-name-list="${fieldId}">
      <label class="form-label">${escapeHtml(label)}</label>
      <div class="admin-name-list" data-name-list-rows="${fieldId}">${rows}</div>
      <button type="button" class="btn-admin btn-admin-secondary admin-add-name-row" data-add-name-row="${fieldId}">+ Ekle</button>
    </div>`;
  }

  function nameRowHtml(fieldId, index, entry = {}) {
    return `<div class="admin-name-row" data-name-row>
      <input class="form-input" type="text" aria-label="İsim (verildiği gibi)" placeholder="İsim (verildiği gibi)" data-name-field="name" value="${escapeHtml(entry.name || "")}">
      <input class="form-input" type="text" aria-label="Dil/köken" placeholder="Dil/köken (ör. ar)" data-name-field="language" value="${escapeHtml(entry.language || "")}">
      <input class="form-input" type="text" aria-label="Not/köken bilgisi" placeholder="Not/köken bilgisi" data-name-field="dialect" value="${escapeHtml(entry.dialect || "")}">
      <button type="button" class="btn-admin btn-admin-danger admin-remove-name-row" aria-label="Kaldır">×</button>
    </div>`;
  }

  function wireNameListEditor(container) {
    container.querySelectorAll("[data-add-name-row]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rows = container.querySelector(`[data-name-list-rows="${btn.dataset.addNameRow}"]`);
        rows.insertAdjacentHTML("beforeend", nameRowHtml(btn.dataset.addNameRow, rows.children.length));
        wireRemoveButtons(rows);
      });
    });
    wireRemoveButtons(container);
  }

  function wireRemoveButtons(scope) {
    scope.querySelectorAll(".admin-remove-name-row").forEach((btn) => {
      btn.onclick = () => btn.closest("[data-name-row]").remove();
    });
  }

  function collectNameList(fieldId) {
    const rows = document.querySelectorAll(`[data-name-list-rows="${fieldId}"] [data-name-row]`);
    const list = [...rows].map((row) => {
      const entry = {};
      row.querySelectorAll("[data-name-field]").forEach((input) => {
        if (input.value.trim()) entry[input.dataset.nameField] = input.value.trim();
      });
      return entry;
    }).filter((entry) => entry.name);
    return list.length ? list : undefined;
  }

  /* ---------------------------------------------------------------------- */
  /* Media linking (Section 10) — searchable, no raw-ID typing required for */
  /* an entity/page to reference an uploaded media record.                  */
  /* ---------------------------------------------------------------------- */

  let mediaEntityIndex = []; // [{id, label}] — populated on demand, mirrors relationshipEntityIndex's pattern

  async function ensureMediaEntityIndexLoaded() {
    if (mediaEntityIndex.length) return;
    try {
      const { data } = await Session.requestContent("/entities?type=media");
      mediaEntityIndex = data.map((m) => ({ id: m.id, label: `${m.originalFilename || m.mediaType} (${m.id})` }));
      const datalist = document.getElementById("admin-media-link-options");
      if (datalist) datalist.innerHTML = mediaEntityIndex.map((m) => `<option value="${escapeHtml(m.label)}">`).join("");
    } catch (error) {
      reportError(error, "ensureMediaEntityIndexLoaded");
    }
  }

  function resolveMediaEntityId(inputValue) {
    const value = inputValue.trim();
    const match = mediaEntityIndex.find((m) => m.label === value);
    if (match) return match.id;
    const idMatch = value.match(/\(([^()]+)\)\s*$/);
    return idMatch ? idMatch[1] : value;
  }

  function mediaLinkListEditorHtml(fieldId, label, currentIds = []) {
    const chips = (currentIds || []).map((id) => mediaLinkChipHtml(fieldId, id)).join("");
    return `<div class="form-group" data-media-link-list="${fieldId}">
      <label class="form-label">${escapeHtml(label)}</label>
      <div class="admin-name-list" data-media-link-rows="${fieldId}">${chips}</div>
      <div style="display:flex; gap:6px;">
        <input class="form-input" type="text" list="admin-media-link-options" placeholder="Medya ara (dosya adı veya ID)…" data-media-link-input="${fieldId}" autocomplete="off">
        <button type="button" class="btn-admin btn-admin-secondary" data-media-link-add="${fieldId}">+ Ekle</button>
      </div>
      <datalist id="admin-media-link-options"></datalist>
    </div>`;
  }

  function mediaLinkChipHtml(fieldId, id) {
    const known = mediaEntityIndex.find((m) => m.id === id);
    return `<div class="admin-name-row" data-media-link-row data-media-id="${escapeHtml(id)}">
      <span class="admin-readonly-value" style="flex:1;">${escapeHtml(known ? known.label : id)}</span>
      <button type="button" class="btn-admin btn-admin-danger admin-remove-name-row" aria-label="Kaldır">×</button>
    </div>`;
  }

  function wireMediaLinkListEditor(container) {
    ensureMediaEntityIndexLoaded();
    container.querySelectorAll("[data-media-link-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const fieldId = btn.dataset.mediaLinkAdd;
        const input = container.querySelector(`[data-media-link-input="${fieldId}"]`);
        const id = resolveMediaEntityId(input.value);
        if (!id) return;
        const rows = container.querySelector(`[data-media-link-rows="${fieldId}"]`);
        if ([...rows.children].some((row) => row.dataset.mediaId === id)) { input.value = ""; return; }
        rows.insertAdjacentHTML("beforeend", mediaLinkChipHtml(fieldId, id));
        wireRemoveButtons(rows);
        input.value = "";
      });
    });
    wireRemoveButtons(container);
  }

  function collectMediaLinkIds(fieldId) {
    const rows = document.querySelectorAll(`[data-media-link-rows="${fieldId}"] [data-media-link-row]`);
    const ids = [...rows].map((row) => row.dataset.mediaId).filter(Boolean);
    return ids.length ? ids : undefined;
  }

  function coordinateEditorHtml(coordinates) {
    return `<div class="form-group">
      <label class="form-label">Koordinatlar</label>
      <div class="form-row-two">
        <input class="form-input" type="number" step="any" id="field-coord-lat" aria-label="Enlem" placeholder="Enlem (-90..90)" value="${coordinates?.latitude ?? ""}">
        <input class="form-input" type="number" step="any" id="field-coord-lng" aria-label="Boylam" placeholder="Boylam (-180..180)" value="${coordinates?.longitude ?? ""}">
      </div>
      <small class="form-help">Haritaya tıklayarak da seçebilirsiniz. Değişiklik yalnızca "Taslak Kaydet" ile saklanır.</small>
      <div id="admin-editor-map" class="admin-editor-map"></div>
    </div>`;
  }

  function initCoordinateMap(coordinates) {
    const container = document.getElementById("admin-editor-map");
    if (!container || typeof L === "undefined") return;
    if (editorMap) { editorMap.remove(); editorMap = null; }
    const start = coordinates && typeof coordinates.latitude === "number" ? [coordinates.latitude, coordinates.longitude] : [36.2021, 36.1608];
    editorMap = L.map(container, { center: start, zoom: coordinates ? 13 : 9, scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(editorMap);
    if (coordinates) placeEditorMarker(start);
    editorMap.on("click", (event) => {
      document.getElementById("field-coord-lat").value = event.latlng.lat.toFixed(6);
      document.getElementById("field-coord-lng").value = event.latlng.lng.toFixed(6);
      placeEditorMarker([event.latlng.lat, event.latlng.lng]);
    });
  }

  function placeEditorMarker(latlng) {
    if (editorMarker) editorMarker.setLatLng(latlng); else editorMarker = L.marker(latlng).addTo(editorMap);
  }

  function typeSpecificFieldsHtml(entityType, entity = {}) {
    const parts = [];
    if (entityType === "place") {
      parts.push(multilingualInputHtml("officialName", "Resmî Ad", entity.officialName || {}));
      parts.push(coordinateEditorHtml(entity.coordinates));
      parts.push(nameListEditorHtml("localNames", "Yerel Adlar (verildiği gibi — otomatik çevrilmez)", entity.localNames));
      parts.push(nameListEditorHtml("historicalNames", "Tarihî Adlar", entity.historicalNames));
    } else if (entityType === "music") {
      parts.push(`<div class="form-row-two">
        <div class="form-group"><label class="form-label">Tür / Genre</label><input class="form-input" id="field-genre" value="${escapeHtml(entity.genre || "")}"></div>
        <div class="form-group"><label class="form-label">Alt Tür / Subgenre</label><input class="form-input" id="field-subgenre" value="${escapeHtml(entity.subgenre || "")}"></div>
        <div class="form-group"><label class="form-label">Özgün Dil (tr/en/ar)</label><input class="form-input" id="field-original-language" value="${escapeHtml(entity.originalLanguage || "")}"></div>
        <div class="form-group"><label class="form-label">Lehçe / Dialect</label><input class="form-input" id="field-dialect" value="${escapeHtml(entity.dialect || "")}"></div>
      </div>`);
      parts.push(multilingualInputHtml("lyrics", "Sözler / Lyrics", entity.lyrics || {}, "textarea"));
      parts.push(multilingualInputHtml("transcript", "Transkript", entity.transcript || {}, "textarea"));
      parts.push(multilingualInputHtml("translations", "Çeviri", entity.translations || {}, "textarea"));
      parts.push(mediaLinkListEditorHtml("audioMediaIds", "Bağlı Ses Kayıtları", entity.audioMediaIds));
    } else if (entityType === "proverb") {
      parts.push(`<div class="form-group"><label class="form-label">Özgün İfade</label><input class="form-input" id="field-original-text" value="${escapeHtml(entity.originalText || "")}"></div>`);
      parts.push(`<div class="form-row-two">
        <div class="form-group"><label class="form-label">Dil</label><input class="form-input" id="field-language" value="${escapeHtml(entity.language || "")}"></div>
        <div class="form-group"><label class="form-label">Lehçe</label><input class="form-input" id="field-dialect" value="${escapeHtml(entity.dialect || "")}"></div>
        <div class="form-group"><label class="form-label">Transliterasyon</label><input class="form-input" id="field-transliteration" value="${escapeHtml(entity.transliteration || "")}"></div>
      </div>`);
      parts.push(multilingualInputHtml("literalMeaning", "Sözlük Anlamı", entity.literalMeaning || {}, "textarea"));
      parts.push(multilingualInputHtml("culturalMeaning", "Kültürel Anlam / Bağlam", entity.culturalMeaning || {}, "textarea"));
      parts.push(multilingualInputHtml("translations", "Çeviri", entity.translations || {}, "textarea"));
      // Section 11 of the "correctness pass" round: proverb.audioMediaIds
      // is already schema-valid (backend/v2/schemas/proverb.js) and already
      // rights-gated end to end (media/mediaRoutes.js, entityDetailRenderer.js)
      // — it was simply never exposed here. No new schema field invented.
      parts.push(mediaLinkListEditorHtml("audioMediaIds", "Bağlı Ses Kayıtları", entity.audioMediaIds));
    } else if (entityType === "structure") {
      parts.push(`<div class="form-group"><label class="form-label">Yapı Türü</label><input class="form-input" id="field-structure-type" value="${escapeHtml(entity.structureType || "")}"></div>`);
      parts.push(mediaLinkListEditorHtml("mediaIds", "Bağlı Medya", entity.mediaIds));
    } else if (entityType === "story") {
      // Section 11: story.audioMediaIds/illustrationMediaIds are already
      // schema-valid (backend/v2/schemas/story.js) but had no editor UI at
      // all yet for this entity type in the direct-publish (SQLite) editor.
      // Exposing only the existing media-linking capability here, per the
      // round brief — story's other type-specific fields (storyCategory,
      // themes, storyPlaceId, period, recordingDate, transcript,
      // translations) remain editable only via the separate
      // proposal/editorial flow; adding a full story editor UI here would
      // be the "massive redesign" the brief says not to do.
      parts.push(mediaLinkListEditorHtml("audioMediaIds", "Bağlı Ses Kayıtları", entity.audioMediaIds));
      parts.push(mediaLinkListEditorHtml("illustrationMediaIds", "Bağlı Görsel", entity.illustrationMediaIds));
    }
    return parts.join("\n");
  }

  function collectTypeSpecificFields(entityType) {
    const out = {};
    if (entityType === "place") {
      const officialName = collectMultilingual("officialName");
      if (officialName) out.officialName = officialName;
      const lat = document.getElementById("field-coord-lat").value;
      const lng = document.getElementById("field-coord-lng").value;
      if (lat !== "" && lng !== "") out.coordinates = { latitude: Number(lat), longitude: Number(lng) };
      const localNames = collectNameList("localNames");
      if (localNames) out.localNames = localNames;
      const historicalNames = collectNameList("historicalNames");
      if (historicalNames) out.historicalNames = historicalNames;
    } else if (entityType === "music") {
      if (val("field-genre")) out.genre = val("field-genre");
      if (val("field-subgenre")) out.subgenre = val("field-subgenre");
      if (val("field-original-language")) out.originalLanguage = val("field-original-language");
      if (val("field-dialect")) out.dialect = val("field-dialect");
      const lyrics = collectMultilingual("lyrics"); if (lyrics) out.lyrics = lyrics;
      const transcript = collectMultilingual("transcript"); if (transcript) out.transcript = transcript;
      const translations = collectMultilingual("translations"); if (translations) out.translations = translations;
      const audioMediaIds = collectMediaLinkIds("audioMediaIds"); if (audioMediaIds) out.audioMediaIds = audioMediaIds;
    } else if (entityType === "proverb") {
      if (val("field-original-text")) out.originalText = val("field-original-text");
      if (val("field-language")) out.language = val("field-language");
      if (val("field-dialect")) out.dialect = val("field-dialect");
      if (val("field-transliteration")) out.transliteration = val("field-transliteration");
      const literalMeaning = collectMultilingual("literalMeaning"); if (literalMeaning) out.literalMeaning = literalMeaning;
      const culturalMeaning = collectMultilingual("culturalMeaning"); if (culturalMeaning) out.culturalMeaning = culturalMeaning;
      const translations = collectMultilingual("translations"); if (translations) out.translations = translations;
      const audioMediaIds = collectMediaLinkIds("audioMediaIds"); if (audioMediaIds) out.audioMediaIds = audioMediaIds;
    } else if (entityType === "structure") {
      if (val("field-structure-type")) out.structureType = val("field-structure-type");
      const mediaIds = collectMediaLinkIds("mediaIds"); if (mediaIds) out.mediaIds = mediaIds;
    } else if (entityType === "story") {
      const audioMediaIds = collectMediaLinkIds("audioMediaIds"); if (audioMediaIds) out.audioMediaIds = audioMediaIds;
      const illustrationMediaIds = collectMediaLinkIds("illustrationMediaIds"); if (illustrationMediaIds) out.illustrationMediaIds = illustrationMediaIds;
    }
    return out;
  }

  function val(id) { return document.getElementById(id)?.value.trim() || ""; }

  function statusOptionsHtml(entityType, selected, isNew) {
    const options = isNew ? ["draft", "inReview"] : ["draft", "inReview", "published", "archived"];
    return options.map((s) => `<option value="${s}" ${s === selected ? "selected" : ""}>${STATUS_LABELS[s]}</option>`).join("");
  }

  /**
   * Section 4: "readonly by default + Gelişmiş: ID'yi değiştir" — chosen
   * over full auto-generation-with-no-field (option B) because the id
   * still needs to be VISIBLE (it appears in URLs/exports/relationship
   * pickers), just never something the admin has to invent. Falls back to
   * the original manually-typed input, unchanged, whenever no suggestion
   * is available (editorial-draft mode, or a type with no id convention).
   */
  function idFieldHtml({ suggestedId, placeholder }) {
    if (suggestedId) {
      return `<div class="form-group"><label class="form-label" for="field-id">Kayıt ID</label>
        <input class="form-input" id="field-id" value="${escapeHtml(suggestedId)}" readonly required>
        <small class="form-help">Program tarafından önerildi. <button type="button" class="form-help-action" id="field-id-advanced-toggle">Gelişmiş: ID'yi değiştir</button></small>
      </div>`;
    }
    return `<div class="form-group"><label class="form-label" for="field-id">Kimlik (ID)</label><input class="form-input" id="field-id" required placeholder="${placeholder}"></div>`;
  }

  function wireIdAdvancedToggle() {
    document.getElementById("field-id-advanced-toggle")?.addEventListener("click", (event) => {
      const input = document.getElementById("field-id");
      input.readOnly = false;
      input.focus();
      input.select();
      event.currentTarget.closest(".form-help").textContent = "Program tarafından önerilen değer değiştirildi — dikkatli olun.";
    });
  }

  /** `/archive-v2/<slug>/` is the only public route non-flat cultural entities ever render at (see v2/routes/v2DetailRoutes.js) — media/source have no slug/public detail page of their own and never call this. */
  function publicEntityUrl(slug) { return `/archive-v2/${encodeURIComponent(slug)}/`; }

  function updateSlugPreview(previewEl, slugValue) {
    if (!previewEl) return;
    previewEl.textContent = slugValue ? `Yayınlandığında adres: ${publicEntityUrl(slugValue)}` : "";
  }

  /** Section 5: auto-fills the slug from the TR title as the admin types, unless they have already edited slug by hand — never runs for an existing (already-published-capable) record. */
  function wireSlugAutoSuggest() {
    const slugInput = document.getElementById("field-slug");
    const helpEl = document.getElementById("field-slug-help");
    const previewEl = document.getElementById("field-slug-preview");
    const titleTr = document.querySelector('[data-ml-field="title"][data-ml-lang="tr"]');
    if (!slugInput || !titleTr) return;
    let slugTouchedByUser = false;
    slugInput.addEventListener("input", () => {
      slugTouchedByUser = true;
      if (helpEl) helpEl.textContent = "Elle düzenlendi.";
      updateSlugPreview(previewEl, slugInput.value.trim());
    });
    titleTr.addEventListener("input", () => {
      if (slugTouchedByUser) return;
      slugInput.value = slugify(titleTr.value);
      updateSlugPreview(previewEl, slugInput.value);
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Existing-record slug UI ("UX refinement" round, Sections 9-16). Fully   */
  /* separate from the main "Kaydet" button and its editEntity() call — a    */
  /* slug change on an EXISTING record always goes through the dedicated,   */
  /* confirm-gated POST /entities/:id/slug endpoint (see contentService.js's */
  /* changeEntitySlug()), never as a side effect of an ordinary content      */
  /* save, so it can never be triggered by an accidental Enter/save.         */
  /* ---------------------------------------------------------------------- */

  function slugWidgetLockedHtml(slugInfo) {
    return `
      <div class="admin-slug-widget admin-slug-widget-locked">
        <span class="admin-slug-lock-icon" aria-hidden="true">🔒</span>
        <div class="admin-slug-locked-body">
          <div><strong>Yayındaki URL:</strong> <code>${escapeHtml(publicEntityUrl(slugInfo.currentSlug))}</code></div>
          <small class="form-help">Bu adres yayında olduğu için korunmaktadır.</small>
        </div>
        <button type="button" class="form-help-action" id="admin-slug-unlock-btn">Gelişmiş: URL'yi değiştir</button>
      </div>`;
  }

  function slugWidgetEditableHtml(slugInfo) {
    return `
      <div class="admin-slug-widget admin-slug-widget-editable">
        <div class="form-group">
          <label class="form-label" for="admin-slug-edit-input">Web adresi (slug)</label>
          <input class="form-input" id="admin-slug-edit-input" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value="${escapeHtml(slugInfo.currentSlug)}" required>
          <p class="admin-slug-url-preview" id="admin-slug-edit-preview">${escapeHtml(`Yeni adres: ${publicEntityUrl(slugInfo.currentSlug)}`)}</p>
          ${slugInfo.everPublished
            ? `<small class="form-help admin-warning-text">⚠ Bu kayıt daha önce yayınlandı. Adresi değiştirmek eski bağlantıları etkileyebilir (eski adres otomatik olarak yeni adrese yönlendirilecektir).</small>`
            : `<small class="form-help">Bu kayıt hiç yayınlanmadığı için serbestçe düzenlenebilir.</small>`}
        </div>
        <div class="admin-slug-widget-actions">
          <button type="button" class="btn-admin btn-admin-primary" id="admin-slug-save-btn">Web Adresini Güncelle</button>
          <button type="button" class="btn-admin btn-admin-secondary" id="admin-slug-cancel-btn">Vazgeç</button>
        </div>
        <p class="admin-error" id="admin-slug-edit-error" hidden></p>
      </div>`;
  }

  /** Renders the widget from the current editorState.slugInfo — locked+🔒 when the entity has ever been published, freely editable otherwise (Section 11: draft/inReview entities that never went live are not locked at all). */
  function renderSlugWidget() {
    const mount = document.getElementById("admin-slug-widget-mount");
    if (!mount) return;
    const { slugInfo } = editorState;
    if (!slugInfo) {
      // The slug-info fetch failed — fail safe to a visible error, never a
      // silently-missing widget that would let an accidental edit through
      // unguarded (same fail-safe philosophy as the environment badge).
      mount.innerHTML = `<p class="admin-error">Web adresi bilgisi alınamadı. Sayfayı yenileyip tekrar deneyin.</p>`;
      return;
    }
    if (slugInfo.everPublished) {
      mount.innerHTML = slugWidgetLockedHtml(slugInfo);
      document.getElementById("admin-slug-unlock-btn").addEventListener("click", () => {
        mount.innerHTML = slugWidgetEditableHtml(slugInfo);
        wireSlugWidgetEditable();
      });
    } else {
      mount.innerHTML = slugWidgetEditableHtml(slugInfo);
      wireSlugWidgetEditable();
    }
  }

  function wireSlugWidgetEditable() {
    const input = document.getElementById("admin-slug-edit-input");
    const preview = document.getElementById("admin-slug-edit-preview");
    input?.addEventListener("input", () => {
      preview.textContent = `Yeni adres: ${publicEntityUrl(input.value.trim())}`;
      editorDirty = true;
    });
    document.getElementById("admin-slug-cancel-btn")?.addEventListener("click", () => renderSlugWidget());
    document.getElementById("admin-slug-save-btn")?.addEventListener("click", () => submitSlugChange());
  }

  /**
   * Section 13: a strong, explicit, non-bypassable warning before changing
   * an ever-published entity's slug — old/new URL preview, a real confirm
   * click (never triggered by Enter, since this is a type="button" outside
   * any implicit form-submit path). Section 9: a 409 collision comes back
   * with a ready-to-use suggestedSlug (never a dead end) — pre-filled into
   * the input so the admin can just click save again.
   */
  async function submitSlugChange() {
    const { baseEntity, slugInfo } = editorState;
    const input = document.getElementById("admin-slug-edit-input");
    const errorEl = document.getElementById("admin-slug-edit-error");
    const newSlug = input.value.trim();
    const showError = (message) => { if (errorEl) { errorEl.hidden = false; errorEl.textContent = message; } };
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ""; }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newSlug)) {
      showError("Web adresi yalnızca küçük harf, rakam ve tek tire ile ayrılmış gruplar içerebilir (ör. “yeni-kayit”).");
      return;
    }
    if (newSlug === slugInfo.currentSlug) {
      showError("Girilen adres, mevcut adresle aynı.");
      return;
    }
    if (slugInfo.everPublished) {
      const oldUrl = publicEntityUrl(slugInfo.currentSlug);
      const newUrl = publicEntityUrl(newSlug);
      const confirmed = confirm(
        `Bu kayıt daha önce yayınlandı.\n\nMevcut adres: ${oldUrl}\nYeni adres: ${newUrl}\n\n`
        + `Eski adres otomatik olarak yeni adrese yönlendirilecek, ancak zaten paylaşılmış eski bağlantılar farklı görünecektir.\n\n`
        + `Devam etmek istiyor musunuz?`
      );
      if (!confirmed) return;
    }
    try {
      const { data } = await Session.requestContent(`/entities/${encodeURIComponent(baseEntity.id)}/slug`, {
        method: "POST",
        body: JSON.stringify({ newSlug, confirmed: true }),
      });
      baseEntity.slug = data.slug;
      editorState.slugInfo = { ...slugInfo, currentSlug: data.slug };
      toast("Web adresi güncellendi.");
      renderSlugWidget();
      loadRecords();
    } catch (error) {
      if (error.suggestedSlug) {
        showError(`Bu URL zaten kullanılıyor. Önerilen: ${error.suggestedSlug}`);
        input.value = error.suggestedSlug;
        document.getElementById("admin-slug-edit-preview").textContent = `Yeni adres: ${publicEntityUrl(error.suggestedSlug)}`;
        return;
      }
      if (error.requiresConfirmation) {
        // Should not normally happen (the confirm dialog above already
        // covers this whenever slugInfo.everPublished is true), but the
        // backend stays authoritative — if the locally-held slugInfo was
        // ever stale, retry honoring the server's own answer rather than
        // silently failing.
        editorState.slugInfo = { ...slugInfo, everPublished: true };
        return submitSlugChange();
      }
      showError(reportError(error, "submitSlugChange"));
    }
  }

  function renderEditor() {
    const { mode, entityType, baseEntity, suggestedId } = editorState;
    const isNew = mode === "create";
    const entity = baseEntity || {};
    const flat = isFlatEntityType(entityType);
    // "COMMIT ÖNCESİ / SON UX CLEANUP" round: the modal title must describe
    // the ACTIVE mode, not always the legacy editorial-proposal wording —
    // direct SQLite mode really does persist an edit straight to the
    // record, it is never "proposing a change" there. The editorial-
    // proposal flow's copy is untouched (see editor-mode-copy.js).
    const headingPrefix = AntiochiaArchiveEditorModeCopy.resolveEditorHeadingPrefix({ isDirect: isDirectContentAuthority(), isNew });
    document.getElementById("admin-editor-heading").textContent = isNew
      ? `${headingPrefix} — ${ENTITY_TYPE_LABELS[entityType]}`
      : `${headingPrefix} — ${flat ? entity.id : localized(entity.title, entity.id)}`;

    const body = document.getElementById("admin-editor-form-body");

    if (flat) {
      // source/media: plain `id`, no slug, no title/summary/status/tags — see isFlatEntityType's header.
      const idHtml = isNew
        ? idFieldHtml({ suggestedId, placeholder: "ör. source-XXXX" })
        : `<p class="admin-readonly-value">ID: <code>${escapeHtml(entity.id)}</code> (bu alan ${isDirectContentAuthority() ? "" : "bir değişiklik önerisiyle "}değiştirilemez)</p>`;
      body.innerHTML = `
        ${publicImpactBannerHtml({ isNew, statusless: true, entityType })}
        ${idHtml}
        ${entityType === "source" ? sourceFieldsHtml(entity) : mediaFieldsHtml(entity)}
      `;
      wireIdAdvancedToggle();
    } else {
      const idSlugHtml = isNew ? `
        <div class="form-row-two">
          ${idFieldHtml({ suggestedId, placeholder: "ör. place-XXXX" })}
          <div class="form-group"><label class="form-label" for="field-slug">Web adresi</label><input class="form-input" id="field-slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required>
            <small class="form-help" id="field-slug-help">Başlıktan otomatik oluşturuldu.</small>
            <p class="admin-slug-url-preview" id="field-slug-preview"></p>
          </div>
        </div>` : isDirectContentAuthority()
          ? `<p class="admin-readonly-value">ID: <code>${escapeHtml(entity.id)}</code> (bu alan değiştirilemez)</p><div id="admin-slug-widget-mount"></div>`
          : `<p class="admin-readonly-value">ID: <code>${escapeHtml(entity.id)}</code> · Slug: <code>${escapeHtml(entity.slug)}</code> (bu alanlar bir değişiklik önerisiyle değiştirilemez)</p>`;

      body.innerHTML = `
        ${publicImpactBannerHtml({ isNew, status: entity.status })}
        ${idSlugHtml}
        ${multilingualInputHtml("title", "Başlık", entity.title || {})}
        ${multilingualInputHtml("summary", "Özet", entity.summary || {}, "textarea")}
        <div class="form-group"><label class="form-label" for="field-status">Durum</label>
          <select class="form-select" id="field-status">${statusOptionsHtml(entityType, entity.status || "draft", isNew)}</select>
          <small class="form-help">Yeni kayıtlar asla doğrudan "Yayında" ile başlayamaz.</small>
        </div>
        <div class="form-group"><label class="form-label" for="field-tags">Etiketler (virgülle ayrılmış)</label><input class="form-input" id="field-tags" value="${escapeHtml((entity.tags || []).join(", "))}"></div>
        ${typeSpecificFieldsHtml(entityType, entity)}
        ${isDirectContentAuthority() ? `<div class="form-group" id="admin-rel-widget-mount"></div>` : ""}
      `;
      wireIdAdvancedToggle();
      if (isNew) wireSlugAutoSuggest();
      if (!isNew && isDirectContentAuthority()) renderSlugWidget();
    }
    body.querySelectorAll('[data-name-list]').forEach(wireNameListEditor);
    body.querySelectorAll('[data-media-link-list]').forEach(() => wireMediaLinkListEditor(body));
    if (entityType === "place") initCoordinateMap(entity.coordinates);
    if (!flat && isDirectContentAuthority()) initRelationshipWidget();

    editorDirty = false;
    body.addEventListener("input", () => { editorDirty = true; });
    body.addEventListener("change", () => { editorDirty = true; });

    const submitBtn = document.getElementById("admin-editor-submit");
    if (submitBtn) {
      submitBtn.textContent = AntiochiaArchiveEditorModeCopy.resolveSubmitButtonLabel({ isDirect: isDirectContentAuthority(), isNew, flat });
    }

    const modal = document.getElementById("admin-editor-modal");
    modal.classList.add("open");
    modal.querySelector("input, textarea, select")?.focus();
  }

  async function openEditorForNew(entityType, triggerEl = document.activeElement) {
    editorTriggerEl = triggerEl;
    editorState = { mode: "create", entityType, baseEntity: null, suggestedId: null, pendingRelationships: [] };
    // Only the direct-authority (SQLite) create form ever calls the real
    // backend — the existing editorial-draft flow gets no suggestion and
    // keeps its original manually-typed id field, unchanged.
    if (isDirectContentAuthority()) {
      editorState.suggestedId = await fetchSuggestedId(entityType);
    }
    renderEditor();
  }

  async function openEditorForExisting(id, entityType, triggerEl = document.activeElement) {
    try {
      const { data } = await Session.request(`/entities/${encodeURIComponent(id)}`);
      editorTriggerEl = triggerEl;
      editorState = { mode: "edit", entityType: entityType || data.entityType, baseEntity: data, slugInfo: null };
      // "UX refinement" round, Section 10: only the direct-authority (SQLite)
      // editor ever offers the "Gelişmiş: URL'yi değiştir" flow — the
      // editorial-draft flow keeps its existing fully-locked slug display,
      // unchanged. Fetched once, up front, so the initial render already
      // knows whether this entity has ever been published (locked) or not
      // (freely editable) without a layout jump after the modal opens.
      if (!isFlatEntityType(editorState.entityType) && isDirectContentAuthority()) {
        try {
          const res = await Session.requestContent(`/entities/${encodeURIComponent(id)}/slug-info`);
          editorState.slugInfo = res.data;
        } catch (error) {
          reportError(error, "openEditorForExisting:slug-info"); // non-fatal — the widget falls back to locked+error state
        }
      }
      renderEditor();
    } catch (error) {
      toast(reportError(error, "openEditorForExisting"), "error");
    }
  }

  /**
   * Dirty-form detection (Section 45): only prompts when the form was
   * actually touched, and is skipped entirely right after a successful
   * submit (submitEditor resets editorDirty before calling this).
   */
  function closeEditor({ force = false } = {}) {
    if (!force && editorDirty && !confirm("Kaydedilmemiş değişiklikler var. Yine de kapatmak istiyor musunuz?")) {
      return;
    }
    document.getElementById("admin-editor-modal").classList.remove("open");
    if (editorMap) { editorMap.remove(); editorMap = null; editorMarker = null; }
    editorDirty = false;
    editorTriggerEl?.focus();
    editorTriggerEl = null;
  }

  function collectCommonFields() {
    const out = { status: val("field-status") };
    const title = collectMultilingual("title"); if (title) out.title = title;
    const summary = collectMultilingual("summary"); if (summary) out.summary = summary;
    const tags = val("field-tags");
    if (tags) out.tags = tags.split(",").map((t) => t.trim()).filter(Boolean);
    return out;
  }

  async function submitEditorDirect({ mode, entityType, baseEntity, proposedChanges, flat }) {
    if (mode === "create") {
      proposedChanges.id = val("field-id");
      if (!flat) proposedChanges.slug = val("field-slug");
      const created = await Session.requestContent("/entities", { method: "POST", body: JSON.stringify({ entityType, fields: proposedChanges }) });
      // Section 20: the entity is already safely saved at this point — any
      // relationship staged during create is added now, sequentially, with
      // its own clear success/failure reporting (createPendingRelationshipsAfterSave),
      // never silently, and never blocking or rolling back the entity
      // creation that already succeeded.
      await createPendingRelationshipsAfterSave(created.data.id);
      if (!(editorState.pendingRelationships || []).length) toast(flat ? "Yeni kayıt oluşturuldu." : "Yeni kayıt oluşturuldu (Taslak).");
      return created;
    }

    // Status is a separate concern from content edits in contentService.js
    // (editEntity() rejects a status field outright) — split it out here
    // and apply it, if changed, through the correct transition/restore
    // endpoint after the content edit succeeds.
    const { status: requestedStatus, ...contentFields } = proposedChanges;
    if (Object.keys(contentFields).length) {
      await Session.requestContent(`/entities/${encodeURIComponent(baseEntity.id)}`, { method: "PATCH", body: JSON.stringify({ fields: contentFields }) });
    }
    if (!flat && requestedStatus && requestedStatus !== baseEntity.status) {
      const fromArchived = baseEntity.status === "archived";
      const endpoint = fromArchived ? `/entities/${encodeURIComponent(baseEntity.id)}/restore` : `/entities/${encodeURIComponent(baseEntity.id)}/transition`;
      await Session.requestContent(endpoint, { method: "POST", body: JSON.stringify({ toStatus: requestedStatus }) });
    }
    toast("Kayıt güncellendi.");
  }

  async function submitEditor(event) {
    event.preventDefault();
    const { mode, entityType, baseEntity } = editorState;
    const flat = isFlatEntityType(entityType);
    const proposedChanges = flat
      ? (entityType === "source" ? collectSourceFields() : collectMediaFields())
      : { ...collectCommonFields(), ...collectTypeSpecificFields(entityType) };

    try {
      if (isDirectContentAuthority()) {
        await submitEditorDirect({ mode, entityType, baseEntity, proposedChanges, flat });
        loadRecords();
      } else if (mode === "create") {
        proposedChanges.id = val("field-id");
        if (!flat) proposedChanges.slug = val("field-slug");
        await Session.request("/drafts", { method: "POST", body: JSON.stringify({ kind: "create", entityType, proposedChanges }) });
        toast("Yeni kayıt taslağı oluşturuldu.");
        loadDrafts();
      } else {
        await Session.request("/drafts", { method: "POST", body: JSON.stringify({ kind: "edit", entityType, entityId: baseEntity.id, proposedChanges }) });
        toast("Değişiklik önerisi taslak olarak kaydedildi.");
        loadDrafts();
      }
      editorDirty = false;
      closeEditor({ force: true });
      refreshDashboard();
    } catch (error) {
      toast(reportError(error, "submitEditor"), "error");
    }
  }

  function initEditorModal() {
    document.getElementById("admin-editor-form").addEventListener("submit", submitEditor);
    document.getElementById("admin-editor-close").addEventListener("click", () => closeEditor());
    document.getElementById("admin-editor-cancel").addEventListener("click", () => closeEditor());
    document.getElementById("admin-editor-modal").addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeEditor();
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Editorial drafts / Değişiklikler                                        */
  /* ---------------------------------------------------------------------- */

  // "applied" is deliberately never called "Yayınlandı"/"Published" anywhere
  // in this UI (Section 14 of the round brief): it only ever means "this
  // draft's status was flipped in the editorial store", never "the public
  // site now reflects this". The button label and its confirmation dialog
  // both say so explicitly, on purpose, every time.
  const DRAFT_NEXT_ACTIONS = Object.freeze({
    draft: [["readyForReview", "İncelemeye Gönder"], ["rejected", "Taslağı İptal Et"]],
    readyForReview: [["approved", "Onayla"], ["draft", "Taslağa Geri Al"], ["rejected", "Reddet"]],
    approved: [["applied", "Harici Uygulama Tamamlandı Olarak İşaretle"], ["rejected", "Reddet"]],
    rejected: [["draft", "Taslağa Geri Al"]],
    applied: [],
  });

  const DESTRUCTIVE_TRANSITIONS = new Set(["rejected"]);
  const CONFIRM_TRANSITIONS = Object.freeze({
    applied: "Bu işlem YALNIZCA bu taslağın editoryal iş akışı durumunu günceller.\n\n"
      + "• Canonical veriyi DEĞİŞTİRMEZ\n"
      + "• Herkese açık siteyi DEPLOY ETMEZ\n\n"
      + "Bu panel, gerçek bir harici uygulama/deploy işleminin yapılıp yapılmadığını DOĞRULAYAMAZ — yalnızca sizin bildiriminizi kaydeder.\n\n"
      + "Canonical veriye işlemek için bir geliştiricinin değişiklik paketini dışa aktarıp `scripts/apply-editorial-changes.js --apply` komutunu çalıştırması, ardından normal inceleme/commit/deploy sürecini tamamlaması gerekir.\n\n"
      + "Bu adımlar zaten tamamlandıysa devam edin.",
    rejected: "Bu değişikliği reddetmek istediğinizden emin misiniz?",
  });

  // Per-status wording for the draft-state block (Section 15-16 + the P0
  // correctness pass on "applied"). Every field here is phrased so that
  // "applied" can never be read as "the panel confirms this is live" — it
  // only ever means "a human reported running the external apply step";
  // CANONICAL/PUBLIC explicitly say verification is required, not "Yok"/
  // "untouched" as a claimed fact this panel has no way to check.
  const DRAFT_STATE_WORDING = Object.freeze({
    draft: { verification: "—", canonical: "Uygulanmadı", publicImpact: "Yok" },
    readyForReview: { verification: "—", canonical: "Uygulanmadı", publicImpact: "Yok" },
    rejected: { verification: "—", canonical: "Uygulanmadı", publicImpact: "Yok" },
    approved: { verification: "—", canonical: "Uygulanmadı", publicImpact: "Beklemede — dışa aktarım ve uygulama bekleniyor" },
    applied: {
      statusNote: "Harici uygulama bildirildi",
      verification: "Panel tarafından doğrulanmadı",
      canonical: "Harici doğrulama gerekli / bilinmiyor",
      publicImpact: "Harici doğrulama gerekli / bilinmiyor",
    },
  });

  const draftEntityCache = new Map(); // entityId -> full entity, for on-demand diffs
  const openDiffs = new Set(); // changeId set — remembers which cards have "Fark Göster" expanded across a reload

  async function loadDrafts() {
    const container = document.getElementById("admin-drafts-list");
    if (!container) return;
    container.innerHTML = `<p class="admin-muted">Yükleniyor…</p>`;
    try {
      const statusFilter = document.getElementById("admin-drafts-status-filter")?.value || "";
      const params = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const { data } = await Session.request(`/drafts${params}`);
      if (!data.length) { container.innerHTML = `<p class="admin-muted">Değişiklik bulunamadı.</p>`; return; }
      container.innerHTML = data.map(draftCardHtml).join("");
      container.querySelectorAll("[data-draft-action]").forEach((btn) => {
        btn.addEventListener("click", () => transitionDraft(btn.dataset.changeId, btn.dataset.draftAction));
      });
      container.querySelectorAll("[data-delete-draft]").forEach((btn) => {
        btn.addEventListener("click", () => deleteDraft(btn.dataset.changeId));
      });
      container.querySelectorAll("[data-toggle-diff]").forEach((btn) => {
        btn.addEventListener("click", () => toggleDiff(btn.dataset.toggleDiff, data.find((d) => d.changeId === btn.dataset.toggleDiff)));
      });
      container.querySelectorAll("[data-toggle-history]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const el = document.getElementById(`draft-history-${btn.dataset.toggleHistory}`);
          if (el) el.hidden = !el.hidden;
        });
      });
      for (const draft of data) {
        if (openDiffs.has(draft.changeId)) await renderDiff(draft);
      }
    } catch (error) {
      container.innerHTML = `<p class="admin-error">${escapeHtml(reportError(error, "loadDrafts"))}</p>`;
    }
  }

  /**
   * Section 15-16, plus the P0 correctness pass on "applied": makes explicit,
   * on every card, what the status badge alone doesn't say — and for
   * "applied" specifically, never claims canonical/public state as a known
   * fact this panel could not possibly verify.
   */
  function draftStateBlockHtml(draft) {
    const wording = DRAFT_STATE_WORDING[draft.status] || DRAFT_STATE_WORDING.draft;
    const statusNote = wording.statusNote ? ` — ${escapeHtml(wording.statusNote)}` : "";
    return `<dl class="admin-draft-state">
      <div><dt>DURUM</dt><dd>${statusBadge(draft.status, DRAFT_STATUS_LABELS)}${statusNote}</dd></div>
      <div><dt>DOĞRULAMA</dt><dd>${escapeHtml(wording.verification)}</dd></div>
      <div><dt>CANONICAL</dt><dd>${escapeHtml(wording.canonical)}</dd></div>
      <div><dt>GENEL ETKİ (PUBLIC)</dt><dd>${escapeHtml(wording.publicImpact)}</dd></div>
    </dl>`;
  }

  function historyHtml(draft) {
    const entries = Array.isArray(draft.history) ? draft.history : [];
    if (!entries.length) return "";
    const rows = entries.map((h) => (
      `<li><code>${escapeHtml((h.at || "").slice(0, 16).replace("T", " "))}</code> — ${escapeHtml(h.action)}${h.note ? ` (${escapeHtml(h.note)})` : ""}</li>`
    )).join("");
    return `
      <button type="button" class="btn-admin btn-admin-secondary" data-toggle-history="${escapeHtml(draft.changeId)}">Geçmiş (${entries.length})</button>
      <ul id="draft-history-${escapeHtml(draft.changeId)}" class="admin-draft-history" hidden>${rows}</ul>`;
  }

  function draftCardHtml(draft) {
    const actions = (DRAFT_NEXT_ACTIONS[draft.status] || []).map(([next, label]) => (
      `<button type="button" class="btn-admin ${DESTRUCTIVE_TRANSITIONS.has(next) ? "btn-admin-danger" : "btn-admin-secondary"}" data-draft-action="${next}" data-change-id="${escapeHtml(draft.changeId)}">${label}</button>`
    )).join("");
    const target = draft.kind === "create" ? (draft.proposedChanges?.id || "(yeni kayıt)") : draft.entityId;
    const diffBtn = draft.kind === "edit"
      ? `<button type="button" class="btn-admin btn-admin-secondary" data-toggle-diff="${escapeHtml(draft.changeId)}">${openDiffs.has(draft.changeId) ? "Farkı Gizle" : "Farkı Göster (Before/After)"}</button>`
      : "";
    return `<article class="admin-draft-card">
      <header>
        <span class="admin-draft-kind">${draft.kind === "create" ? "Yeni Kayıt" : "Değişiklik"}</span>
        ${statusBadge(draft.status, DRAFT_STATUS_LABELS)}
      </header>
      <p><strong>${escapeHtml(ENTITY_TYPE_LABELS[draft.entityType] || draft.entityType)}</strong> — <code>${escapeHtml(target)}</code></p>
      <p class="admin-muted">Son güncelleme: ${escapeHtml((draft.updatedAt || "").slice(0, 16).replace("T", " "))}</p>
      ${draftStateBlockHtml(draft)}
      <div id="draft-diff-${escapeHtml(draft.changeId)}" class="admin-draft-diff" ${openDiffs.has(draft.changeId) ? "" : "hidden"}></div>
      <div class="admin-row-actions">
        ${actions}
        ${diffBtn}
        <button type="button" class="btn-admin btn-admin-danger" data-delete-draft data-change-id="${escapeHtml(draft.changeId)}">Sil</button>
      </div>
      ${historyHtml(draft)}
    </article>`;
  }

  /** Diffs the entity's live values against proposedChanges — only fields the proposal actually touches (Section 16: "değişmeyen alanları gizle"). */
  function buildDiffRows(baseEntity, proposedChanges) {
    return Object.keys(proposedChanges || {}).map((key) => {
      const before = baseEntity ? baseEntity[key] : undefined;
      const after = proposedChanges[key];
      const format = (value) => (value === undefined ? "(boş)" : typeof value === "object" ? JSON.stringify(value) : String(value));
      return { field: key, before: format(before), after: format(after) };
    }).filter((row) => row.before !== row.after);
  }

  async function toggleDiff(changeId, draft) {
    if (openDiffs.has(changeId)) {
      openDiffs.delete(changeId);
    } else {
      openDiffs.add(changeId);
      if (draft) await renderDiff(draft);
    }
    loadDrafts();
  }

  async function renderDiff(draft) {
    const container = document.getElementById(`draft-diff-${draft.changeId}`);
    if (!container) return;
    container.hidden = false;
    container.innerHTML = `<p class="admin-muted">Fark yükleniyor…</p>`;
    try {
      let baseEntity = draftEntityCache.get(draft.entityId);
      if (!baseEntity && draft.entityId) {
        const { data } = await Session.request(`/entities/${encodeURIComponent(draft.entityId)}`);
        baseEntity = data;
        draftEntityCache.set(draft.entityId, data);
      }
      const rows = buildDiffRows(baseEntity, draft.proposedChanges);
      if (!rows.length) { container.innerHTML = `<p class="admin-muted">Değişen alan yok.</p>`; return; }
      container.innerHTML = `<table class="admin-table admin-diff-table"><thead><tr><th>Alan</th><th>Önce</th><th>Sonra</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td><code>${escapeHtml(r.field)}</code></td><td class="admin-diff-before">${escapeHtml(r.before)}</td><td class="admin-diff-after">${escapeHtml(r.after)}</td></tr>`).join("")}
      </tbody></table>`;
    } catch (error) {
      container.innerHTML = `<p class="admin-error">${escapeHtml(reportError(error, "renderDiff"))}</p>`;
    }
  }

  async function transitionDraft(changeId, status) {
    const confirmText = CONFIRM_TRANSITIONS[status];
    if (confirmText && !confirm(confirmText)) return;
    try {
      await Session.request(`/drafts/${encodeURIComponent(changeId)}`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast("Durum güncellendi.");
      loadDrafts();
      refreshDashboard();
    } catch (error) {
      toast(reportError(error, "transitionDraft"), "error");
    }
  }

  async function deleteDraft(changeId) {
    if (!confirm("Bu taslağı kalıcı olarak silmek istediğinizden emin misiniz?")) return;
    try {
      await Session.request(`/drafts/${encodeURIComponent(changeId)}`, { method: "DELETE" });
      toast("Taslak silindi.");
      loadDrafts();
    } catch (error) {
      toast(reportError(error, "deleteDraft"), "error");
    }
  }

  function initDraftsView() {
    document.getElementById("admin-drafts-status-filter")?.addEventListener("change", loadDrafts);
    document.getElementById("admin-export-changes-btn")?.addEventListener("click", async () => {
      try {
        const csrfMatch = document.cookie.match(/(?:^|; )aa_admin_csrf=([^;]*)/);
        const response = await fetch("/api/admin/editorial/drafts/export?status=approved", {
          credentials: "same-origin",
          headers: csrfMatch ? { "X-CSRF-Token": decodeURIComponent(csrfMatch[1]) } : {},
        });
        if (!response.ok) throw new Error(`Dışa aktarma başarısız (${response.status}).`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `editorial-change-package-${Date.now()}.json`;
        link.hidden = true;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        toast("Değişiklik paketi indirildi.");
      } catch (error) {
        toast(reportError(error, "exportChanges"), "error");
      }
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Media — dedicated card view with rights-safety badges (Sections 11-12,  */
  /* 28). Read-through of the same /entities?type=media the generic records  */
  /* table would use, but rendered for what a media reviewer actually needs. */
  /* ---------------------------------------------------------------------- */

  const RIGHTS_STATUS_LABELS = Object.freeze({
    unknown: "Bilinmiyor", pendingReview: "İncelemede", cleared: "Temiz (Yayına Hazır)",
    restricted: "Kısıtlı", doNotPublish: "Yayınlanmasın",
  });
  const RIGHTS_NOT_CLEARED = new Set(["unknown", "pendingReview", "restricted", "doNotPublish"]);
  const MEDIA_TYPE_LABELS = Object.freeze({ image: "Görsel", audio: "Ses", video: "Video", document: "Belge" });
  const MEDIA_ROLE_LABELS = Object.freeze({ realArchiveMedia: "Gerçek Arşiv Medyası", aiGeneratedIllustration: "Yapay Zekâ Görseli" });

  let mediaFilter = { mediaType: "", rightsStatus: "" };

  function mediaCardHtml(entity) {
    const rightsNotCleared = RIGHTS_NOT_CLEARED.has(entity.rightsStatus);
    const rightsClass = entity.rightsStatus === "cleared" ? "admin-badge-published"
      : entity.rightsStatus === "doNotPublish" || entity.rightsStatus === "restricted" ? "admin-badge-rejected"
      : "admin-badge-inReview";
    return `<article class="admin-draft-card">
      <header>
        <span class="admin-draft-kind">${escapeHtml(MEDIA_TYPE_LABELS[entity.mediaType] || entity.mediaType || "—")}</span>
        ${originBadgeHtml(entity)}
      </header>
      <p><code>${escapeHtml(entity.id)}</code>${entity.title ? ` — ${escapeHtml(localized(entity.title, ""))}` : ""}</p>
      <p>${escapeHtml(MEDIA_ROLE_LABELS[entity.mediaRole] || entity.mediaRole || "—")}</p>
      <p><span class="admin-badge ${rightsClass}">${escapeHtml(RIGHTS_STATUS_LABELS[entity.rightsStatus] || "Bilinmiyor")}</span>
        ${rightsNotCleared ? `<span class="admin-muted"> — yayına hazır değil</span>` : ""}</p>
      <p class="admin-muted">${escapeHtml(entity.source || "kaynak yok")}${entity.author ? ` · ${escapeHtml(entity.author)}` : ""}${entity.license ? ` · ${escapeHtml(entity.license)}` : ""}</p>
      <p class="admin-muted">${escapeHtml(entity.originalStoragePath || "(depolama yolu yok)")}${entity.size ? ` · ${Math.round(entity.size / 1024)} KB` : ""}</p>
      <div class="admin-row-actions">
        <button type="button" class="btn-admin btn-admin-secondary admin-row-action" data-action="view" data-id="${escapeHtml(entity.id)}">Görüntüle</button>
        <button type="button" class="btn-admin btn-admin-secondary admin-row-action" data-action="propose-edit" data-id="${escapeHtml(entity.id)}" data-type="media">Metadata Düzenle</button>
      </div>
    </article>`;
  }

  async function loadMedia(filter = {}) {
    mediaFilter = { ...mediaFilter, ...filter };
    const container = document.getElementById("admin-media-list");
    if (!container) return;
    container.innerHTML = `<p class="admin-muted">Yükleniyor…</p>`;
    try {
      const { data: fetched } = await Session.request("/entities?type=media");
      const data = fetched.filter((entity) => (
        (!mediaFilter.mediaType || entity.mediaType === mediaFilter.mediaType)
        && (!mediaFilter.rightsStatus || entity.rightsStatus === mediaFilter.rightsStatus)
      ));
      if (!data.length) { container.innerHTML = `<p class="admin-muted">Medya kaydı bulunamadı.</p>`; return; }
      container.innerHTML = `<div class="admin-drafts-list">${data.map(mediaCardHtml).join("")}</div>`;
      container.querySelectorAll("[data-action='view']").forEach((btn) => btn.addEventListener("click", () => viewEntity(btn.dataset.id)));
      container.querySelectorAll("[data-action='propose-edit']").forEach((btn) => btn.addEventListener("click", () => openEditorForExisting(btn.dataset.id, btn.dataset.type)));
    } catch (error) {
      container.innerHTML = `<p class="admin-error">${escapeHtml(reportError(error, "loadMedia"))}</p>`;
    }
  }

  function initMediaFilters() {
    document.getElementById("admin-media-type-filter")?.addEventListener("change", (e) => loadMedia({ mediaType: e.target.value }));
    document.getElementById("admin-media-rights-filter")?.addEventListener("change", (e) => loadMedia({ rightsStatus: e.target.value }));
    document.getElementById("admin-media-new-btn")?.addEventListener("click", () => {
      // Real file upload (Section 8) only exists in direct/SQLite mode — an
      // editorial-mode deployment keeps its existing, unrelated "propose a
      // media entity draft" behavior (no file, metadata only), unchanged.
      if (isDirectContentAuthority()) openMediaUploadModal(); else openEditorForNew("media");
    });
    document.getElementById("admin-sources-new-btn")?.addEventListener("click", () => openEditorForNew("source"));
  }

  /* ---------------------------------------------------------------------- */
  /* Media upload (Section 8-10) — direct/SQLite mode only.                  */
  /* ---------------------------------------------------------------------- */

  const UPLOAD_ACCEPT = ".jpg,.jpeg,.png,.webp,.mp3,.wav,.m4a,.ogg,.pdf";
  let mediaUploadTriggerEl = null;

  function renderMediaUploadForm() {
    const body = document.getElementById("admin-media-upload-form-body");
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label" for="field-upload-file">Dosya (jpg, jpeg, png, webp, mp3, wav, m4a, ogg, pdf)</label>
        <input class="form-input" type="file" id="field-upload-file" accept="${UPLOAD_ACCEPT}" required>
      </div>
      <div class="form-row-two">
        <div class="form-group"><label class="form-label" for="field-upload-role">Köken / Role</label>
          <select class="form-select" id="field-upload-role">${selectOptionsHtml(MEDIA_ROLES_LIST, MEDIA_ROLE_LABELS, "realArchiveMedia")}</select></div>
        <div class="form-group"><label class="form-label" for="field-upload-rights-status">Haklar Durumu / Rights Status</label>
          <select class="form-select" id="field-upload-rights-status">${selectOptionsHtml(RIGHTS_STATUS_LIST, RIGHTS_STATUS_LABELS, "unknown")}</select></div>
        <div class="form-group"><label class="form-label" for="field-upload-source">Kaynak / Source</label><input class="form-input" id="field-upload-source"></div>
        <div class="form-group"><label class="form-label" for="field-upload-author">Yazar / Author</label><input class="form-input" id="field-upload-author"></div>
        <div class="form-group"><label class="form-label" for="field-upload-license">Lisans / License</label><input class="form-input" id="field-upload-license"></div>
      </div>
      <div class="form-group"><label class="form-label" for="field-upload-rights-note">Haklar Notu / Rights Note</label><textarea class="form-textarea" id="field-upload-rights-note"></textarea></div>
      <label class="checkbox-row" for="field-upload-ai-generated">
        <input type="checkbox" id="field-upload-ai-generated">
        <span>Yapay zekâ ile oluşturulmuş / AI-generated</span>
      </label>
      <p class="admin-storage-banner admin-storage-banner-ephemeral">Yalnızca <strong>"Temiz (Yayına Hazır)"</strong> olarak işaretlenen medya herkese açık sitede görünür/çalınabilir olur. Diğer tüm durumlar (Bilinmiyor, İncelemede, Kısıtlı, Yayınlanmasın) dosyayı otomatik olarak herkese kapalı tutar.</p>
    `;
  }

  function openMediaUploadModal(triggerEl = document.activeElement) {
    mediaUploadTriggerEl = triggerEl;
    renderMediaUploadForm();
    const modal = document.getElementById("admin-media-upload-modal");
    modal.classList.add("open");
    modal.querySelector("input")?.focus();
  }

  function closeMediaUploadModal() {
    document.getElementById("admin-media-upload-modal").classList.remove("open");
    document.getElementById("admin-media-upload-form").reset();
    mediaUploadTriggerEl?.focus();
    mediaUploadTriggerEl = null;
  }

  /**
   * Multipart upload — deliberately NOT routed through
   * Session.requestContent (which always sets Content-Type: application/
   * json and JSON.stringifies the body). This mirrors that helper's own
   * CSRF-cookie-attachment logic by hand for the one request in this file
   * that must send FormData instead.
   */
  async function submitMediaUpload(event) {
    event.preventDefault();
    const fileInput = document.getElementById("field-upload-file");
    const file = fileInput.files?.[0];
    if (!file) { toast("Bir dosya seçin.", "error"); return; }

    const fields = {
      mediaRole: val("field-upload-role"),
      rightsStatus: val("field-upload-rights-status"),
      source: val("field-upload-source") || undefined,
      author: val("field-upload-author") || undefined,
      license: val("field-upload-license") || undefined,
      rightsNote: val("field-upload-rights-note") || undefined,
      aiGenerated: document.getElementById("field-upload-ai-generated").checked,
    };

    const formData = new FormData();
    formData.append("file", file);
    formData.append("fields", JSON.stringify(fields));

    const submitBtn = document.getElementById("admin-media-upload-submit");
    submitBtn.disabled = true;
    try {
      const csrfMatch = document.cookie.match(/(?:^|; )aa_admin_csrf=([^;]*)/);
      const response = await fetch("/api/admin/content/media/upload", {
        method: "POST",
        credentials: "same-origin",
        headers: csrfMatch ? { "X-CSRF-Token": decodeURIComponent(csrfMatch[1]) } : {},
        body: formData,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || `Yükleme başarısız (${response.status}).`);
      toast(data.duplicate ? "Bu dosya zaten yüklenmiş — mevcut kayıt kullanıldı." : "Medya yüklendi.");
      closeMediaUploadModal();
      loadMedia();
      refreshDashboard();
    } catch (error) {
      toast(reportError(error, "submitMediaUpload"), "error");
    } finally {
      submitBtn.disabled = false;
    }
  }

  function initMediaUploadModal() {
    document.getElementById("admin-media-upload-form")?.addEventListener("submit", submitMediaUpload);
    document.getElementById("admin-media-upload-close")?.addEventListener("click", closeMediaUploadModal);
    document.getElementById("admin-media-upload-cancel")?.addEventListener("click", closeMediaUploadModal);
    document.getElementById("admin-media-upload-modal")?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMediaUploadModal();
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Sources — dedicated table (Sections 9-10, 27). Quality/editorial        */
  /* classification (Primary/Academic/Institutional/...) is NOT implemented */
  /* here: it is not a field the v2 source schema (backend/v2/schemas/       */
  /* source.js) carries today, and this round does not add canonical schema */
  /* fields on its own judgment — see the round's final report for this as  */
  /* an explicit architecture proposal instead.                             */
  /* ---------------------------------------------------------------------- */

  const SOURCE_TYPE_LABELS = Object.freeze({
    book: "Kitap", article: "Makale", archive: "Arşiv Kaydı", oralHistory: "Sözlü Tarih",
    photograph: "Fotoğraf", institutionalRecord: "Kurumsal Kayıt", website: "Web Sitesi", other: "Diğer",
  });

  async function loadSources() {
    const container = document.getElementById("admin-sources-list");
    if (!container) return;
    container.innerHTML = `<p class="admin-muted">Yükleniyor…</p>`;
    try {
      const { data } = await Session.request("/entities?type=source");
      if (!data.length) { container.innerHTML = `<p class="admin-muted">Kaynak bulunamadı.</p>`; return; }
      container.innerHTML = `
        <p class="admin-muted" style="margin-bottom: var(--sp-3);">Kaynak kalite sınıflandırması bilginin doğruluk garantisi değildir; editoryal sınıflandırmadır. Sistem otomatik atama yapmaz.</p>
        <table class="admin-table"><thead><tr><th>Başlık</th><th>ID</th><th>Tür</th><th>Kalite</th><th>Yazar</th><th>Yıl</th><th>URL</th><th>İşlemler</th></tr></thead><tbody>
        ${data.map((s) => `<tr>
          <td class="cell-title">${escapeHtml(s.title || "(başlıksız)")}</td>
          <td class="cell-id">${escapeHtml(s.id)}${originBadgeHtml(s)}</td>
          <td>${escapeHtml(SOURCE_TYPE_LABELS[s.type] || s.type || "—")}</td>
          <td>${s.qualityClassification ? `<span class="admin-badge admin-badge-draft">${escapeHtml(SOURCE_QUALITY_LABELS[s.qualityClassification] || s.qualityClassification)}</span>` : `<span class="admin-muted">—</span>`}</td>
          <td>${escapeHtml(s.author || "—")}</td>
          <td>${escapeHtml(s.year || "—")}</td>
          <td>${s.url ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">Bağlantı</a>` : "—"}</td>
          <td class="admin-row-actions">
            <button type="button" class="btn-admin btn-admin-secondary admin-row-action" data-action="propose-edit" data-id="${escapeHtml(s.id)}" data-type="source">Düzenle</button>
          </td>
        </tr>`).join("")}
      </tbody></table>`;
      container.querySelectorAll("[data-action='propose-edit']").forEach((btn) => btn.addEventListener("click", () => openEditorForExisting(btn.dataset.id, btn.dataset.type)));
    } catch (error) {
      container.innerHTML = `<p class="admin-error">${escapeHtml(reportError(error, "loadSources"))}</p>`;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Relationships (read-only)                                               */
  /* ---------------------------------------------------------------------- */

  const RELATIONSHIP_TYPES_LIST = Object.freeze([
    "associatedWith", "locatedIn", "hasBelief", "practicedBy", "hasSite", "narratedBy",
    "originatesFrom", "performedBy", "spokenIn", "documents", "depicts", "relatedTo",
  ]);
  let relationshipEntityIndex = []; // [{id, label}] — populated in direct mode for the datalist + preview lookup

  async function loadRelationships() {
    const container = document.getElementById("admin-relationships-list");
    if (!container) return;
    container.innerHTML = `<p class="admin-muted">Yükleniyor…</p>`;

    const form = document.getElementById("admin-relationship-form");
    const sub = document.getElementById("admin-relationships-sub");
    if (form) form.hidden = !isDirectContentAuthority();
    if (sub) sub.textContent = isDirectContentAuthority()
      ? "Kayıtlar arası ilişkiler. Aşağıdaki formla doğrudan ekleyebilir veya kaldırabilirsiniz."
      : "Kayıtlar arası ilişkiler — bu sürümde yalnızca görüntüleme; yeni ilişki önerisi desteklenmiyor.";

    try {
      const { data } = await (isDirectContentAuthority() ? Session.requestContent("/relationships") : Session.request("/relationships"));
      if (isDirectContentAuthority()) await populateRelationshipEntityIndex();

      if (!data.length) { container.innerHTML = `<p class="admin-muted">İlişki kaydı bulunamadı.</p>`; return; }
      const labelFor = (id) => relationshipEntityIndex.find((e) => e.id === id)?.label || id;
      container.innerHTML = `<table class="admin-table"><thead><tr><th>Kaynak</th><th>Tür</th><th>Hedef</th><th>Durum</th>${isDirectContentAuthority() ? "<th></th>" : ""}</tr></thead><tbody>
        ${data.map((r) => `<tr>
          <td>${escapeHtml(labelFor(r.sourceId))}</td><td>${escapeHtml(r.type)}</td><td>${escapeHtml(labelFor(r.targetId))}</td><td>${statusBadge(r.status)}</td>
          ${isDirectContentAuthority() ? `<td><button type="button" class="btn-admin btn-admin-danger" data-remove-relationship="${escapeHtml(r.id)}">Kaldır</button></td>` : ""}
        </tr>`).join("")}
      </tbody></table>`;
      container.querySelectorAll("[data-remove-relationship]").forEach((btn) => btn.addEventListener("click", () => removeRelationshipDirect(btn.dataset.removeRelationship)));
    } catch (error) {
      container.innerHTML = `<p class="admin-error">${escapeHtml(reportError(error, "loadRelationships"))}</p>`;
    }
  }

  async function populateRelationshipEntityIndex() {
    try {
      const { data } = await Session.requestContent("/entities");
      relationshipEntityIndex = data.map((e) => ({ id: e.id, label: `${localized(e.title, e.id)} (${e.id})` }));
      const datalist = document.getElementById("admin-rel-entity-options");
      if (datalist) datalist.innerHTML = relationshipEntityIndex.map((e) => `<option value="${escapeHtml(e.label)}">`).join("");
    } catch (error) {
      reportError(error, "populateRelationshipEntityIndex");
    }
  }

  /** The datalist shows "Title (id)" — accept either that exact label or a bare id typed directly. */
  function resolveRelationshipEntityId(inputValue) {
    const value = inputValue.trim();
    const match = relationshipEntityIndex.find((e) => e.label === value);
    if (match) return match.id;
    const idMatch = value.match(/\(([^()]+)\)\s*$/);
    if (idMatch && relationshipEntityIndex.some((e) => e.id === idMatch[1])) return idMatch[1];
    return relationshipEntityIndex.some((e) => e.id === value) ? value : value;
  }

  async function removeRelationshipDirect(id) {
    if (!confirm("Bu ilişkiyi kaldırmak istediğinizden emin misiniz? Kayıtların kendisi etkilenmez.")) return;
    try {
      await Session.requestContent(`/relationships/${encodeURIComponent(id)}`, { method: "DELETE" });
      toast("İlişki kaldırıldı.");
      loadRelationships();
    } catch (error) {
      toast(reportError(error, "removeRelationshipDirect"), "error");
    }
  }

  function initRelationshipForm() {
    const form = document.getElementById("admin-relationship-form");
    const typeSelect = document.getElementById("admin-rel-type");
    if (typeSelect) typeSelect.innerHTML = RELATIONSHIP_TYPES_LIST.map((t) => `<option value="${t}">${t}</option>`).join("");

    const preview = document.getElementById("admin-rel-preview");
    async function updatePreview() {
      const sourceId = resolveRelationshipEntityId(document.getElementById("admin-rel-source").value);
      const targetId = resolveRelationshipEntityId(document.getElementById("admin-rel-target").value);
      const type = typeSelect.value;
      if (!sourceId || !targetId || !type) { preview.hidden = true; return; }
      try {
        const { data } = await Session.requestContent(`/relationships/preview?type=${encodeURIComponent(type)}&sourceId=${encodeURIComponent(sourceId)}&targetId=${encodeURIComponent(targetId)}`);
        preview.hidden = false;
        preview.textContent = `Önizleme: ${data.summary}`;
      } catch {
        preview.hidden = true;
      }
    }
    form?.querySelectorAll("input, select").forEach((el) => el.addEventListener("change", updatePreview));

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const sourceId = resolveRelationshipEntityId(document.getElementById("admin-rel-source").value);
      const targetId = resolveRelationshipEntityId(document.getElementById("admin-rel-target").value);
      const type = typeSelect.value;
      try {
        await Session.requestContent("/relationships", { method: "POST", body: JSON.stringify({ type, sourceId, targetId }) });
        toast("İlişki eklendi.");
        form.reset();
        preview.hidden = true;
        loadRelationships();
      } catch (error) {
        toast(reportError(error, "createRelationship"), "error");
      }
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Pages (CMS) — Section 15-19. Only reachable in direct-authority mode.   */
  /* ---------------------------------------------------------------------- */

  let pageEditorState = { mode: "create", basePage: null };
  let pageEditorDirty = false;
  let pageEditorTriggerEl = null;

  const PAGE_STATUS_NEXT_ACTIONS = Object.freeze({
    draft: [["inReview", "İncelemeye Gönder"], ["published", "Yayınla"]],
    inReview: [["published", "Yayınla"], ["draft", "Taslağa Geri Al"]],
    published: [["archived", "Yayından Kaldır / Arşivle"]],
    archived: [], // handled via the dedicated restore buttons below
  });

  function pageCardHtml(page) {
    const actions = (PAGE_STATUS_NEXT_ACTIONS[page.status] || []).map(([next, label]) => (
      `<button type="button" class="btn-admin btn-admin-secondary" data-page-transition="${next}" data-page-id="${escapeHtml(page.id)}">${label}</button>`
    )).join("");
    const restoreActions = page.status === "archived"
      ? `<button type="button" class="btn-admin btn-admin-secondary" data-page-restore="draft" data-page-id="${escapeHtml(page.id)}">Taslağa Geri Yükle</button>
         <button type="button" class="btn-admin btn-admin-primary" data-page-restore="published" data-page-id="${escapeHtml(page.id)}">Yayına Geri Yükle</button>`
      : "";
    const publicLink = page.status === "published" ? `<a href="/sayfa/${encodeURIComponent(page.slug)}/" target="_blank" rel="noopener noreferrer">Canlı Görüntüle ↗</a>` : "";
    return `<article class="admin-draft-card">
      <header><span class="admin-draft-kind">Sayfa</span>${statusBadge(page.status)}</header>
      <p><strong>${escapeHtml(localized(page.title, page.slug))}</strong> — <code>/sayfa/${escapeHtml(page.slug)}/</code></p>
      <p class="admin-muted">${escapeHtml((page.updatedAt || "").slice(0, 16).replace("T", " "))} ${publicLink}</p>
      <div class="admin-row-actions">
        <button type="button" class="btn-admin btn-admin-secondary" data-page-edit="${escapeHtml(page.id)}">Düzenle</button>
        ${actions}
        ${restoreActions}
        <button type="button" class="btn-admin btn-admin-danger" data-page-delete="${escapeHtml(page.id)}">Kalıcı Sil</button>
      </div>
    </article>`;
  }

  async function loadPages() {
    const container = document.getElementById("admin-pages-list");
    if (!container) return;
    container.innerHTML = `<p class="admin-muted">Yükleniyor…</p>`;
    try {
      const { data } = await Session.requestContent("/pages");
      if (!data.length) { container.innerHTML = `<p class="admin-muted">Henüz sayfa yok.</p>`; return; }
      container.innerHTML = `<div class="admin-drafts-list">${data.map(pageCardHtml).join("")}</div>`;
      container.querySelectorAll("[data-page-edit]").forEach((btn) => btn.addEventListener("click", () => openPageEditor(btn.dataset.pageEdit, btn)));
      container.querySelectorAll("[data-page-transition]").forEach((btn) => btn.addEventListener("click", () => transitionPage(btn.dataset.pageId, btn.dataset.pageTransition)));
      container.querySelectorAll("[data-page-restore]").forEach((btn) => btn.addEventListener("click", () => restorePageDirect(btn.dataset.pageId, btn.dataset.pageRestore)));
      container.querySelectorAll("[data-page-delete]").forEach((btn) => btn.addEventListener("click", () => deletePageDirect(btn.dataset.pageDelete)));
    } catch (error) {
      container.innerHTML = `<p class="admin-error">${escapeHtml(reportError(error, "loadPages"))}</p>`;
    }
  }

  async function transitionPage(id, toStatus) {
    try {
      await Session.requestContent(`/pages/${encodeURIComponent(id)}/transition`, { method: "POST", body: JSON.stringify({ toStatus }) });
      toast(toStatus === "published" ? "Sayfa yayınlandı." : toStatus === "archived" ? "Sayfa arşivlendi." : "Durum güncellendi.");
      loadPages();
    } catch (error) {
      toast(reportError(error, "transitionPage"), "error");
    }
  }

  async function restorePageDirect(id, toStatus) {
    if (!confirm("Sayfa geri yüklenecek. Devam edilsin mi?")) return;
    try {
      await Session.requestContent(`/pages/${encodeURIComponent(id)}/restore`, { method: "POST", body: JSON.stringify({ toStatus }) });
      toast("Sayfa geri yüklendi.");
      loadPages();
    } catch (error) {
      toast(reportError(error, "restorePageDirect"), "error");
    }
  }

  async function deletePageDirect(id) {
    if (!confirm("Bu sayfa KALICI olarak silinecek. Bu işlem geri alınamaz. Devam edilsin mi?")) return;
    try {
      await Session.requestContent(`/pages/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({ confirm: true }) });
      toast("Sayfa kalıcı olarak silindi.");
      loadPages();
    } catch (error) {
      toast(reportError(error, "deletePageDirect"), "error");
    }
  }

  function pageMultilingualField(fieldId, label, values = {}, tag = "input") {
    return multilingualInputHtml(fieldId, label, values, tag);
  }

  /** `/sayfa/<slug>/` is the only public route a CMS page ever renders at (see pages/pageRoutes.js's publicPageHtmlRouter). */
  function publicPageUrl(slug) { return `/sayfa/${encodeURIComponent(slug)}/`; }

  /** Section 2 ("COMMIT ÖNCESİ" round): the page-editor equivalent of wireSlugAutoSuggest() — same Turkish-slugify logic, same "stops the moment the admin edits it by hand" rule, only ever wired for a brand-new (never-published) page. */
  function wirePageSlugAutoSuggest() {
    const slugInput = document.getElementById("field-page-slug");
    const helpEl = document.getElementById("field-page-slug-help");
    const previewEl = document.getElementById("field-page-slug-preview");
    const titleTr = document.querySelector('[data-ml-field="page-title"][data-ml-lang="tr"]');
    if (!slugInput || !titleTr) return;
    let slugTouchedByUser = false;
    slugInput.addEventListener("input", () => {
      slugTouchedByUser = true;
      if (helpEl) helpEl.textContent = "Elle düzenlendi.";
      if (previewEl) previewEl.textContent = slugInput.value.trim() ? `Yayınlandığında adres: ${publicPageUrl(slugInput.value.trim())}` : "";
    });
    titleTr.addEventListener("input", () => {
      if (slugTouchedByUser) return;
      slugInput.value = slugify(titleTr.value);
      if (previewEl) previewEl.textContent = slugInput.value ? `Yayınlandığında adres: ${publicPageUrl(slugInput.value)}` : "";
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Existing-page slug UI ("COMMIT ÖNCESİ" round, Section 2/3) — the exact  */
  /* same lock/unlock/warning/collision-suggestion pattern as the cultural-  */
  /* entity slug widget above, applied to Pages. A slug change on an        */
  /* EXISTING page always goes through the dedicated, confirm-gated         */
  /* POST /pages/:id/slug endpoint (pageService.js's changePageSlug()),     */
  /* never as a side effect of the ordinary "Kaydet" content save.          */
  /* ---------------------------------------------------------------------- */

  function pageSlugWidgetLockedHtml(slugInfo) {
    return `
      <div class="admin-slug-widget admin-slug-widget-locked">
        <span class="admin-slug-lock-icon" aria-hidden="true">🔒</span>
        <div class="admin-slug-locked-body">
          <div><strong>Yayındaki URL:</strong> <code>${escapeHtml(publicPageUrl(slugInfo.currentSlug))}</code></div>
          <small class="form-help">Bu adres yayında olduğu için korunmaktadır.</small>
        </div>
        <button type="button" class="form-help-action" id="admin-page-slug-unlock-btn">Gelişmiş: URL'yi değiştir</button>
      </div>`;
  }

  function pageSlugWidgetEditableHtml(slugInfo) {
    return `
      <div class="admin-slug-widget admin-slug-widget-editable">
        <div class="form-group">
          <label class="form-label" for="admin-page-slug-edit-input">Web adresi (slug)</label>
          <input class="form-input" id="admin-page-slug-edit-input" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value="${escapeHtml(slugInfo.currentSlug)}" required>
          <p class="admin-slug-url-preview" id="admin-page-slug-edit-preview">${escapeHtml(`Yeni adres: ${publicPageUrl(slugInfo.currentSlug)}`)}</p>
          ${slugInfo.everPublished
            ? `<small class="form-help admin-warning-text">⚠ Bu sayfa daha önce yayınlandı. Adresi değiştirmek eski bağlantıları etkileyebilir (eski adres otomatik olarak yeni adrese yönlendirilecektir).</small>`
            : `<small class="form-help">Bu sayfa hiç yayınlanmadığı için serbestçe düzenlenebilir.</small>`}
        </div>
        <div class="admin-slug-widget-actions">
          <button type="button" class="btn-admin btn-admin-primary" id="admin-page-slug-save-btn">Web Adresini Güncelle</button>
          <button type="button" class="btn-admin btn-admin-secondary" id="admin-page-slug-cancel-btn">Vazgeç</button>
        </div>
        <p class="admin-error" id="admin-page-slug-edit-error" hidden></p>
      </div>`;
  }

  function renderPageSlugWidget() {
    const mount = document.getElementById("admin-page-slug-widget-mount");
    if (!mount) return;
    const { slugInfo } = pageEditorState;
    if (!slugInfo) {
      mount.innerHTML = `<p class="admin-error">Web adresi bilgisi alınamadı. Sayfayı yenileyip tekrar deneyin.</p>`;
      return;
    }
    if (slugInfo.everPublished) {
      mount.innerHTML = pageSlugWidgetLockedHtml(slugInfo);
      document.getElementById("admin-page-slug-unlock-btn").addEventListener("click", () => {
        mount.innerHTML = pageSlugWidgetEditableHtml(slugInfo);
        wirePageSlugWidgetEditable();
      });
    } else {
      mount.innerHTML = pageSlugWidgetEditableHtml(slugInfo);
      wirePageSlugWidgetEditable();
    }
  }

  function wirePageSlugWidgetEditable() {
    const input = document.getElementById("admin-page-slug-edit-input");
    const preview = document.getElementById("admin-page-slug-edit-preview");
    input?.addEventListener("input", () => {
      preview.textContent = `Yeni adres: ${publicPageUrl(input.value.trim())}`;
      pageEditorDirty = true;
    });
    document.getElementById("admin-page-slug-cancel-btn")?.addEventListener("click", () => renderPageSlugWidget());
    document.getElementById("admin-page-slug-save-btn")?.addEventListener("click", () => submitPageSlugChange());
  }

  async function submitPageSlugChange() {
    const { basePage, slugInfo } = pageEditorState;
    const input = document.getElementById("admin-page-slug-edit-input");
    const errorEl = document.getElementById("admin-page-slug-edit-error");
    const newSlug = input.value.trim();
    const showError = (message) => { if (errorEl) { errorEl.hidden = false; errorEl.textContent = message; } };
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ""; }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newSlug)) {
      showError("Web adresi yalnızca küçük harf, rakam ve tek tire ile ayrılmış gruplar içerebilir (ör. “yeni-sayfa”).");
      return;
    }
    if (newSlug === slugInfo.currentSlug) {
      showError("Girilen adres, mevcut adresle aynı.");
      return;
    }
    if (slugInfo.everPublished) {
      const oldUrl = publicPageUrl(slugInfo.currentSlug);
      const newUrl = publicPageUrl(newSlug);
      const confirmed = confirm(
        `Bu sayfa daha önce yayınlandı.\n\nMevcut adres: ${oldUrl}\nYeni adres: ${newUrl}\n\n`
        + `Eski adres otomatik olarak yeni adrese yönlendirilecek, ancak zaten paylaşılmış eski bağlantılar farklı görünecektir.\n\n`
        + `Devam etmek istiyor musunuz?`
      );
      if (!confirmed) return;
    }
    try {
      const { data } = await Session.requestContent(`/pages/${encodeURIComponent(basePage.id)}/slug`, {
        method: "POST",
        body: JSON.stringify({ newSlug, confirmed: true }),
      });
      basePage.slug = data.slug;
      pageEditorState.slugInfo = { ...slugInfo, currentSlug: data.slug };
      toast("Web adresi güncellendi.");
      renderPageSlugWidget();
      loadPages();
    } catch (error) {
      if (error.suggestedSlug) {
        showError(`Bu URL zaten kullanılıyor. Önerilen: ${error.suggestedSlug}`);
        input.value = error.suggestedSlug;
        document.getElementById("admin-page-slug-edit-preview").textContent = `Yeni adres: ${publicPageUrl(error.suggestedSlug)}`;
        return;
      }
      if (error.requiresConfirmation) {
        pageEditorState.slugInfo = { ...slugInfo, everPublished: true };
        return submitPageSlugChange();
      }
      showError(reportError(error, "submitPageSlugChange"));
    }
  }

  function renderPageEditor() {
    const { mode, basePage } = pageEditorState;
    const isNew = mode === "create";
    const page = basePage || {};
    document.getElementById("admin-page-editor-heading").textContent = isNew ? "Yeni Sayfa" : `Sayfa Düzenle — ${localized(page.title, page.slug)}`;

    const slugHtml = isNew
      ? `<div class="form-group"><label class="form-label" for="field-page-slug">Web adresi</label><input class="form-input" id="field-page-slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required placeholder="ör. hakkimizda">
          <small class="form-help" id="field-page-slug-help">Başlıktan otomatik oluşturuldu.</small>
          <p class="admin-slug-url-preview" id="field-page-slug-preview"></p>
        </div>`
      : `<div id="admin-page-slug-widget-mount"></div>`;

    const body = document.getElementById("admin-page-editor-form-body");
    body.innerHTML = `
      ${slugHtml}
      ${pageMultilingualField("page-title", "Başlık", page.title || {})}
      ${pageMultilingualField("page-summary", "Özet", page.summary || {}, "textarea")}
      ${pageMultilingualField("page-content", "İçerik (paragraflar boş satırla ayrılır)", page.content || {}, "textarea")}
      <details class="editor-section">
        <summary>SEO</summary>
        <div class="editor-section-body">
          ${pageMultilingualField("page-seo-title", "SEO Başlık", page.seoTitle || {})}
          ${pageMultilingualField("page-seo-description", "SEO Açıklama", page.seoDescription || {}, "textarea")}
        </div>
      </details>
      <details class="editor-section">
        <summary>Menü Ayarları</summary>
        <div class="editor-section-body">
          <label class="checkbox-row" for="field-page-show-nav">
            <input type="checkbox" id="field-page-show-nav" ${page.showInNavigation ? "checked" : ""}>
            <span>Menüde göster</span>
          </label>
          ${pageMultilingualField("page-nav-label", "Menü Etiketi", page.navigationLabel || {})}
          <div class="form-row-two">
            <div class="form-group"><label class="form-label" for="field-page-nav-group">Menü Grubu</label><input class="form-input" id="field-page-nav-group" value="${escapeHtml(page.navigationGroup || "")}"></div>
            <div class="form-group"><label class="form-label" for="field-page-nav-order">Menü Sırası</label><input class="form-input" type="number" id="field-page-nav-order" value="${page.navigationOrder ?? ""}"></div>
          </div>
        </div>
      </details>
      <details class="editor-section">
        <summary>Medya</summary>
        <div class="editor-section-body">
          ${mediaLinkListEditorHtml("page-mediaIds", "Bağlı Medya (ör. kapak görseli)", page.mediaIds)}
        </div>
      </details>
    `;

    body.querySelectorAll('[data-media-link-list]').forEach(() => wireMediaLinkListEditor(body));
    if (isNew) wirePageSlugAutoSuggest(); else renderPageSlugWidget();

    pageEditorDirty = false;
    body.addEventListener("input", () => { pageEditorDirty = true; });
    body.addEventListener("change", () => { pageEditorDirty = true; });

    const modal = document.getElementById("admin-page-editor-modal");
    modal.classList.add("open");
    modal.querySelector("input, textarea, select")?.focus();
  }

  async function openPageEditor(id, triggerEl = document.activeElement) {
    pageEditorTriggerEl = triggerEl;
    if (!id) {
      pageEditorState = { mode: "create", basePage: null };
      renderPageEditor();
      return;
    }
    try {
      const { data } = await Session.requestContent(`/pages/${encodeURIComponent(id)}`);
      pageEditorState = { mode: "edit", basePage: data, slugInfo: null };
      // Section 2/3: fetched up front, same as the entity editor, so the
      // initial render already knows whether this page has ever been
      // published (locked) or not (freely editable) with no layout jump.
      try {
        const slugInfoRes = await Session.requestContent(`/pages/${encodeURIComponent(id)}/slug-info`);
        pageEditorState.slugInfo = slugInfoRes.data;
      } catch (error) {
        reportError(error, "openPageEditor:slug-info"); // non-fatal — the widget falls back to a visible error state
      }
      renderPageEditor();
    } catch (error) {
      toast(reportError(error, "openPageEditor"), "error");
    }
  }

  function closePageEditor({ force = false } = {}) {
    if (!force && pageEditorDirty && !confirm("Kaydedilmemiş değişiklikler var. Yine de kapatmak istiyor musunuz?")) return;
    document.getElementById("admin-page-editor-modal").classList.remove("open");
    pageEditorDirty = false;
    pageEditorTriggerEl?.focus();
    pageEditorTriggerEl = null;
  }

  function collectPageFields() {
    const out = {
      title: collectMultilingual("page-title"),
      summary: collectMultilingual("page-summary"),
      content: collectMultilingual("page-content"),
      seoTitle: collectMultilingual("page-seo-title"),
      seoDescription: collectMultilingual("page-seo-description"),
      navigationLabel: collectMultilingual("page-nav-label"),
      showInNavigation: document.getElementById("field-page-show-nav").checked,
      navigationGroup: val("field-page-nav-group") || undefined,
    };
    const order = val("field-page-nav-order");
    if (order !== "") out.navigationOrder = Number(order);
    const mediaIds = collectMediaLinkIds("page-mediaIds"); if (mediaIds) out.mediaIds = mediaIds;
    return out;
  }

  async function submitPageEditor(event) {
    event.preventDefault();
    const { mode, basePage } = pageEditorState;
    const fields = collectPageFields();
    try {
      if (mode === "create") {
        fields.slug = val("field-page-slug");
        await Session.requestContent("/pages", { method: "POST", body: JSON.stringify(fields) });
        toast("Sayfa oluşturuldu (Taslak).");
      } else {
        await Session.requestContent(`/pages/${encodeURIComponent(basePage.id)}`, { method: "PATCH", body: JSON.stringify({ fields }) });
        toast("Sayfa güncellendi.");
      }
      pageEditorDirty = false;
      closePageEditor({ force: true });
      loadPages();
    } catch (error) {
      toast(reportError(error, "submitPageEditor"), "error");
    }
  }

  function initPageEditor() {
    document.getElementById("admin-page-editor-form")?.addEventListener("submit", submitPageEditor);
    document.getElementById("admin-page-editor-close")?.addEventListener("click", () => closePageEditor());
    document.getElementById("admin-page-editor-cancel")?.addEventListener("click", () => closePageEditor());
    document.getElementById("admin-page-editor-modal")?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePageEditor();
    });
    document.getElementById("admin-pages-new-btn")?.addEventListener("click", () => openPageEditor(null));
  }

  /* ---------------------------------------------------------------------- */
  /* SQLite runtime backups (Section 29-31) — direct-authority mode only.    */
  /* ---------------------------------------------------------------------- */

  async function loadSqliteBackups() {
    const panel = document.getElementById("admin-sqlite-backup-panel");
    const list = document.getElementById("admin-sqlite-backups-list");
    if (!panel || !list) return;
    panel.hidden = !isDirectContentAuthority();
    if (!isDirectContentAuthority()) return;

    list.innerHTML = `<p class="admin-muted">Yükleniyor…</p>`;
    try {
      const { data } = await Session.requestContent("/backups");
      if (!data.length) { list.innerHTML = `<p class="admin-muted">Henüz yedek yok.</p>`; return; }
      list.innerHTML = `<table class="admin-table"><thead><tr><th>Tarih</th><th>Neden</th><th>Medya Dosyası</th><th></th></tr></thead><tbody>
        ${data.map((b) => `<tr>
          <td>${escapeHtml((b.createdAt || "").slice(0, 16).replace("T", " "))}</td>
          <td>${escapeHtml(b.reason)}</td>
          <td>${b.mediaFileCount}</td>
          <td><button type="button" class="btn-admin btn-admin-danger" data-restore-backup="${escapeHtml(b.id)}">Geri Yükle</button></td>
        </tr>`).join("")}
      </tbody></table>`;
      list.querySelectorAll("[data-restore-backup]").forEach((btn) => btn.addEventListener("click", () => restoreSqliteBackup(btn.dataset.restoreBackup)));
    } catch (error) {
      list.innerHTML = `<p class="admin-error">${escapeHtml(reportError(error, "loadSqliteBackups"))}</p>`;
    }
  }

  async function restoreSqliteBackup(id) {
    if (!confirm(`Bu yedeğe (${id}) geri dönülecek. Bu andan sonraki tüm değişiklikler kaybolur (geri yükleme öncesi durum otomatik olarak ayrıca yedeklenir). Devam edilsin mi?`)) return;
    try {
      const { data } = await Session.requestContent(`/backups/${encodeURIComponent(id)}/restore`, { method: "POST", body: JSON.stringify({ confirm: true }) });
      toast(`Geri yükleme tamamlandı. Güvenlik yedeği: ${data.preRestoreSafetyBackup}`);
      loadSqliteBackups();
      refreshDashboard();
    } catch (error) {
      toast(reportError(error, "restoreSqliteBackup"), "error");
    }
  }

  function initSqliteBackupPanel() {
    document.getElementById("admin-sqlite-backup-create")?.addEventListener("click", async () => {
      try {
        await Session.requestContent("/backups", { method: "POST", body: JSON.stringify({ reason: "manual" }) });
        toast("Yedek oluşturuldu.");
        loadSqliteBackups();
      } catch (error) {
        toast(reportError(error, "createSqliteBackup"), "error");
      }
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Init                                                                     */
  /* ---------------------------------------------------------------------- */

  document.addEventListener("DOMContentLoaded", async () => {
    if (!document.getElementById("admin-panel-shell")) return; // not the admin page
    initLoginGate();
    initSidebarNav();
    initRecordsFilters();
    initMediaFilters();
    initEditorModal();
    initDraftsView();
    initRelationshipForm();
    initPageEditor();
    initSqliteBackupPanel();
    initMediaUploadModal();

    // Manual QA finding: an unhandled checkSession() rejection (backend
    // unreachable at page load) previously aborted this handler silently —
    // the login form stayed visible with no indication anything was wrong.
    // Now surfaces the same clear Turkish message login() itself uses.
    try {
      const sessionInfo = await Session.checkSession();
      renderEnvironmentBadge(sessionInfo);
      if (sessionInfo.authenticated) await showPanel(); else showLoginGate();
    } catch (error) {
      // The metadata request failed outright (network/backend unreachable)
      // — render the fail-safe "unknown" badge rather than leaving it
      // blank, exactly like a response that came back without the field
      // does (see renderEnvironmentBadge()'s own fallback).
      renderEnvironmentBadge({});
      showLoginGate(error.message || "Yönetim servisine ulaşılamadı.");
    }
  });

  root.AntiochiaAdminPanel = Object.freeze({
    toast, escapeHtml, isLegacyEntity, translateAdminError, buildDiffRows,
  });
})(typeof window !== "undefined" ? window : globalThis);
