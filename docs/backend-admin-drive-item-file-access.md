# Backend implementation request: admin drive item file access

## Objective

Implement system administrator access to actual uploaded files from the Mitsubachi admin UI.

The frontend now calls admin-specific file delivery URLs:

- `GET /api/v1/admin/drive_items/:id/preview`
- `GET /api/v1/admin/drive_items/:id/download`
- `GET /api/v1/admin/drive_items/:id/stream`
- `DELETE /api/v1/admin/drive_items/:id/purge`

These endpoints do not currently exist in Rails. Do not make the frontend call the normal user Drive endpoints for cross-organization admin access.

## Current Rails behavior observed

Normal Drive delivery exists here:

- `GET /api/v1/drive_items/:id/preview`
- `GET /api/v1/drive_items/:id/download`
- `GET /api/v1/drive_items/:id/stream`

Those endpoints are scoped to:

```ruby
current_user.organization.drive_items.active.find_by(id: params[:id])
```

That is correct for normal users, but it means `system_admin` cannot inspect files belonging to other organizations through the current delivery endpoints.

Admin drive item detail currently returns:

- `id`
- `organization_id`
- `organization_name`
- `owner_user_id`
- `owner_email`
- `parent_id`
- `name`
- `item_type`
- `extension`
- `content_type`
- `file_size`
- `deleted_at`
- `created_at`
- `updated_at`

The frontend also expects these optional fields when backend support is added:

- `upload_ip_address`
- `uploaded_at`

## Required routes

Add member routes under `api/v1/admin/drive_items`:

```ruby
namespace :api do
  namespace :v1 do
    namespace :admin do
      resources :drive_items, only: %i[index show destroy] do
        member do
          get :preview
          get :download
          get :stream
          delete :purge
          patch :restore
        end
      end
    end
  end
end
```

## Authorization

Use the existing admin authentication and role checks.

Required behavior:

- `system_admin` can preview/download/stream active files from any organization.
- `organization_admin` can preview/download/stream active files only within their own organization, if product policy allows that. If not allowed, return 403.
- `member` cannot access admin delivery endpoints.
- Unauthenticated requests return 401.
- Deleted drive items return 404 or 422 consistently with existing admin file operations. Prefer 404 for delivery.
- Physical purge is `system_admin` only.
- Physical purge must only be allowed for already soft-deleted drive items.
- Direct URL access must be authorized by Rails, not only hidden in the UI.

Do not weaken Rails host/CORS/security settings.

## Controller behavior

Implement these actions in `Api::V1::Admin::DriveItemsController`:

```ruby
def preview
  deliver_admin_drive_item(:preview)
end

def download
  deliver_admin_drive_item(:download)
end

def stream
  deliver_admin_drive_item(:stream)
end

def purge
  purge_admin_drive_item
end
```

The lookup must use admin scope, not normal user organization scope.

Suggested logic:

- find active file drive item with `find_scoped_drive_item` or a new `find_deliverable_drive_item`
- reject directories
- call existing `DriveItems::DeliveryService`
- set returned headers
- return `head result.status`

If `DriveItems::DeliveryService` itself enforces normal organization ownership, update it carefully so admin delivery can pass an explicit admin mode or already-authorized drive item. Do not bypass storage key validation or X-Accel-Redirect protections.

## Physical purge behavior

Implement `DELETE /api/v1/admin/drive_items/:id/purge` as an irreversible physical deletion endpoint.

Safety requirements:

- Only `system_admin` may call it.
- The target must be within the admin scope.
- The target must already be soft-deleted (`deleted_at` present).
- Active files must not be physically deleted directly. Return 422 with a safe message such as `先にゴミ箱へ移動してください`.
- Directories require careful handling:
  - either reject non-empty directories with 422, or
  - purge a directory tree only if the implementation can atomically delete all descendants and files safely.
- File storage deletion and database deletion must be transactionally safe where possible.
- Validate `storage_key` using the existing `DriveItem.valid_storage_key?` before deleting physical files.
- Never delete paths built from user input.
- Do not expose internal storage paths in API responses or logs.

Recommended response:

```json
{
  "message": "ファイルを完全削除しました"
}
```

Recommended implementation shape:

- create a service object such as `Admin::DriveItems::PurgeService`
- lock the drive item row
- verify `deleted_at`
- delete the physical file if `item_type == "file"` and storage key is valid
- destroy or delete the `DriveItem` record after file deletion succeeds
- keep or nullify dependent audit/access logs according to existing foreign keys
- return a clear failure result without partial silent success

## Audit logging

Admin delivery should be auditable.

Record admin audit actions:

- `drive_item.preview`
- `drive_item.download`
- `drive_item.stream`
- `drive_item.purge`

Include:

- actor user
- organization
- target drive item
- IP address
- user agent
- request id
- result/outcome where existing audit infrastructure supports it

Avoid logging storage paths, signed internal paths, cookies, authorization headers, CSRF tokens, session identifiers, or raw file contents.

## Upload metadata

The admin drive item detail screen should show:

- uploaded by user
- upload source IP
- file size
- uploaded at
- updated at
- deleted at

`owner_user_id` and `owner_email` already cover the uploader identity.

Add persistent upload source IP support if it does not exist yet.

Recommended schema addition:

```ruby
add_column :drive_items, :upload_ip_address, :string
```

Set it on file and directory creation from `request.remote_ip`.

Return the following fields from admin `drive_item_json`:

```ruby
upload_ip_address: drive_item.upload_ip_address,
uploaded_at: drive_item.created_at,
```

If adding a DB column is not desired, an alternative is to create a `DriveItemAccessLog` record for upload/create and derive latest upload IP from that log. If using logs, keep the response field name `upload_ip_address` so the frontend contract remains stable.

## OpenAPI update

Update the Rails OpenAPI contract with:

- `GET /api/v1/admin/drive_items/{id}/preview`
- `GET /api/v1/admin/drive_items/{id}/download`
- `GET /api/v1/admin/drive_items/{id}/stream`
- `DELETE /api/v1/admin/drive_items/{id}/purge`
- `upload_ip_address` on the admin drive item response
- `uploaded_at` on the admin drive item response

Delivery response schemas can reuse the existing `AccelRedirect` response.

## Tests

Add request specs for:

- `system_admin` can preview a file from another organization.
- `system_admin` can download a file from another organization.
- `system_admin` can stream a file from another organization.
- `organization_admin` cannot access another organization file.
- `member` cannot access admin delivery.
- unauthenticated request returns 401.
- directory delivery is rejected.
- deleted file delivery is rejected.
- delivery records an admin audit log.
- `system_admin` can purge an already soft-deleted file.
- `system_admin` cannot purge an active file without soft deletion first.
- `organization_admin` cannot purge.
- `member` cannot purge.
- purge deletes the physical stored file.
- purge does not delete arbitrary paths when storage_key is invalid.
- purge records an admin audit log with action `drive_item.purge`.
- admin drive item detail includes `upload_ip_address`, `uploaded_at`, `file_size`, `owner_user_id`, `owner_email`, `created_at`, `updated_at`, `deleted_at`.

Also run the existing drive delivery tests to ensure normal user endpoints remain organization-scoped.

## Frontend contract already implemented

The frontend branch `feat/admin-file-access-controls` uses:

- `adminDriveItemPreviewUrl(id)` -> `/api/v1/admin/drive_items/:id/preview`
- `adminDriveItemDownloadUrl(id)` -> `/api/v1/admin/drive_items/:id/download`
- `adminDriveItemStreamUrl(id)` -> `/api/v1/admin/drive_items/:id/stream`
- `purgeAdminDriveItem(id)` -> `DELETE /api/v1/admin/drive_items/:id/purge`

The admin file detail UI displays:

- uploader: `owner_email` or `owner_user_id`
- upload IP: `upload_ip_address`
- size: `file_size`
- uploaded date: `uploaded_at` or `created_at`
- updated date: `updated_at`
- deleted date: `deleted_at`
- irreversible purge button for `system_admin` only, shown only when `deleted_at` is present
