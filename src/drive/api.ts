import { apiFetch, apiRequest, apiUrl, getCsrfToken } from "../api/client";
import { parseApiError } from "../api/errors";
import {
  driveItemSchema,
  driveItemsSchema,
  driveSearchResponseSchema,
  type DriveItem,
} from "../api/schemas";

export const driveKeys = {
  all: ["drive-items"] as const,
  list: (parentId: number | null) => [...driveKeys.all, "list", { parentId }] as const,
  detail: (id: number) => [...driveKeys.all, "detail", id] as const,
  trash: () => [...driveKeys.all, "trash"] as const,
};

export async function fetchDriveItems(parentId: number | null): Promise<DriveItem[]> {
  const query =
    parentId === null ? "" : `?parent_id=${encodeURIComponent(String(parentId))}`;
  return driveItemsSchema.parse(
    await apiRequest<unknown>(`/api/v1/drive_items${query}`),
  );
}

export async function searchDriveItems(input: {
  query: string;
  parentId: number | null;
  scope: "current" | "organization";
  page?: number;
}) {
  const params = new URLSearchParams({
    q: input.query,
    scope: input.scope,
    page: String(input.page ?? 1),
    per_page: "50",
  });
  if (input.scope === "current" && input.parentId !== null) {
    params.set("parent_id", String(input.parentId));
  }
  return driveSearchResponseSchema.parse(
    await apiRequest<unknown>(`/api/v1/drive_items/search?${params.toString()}`),
  );
}

export async function fetchDriveItem(id: number): Promise<DriveItem> {
  return driveItemSchema.parse(await apiRequest<unknown>(`/api/v1/drive_items/${id}`));
}

export async function fetchTrash(): Promise<DriveItem[]> {
  return driveItemsSchema.parse(await apiRequest<unknown>("/api/v1/drive_items/trash"));
}

export function createDirectory(input: { name: string; parentId: number | null }) {
  return apiRequest<DriveItem>("/api/v1/drive_items", {
    method: "POST",
    body: {
      name: input.name,
      item_type: "directory",
      parent_id: input.parentId,
    },
  });
}

export type UploadProgress = {
  loaded: number;
  total?: number;
  percent?: number;
};

export type RestoreConflictResolution =
  "rename" | "purge_existing" | "select_destination" | "restore_to_root" | "skip";

export type RestorePreviewRequestItem = {
  itemId: number;
  resolution: RestoreConflictResolution;
  destinationParentId?: number | null;
  expectedName?: string | null;
  expectedExistingItemId?: number | null;
};

export type RestorePreviewItem = {
  itemId: number;
  itemType: "file" | "directory";
  restoreTargetId: number;
  conflictType:
    "none" | "name_conflict" | "missing_parent" | "name_conflict_and_missing_parent";
  parentExists: boolean;
  existingItemId: number | null;
  existingItemType?: "file" | "directory" | null;
  recommendedResolution: RestoreConflictResolution;
  autoRenamedName?: string | null;
  childrenCount: number;
  descendantConflictCount: number;
  before: {
    name: string;
    parentId: number | null;
    parentPath: string | null;
    state: string;
    restorable: boolean;
    reason: string | null;
  };
  after: {
    name: string | null;
    parentId: number | null;
    parentPath: string | null;
    restorable: boolean;
    resolution: RestoreConflictResolution;
    existingItemWillBePurged: boolean;
    existingItem?: {
      id: number;
      itemType: "file" | "directory";
      name: string;
      parentPath: string | null;
      purgeNote: string;
    } | null;
    state: string;
    impact: string;
  };
};

export type RestorePreviewResponse = {
  items: RestorePreviewItem[];
  summary: {
    totalCount: number;
    conflictCount: number;
    restorableCount: number;
    skippedCount: number;
    renameCount: number;
    purgeExistingCount: number;
  };
};

export function uploadFile(input: {
  file: File;
  name: string;
  parentId: number | null;
  allowDuplicateContent?: boolean;
  allowTrashDuplicate?: boolean;
  replaceTrashedDriveItemId?: number;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
}) {
  if (!input.onProgress) {
    const form = new FormData();
    form.append("name", input.name);
    form.append("item_type", "file");
    if (input.parentId !== null) form.append("parent_id", String(input.parentId));
    if (input.allowDuplicateContent) form.append("allow_duplicate_content", "true");
    if (input.allowTrashDuplicate) form.append("allow_trash_duplicate", "true");
    if (input.replaceTrashedDriveItemId !== undefined) {
      form.append(
        "replace_trashed_drive_item_id",
        String(input.replaceTrashedDriveItemId),
      );
    }
    form.append("file", input.file);
    return apiRequest<DriveItem>("/api/v1/drive_items", {
      method: "POST",
      body: form,
      signal: input.signal,
    });
  }

  return uploadFileWithProgress({ ...input, onProgress: input.onProgress });
}

async function uploadFileWithProgress(input: {
  file: File;
  name: string;
  parentId: number | null;
  allowDuplicateContent?: boolean;
  allowTrashDuplicate?: boolean;
  replaceTrashedDriveItemId?: number;
  signal?: AbortSignal;
  onProgress: (progress: UploadProgress) => void;
}): Promise<DriveItem> {
  const form = new FormData();
  form.append("name", input.name);
  form.append("item_type", "file");
  if (input.parentId !== null) form.append("parent_id", String(input.parentId));
  if (input.allowDuplicateContent) form.append("allow_duplicate_content", "true");
  if (input.allowTrashDuplicate) form.append("allow_trash_duplicate", "true");
  if (input.replaceTrashedDriveItemId !== undefined) {
    form.append(
      "replace_trashed_drive_item_id",
      String(input.replaceTrashedDriveItemId),
    );
  }
  form.append("file", input.file);

  const csrfToken = await getCsrfToken();
  const url = apiUrl("/api/v1/drive_items");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    input.signal?.addEventListener("abort", abort, { once: true });

    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : undefined;
      input.onProgress({
        loaded: event.loaded,
        total,
        percent: total ? Math.round((event.loaded / total) * 100) : undefined,
      });
    };
    xhr.onload = () => {
      input.signal?.removeEventListener("abort", abort);
      const body = parseJson(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(driveItemSchema.parse(body));
        return;
      }
      reject(parseApiError(xhr.status, body, url));
    };
    xhr.onerror = () => {
      input.signal?.removeEventListener("abort", abort);
      reject(new Error("アップロードに失敗しました。"));
    };
    xhr.onabort = () => {
      input.signal?.removeEventListener("abort", abort);
      reject(new DOMException("アップロードをキャンセルしました。", "AbortError"));
    };
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("X-CSRF-Token", csrfToken);
    xhr.send(form);
  });
}

export function renameDriveItem(input: { id: number; name: string }) {
  return apiRequest<DriveItem>(`/api/v1/drive_items/${input.id}`, {
    method: "PATCH",
    body: { name: input.name },
  });
}

export function moveDriveItem(input: { id: number; parentId: number | null }) {
  return apiRequest<{ data: DriveItem; request_id?: string }>(
    `/api/v1/drive_items/${input.id}/move`,
    {
      method: "PATCH",
      body: { parent_id: input.parentId },
    },
  );
}

export function deleteDriveItem(id: number) {
  return apiRequest<{ message?: string }>(`/api/v1/drive_items/${id}`, {
    method: "DELETE",
  });
}

export function purgeDriveItem(id: number) {
  return apiRequest<{ message?: string }>(`/api/v1/drive_items/${id}/purge`, {
    method: "DELETE",
  });
}

export function restoreDriveItem(id: number, items?: RestorePreviewRequestItem[]) {
  return apiRequest<DriveItem | { message?: string; restored_item_ids?: number[] }>(
    `/api/v1/drive_items/${id}/restore`,
    {
      method: "POST",
      body: items ? { items: restoreRequestItemsBody(items) } : undefined,
    },
  );
}

export function restorePreview(id: number, items?: RestorePreviewRequestItem[]) {
  return apiRequest<unknown>(`/api/v1/drive_items/${id}/restore_preview`, {
    method: "POST",
    body: items ? { items: restoreRequestItemsBody(items) } : undefined,
  }).then(normalizeRestorePreview);
}

export function bulkDelete(ids: number[]) {
  return apiRequest<{ message?: string }>("/api/v1/drive_items/bulk_delete", {
    method: "POST",
    body: { drive_item_ids: ids },
  });
}

export function bulkRestore(ids: number[], items?: RestorePreviewRequestItem[]) {
  return apiRequest<{ message?: string }>("/api/v1/drive_items/bulk_restore", {
    method: "POST",
    body: {
      drive_item_ids: ids,
      ...(items ? { items: restoreRequestItemsBody(items) } : {}),
    },
  });
}

export function bulkRestorePreview(ids: number[], items?: RestorePreviewRequestItem[]) {
  return apiRequest<unknown>("/api/v1/drive_items/bulk_restore_preview", {
    method: "POST",
    body: {
      drive_item_ids: ids,
      ...(items ? { items: restoreRequestItemsBody(items) } : {}),
    },
  }).then(normalizeRestorePreview);
}

export function bulkMove(ids: number[], parentId: number | null) {
  return apiRequest<{ message?: string }>("/api/v1/drive_items/bulk_move", {
    method: "POST",
    body: { drive_item_ids: ids, parent_id: parentId },
  });
}

export async function bulkDownload(ids: number[], signal?: AbortSignal) {
  const response = await apiFetch("/api/v1/drive_items/bulk_download", {
    method: "POST",
    headers: {
      Accept: "application/zip, application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": await getCsrfToken(),
    },
    body: JSON.stringify({ drive_item_ids: ids }),
    signal,
  });

  if (
    !response.ok ||
    response.headers.get("Content-Type")?.includes("application/json")
  ) {
    const body: unknown = await response.json().catch(() => null);
    throw parseApiError(
      response.status,
      body,
      apiUrl("/api/v1/drive_items/bulk_download"),
    );
  }

  if (!response.headers.get("Content-Type")?.includes("application/zip")) {
    throw new Error("サーバーの応答形式がZIPではありません。");
  }

  /*
   * 現行APIはPOSTレスポンスでZIP本体を返すため、暫定的にBlobへ展開する。
   * 大容量ZIPではブラウザメモリを消費するので、GET用download_url方式が必要。
   */
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = contentDispositionFilename(
    response.headers.get("Content-Disposition"),
  );
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadDriveItem(id: number) {
  const anchor = document.createElement("a");
  anchor.href = apiUrl(`/api/v1/drive_items/${id}/download`);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function previewUrl(id: number) {
  return apiUrl(`/api/v1/drive_items/${id}/preview`);
}

export function streamUrl(id: number) {
  return apiUrl(`/api/v1/drive_items/${id}/stream`);
}

function contentDispositionFilename(value: string | null) {
  const fallback = "mitsubachi-download.zip";
  if (!value) return fallback;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(value);
  if (!match?.[1]) return fallback;
  return decodeURIComponent(match[1]).replace(/[\\/:*?"<>|]/g, "_");
}

function restoreRequestItemsBody(items: RestorePreviewRequestItem[]) {
  return items.map((item) => ({
    item_id: item.itemId,
    resolution: item.resolution,
    destination_parent_id: item.destinationParentId,
    expected_name: item.expectedName,
    expected_existing_item_id: item.expectedExistingItemId,
  }));
}

export function normalizeRestorePreview(value: unknown): RestorePreviewResponse {
  const body = recordFrom(value);
  const items = Array.isArray(body.items) ? body.items.map(normalizeRestoreItem) : [];
  const summary = recordFrom(body.summary);
  return {
    items,
    summary: {
      totalCount: numberFrom(summary.total_count ?? summary.totalCount),
      conflictCount: numberFrom(summary.conflict_count ?? summary.conflictCount),
      restorableCount: numberFrom(summary.restorable_count ?? summary.restorableCount),
      skippedCount: numberFrom(summary.skipped_count ?? summary.skippedCount),
      renameCount: numberFrom(summary.rename_count ?? summary.renameCount),
      purgeExistingCount: numberFrom(
        summary.purge_existing_count ?? summary.purgeExistingCount,
      ),
    },
  };
}

function normalizeRestoreItem(value: unknown): RestorePreviewItem {
  const item = recordFrom(value);
  const before = recordFrom(item.before);
  const after = recordFrom(item.after);
  const existingItem = recordFrom(after.existing_item ?? after.existingItem);
  return {
    itemId: numberFrom(item.item_id ?? item.itemId),
    itemType: (item.item_type ?? item.itemType) === "directory" ? "directory" : "file",
    restoreTargetId: numberFrom(item.restore_target_id ?? item.restoreTargetId),
    conflictType: restoreConflictTypeFrom(item.conflict_type ?? item.conflictType),
    parentExists: Boolean(item.parent_exists ?? item.parentExists),
    existingItemId:
      (item.existing_item_id ?? item.existingItemId) === null
        ? null
        : numberFrom(item.existing_item_id ?? item.existingItemId),
    existingItemType:
      (item.existing_item_type ?? item.existingItemType) === "directory"
        ? "directory"
        : (item.existing_item_type ?? item.existingItemType) === "file"
          ? "file"
          : null,
    recommendedResolution: restoreResolutionFrom(
      item.recommended_resolution ?? item.recommendedResolution,
    ),
    autoRenamedName:
      typeof item.auto_renamed_name === "string" ? item.auto_renamed_name : null,
    childrenCount: numberFrom(item.children_count ?? item.childrenCount),
    descendantConflictCount: numberFrom(
      item.descendant_conflict_count ?? item.descendantConflictCount,
    ),
    before: {
      name: stringFrom(before.name),
      parentId:
        (before.parent_id ?? before.parentId) === null
          ? null
          : numberFrom(before.parent_id ?? before.parentId),
      parentPath:
        (before.parent_path ?? before.parentPath) === null
          ? null
          : stringFrom(before.parent_path ?? before.parentPath),
      state: stringFrom(before.state),
      restorable: Boolean(before.restorable),
      reason: before.reason === null ? null : stringFrom(before.reason),
    },
    after: {
      name: after.name === null ? null : stringFrom(after.name),
      parentId:
        (after.parent_id ?? after.parentId) === null
          ? null
          : numberFrom(after.parent_id ?? after.parentId),
      parentPath:
        (after.parent_path ?? after.parentPath) === null
          ? null
          : stringFrom(after.parent_path ?? after.parentPath),
      restorable: Boolean(after.restorable),
      resolution: restoreResolutionFrom(after.resolution),
      existingItemWillBePurged: Boolean(
        after.existing_item_will_be_purged ?? after.existingItemWillBePurged,
      ),
      existingItem:
        (after.existing_item ?? after.existingItem) &&
        Object.keys(existingItem).length > 0
          ? {
              id: numberFrom(existingItem.id),
              itemType:
                (existingItem.item_type ?? existingItem.itemType) === "directory"
                  ? "directory"
                  : "file",
              name: stringFrom(existingItem.name),
              parentPath:
                (existingItem.parent_path ?? existingItem.parentPath) === null
                  ? null
                  : stringFrom(existingItem.parent_path ?? existingItem.parentPath),
              purgeNote: stringFrom(existingItem.purge_note ?? existingItem.purgeNote),
            }
          : null,
      state: stringFrom(after.state),
      impact: stringFrom(after.impact),
    },
  };
}

function restoreConflictTypeFrom(value: unknown): RestorePreviewItem["conflictType"] {
  if (
    value === "name_conflict" ||
    value === "missing_parent" ||
    value === "name_conflict_and_missing_parent"
  ) {
    return value;
  }
  return "none";
}

function restoreResolutionFrom(value: unknown): RestoreConflictResolution {
  if (
    value === "purge_existing" ||
    value === "select_destination" ||
    value === "restore_to_root" ||
    value === "skip"
  ) {
    return value;
  }
  return "rename";
}

function recordFrom(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringFrom(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberFrom(value: unknown) {
  return typeof value === "number" ? value : Number(value) || 0;
}

function parseJson(value: string) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return { error: value };
  }
}
