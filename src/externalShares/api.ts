import { z } from "zod";

import { apiFetch, apiRequest, apiUrl, getCsrfToken } from "../api/client";
import { parseApiError } from "../api/errors";

const publicShareItemSchema = z.object({
  id: z.number(),
  parent_id: z.number().nullable().optional(),
  name: z.string(),
  item_type: z.enum(["file", "directory"]),
  extension: z.string().nullable().optional(),
  content_type: z.string().nullable().optional(),
  file_size: z.number().nullable().optional(),
});

const externalShareSchema = z.object({
  id: z.number(),
  name: z.string(),
  expires_at: z.string().nullable().optional(),
  revoked_at: z.string().nullable().optional(),
  folder_share_mode: z.enum(["snapshot", "dynamic"]),
  allow_download: z.boolean(),
  allow_bulk_download: z.boolean(),
  password_required: z.boolean().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  share_url: z.string().optional(),
  generated_password: z.string().optional(),
});

const publicShareSchema = z.union([
  z.object({
    id: z.number(),
    name: z.string(),
    expires_at: z.string().nullable().optional(),
    allow_download: z.boolean(),
    allow_bulk_download: z.boolean(),
    password_required: z.boolean().optional(),
    items: z.array(publicShareItemSchema),
  }),
  z.object({ password_required: z.literal(true) }),
]);

export type ExternalShare = z.infer<typeof externalShareSchema>;
export type PublicShare = z.infer<typeof publicShareSchema>;
export type PublicShareItem = z.infer<typeof publicShareItemSchema>;

export type CreateExternalShareInput = {
  name: string;
  driveItemIds: number[];
  expiresAt: string | null;
  allowDownload: boolean;
  allowBulkDownload: boolean;
  passwordProtected: boolean;
  folderShareMode: "snapshot" | "dynamic";
};

export function createExternalShare(input: CreateExternalShareInput) {
  return apiRequest<unknown>("/api/v1/external_shares", {
    method: "POST",
    body: {
      external_share: {
        name: input.name,
        drive_item_ids: input.driveItemIds,
        expires_at: input.expiresAt,
        allow_download: input.allowDownload,
        allow_bulk_download: input.allowBulkDownload,
        password_protected: input.passwordProtected,
        folder_share_mode: input.folderShareMode,
      },
    },
  }).then((body) => externalShareSchema.parse(body));
}

export function regenerateExternalSharePassword(id: number) {
  return apiRequest<unknown>(`/api/v1/external_shares/${id}/regenerate_password`, {
    method: "POST",
  }).then((body) => externalShareSchema.parse(body));
}

export function fetchPublicShare(token: string): Promise<PublicShare> {
  return apiRequest<unknown>(`/api/v1/public/shares/${encodeURIComponent(token)}`).then(
    (body) => publicShareSchema.parse(body),
  );
}

export function unlockPublicShare(token: string, password: string) {
  return apiRequest<{ unlocked: boolean }>(
    `/api/v1/public/shares/${encodeURIComponent(token)}/unlock`,
    { method: "POST", body: { password } },
  );
}

export function publicPreviewUrl(token: string, id: number) {
  return apiUrl(
    `/api/v1/public/shares/${encodeURIComponent(token)}/items/${id}/preview`,
  );
}

export function publicDownloadUrl(token: string, id: number) {
  return apiUrl(
    `/api/v1/public/shares/${encodeURIComponent(token)}/items/${id}/download`,
  );
}

export async function bulkDownloadPublicShare(token: string) {
  const path = `/api/v1/public/shares/${encodeURIComponent(token)}/bulk_download`;
  const response = await apiFetch(path, {
    method: "POST",
    headers: {
      Accept: "application/zip, application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": await getCsrfToken(),
    },
  });

  if (
    !response.ok ||
    response.headers.get("Content-Type")?.includes("application/json")
  ) {
    const body: unknown = await response.json().catch(() => null);
    throw parseApiError(response.status, body, apiUrl(path));
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "external-share.zip";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
