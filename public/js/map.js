/**
 * Interactive map of Antioch — plots only public entities that carry a real,
 * already-published coordinate pair.
 *
 * Coordinates only exist (per backend/v2/schemas/place.js) on the `place`
 * entity type; `structure` (backend/v2/schemas/structure.js) has no
 * coordinate field in the schema at all today, and no entity of any type
 * currently has a published `coordinates` value (verified against
 * data/v2/entities.json — see the FRONTEND round report). This module never
 * invents, estimates, or derives a coordinate — an entity with no
 * `coordinates.latitude`/`coordinates.longitude` is simply never plotted, so
 * the map is correctly empty today and will start populating itself the
 * moment editorial coordinates are published, with no code changes needed.
 */
(function exposeMapCore(root) {
  "use strict";

  function hasValidCoordinates(entity) {
    const c = entity?.coordinates;
    return !!c
      && typeof c.latitude === "number" && Number.isFinite(c.latitude) && c.latitude >= -90 && c.latitude <= 90
      && typeof c.longitude === "number" && Number.isFinite(c.longitude) && c.longitude >= -180 && c.longitude <= 180;
  }

  /** Every public entity that can legitimately appear on the map today (place, plus structure for forward-compatibility — see file header). */
  const MAPPABLE_TYPES = Object.freeze(["place", "structure"]);

  /** Pure: public entities -> markers. Never fabricates a coordinate. */
  function getMappableEntities(entities) {
    return (entities || []).filter((entity) => (
      MAPPABLE_TYPES.includes(entity.entityType) && hasValidCoordinates(entity)
    ));
  }

  function filterByType(markers, typeFilter) {
    if (!typeFilter || typeFilter === "all") return markers;
    return markers.filter((entity) => entity.entityType === typeFilter);
  }

  /**
   * Resolves a `?entity=<id>` (or legacy `?focus=<slug>`) deep-link target to
   * a mappable entity, or null — never throws, never fabricates a result.
   * Used by both the map deep-link handler and its tests; kept here (rather
   * than duplicated in script.js) so the "is this id actually safe to focus
   * on" rule lives in exactly one place. A non-public entity never reaches
   * this function at all (the caller only ever has the public entity array
   * to search), so an inReview/draft id simply resolves to null like any
   * other unknown id — no separate leak-prevention check is needed here.
   */
  function findDeepLinkEntity(entities, { id, slug } = {}) {
    const mappable = getMappableEntities(entities);
    if (id) {
      const byId = mappable.find((entity) => entity.id === id);
      if (byId) return byId;
    }
    if (slug) {
      const bySlug = mappable.find((entity) => entity.slug === slug);
      if (bySlug) return bySlug;
    }
    return null;
  }

  /** [[south, west], [north, east]] over the given markers, or null if too few to bound. */
  function computeBounds(markers) {
    if (!markers || markers.length === 0) return null;
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const entity of markers) {
      const { latitude, longitude } = entity.coordinates;
      minLat = Math.min(minLat, latitude);
      maxLat = Math.max(maxLat, latitude);
      minLng = Math.min(minLng, longitude);
      maxLng = Math.max(maxLng, longitude);
    }
    return [[minLat, minLng], [maxLat, maxLng]];
  }

  root.AntiochiaArchiveMapCore = Object.freeze({
    MAPPABLE_TYPES,
    hasValidCoordinates,
    getMappableEntities,
    filterByType,
    computeBounds,
    findDeepLinkEntity,
  });
})(typeof window !== "undefined" ? window : globalThis);

/* ==========================================================================
   Leaflet-backed rendering (browser only). Kept separate from the pure core
   above so test/map.test.js can exercise the filtering/bounds logic without
   a DOM or the Leaflet library.
   ========================================================================== */
(function initMapDom(root) {
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

  const MARKER_CLASS_BY_TYPE = Object.freeze({ place: "map-marker-place", structure: "map-marker-structure" });

  /**
   * Creates the Leaflet map instance (OpenStreetMap tiles — no API key, free
   * to self-host per usage policy; attribution is required and always
   * rendered, both by Leaflet's built-in attribution control and the
   * `.map-attribution-note` element the caller places beside the map).
   */
  function createLeafletMap(containerId, { center = [36.2021, 36.1608], zoom = 9 } = {}) {
    if (typeof L === "undefined") throw new Error("Leaflet failed to load.");
    const map = L.map(containerId, { center, zoom, scrollWheelZoom: false, minZoom: 6, maxZoom: 17 });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.zoomControl.setPosition("bottomright");
    map.on("focus", () => map.scrollWheelZoom.enable());
    map.on("blur", () => map.scrollWheelZoom.disable());
    return map;
  }

  function popupHtml(entity, lang, typeLabel, detailLabel) {
    const title = escapeHtml(localized(entity.title, lang, entity.slug));
    const summary = escapeHtml(localized(entity.summary, lang, ""));
    const href = detailHref(entity);
    const imagePath = entity.media?.path ? escapeHtml(entity.media.path) : "";
    return `
      <div class="map-popup">
        ${imagePath ? `<img class="map-popup-image" src="${imagePath}" alt="" loading="lazy">` : ""}
        <span class="map-popup-type">${escapeHtml(typeLabel)}</span>
        <h3 class="map-popup-title">${title}</h3>
        ${summary ? `<p class="map-popup-summary">${summary}</p>` : ""}
        ${href ? `<a class="map-popup-link" href="${escapeHtml(href)}">${escapeHtml(detailLabel)} →</a>` : ""}
      </div>`;
  }

  /**
   * Clears prior markers, adds one per entity, returns the created layer
   * group. `labels` = { typeLabels: {place, structure}, detailLabel }, all
   * pre-resolved by the caller (see file header: this module never resolves
   * translations itself).
   */
  function renderMarkers(map, entities, lang, labels) {
    const group = L.layerGroup().addTo(map);
    // Keyed lookup alongside the layer group so a deep link (?entity=<id>)
    // can find and open its own marker's popup without re-querying Leaflet's
    // internal layer storage — see focusMapOnQueryParam() in script.js.
    const markersByEntityId = new Map();
    entities.forEach((entity) => {
      const icon = L.divIcon({
        className: `map-marker ${MARKER_CLASS_BY_TYPE[entity.entityType] || "map-marker-place"}`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -12],
      });
      const marker = L.marker([entity.coordinates.latitude, entity.coordinates.longitude], {
        icon,
        alt: localized(entity.title, lang, entity.slug),
      });
      const typeLabel = labels?.typeLabels?.[entity.entityType] || entity.entityType;
      marker.bindPopup(popupHtml(entity, lang, typeLabel, labels?.detailLabel || ""));
      marker.addTo(group);
      markersByEntityId.set(entity.id, marker);
    });
    group.markersByEntityId = markersByEntityId;
    return group;
  }

  function fitToMarkers(map, entities) {
    const bounds = root.AntiochiaArchiveMapCore.computeBounds(entities);
    if (!bounds) return;
    if (entities.length === 1) {
      map.setView([entities[0].coordinates.latitude, entities[0].coordinates.longitude], 14);
    } else {
      map.fitBounds(bounds, { padding: [32, 32] });
    }
  }

  /** Accessible text alternative to the visual map — always rendered, list stays in sync with the current filter. */
  function renderMapList(container, entities, lang, labels) {
    if (!container) return;
    if (!entities.length) {
      container.innerHTML = `<p class="map-list-empty">${escapeHtml(labels?.emptyLabel || "")}</p>`;
      return;
    }
    container.innerHTML = `<ul class="map-list">${entities.map((entity) => {
      const title = escapeHtml(localized(entity.title, lang, entity.slug));
      const href = detailHref(entity);
      const typeLabel = escapeHtml(labels?.typeLabels?.[entity.entityType] || entity.entityType);
      const inner = `<span class="map-list-type">${typeLabel}</span><span class="map-list-title">${title}</span>`;
      return `<li>${href ? `<a href="${escapeHtml(href)}">${inner}</a>` : `<span>${inner}</span>`}</li>`;
    }).join("")}</ul>`;
  }

  root.AntiochiaArchiveMapDom = Object.freeze({
    createLeafletMap,
    renderMarkers,
    fitToMarkers,
    renderMapList,
  });
})(typeof window !== "undefined" ? window : globalThis);
