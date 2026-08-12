// Cursor-oriented pagination contract for v2 list endpoints. Offset-based
// pagination (page numbers) is deliberately not the long-term design.

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

/**
 * Validates request-shape only. A store with no data (EmptyV2Store) may
 * ignore `cursor` semantically, but the request itself must still be a
 * well-formed pagination request before it reaches the store.
 */
export function validatePagination(query = {}) {
  let limit = DEFAULT_PAGE_LIMIT;

  if (query.limit != null && query.limit !== "") {
    const parsed = Number(query.limit);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return { valid: false, error: "limit must be a positive integer." };
    }
    if (parsed > MAX_PAGE_LIMIT) {
      return { valid: false, error: `limit must not exceed ${MAX_PAGE_LIMIT}.` };
    }
    limit = parsed;
  }

  let cursor = null;
  if (query.cursor != null && query.cursor !== "") {
    if (typeof query.cursor !== "string" || !query.cursor.trim()) {
      return { valid: false, error: "cursor must be a non-empty string." };
    }
    cursor = query.cursor.trim();
  }

  return { valid: true, limit, cursor };
}
