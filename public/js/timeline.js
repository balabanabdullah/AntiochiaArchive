/**
 * Reusable "Antakya Through Time" timeline component.
 *
 * Source: public historicalContext entities only (the same records already
 * shown on pages/history.html), read through AntiochiaArchiveStore — never a
 * hardcoded list of eras. See backend/v2/schemas/historicalContext.js: the
 * only period-ish field the public API ever serializes is `period.label`, a
 * short free-text string ({ en, tr?, ar? }) — there is no start/end year, no
 * numeric date, anywhere in the public v2 schema. So this component never
 * displays or infers a year: it shows exactly the (title, period.label,
 * summary) each record already publishes, in the order described below.
 *
 * Ordering: 19 of the 22 public records carry a sequential `hist-00NN` id
 * that the editorial team already assigned in chronological narrative order
 * (verified against data/v2/entities.json — hist-0002 is the Seleucid
 * founding, hist-0021 is the 2023 earthquake, strictly increasing in
 * between). The remaining 3 are legacy v1-migrated "broad era" summaries
 * (ids h1/h2/h3) that don't carry that numbering; LEGACY_ERA_RANK places
 * each one only by re-reading ITS OWN already-published period.label text
 * ("300 BCE — Roman Capital", "Medieval & Ottoman Eras", "Modern Memory") —
 * no new historical judgment is introduced, just a stable sort key.
 */
(function exposeTimeline(root) {
  "use strict";

  const HIST_ID_PATTERN = /^hist-(\d+)$/;

  // See file header: derived from each entity's own published period.label,
  // not asserted independently. Placed to interleave with the matching
  // hist-00NN rank range (roman era ~hist-0004, medieval/ottoman spans
  // hist-0012..hist-0016, modern sits after hist-0021).
  const LEGACY_ERA_RANK = Object.freeze({
    h1: 3.5,   // "300 BCE — Roman Capital"
    h2: 13.5,  // "Medieval & Ottoman Eras"
    h3: 21.5,  // "Modern Memory"
  });

  function timelineSortRank(entity, fallbackIndex) {
    const histMatch = HIST_ID_PATTERN.exec(String(entity?.id || ""));
    if (histMatch) return Number(histMatch[1]);
    if (Object.hasOwn(LEGACY_ERA_RANK, entity?.id)) return LEGACY_ERA_RANK[entity.id];
    // Unknown id shape (a future record type this component wasn't updated
    // for): keep it out of the way at the end rather than guessing.
    return 10000 + fallbackIndex;
  }

  /**
   * Builds the ordered, display-ready timeline entries from a flat public
   * entity array. Pure and synchronous — safe to unit test without a DOM.
   */
  function getTimelineEntries(entities) {
    return (entities || [])
      .filter((entity) => entity.entityType === "historicalContext")
      .map((entity, index) => ({ entity, rank: timelineSortRank(entity, index), index }))
      .sort((a, b) => (a.rank - b.rank) || (a.index - b.index))
      .map(({ entity }) => entity);
  }

  root.AntiochiaArchiveTimeline = Object.freeze({
    getTimelineEntries,
    timelineSortRank,
  });
})(typeof window !== "undefined" ? window : globalThis);

/* ==========================================================================
   DOM rendering + interaction (browser only; the pure logic above is what
   test/timeline.test.js exercises).
   ========================================================================== */
(function initTimelineDom(root) {
  "use strict";
  if (typeof document === "undefined") return;

  function localized(value, lang, fallback = "") {
    if (!value || typeof value !== "object") return fallback;
    return value[lang] ?? value.en ?? value.tr ?? value.ar ?? fallback;
  }

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

  /** Renders one timeline rail: a horizontally-scrollable row of era cards on a connecting line. */
  function renderTimelineRailHtml(entries, lang, { emptyLabel = "" } = {}) {
    if (!entries.length) {
      return `<p class="timeline-rail-empty">${escapeHtml(emptyLabel)}</p>`;
    }
    const cards = entries.map((entity) => {
      const title = escapeHtml(localized(entity.title, lang, entity.slug));
      const period = escapeHtml(localized(entity.period?.label, lang, ""));
      const summary = escapeHtml(localized(entity.summary, lang, ""));
      const href = detailHref(entity);
      const inner = `
        <span class="timeline-rail-dot" aria-hidden="true"></span>
        ${period ? `<span class="timeline-rail-era">${period}</span>` : ""}
        <span class="timeline-rail-title">${title}</span>
        ${summary ? `<span class="timeline-rail-summary">${summary}</span>` : ""}`;
      return href
        ? `<a class="timeline-rail-card" href="${escapeHtml(href)}" data-search="${escapeHtml(`${title} ${period}`.toLowerCase())}">${inner}</a>`
        : `<div class="timeline-rail-card" tabindex="0" data-search="${escapeHtml(`${title} ${period}`.toLowerCase())}">${inner}</div>`;
    }).join("");
    return `<div class="timeline-rail-track" role="list">${cards}</div>`;
  }

  /**
   * Renders a timeline rail into `container`. `entries` is the array from
   * getTimelineEntries(); `opts.limit` truncates for a compact homepage
   * preview (full order is preserved, just cut short — never re-sorted).
   */
  function renderTimeline(container, entries, lang, opts = {}) {
    if (!container) return;
    const limited = opts.limit ? entries.slice(0, opts.limit) : entries;
    container.innerHTML = renderTimelineRailHtml(limited, lang, opts);
    wireTimelineKeyboardScroll(container);
  }

  /** Left/Right arrow keys scroll the rail track when it (or a card inside it) has focus — keyboard parity with touch/drag scrolling. */
  function wireTimelineKeyboardScroll(container) {
    const track = container.querySelector(".timeline-rail-track");
    if (!track || track.dataset.keyboardWired) return;
    track.dataset.keyboardWired = "true";
    track.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const cards = Array.from(track.querySelectorAll(".timeline-rail-card"));
      const currentIndex = cards.indexOf(document.activeElement);
      if (currentIndex === -1) return;
      const nextIndex = event.key === "ArrowRight"
        ? Math.min(currentIndex + 1, cards.length - 1)
        : Math.max(currentIndex - 1, 0);
      if (nextIndex === currentIndex) return;
      event.preventDefault();
      cards[nextIndex].focus();
      cards[nextIndex].scrollIntoView({ behavior: root.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", inline: "center", block: "nearest" });
    });
  }

  root.AntiochiaArchiveTimeline = Object.freeze({
    ...root.AntiochiaArchiveTimeline,
    renderTimeline,
    renderTimelineRailHtml,
  });
})(typeof window !== "undefined" ? window : globalThis);
