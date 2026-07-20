import { apiFetch, apiRequest, apiUrl, getCsrfToken } from "../api/client";
import { parseApiError } from "../api/errors";
import { driveItemSchema, driveItemsSchema, driveSearchResponseSchema, type DriveItem } from "../api/schemas";

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

export function uploadFile(input: {
  file: File;
  name: string;
  parentId: number | null;
  allowDuplicateContent?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
}) {
  if (!input.onProgress) {
    const form = new FormData();
    form.append("name", input.name);
    form.append("item_type", "file");
    if (input.parentId !== null) form.append("parent_id", String(input.parentId));
    if (input.allowDuplicateContent) form.append("allow_duplicate_content", "true");
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
  signal?: AbortSignal;
  onProgress: (progress: UploadProgress) => void;
}): Promise<DriveItem> {
  const form = new FormData();
  form.append("name", input.name);
  form.append("item_type", "file");
  if (input.parentId !== null) form.append("parent_id", String(input.parentId));
  if (input.allowDuplicateContent) form.append("allow_duplicate_content", "true");
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

export function restoreDriveItem(id: number) {
  return apiRequest<DriveItem>(`/api/v1/drive_items/${id}/restore`, {
    method: "POST",
  });
}

export function bulkDelete(ids: number[]) {
  return apiRequest<{ message?: string }>("/api/v1/drive_items/bulk_delete", {
    method: "POST",
    body: { drive_item_ids: ids },
  });
}

export function bulkRestore(ids: number[]) {
  return apiRequest<{ message?: string }>("/api/v1/drive_items/bulk_restore", {
    method: "POST",
    body: { drive_item_ids: ids },
  });
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
    throw parseApiError(response.status, body, apiUrl("/api/v1/drive_items/bulk_download"));
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

function parseJson(value: string) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return { error: value };
  }
}
