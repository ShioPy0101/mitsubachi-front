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

1. `GET /api/v1/me` could not be confirmed.
2. Exact DriveItem JSON fields could not be confirmed.
3. DriveItem hierarchy cycle validation could not be confirmed.
4. Validation preventing self-parenting could not be confirmed.
5. Ancestors API could not be confirmed.
6. Bulk operations requiring all requested IDs to match could not be confirmed.
7. Empty `drive_item_ids` rejection could not be confirmed.
8. Bulk responses containing requested/matched/processed counts could not be confirmed.
9. Browser-native large ZIP download URL API could not be confirmed.
10. Upload limit discovery API could not be confirmed.
11. Directory deletion descendant behavior could not be confirmed.
12. Directory restore descendant behavior could not be confirmed.
13. File `name` and `extension` display rule could not be confirmed.
14. Suspended user `/me` status could not be confirmed.
15. Logout response body and status could not be confirmed.
16. Admin API exact JSON schema could not be confirmed.
