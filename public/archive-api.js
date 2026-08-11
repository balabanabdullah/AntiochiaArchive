/**
 * Strict browser client for the public archive API.
 * The backend datastore is intentionally opaque to the frontend.
 */
(function exposeArchiveApi(root) {
  "use strict";

  const ARCHIVE_CATEGORIES = Object.freeze([
    "history",
    "stories",
    "structures",
    "beliefs",
    "music",
    "gallery",
  ]);

  function normalizeArchiveResponse(payload) {
    if (!payload || typeof payload !== "object" || payload.success !== true) {
      throw new TypeError("Archive API returned an invalid response.");
    }

    const archive = payload.data;
    if (!archive || typeof archive !== "object" || Array.isArray(archive)) {
      throw new TypeError("Archive API returned an invalid data object.");
    }

    for (const category of ARCHIVE_CATEGORIES) {
      if (!Array.isArray(archive[category])) {
        throw new TypeError(`Archive API response is missing the '${category}' category.`);
      }
    }

    return archive;
  }

  async function fetchArchive(fetchImplementation = root.fetch) {
    if (typeof fetchImplementation !== "function") {
      throw new TypeError("Archive API fetch is unavailable.");
    }

    const response = await fetchImplementation("/api/archive", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response?.ok) {
      throw new Error(`Archive API request failed (${response?.status || "network error"}).`);
    }

    return normalizeArchiveResponse(await response.json());
  }

  root.AntiochiaArchiveAPI = Object.freeze({
    ARCHIVE_CATEGORIES,
    fetchArchive,
    normalizeArchiveResponse,
  });
})(typeof window !== "undefined" ? window : globalThis);
