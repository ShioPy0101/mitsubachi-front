# API Contract Findings

## Checked in this repository

- `AGENTS.md`: present and followed.
- `AGENT.md`: not present.
- `CONTRIBUTING.md`: not present.
- `config/routes.rb`: not present.
- `app/controllers/api/v1/drive_items_controller.rb`: not present.
- authentication controllers: not present.
- admin API controllers: not present.
- `DriveItem` model: not present.
- serializer / JSON response builders: not present.
- request/controller tests: not present.

## Checked from provided API Overview

- `GET /api/v1/csrf_token`: confirmed.
- `POST /api/v1/auth/create`: confirmed.
- `POST /api/v1/auth/login`: confirmed.
- `POST /api/v1/auth/verify`: confirmed.
- `DELETE /api/v1/logout`: confirmed.
- `GET /api/v1/drive_items`: confirmed.
- `POST /api/v1/drive_items`: confirmed.
- `GET /api/v1/drive_items/:id`: confirmed.
- `PATCH /api/v1/drive_items/:id`: confirmed.
- `PUT /api/v1/drive_items/:id`: confirmed.
- `DELETE /api/v1/drive_items/:id`: confirmed.
- `POST /api/v1/drive_items/:id/restore`: confirmed.
- `GET /api/v1/drive_items/trash`: confirmed.
- `POST /api/v1/drive_items/bulk_move`: confirmed.
- `POST /api/v1/drive_items/bulk_delete`: confirmed.
- `POST /api/v1/drive_items/bulk_restore`: confirmed.
- `POST /api/v1/drive_items/bulk_download`: confirmed.
- `GET /api/v1/drive_items/:id/preview`: confirmed.
- `GET /api/v1/drive_items/:id/download`: confirmed.
- `GET /api/v1/drive_items/:id/stream`: confirmed.
- `/api/v1/admin/*` dashboard, organization, user, drive item, and audit log APIs: confirmed at overview level.
- `PATCH /api/v1/admin/users/:id/suspend`: confirmed.
- `PATCH /api/v1/admin/users/:id/unsuspend`: confirmed.
- Health check endpoints under `/api/health`: confirmed.

## Contract used by the frontend

- API URLs are relative and use `credentials: "same-origin"`.
- State-changing requests fetch `GET /api/v1/csrf_token` and send `X-CSRF-Token`.
- CSRF token is held in memory only.
- Drive item list and trash endpoints are treated as direct arrays, not `{ data: [] }`.
- Admin list endpoints are treated as `{ data, meta }`.
- Drive item fields are accepted in snake_case and kept snake_case at the API boundary.
- Internal storage fields such as `storage_key`, `blob_path`, and `file_hash` are not rendered.
- Single download uses browser-native anchor navigation, not `fetch().blob()`.
- Preview and stream use same-origin API URLs.
- Bulk operation success messages do not claim all requested IDs were processed.

## Backend API Gaps

1. `GET /api/v1/me` is still not described in the API overview.
2. Exact DriveItem JSON response fields are not fully described beyond the table columns.
3. DriveItem hierarchy cycle validation is not described.
4. Validation preventing self-parenting is not described.
5. Ancestors API is not described.
6. Bulk operations requiring all requested IDs to match is not described.
7. Empty `drive_item_ids` rejection is not described.
8. Bulk responses containing requested/matched/processed counts are not described.
9. Browser-native large ZIP download URL API is not described.
10. Upload limit discovery API is not described.
11. Directory deletion descendant behavior is not described.
12. Directory restore descendant behavior is not described.
13. Exact file `name` and `extension` display rule is not described.
14. Suspended user `/me` status is not described because `/me` is not described.
15. Admin API exact detail JSON schemas are not fully described.
16. `POST /api/v1/admin/organizations` is defined by the OpenAPI contract for system_admin organization creation.
