# Administrator JSON exports

All backup endpoints are read-only and require the existing `ADMIN_TOKEN` bearer
authentication. The token must be sent in the `Authorization` header and is
never accepted in a query string.

- `GET /api/admin/export/archive` exports all six archive categories and every
  stored archive item field.
- `GET /api/admin/export/submissions` exports submission IDs, names, email
  addresses, messages, and ISO-formatted creation times.
- `GET /api/admin/export/full` exports version metadata, the archive snapshot,
  and the submissions snapshot in one file.

Responses are indented UTF-8 JSON downloads with private, no-store caching.
Submission and full backups contain private visitor information and must be
stored securely with access limited to authorized administrators.

Restore/import is intentionally not implemented. Importing backup data can
overwrite production records and requires a separate validation, confirmation,
and rollback design.
