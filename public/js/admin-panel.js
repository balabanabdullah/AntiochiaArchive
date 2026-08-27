/**
 * v2 Admin/Editorial panel — the new draft/review/export workflow described
 * in the round's brief. Talks exclusively to /api/admin/editorial/* via
 * admin-session.js (session-cookie + CSRF, never a token in this file).
 *
 * This module never assumes it can publish anything: every write here is a
 * "create draft" or "propose edit" or a draft-status transition. The only
 * path from a draft to the live public site is human-mediated — export the
 * approved package, then a developer runs
 * scripts/apply-editorial-changes.js against the real repository and goes
 * through the normal review/commit/deploy process. See that script's header
 * for the full reasoning.
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
    [/^slug '.*' already exists.*$/i, "Bu slug zaten kullanılıyor — başka bir slug seçin."],
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
    else if (view === "drafts") loadDrafts();
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
      Editoryal Depolama: <strong>${escapeHtml(label)}</strong>
    </p>`;
  }

  async function refreshDashboard() {
    const container = document.getElementById("admin-dashboard-cards");
    const banner = document.getElementById("admin-storage-banner");
    if (!container) return;
    container.innerHTML = `<p class="admin-muted">Yükleniyor…</p>`;
    try {
      const { data } = await Session.request("/dashboard");
      if (banner) banner.innerHTML = editorialStoreBannerHtml(data.editorialStoreName);
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
    const archiveBtn = isPublic
      ? `<button type="button" class="btn-admin btn-admin-secondary admin-row-action" data-action="archive-proposal" data-id="${escapeHtml(entity.id)}" data-type="${escapeHtml(entity.entityType)}">Arşivleme Teklifi Oluştur</button>`
      : "";
    return `
      <button type="button" class="btn-admin btn-admin-secondary admin-row-action" data-action="view" data-id="${escapeHtml(entity.id)}">Görüntüle</button>
      <button type="button" class="btn-admin btn-admin-secondary admin-row-action" data-action="propose-edit" data-id="${escapeHtml(entity.id)}" data-type="${escapeHtml(entity.entityType)}">${isPublic ? "Değişiklik Öner" : "Düzenle"}</button>
      ${archiveBtn}`;
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

  let editorState = { mode: "create", entityType: "place", baseEntity: null };
  let editorMap = null;
  let editorMarker = null;
  let editorDirty = false;
  let editorTriggerEl = null;

  /**
   * Public Impact indicator (Section 44 of the round brief): every write
   * this modal can make is a draft/proposal, never a direct canonical
   * mutation — so this banner is always "None", by construction, not by
   * a value that could drift out of sync with what the code actually does.
   */
  function publicImpactBannerHtml() {
    return `<p class="admin-storage-banner admin-storage-banner-durable" style="margin-bottom: var(--sp-3);">
      GENEL ETKİ: <strong>Yok</strong> — bu form yalnızca bir taslak/öneri oluşturur; herkese açık site hemen değişmez.
    </p>`;
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

  function sourceFieldsHtml(entity = {}) {
    return `
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
        <div class="form-group"><label class="form-label" for="field-media-storage-path">Depolama Yolu / Storage Path</label><input class="form-input" id="field-media-storage-path" value="${escapeHtml(entity.originalStoragePath || "")}"></div>
        <div class="form-group"><label class="form-label" for="field-media-source">Kaynak / Source</label><input class="form-input" id="field-media-source" value="${escapeHtml(entity.source || "")}"></div>
        <div class="form-group"><label class="form-label" for="field-media-author">Yazar / Author</label><input class="form-input" id="field-media-author" value="${escapeHtml(entity.author || "")}"></div>
        <div class="form-group"><label class="form-label" for="field-media-license">Lisans / License</label><input class="form-input" id="field-media-license" value="${escapeHtml(entity.license || "")}"></div>
      </div>
      <div class="form-group"><label class="form-label" for="field-media-rights-note">Haklar Notu / Rights Note</label><textarea class="form-textarea" id="field-media-rights-note">${escapeHtml(entity.rightsNote || "")}</textarea></div>
      <label class="checkbox-row" for="field-media-ai-generated">
        <input type="checkbox" id="field-media-ai-generated" ${entity.aiGenerated ? "checked" : ""}>
        <span>Yapay zekâ ile oluşturulmuş / AI-generated</span>
      </label>
      <p class="form-help">Dosya yükleme bu sürümde desteklenmiyor — yalnızca zaten var olan bir dosyanın metadata'sı düzenlenir. Bkz. round raporu, "Known Limitations".</p>`;
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
      const audioIds = (entity.audioMediaIds || []).join(", ") || "(bağlı ses kaydı yok)";
      parts.push(`<div class="form-group"><label class="form-label">Bağlı Ses Kayıtları (audioMediaIds)</label>
        <p class="admin-readonly-value">${escapeHtml(audioIds)}</p>
        <small class="form-help">Ses dosyası bağlama bu sürümde desteklenmiyor — bkz. Medya bölümü notu.</small></div>`);
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
    } else if (entityType === "structure") {
      parts.push(`<div class="form-group"><label class="form-label">Yapı Türü</label><input class="form-input" id="field-structure-type" value="${escapeHtml(entity.structureType || "")}"></div>`);
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
    } else if (entityType === "proverb") {
      if (val("field-original-text")) out.originalText = val("field-original-text");
      if (val("field-language")) out.language = val("field-language");
      if (val("field-dialect")) out.dialect = val("field-dialect");
      if (val("field-transliteration")) out.transliteration = val("field-transliteration");
      const literalMeaning = collectMultilingual("literalMeaning"); if (literalMeaning) out.literalMeaning = literalMeaning;
      const culturalMeaning = collectMultilingual("culturalMeaning"); if (culturalMeaning) out.culturalMeaning = culturalMeaning;
      const translations = collectMultilingual("translations"); if (translations) out.translations = translations;
    } else if (entityType === "structure") {
      if (val("field-structure-type")) out.structureType = val("field-structure-type");
    }
    return out;
  }

  function val(id) { return document.getElementById(id)?.value.trim() || ""; }

  function statusOptionsHtml(entityType, selected, isNew) {
    const options = isNew ? ["draft", "inReview"] : ["draft", "inReview", "published", "archived"];
    return options.map((s) => `<option value="${s}" ${s === selected ? "selected" : ""}>${STATUS_LABELS[s]}</option>`).join("");
  }

  function renderEditor() {
    const { mode, entityType, baseEntity } = editorState;
    const isNew = mode === "create";
    const entity = baseEntity || {};
    const flat = isFlatEntityType(entityType);
    document.getElementById("admin-editor-heading").textContent = isNew
      ? `Yeni Kayıt — ${ENTITY_TYPE_LABELS[entityType]}`
      : `Değişiklik Öner — ${flat ? entity.id : localized(entity.title, entity.id)}`;

    const body = document.getElementById("admin-editor-form-body");

    if (flat) {
      // source/media: plain `id`, no slug, no title/summary/status/tags — see isFlatEntityType's header.
      const idHtml = isNew
        ? `<div class="form-group"><label class="form-label" for="field-id">Kimlik (ID)</label><input class="form-input" id="field-id" required placeholder="ör. source-XXXX"></div>`
        : `<p class="admin-readonly-value">ID: <code>${escapeHtml(entity.id)}</code> (bu alan bir değişiklik önerisiyle değiştirilemez)</p>`;
      body.innerHTML = `
        ${publicImpactBannerHtml()}
        ${idHtml}
        ${entityType === "source" ? sourceFieldsHtml(entity) : mediaFieldsHtml(entity)}
      `;
    } else {
      const idSlugHtml = isNew ? `
        <div class="form-row-two">
          <div class="form-group"><label class="form-label" for="field-id">Kimlik (ID)</label><input class="form-input" id="field-id" required placeholder="ör. place-XXXX"></div>
          <div class="form-group"><label class="form-label" for="field-slug">Slug</label><input class="form-input" id="field-slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required></div>
        </div>` : `<p class="admin-readonly-value">ID: <code>${escapeHtml(entity.id)}</code> · Slug: <code>${escapeHtml(entity.slug)}</code> (bu alanlar bir değişiklik önerisiyle değiştirilemez)</p>`;

      body.innerHTML = `
        ${publicImpactBannerHtml()}
        ${idSlugHtml}
        ${multilingualInputHtml("title", "Başlık", entity.title || {})}
        ${multilingualInputHtml("summary", "Özet", entity.summary || {}, "textarea")}
        <div class="form-group"><label class="form-label" for="field-status">Durum</label>
          <select class="form-select" id="field-status">${statusOptionsHtml(entityType, entity.status || "draft", isNew)}</select>
          <small class="form-help">Yeni kayıtlar asla doğrudan "Yayında" ile başlayamaz.</small>
        </div>
        <div class="form-group"><label class="form-label" for="field-tags">Etiketler (virgülle ayrılmış)</label><input class="form-input" id="field-tags" value="${escapeHtml((entity.tags || []).join(", "))}"></div>
        ${typeSpecificFieldsHtml(entityType, entity)}
      `;
    }
    body.querySelectorAll('[data-name-list]').forEach(wireNameListEditor);
    if (entityType === "place") initCoordinateMap(entity.coordinates);

    editorDirty = false;
    body.addEventListener("input", () => { editorDirty = true; });
    body.addEventListener("change", () => { editorDirty = true; });

    const modal = document.getElementById("admin-editor-modal");
    modal.classList.add("open");
    modal.querySelector("input, textarea, select")?.focus();
  }

  function openEditorForNew(entityType, triggerEl = document.activeElement) {
    editorTriggerEl = triggerEl;
    editorState = { mode: "create", entityType, baseEntity: null };
    renderEditor();
  }

  async function openEditorForExisting(id, entityType, triggerEl = document.activeElement) {
    try {
      const { data } = await Session.request(`/entities/${encodeURIComponent(id)}`);
      editorTriggerEl = triggerEl;
      editorState = { mode: "edit", entityType: entityType || data.entityType, baseEntity: data };
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

  async function submitEditor(event) {
    event.preventDefault();
    const { mode, entityType, baseEntity } = editorState;
    const flat = isFlatEntityType(entityType);
    const proposedChanges = flat
      ? (entityType === "source" ? collectSourceFields() : collectMediaFields())
      : { ...collectCommonFields(), ...collectTypeSpecificFields(entityType) };

    try {
      if (mode === "create") {
        proposedChanges.id = val("field-id");
        if (!flat) proposedChanges.slug = val("field-slug");
        await Session.request("/drafts", { method: "POST", body: JSON.stringify({ kind: "create", entityType, proposedChanges }) });
        toast("Yeni kayıt taslağı oluşturuldu.");
      } else {
        await Session.request("/drafts", { method: "POST", body: JSON.stringify({ kind: "edit", entityType, entityId: baseEntity.id, proposedChanges }) });
        toast("Değişiklik önerisi taslak olarak kaydedildi.");
      }
      editorDirty = false;
      closeEditor({ force: true });
      loadDrafts();
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
    document.getElementById("admin-media-new-btn")?.addEventListener("click", () => openEditorForNew("media"));
    document.getElementById("admin-sources-new-btn")?.addEventListener("click", () => openEditorForNew("source"));
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
        <p class="admin-muted" style="margin-bottom: var(--sp-3);">Not: kaynak kalite sınıflandırması (Birincil / Akademik / Kurumsal / Yerel Tarih / Sözlü Tarih / Popüler / Doğrulanmamış) bu sürümde desteklenmiyor — canonical şemada henüz karşılığı yok. Bkz. round raporu, "Known Limitations".</p>
        <table class="admin-table"><thead><tr><th>Başlık</th><th>ID</th><th>Tür</th><th>Yazar</th><th>Yıl</th><th>URL</th><th>İşlemler</th></tr></thead><tbody>
        ${data.map((s) => `<tr>
          <td class="cell-title">${escapeHtml(s.title || "(başlıksız)")}</td>
          <td class="cell-id">${escapeHtml(s.id)}${originBadgeHtml(s)}</td>
          <td>${escapeHtml(SOURCE_TYPE_LABELS[s.type] || s.type || "—")}</td>
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

  async function loadRelationships() {
    const container = document.getElementById("admin-relationships-list");
    if (!container) return;
    container.innerHTML = `<p class="admin-muted">Yükleniyor…</p>`;
    try {
      const { data } = await Session.request("/relationships");
      if (!data.length) { container.innerHTML = `<p class="admin-muted">İlişki kaydı bulunamadı.</p>`; return; }
      container.innerHTML = `<table class="admin-table"><thead><tr><th>Kaynak</th><th>Tür</th><th>Hedef</th><th>Durum</th></tr></thead><tbody>
        ${data.map((r) => `<tr><td><code>${escapeHtml(r.sourceId)}</code></td><td>${escapeHtml(r.type)}</td><td><code>${escapeHtml(r.targetId)}</code></td><td>${statusBadge(r.status)}</td></tr>`).join("")}
      </tbody></table>`;
    } catch (error) {
      container.innerHTML = `<p class="admin-error">${escapeHtml(reportError(error, "loadRelationships"))}</p>`;
    }
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

    const authenticated = await Session.checkSession();
    if (authenticated) await showPanel(); else showLoginGate();
  });

  root.AntiochiaAdminPanel = Object.freeze({
    toast, escapeHtml, isLegacyEntity, translateAdminError, buildDiffRows,
  });
})(typeof window !== "undefined" ? window : globalThis);
