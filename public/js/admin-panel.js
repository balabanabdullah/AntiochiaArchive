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
    document.querySelectorAll("[data-admin-view]").forEach((btn) => btn.classList.toggle("active", btn === activeBtn));
    document.querySelectorAll("[data-admin-panel]").forEach((panel) => { panel.hidden = panel.dataset.adminPanel !== view; });
    document.querySelector(".admin-sidebar")?.classList.remove("is-open");

    if (view === "dashboard") refreshDashboard();
    else if (view === "records") loadRecords({ type: type || "" });
    else if (view === "media") loadRecords({ type: "media" }, "records");
    else if (view === "sources") loadRecords({ type: "source" }, "records");
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
      container.innerHTML = `<p class="admin-error">${escapeHtml(error.message)}</p>`;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Records — shared table for "Kayıtlar" + every per-type nav shortcut     */
  /* ---------------------------------------------------------------------- */

  let recordsFilter = { type: "", status: "", q: "" };

  function recordActionsHtml(entity) {
    const isPublic = entity.status === "published";
    return `
      <button type="button" class="btn-admin btn-admin-secondary admin-row-action" data-action="view" data-id="${escapeHtml(entity.id)}">Görüntüle</button>
      <button type="button" class="btn-admin btn-admin-secondary admin-row-action" data-action="propose-edit" data-id="${escapeHtml(entity.id)}" data-type="${escapeHtml(entity.entityType)}">${isPublic ? "Değişiklik Öner" : "Düzenle"}</button>`;
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
      const { data } = await Session.request(`/entities?${params.toString()}`);
      if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="admin-muted">Kayıt bulunamadı.</td></tr>`;
        return;
      }
      tbody.innerHTML = data.map((entity) => `
        <tr>
          <td class="cell-title">${escapeHtml(localized(entity.title, entity.slug || entity.id))}</td>
          <td class="cell-id">${escapeHtml(entity.id)}</td>
          <td>${escapeHtml(ENTITY_TYPE_LABELS[entity.entityType] || entity.entityType)}</td>
          <td>${statusBadge(entity.status)}</td>
          <td>${escapeHtml((entity.updatedAt || entity.createdAt || "").slice(0, 10) || "—")}</td>
          <td class="admin-row-actions">${recordActionsHtml(entity)}</td>
        </tr>`).join("");

      tbody.querySelectorAll("[data-action='view']").forEach((btn) => btn.addEventListener("click", () => viewEntity(btn.dataset.id)));
      tbody.querySelectorAll("[data-action='propose-edit']").forEach((btn) => btn.addEventListener("click", () => openEditorForExisting(btn.dataset.id, btn.dataset.type)));
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="6" class="admin-error">${escapeHtml(error.message)}</td></tr>`;
    }
  }

  function switchActiveTypeFilter(type) {
    document.querySelectorAll("[data-records-type-filter]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.recordsTypeFilter === (type || "all"));
    });
  }

  function initRecordsFilters() {
    const typeBar = document.getElementById("admin-records-type-filters");
    if (typeBar) {
      typeBar.innerHTML = `<button type="button" class="tab-btn active" data-records-type-filter="all">Tümü</button>` + Object.entries(ENTITY_TYPE_LABELS).map(([type, label]) => (
        `<button type="button" class="tab-btn" data-records-type-filter="${type}">${escapeHtml(label)}</button>`
      )).join("");
      typeBar.querySelectorAll("[data-records-type-filter]").forEach((btn) => {
        btn.addEventListener("click", () => loadRecords({ type: btn.dataset.recordsTypeFilter === "all" ? "" : btn.dataset.recordsTypeFilter }));
      });
    }

    document.getElementById("admin-records-status-filter")?.addEventListener("change", (e) => loadRecords({ status: e.target.value }));
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
      alert(`${localized(data.title, data.slug)}\n\n${JSON.stringify(data, null, 2)}`.slice(0, 4000));
    } catch (error) {
      toast(error.message, "error");
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Entity editor — schema-aware core fields + place/music specifics        */
  /* ---------------------------------------------------------------------- */

  let editorState = { mode: "create", entityType: "place", baseEntity: null };
  let editorMap = null;
  let editorMarker = null;

  function fieldsFor(entityType) {
    const common = ["title", "summary", "status", "tags"];
    if (entityType === "place") return [...common, "officialName", "coordinates", "localNames", "historicalNames", "alternateNames"];
    if (entityType === "music") return [...common, "genre", "subgenre", "originalLanguage", "dialect", "lyrics", "transcript", "translations", "audioMediaIds", "rightsStatus"];
    if (entityType === "proverb") return [...common, "originalText", "language", "dialect", "transliteration", "literalMeaning", "culturalMeaning", "translations"];
    if (entityType === "structure") return [...common, "structureType"];
    if (entityType === "story") return [...common, "storyCategory", "originalLanguage", "dialect", "transcript", "translations"];
    return common;
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
      <input class="form-input" type="text" placeholder="İsim (verildiği gibi)" data-name-field="name" value="${escapeHtml(entry.name || "")}">
      <input class="form-input" type="text" placeholder="Dil/köken (ör. ar)" data-name-field="language" value="${escapeHtml(entry.language || "")}">
      <input class="form-input" type="text" placeholder="Not/köken bilgisi" data-name-field="dialect" value="${escapeHtml(entry.dialect || "")}">
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
        <input class="form-input" type="number" step="any" id="field-coord-lat" placeholder="Enlem (-90..90)" value="${coordinates?.latitude ?? ""}">
        <input class="form-input" type="number" step="any" id="field-coord-lng" placeholder="Boylam (-180..180)" value="${coordinates?.longitude ?? ""}">
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
    document.getElementById("admin-editor-heading").textContent = isNew
      ? `Yeni Kayıt — ${ENTITY_TYPE_LABELS[entityType]}`
      : `Değişiklik Öner — ${localized(entity.title, entity.id)}`;

    const idSlugHtml = isNew ? `
      <div class="form-row-two">
        <div class="form-group"><label class="form-label" for="field-id">Kimlik (ID)</label><input class="form-input" id="field-id" required placeholder="ör. place-XXXX"></div>
        <div class="form-group"><label class="form-label" for="field-slug">Slug</label><input class="form-input" id="field-slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required></div>
      </div>` : `<p class="admin-readonly-value">ID: <code>${escapeHtml(entity.id)}</code> · Slug: <code>${escapeHtml(entity.slug)}</code> (bu alanlar bir değişiklik önerisiyle değiştirilemez)</p>`;

    const body = document.getElementById("admin-editor-form-body");
    body.innerHTML = `
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
    body.querySelectorAll('[data-name-list]').forEach(wireNameListEditor);
    if (entityType === "place") initCoordinateMap(entity.coordinates);

    document.getElementById("admin-editor-modal").classList.add("open");
  }

  function openEditorForNew(entityType) {
    editorState = { mode: "create", entityType, baseEntity: null };
    renderEditor();
  }

  async function openEditorForExisting(id, entityType) {
    try {
      const { data } = await Session.request(`/entities/${encodeURIComponent(id)}`);
      editorState = { mode: "edit", entityType: entityType || data.entityType, baseEntity: data };
      renderEditor();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function closeEditor() {
    document.getElementById("admin-editor-modal").classList.remove("open");
    if (editorMap) { editorMap.remove(); editorMap = null; editorMarker = null; }
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
    const proposedChanges = { ...collectCommonFields(), ...collectTypeSpecificFields(entityType) };

    try {
      if (mode === "create") {
        proposedChanges.id = val("field-id");
        proposedChanges.slug = val("field-slug");
        await Session.request("/drafts", { method: "POST", body: JSON.stringify({ kind: "create", entityType, proposedChanges }) });
        toast("Yeni kayıt taslağı oluşturuldu.");
      } else {
        await Session.request("/drafts", { method: "POST", body: JSON.stringify({ kind: "edit", entityType, entityId: baseEntity.id, proposedChanges }) });
        toast("Değişiklik önerisi taslak olarak kaydedildi.");
      }
      closeEditor();
      loadDrafts();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function initEditorModal() {
    document.getElementById("admin-editor-form").addEventListener("submit", submitEditor);
    document.getElementById("admin-editor-close").addEventListener("click", closeEditor);
    document.getElementById("admin-editor-cancel").addEventListener("click", closeEditor);
  }

  /* ---------------------------------------------------------------------- */
  /* Editorial drafts / Değişiklikler                                        */
  /* ---------------------------------------------------------------------- */

  const DRAFT_NEXT_ACTIONS = Object.freeze({
    draft: [["readyForReview", "İncelemeye Gönder"], ["rejected", "Taslağı İptal Et"]],
    readyForReview: [["approved", "Onayla"], ["draft", "Taslağa Geri Al"], ["rejected", "Reddet"]],
    approved: [["applied", "Uygulandı Olarak İşaretle"], ["rejected", "Reddet"]],
    rejected: [["draft", "Taslağa Geri Al"]],
    applied: [],
  });

  const DESTRUCTIVE_TRANSITIONS = new Set(["rejected"]);

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
    } catch (error) {
      container.innerHTML = `<p class="admin-error">${escapeHtml(error.message)}</p>`;
    }
  }

  function draftCardHtml(draft) {
    const actions = (DRAFT_NEXT_ACTIONS[draft.status] || []).map(([next, label]) => (
      `<button type="button" class="btn-admin ${DESTRUCTIVE_TRANSITIONS.has(next) ? "btn-admin-danger" : "btn-admin-secondary"}" data-draft-action="${next}" data-change-id="${escapeHtml(draft.changeId)}">${label}</button>`
    )).join("");
    const target = draft.kind === "create" ? (draft.proposedChanges?.id || "(yeni kayıt)") : draft.entityId;
    return `<article class="admin-draft-card">
      <header>
        <span class="admin-draft-kind">${draft.kind === "create" ? "Yeni Kayıt" : "Değişiklik"}</span>
        ${statusBadge(draft.status, DRAFT_STATUS_LABELS)}
      </header>
      <p><strong>${escapeHtml(ENTITY_TYPE_LABELS[draft.entityType] || draft.entityType)}</strong> — <code>${escapeHtml(target)}</code></p>
      <p class="admin-muted">Son güncelleme: ${escapeHtml((draft.updatedAt || "").slice(0, 16).replace("T", " "))}</p>
      <div class="admin-row-actions">
        ${actions}
        <button type="button" class="btn-admin btn-admin-danger" data-delete-draft data-change-id="${escapeHtml(draft.changeId)}">Sil</button>
      </div>
    </article>`;
  }

  async function transitionDraft(changeId, status) {
    if (DESTRUCTIVE_TRANSITIONS.has(status) && !confirm("Bu değişikliği reddetmek istediğinizden emin misiniz?")) return;
    try {
      await Session.request(`/drafts/${encodeURIComponent(changeId)}`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast("Durum güncellendi.");
      loadDrafts();
      refreshDashboard();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function deleteDraft(changeId) {
    if (!confirm("Bu taslağı kalıcı olarak silmek istediğinizden emin misiniz?")) return;
    try {
      await Session.request(`/drafts/${encodeURIComponent(changeId)}`, { method: "DELETE" });
      toast("Taslak silindi.");
      loadDrafts();
    } catch (error) {
      toast(error.message, "error");
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
        toast(error.message, "error");
      }
    });
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
      container.innerHTML = `<p class="admin-error">${escapeHtml(error.message)}</p>`;
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
    initEditorModal();
    initDraftsView();

    const authenticated = await Session.checkSession();
    if (authenticated) await showPanel(); else showLoginGate();
  });

  root.AntiochiaAdminPanel = Object.freeze({ toast, escapeHtml });
})(typeof window !== "undefined" ? window : globalThis);
