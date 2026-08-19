/**
 * Deterministic, client-side unified search over the public v2 archive.
 *
 * No AI/embeddings/vector search and no backend search endpoint — this is a
 * plain substring match over a per-entity haystack built once from fields
 * the public serializer already exposes (see
 * backend/v2/serializers/publicSerializer.js): title, summary,
 * alternateNames, tags, period.label, plus place's officialName/localNames/
 * historicalNames/etymology and structure/music/story's type-specific
 * fields. Every language variant of every field is folded into the
 * haystack, so a query in one language can still match a title only
 * populated in another (e.g. searching "Antioch" finds a record whose title
 * is only set in `tr`/`ar`, because its `en` alternate name still is).
 */
(function exposeSearch(root) {
  "use strict";

  // Turkish-aware, diacritic-tolerant fold: lowercases (Turkish "İ"/"I" the
  // Turkish way, not the default locale-insensitive toLowerCase, which maps
  // "I" -> "i" and "İ" -> "i̇" with a stray combining dot); folds dotless "ı"
  // to plain "i" (its NFD decomposition is a no-op — "ı" is a base letter,
  // not a composed accent — so this is the one Turkish letter NFD alone
  // can't fold, e.g. "Hızır" vs "Hizir"); then strips the combining marks
  // NFD decomposition leaves behind for ç/ğ/ö/ş/ü and other accented Latin
  // letters, so those line up with their plain form too.
  function normalizeSearchText(value) {
    if (value == null) return "";
    return String(value)
      .replace(/İ/g, "i")
      .replace(/I/g, "ı")
      .toLocaleLowerCase("tr")
      .replace(/ı/g, "i")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim();
  }

  function collectMultilingualText(value, into) {
    if (!value) return;
    if (typeof value === "string") { into.push(value); return; }
    if (typeof value !== "object") return;
    for (const text of Object.values(value)) {
      if (typeof text === "string") into.push(text);
    }
  }

  function collectNameArray(value, into) {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      if (typeof item?.name === "string") into.push(item.name);
      if (typeof item?.transliteration === "string") into.push(item.transliteration);
    }
  }

  /** Title text alone (every language) — the highest-priority match field, kept separate so a title match always outranks a tag/summary match. */
  function collectTitleText(entity) {
    const parts = [];
    collectMultilingualText(entity.title, parts);
    collectMultilingualText(entity.officialName, parts);
    return parts.filter(Boolean).join(" ␟ ");
  }

  /** Every other free-text field an entity of any public type can carry, per the public allowlist. */
  function collectSecondaryText(entity) {
    const parts = [];
    collectMultilingualText(entity.summary, parts);
    collectMultilingualText(entity.alternateNames, parts);
    collectMultilingualText(entity.etymology, parts);
    collectMultilingualText(entity.period?.label, parts);
    collectNameArray(entity.localNames, parts);
    collectNameArray(entity.historicalNames, parts);
    if (Array.isArray(entity.tags)) parts.push(...entity.tags);
    if (typeof entity.structureType === "string") parts.push(entity.structureType);
    if (typeof entity.genre === "string") parts.push(entity.genre);
    if (typeof entity.storyCategory === "string") parts.push(entity.storyCategory);
    parts.push(entity.entityType, entity.slug);
    return parts.filter(Boolean).join(" ␟ ");
  }

  /**
   * Builds the search index: one entry per detail-eligible public entity.
   * Pure and synchronous — entities in, index out, no fetching here. Kept
   * as two separate haystacks (title vs. everything else) so relevanceScore
   * can rank a title match above a same-string match buried in a tag/slug.
   */
  function buildSearchIndex(entities) {
    return (entities || [])
      .filter((entity) => root.AntiochiaArchiveStore?.DETAIL_TYPES.includes(entity.entityType))
      .map((entity) => ({
        entity,
        titleHaystack: normalizeSearchText(collectTitleText(entity)),
        haystack: normalizeSearchText(`${collectTitleText(entity)} ␟ ${collectSecondaryText(entity)}`),
      }));
  }

  function displayTitle(entity, lang) {
    const title = entity.title;
    if (!title || typeof title !== "object") return entity.slug || "";
    return title[lang] ?? title.en ?? title.tr ?? title.ar ?? entity.slug ?? "";
  }

  /** A title match always outranks a match elsewhere; within each, startsWith > word-boundary > plain substring. Ties keep index order. */
  function substringTier(haystack, needle) {
    const at = haystack.indexOf(needle);
    if (at === -1) return -1;
    if (at === 0) return 2;
    if (haystack[at - 1] === " ") return 1;
    return 0;
  }

  function relevanceScore(entry, needle) {
    const titleTier = substringTier(entry.titleHaystack, needle);
    if (titleTier >= 0) return 10 + titleTier;
    return substringTier(entry.haystack, needle);
  }

  /**
   * Matches `query` against the index. `typeFilter` narrows to one
   * entityType ("all" or omitted searches every type). Returns entities
   * (not index entries), best matches first.
   */
  function searchEntities(index, query, { typeFilter = "all", limit } = {}) {
    const needle = normalizeSearchText(query);
    if (!needle) return [];
    const scored = [];
    for (const entry of index) {
      if (typeFilter !== "all" && entry.entity.entityType !== typeFilter) continue;
      const score = relevanceScore(entry, needle);
      if (score >= 0) scored.push({ entity: entry.entity, score });
    }
    scored.sort((a, b) => b.score - a.score);
    const results = scored.map((item) => item.entity);
    return typeof limit === "number" ? results.slice(0, limit) : results;
  }

  root.AntiochiaArchiveSearch = Object.freeze({
    normalizeSearchText,
    buildSearchIndex,
    searchEntities,
    displayTitle,
  });
})(typeof window !== "undefined" ? window : globalThis);

/* ==========================================================================
   Header search box: debounced autocomplete dropdown. Browser only.
   ========================================================================== */
(function initSearchBoxDom(root) {
  "use strict";
  if (typeof document === "undefined") return;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
    })[char]);
  }

  function detailHref(entity) {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(entity?.slug || ""))
      ? `/archive-v2/${entity.slug}/`
      : null;
  }

  const SUGGESTION_LIMIT = 8;
  const DEBOUNCE_MS = 150;

  /**
   * Wires one search `<input>` to a live autocomplete dropdown. Multiple
   * inputs (desktop header + mobile nav) can each call this independently;
   * `getIndex` is a () -> index-array-or-null getter so the box can render
   * "type to search" before the archive has finished loading, without this
   * module owning the fetch itself.
   */
  function initSearchAutocomplete(input, { getIndex, getLang, getTypeLabels, resultsHref, onNavigate }) {
    if (!input || input.dataset.autocompleteWired) return;
    input.dataset.autocompleteWired = "true";

    const wrap = document.createElement("div");
    wrap.className = "search-autocomplete";
    input.insertAdjacentElement("afterend", wrap);

    const listEl = document.createElement("ul");
    listEl.className = "search-autocomplete-list";
    listEl.id = `${input.id || "search"}-suggestions`;
    listEl.setAttribute("role", "listbox");
    wrap.appendChild(listEl);

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", listEl.id);
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("autocomplete", "off");

    let activeIndex = -1;
    let currentSuggestions = [];
    let debounceHandle = null;

    function close() {
      wrap.classList.remove("is-open");
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      activeIndex = -1;
      currentSuggestions = [];
      listEl.innerHTML = "";
    }

    function optionId(i) { return `${listEl.id}-opt-${i}`; }

    function renderSuggestions(suggestions) {
      currentSuggestions = suggestions;
      activeIndex = -1;
      input.removeAttribute("aria-activedescendant");
      if (!suggestions.length) { wrap.classList.remove("is-open"); listEl.innerHTML = ""; return; }
      const lang = getLang();
      const typeLabels = getTypeLabels ? getTypeLabels() : null;
      listEl.innerHTML = suggestions.map((entity, i) => {
        const title = escapeHtml(root.AntiochiaArchiveSearch.displayTitle(entity, lang));
        const typeLabel = escapeHtml(typeLabels?.[entity.entityType] || entity.entityType);
        const href = detailHref(entity);
        return `<li id="${optionId(i)}" role="option" class="search-suggestion" data-href="${escapeHtml(href || "")}">
          <span class="search-suggestion-title">${title}</span>
          <span class="search-suggestion-type">${typeLabel}</span>
        </li>`;
      }).join("");
      wrap.classList.add("is-open");
      input.setAttribute("aria-expanded", "true");
    }

    function navigateTo(entity) {
      const href = detailHref(entity);
      close();
      if (href) {
        if (typeof onNavigate === "function") onNavigate(entity, href);
        else root.location.href = href;
      }
    }

    function setActive(i) {
      const options = listEl.querySelectorAll(".search-suggestion");
      options.forEach((el) => el.classList.remove("is-active"));
      if (i >= 0 && options[i]) {
        options[i].classList.add("is-active");
        options[i].scrollIntoView({ block: "nearest" });
        input.setAttribute("aria-activedescendant", optionId(i));
      } else {
        input.removeAttribute("aria-activedescendant");
      }
      activeIndex = i;
    }

    input.addEventListener("input", () => {
      window.clearTimeout(debounceHandle);
      const query = input.value;
      if (!query.trim()) { close(); return; }
      debounceHandle = window.setTimeout(() => {
        const index = getIndex();
        if (!index) return;
        const results = root.AntiochiaArchiveSearch.searchEntities(index, query, { limit: SUGGESTION_LIMIT });
        renderSuggestions(results);
      }, DEBOUNCE_MS);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        if (!currentSuggestions.length) return;
        event.preventDefault();
        setActive(Math.min(activeIndex + 1, currentSuggestions.length - 1));
      } else if (event.key === "ArrowUp") {
        if (!currentSuggestions.length) return;
        event.preventDefault();
        setActive(Math.max(activeIndex - 1, 0));
      } else if (event.key === "Enter") {
        if (activeIndex >= 0 && currentSuggestions[activeIndex]) {
          event.preventDefault();
          navigateTo(currentSuggestions[activeIndex]);
        } else if (resultsHref && input.value.trim()) {
          close();
          root.location.href = `${resultsHref}?q=${encodeURIComponent(input.value.trim())}`;
        }
      } else if (event.key === "Escape") {
        close();
      }
    });

    listEl.addEventListener("mousedown", (event) => {
      const option = event.target.closest(".search-suggestion");
      if (!option) return;
      event.preventDefault();
      const index = Array.from(listEl.children).indexOf(option);
      if (currentSuggestions[index]) navigateTo(currentSuggestions[index]);
    });

    document.addEventListener("click", (event) => {
      if (!wrap.contains(event.target) && event.target !== input) close();
    });

    return { close };
  }

  root.AntiochiaArchiveSearchBox = Object.freeze({ initSearchAutocomplete });
})(typeof window !== "undefined" ? window : globalThis);
