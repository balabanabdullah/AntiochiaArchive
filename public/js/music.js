/**
 * Music archive activation: resolves a public `music` entity's
 * `audioMediaIds` (see backend/v2/schemas/music.js, already on the public
 * serializer allowlist) to the real, already-public `media` entities they
 * reference, and decides — deterministically, fail-closed — which of those
 * are actually safe to render as a playable `<audio>` element.
 *
 * `media` entities have no PUBLICATION_STATUS `status` field at all (see
 * backend/v2/serializers/publicVisibility.js — media/source are always
 * "public" once they exist, matching how v1 gallery images always were).
 * That means the ONLY thing standing between an unresolved-rights audio file
 * and public playback is this module's rights gate — never skip it. A
 * restricted/pendingReview/unknown/doNotPublish media entity is left exactly
 * where it is (still technically fetchable via GET /api/v2/entities/:id,
 * same as any pre-existing gallery image with unset rights) but is never
 * selected here, so the frontend never builds a player for it and the
 * import/ingestion workflow (scripts/import-music-audio.js) never copies its
 * file into the public/media/ directory in the first place — see that
 * script's header for the full "stays out of public reach" argument.
 */
(function exposeMusicCore(root) {
  "use strict";

  // Browser-safe minimum per the brief: mp3 always, ogg/wav/m4a where the
  // browser supports them. A media entity with any other mimeType is never
  // rendered as a player, even if its rights are cleared — an unplayable
  // format is not a safe "audio available" experience.
  const SUPPORTED_AUDIO_MIME_TYPES = Object.freeze([
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/x-wav",
    "audio/mp4",
    "audio/x-m4a",
  ]);

  const RIGHTS_STATUS_PUBLIC_PLAYBACK = "cleared";

  /** Only a same-origin absolute path or an https:// URL — never a javascript:/data:/relative-traversal src. */
  function isSafeAudioSrc(src) {
    if (typeof src !== "string" || !src) return false;
    if (src.startsWith("/") && !src.startsWith("//")) return true;
    return /^https:\/\//i.test(src);
  }

  /** True only for a media entity that is genuinely safe to play publicly right now — every condition fails closed. */
  function isPlayablePublicAudio(media) {
    if (!media || media.entityType !== "media") return false;
    if (media.mediaType !== "audio") return false;
    if (media.rightsStatus !== RIGHTS_STATUS_PUBLIC_PLAYBACK) return false;
    if (!SUPPORTED_AUDIO_MIME_TYPES.includes(media.mimeType)) return false;
    const src = Array.isArray(media.derivativeStoragePaths) ? media.derivativeStoragePaths[0] : null;
    return isSafeAudioSrc(src);
  }

  /**
   * Resolves a music entity's audioMediaIds against the full public entity
   * set (which — unlike a page's own per-type fetch — already includes
   * `media` entities; see AntiochiaArchiveStore.loadAllPublicEntities()) and
   * returns only the safely-playable ones, in the order audioMediaIds listed
   * them. A music entity with no audioMediaIds, or none of them resolving to
   * a playable asset, returns []  — the caller renders no player at all
   * ("no audio" is a normal state, never an error; see V2-ARCHITECTURE.md
   * music.audioMediaIds).
   */
  function resolvePlayableAudio(musicEntity, allEntities) {
    const ids = Array.isArray(musicEntity?.audioMediaIds) ? musicEntity.audioMediaIds : [];
    if (!ids.length) return [];
    const byId = new Map((allEntities || []).filter((e) => e.entityType === "media").map((e) => [e.id, e]));
    return ids.map((id) => byId.get(id)).filter(isPlayablePublicAudio);
  }

  /** For the music list page: which of these music entities have at least one playable audio asset (drives the "Audio" badge). */
  function musicIdsWithPlayableAudio(musicEntities, allEntities) {
    const result = new Set();
    for (const music of musicEntities || []) {
      if (resolvePlayableAudio(music, allEntities).length) result.add(music.id);
    }
    return result;
  }

  root.AntiochiaArchiveMusic = Object.freeze({
    SUPPORTED_AUDIO_MIME_TYPES,
    isSafeAudioSrc,
    isPlayablePublicAudio,
    resolvePlayableAudio,
    musicIdsWithPlayableAudio,
  });
})(typeof window !== "undefined" ? window : globalThis);

/* ==========================================================================
   DOM rendering (browser only) — audio badges on music cards, and the
   audio-player section on a music detail page.
   ========================================================================== */
(function initMusicDom(root) {
  "use strict";
  if (typeof document === "undefined") return;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
    })[char]);
  }

  /** Adds/removes the "has audio" badge + class on already-rendered music cards (data-entity-id, see renderV2Music in script.js). Never adds a badge for anything but a genuinely playable asset. */
  function annotateAudioBadges(container, playableIdSet, badgeLabel) {
    if (!container) return;
    container.querySelectorAll("[data-entity-id]").forEach((card) => {
      const id = card.getAttribute("data-entity-id");
      const hasAudio = playableIdSet.has(id);
      card.classList.toggle("has-audio", hasAudio);
      let badge = card.querySelector("[data-audio-badge]");
      if (hasAudio) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "track-audio-badge";
          badge.setAttribute("data-audio-badge", "");
          badge.innerHTML = `<span aria-hidden="true">♪</span> <span data-audio-badge-label></span>`;
          card.querySelector(".track-info")?.prepend(badge);
        }
        const labelEl = badge.querySelector("[data-audio-badge-label]");
        if (labelEl) labelEl.textContent = badgeLabel || "";
      } else if (badge) {
        badge.remove();
      }
    });
  }

  function audioItemMarkup(media, index, labels) {
    const src = escapeHtml(media.derivativeStoragePaths[0]);
    const facts = [
      typeof media.duration === "number" && media.duration > 0
        ? `<span><strong data-i18n="music.duration">${escapeHtml(labels.duration)}</strong>: ${formatDuration(media.duration)}</span>`
        : "",
      media.source ? `<span><strong data-i18n="provenance.sourceLabel">${escapeHtml(labels.credit)}</strong>: ${escapeHtml(media.source)}</span>` : "",
      media.author ? `<span><strong data-i18n="provenance.photoBy">${escapeHtml(labels.author)}</strong>: ${escapeHtml(media.author)}</span>` : "",
      media.license ? `<span><strong data-i18n="provenance.license">${escapeHtml(labels.license)}</strong>: ${escapeHtml(media.license)}</span>` : "",
    ].filter(Boolean).join("");
    const label = labels.trackLabelTemplate
      ? labels.trackLabelTemplate.replace("{n}", String(index + 1))
      : `Track ${index + 1}`;
    return `<div class="music-audio-item">
      <audio controls preload="metadata" aria-label="${escapeHtml(label)}">
        <source src="${src}" type="${escapeHtml(media.mimeType)}">
      </audio>
      ${facts ? `<div class="record-provenance-facts music-audio-facts">${facts}</div>` : ""}
      ${media.rightsNote ? `<p class="record-rights-note">${escapeHtml(media.rightsNote)}</p>` : ""}
    </div>`;
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  /**
   * Renders (or hides) the audio-player section on a music detail page.
   * `playable` is the already-resolved array from
   * AntiochiaArchiveMusic.resolvePlayableAudio() — an empty array hides the
   * whole section (no player, no "no audio" warning — see brief §23: a music
   * entity without safe audio is not an error state).
   */
  function renderAudioSection(section, playable, labels) {
    if (!section) return;
    if (!playable.length) {
      section.hidden = true;
      section.innerHTML = "";
      return;
    }
    const container = section.querySelector("[data-music-audio-container]") || section;
    container.innerHTML = playable.map((media, i) => audioItemMarkup(media, i, labels)).join("");
    section.hidden = false;
  }

  root.AntiochiaArchiveMusicDom = Object.freeze({
    annotateAudioBadges,
    renderAudioSection,
    formatDuration,
  });
})(typeof window !== "undefined" ? window : globalThis);
