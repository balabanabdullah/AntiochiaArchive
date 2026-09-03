// Schema for a first-class CMS Page (Section 15 of the round brief) — a
// website page a non-developer creates from Admin, distinct from a cultural
// entity: it has no entityType from constants/vocabularies.js's ENTITY_TYPES
// and lives in its own `pages` SQLite table (see
// backend/db/repositories/pageRepository.js), not the `entities` table.
//
// `content` is intentionally a per-language plain-text/markdown string, not
// HTML — Section 15 explicitly forbids arbitrary executable HTML from a
// non-developer input. backend/pages/pageRenderer.js is responsible for
// escaping it and applying a minimal, safe formatting pass (paragraphs from
// blank lines) rather than trusting any HTML tags a value might contain.

import { PUBLICATION_STATUS, LANGUAGES } from "../constants/vocabularies.js";
import {
  isObject, isNonEmptyString, validateEnum, validateMultilingualText, validateNonEmptyMultilingualText, validateIdArray,
} from "./shared.js";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validatePage(page) {
  if (!isObject(page)) return { valid: false, error: "page must be an object." };

  if (!isNonEmptyString(page.id)) {
    return { valid: false, error: "page.id is required and must be a non-empty string." };
  }
  if (!isNonEmptyString(page.slug) || !SLUG_PATTERN.test(page.slug)) {
    return { valid: false, error: "page.slug must be a lowercase, hyphenated identifier." };
  }
  // Pages never collide with the site's own reserved paths — checked here
  // (not just at the route layer) so an imported/scripted page can never
  // accidentally shadow a real system route either.
  const RESERVED_SLUGS = new Set(["admin", "api", "assets", "pages", "archive", "archive-v2", "images", "sayfa"]);
  if (RESERVED_SLUGS.has(page.slug)) {
    return { valid: false, error: `page.slug '${page.slug}' is reserved and cannot be used for a CMS page.` };
  }

  const statusError = validateEnum(page.status, "page.status", PUBLICATION_STATUS, { required: true });
  if (statusError) return { valid: false, error: statusError };

  const titleError = validateNonEmptyMultilingualText(page.title, "page.title");
  if (titleError) return { valid: false, error: titleError };

  for (const [field, required] of [["summary", false], ["content", false], ["seoTitle", false], ["seoDescription", false], ["navigationLabel", false]]) {
    const error = required
      ? validateNonEmptyMultilingualText(page[field], `page.${field}`)
      : validateMultilingualText(page[field], `page.${field}`);
    if (error) return { valid: false, error };
  }

  // Section 10: lets a page reference uploaded media (e.g. a hero image) —
  // referential integrity (does the id exist, is it actually a media
  // entity) is the write-service's job (backend/admin/pageService.js),
  // exactly like relationship endpoints already validate their own ids;
  // this schema only checks shape.
  const mediaIdsError = validateIdArray(page.mediaIds, "page.mediaIds");
  if (mediaIdsError) return { valid: false, error: mediaIdsError };

  if (page.showInNavigation != null && typeof page.showInNavigation !== "boolean") {
    return { valid: false, error: "page.showInNavigation must be a boolean." };
  }
  if (page.navigationGroup != null && typeof page.navigationGroup !== "string") {
    return { valid: false, error: "page.navigationGroup must be a string." };
  }
  if (page.navigationOrder != null && (typeof page.navigationOrder !== "number" || !Number.isFinite(page.navigationOrder))) {
    return { valid: false, error: "page.navigationOrder must be a number." };
  }

  return { valid: true };
}

export function pageHasContentForLanguage(page, language) {
  return LANGUAGES.includes(language) && Boolean(page.content?.[language]?.trim());
}
