export type RawApiError =
  | { error: string }
  | { errors: string[] }
  | {
      error: {
        code?: string;
        message?: string;
        request_id?: string;
        details?: Record<string, unknown>;
        field?: string;
        conflicting_name?: string;
      };
    };

export type DuplicateContentFile = {
  id: number;
  name: string;
  parent_id: number | null;
  parent_name?: string;
  owner_display_name?: string;
  created_at?: string;
  file_size?: number;
  deleted?: boolean;
};

export type TrashDuplicate = {
  id: number;
  name: string;
  extension: string | null;
  displayName: string;
  fileSize: number | null;
  contentType?: string | null;
  deletedAt: string | null;
  originalParent: {
    id: number | null;
    name: string | null;
    path: string | null;
  } | null;
  uploadedBy: {
    id: number;
    displayName: string;
  } | null;
  restoreTarget: {
    id: number;
    type: string;
    displayName: string;
  } | null;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details: string[];
  readonly url?: string;
  readonly field?: string;
  readonly conflictingName?: string;
  readonly requestId?: string;
  readonly safeDetails?: Record<string, string | number | boolean | null>;
  readonly rawDetails?: Record<string, unknown>;
  readonly duplicateFiles: DuplicateContentFile[];
  readonly trashDuplicate?: TrashDuplicate;
  readonly allowedActions: string[];

  constructor(
    status: number,
    message: string,
    details: string[] = [],
    code?: string,
    url?: string,
    field?: string,
    conflictingName?: string,
    requestId?: string,
    safeDetails?: Record<string, string | number | boolean | null>,
    duplicateFiles: DuplicateContentFile[] = [],
    trashDuplicate?: TrashDuplicate,
    allowedActions: string[] = [],
    rawDetails?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
    this.code = code;
    this.url = url;
    this.field = field;
    this.conflictingName = conflictingName;
    this.requestId = requestId;
    this.safeDetails = safeDetails;
    this.rawDetails = rawDetails;
    this.duplicateFiles = duplicateFiles;
    this.trashDuplicate = trashDuplicate;
    this.allowedActions = allowedActions;
  }
}

export class ApiNetworkError extends Error {
  readonly url: string;

  constructor(url: string, cause: unknown) {
    super("APIサーバーへ接続できません。");
    this.name = "ApiNetworkError";
    this.url = url;
    this.cause = cause;
  }
}

const statusMessages: Record<number, string> = {
  400: "入力内容を確認してください。",
  401: "ログインが必要です。",
  403: "この操作を実行する権限がありません。",
  404: "対象が存在しないか、アクセスできません。",
  413: "ファイルサイズがサーバーの上限を超えています。",
  422: "入力内容を確認してください。",
  503: "ファイルを配信できません。時間をおいて再試行してください。",
};

export function parseApiError(status: number, body: unknown, url?: string): ApiError {
  if (isRecord(body)) {
    if (typeof body.error === "string") {
      return new ApiError(status, body.error, [], undefined, url);
    }

    if (
      Array.isArray(body.errors) &&
      body.errors.every((item) => typeof item === "string")
    ) {
      const [first = statusMessages[status] ?? "リクエストに失敗しました。"] =
        body.errors;
      return new ApiError(status, first, body.errors, undefined, url);
    }

    if (isRecord(body.error)) {
      const message =
        typeof body.error.message === "string"
          ? body.error.message
          : (statusMessages[status] ?? "リクエストに失敗しました。");
      const code = typeof body.error.code === "string" ? body.error.code : undefined;
      const field = typeof body.error.field === "string" ? body.error.field : undefined;
      const errorDetails = isRecord(body.error.details) ? body.error.details : {};
      const detailField =
        typeof errorDetails.field === "string" ? errorDetails.field : undefined;
      const conflictingName =
        typeof errorDetails.conflicting_name === "string"
          ? errorDetails.conflicting_name
          : typeof body.error.conflicting_name === "string"
            ? body.error.conflicting_name
            : undefined;
      const requestId =
        typeof body.error.request_id === "string" ? body.error.request_id : undefined;
      return new ApiError(
        status,
        message,
        [],
        code,
        url,
        field ?? detailField,
        conflictingName,
        requestId,
        safeDetailsFrom(errorDetails),
        duplicateFilesFrom(errorDetails),
        trashDuplicateFrom(errorDetails),
        allowedActionsFrom(errorDetails),
        errorDetails,
      );
    }
  }

  return new ApiError(
    status,
    statusMessages[status] ?? "リクエストに失敗しました。",
    [],
    undefined,
    url,
  );
}

function trashDuplicateFrom(value: Record<string, unknown>) {
  const duplicate = value.duplicate;
  if (!isRecord(duplicate) || typeof duplicate.id !== "number") return undefined;
  const originalParent = isRecord(duplicate.original_parent)
    ? {
        id:
          typeof duplicate.original_parent.id === "number"
            ? duplicate.original_parent.id
            : null,
        name:
          typeof duplicate.original_parent.name === "string"
            ? duplicate.original_parent.name
            : null,
        path:
          typeof duplicate.original_parent.path === "string"
            ? duplicate.original_parent.path
            : null,
      }
    : null;
  const uploadedBy = isRecord(duplicate.uploaded_by)
    ? {
        id: typeof duplicate.uploaded_by.id === "number" ? duplicate.uploaded_by.id : 0,
        displayName:
          typeof duplicate.uploaded_by.display_name === "string" &&
          duplicate.uploaded_by.display_name.trim()
            ? duplicate.uploaded_by.display_name
            : "未設定ユーザー",
      }
    : null;
  const restoreTarget = isRecord(duplicate.restore_target)
    ? {
        id:
          typeof duplicate.restore_target.id === "number"
            ? duplicate.restore_target.id
            : duplicate.id,
        type:
          typeof duplicate.restore_target.type === "string"
            ? duplicate.restore_target.type
            : "file",
        displayName:
          typeof duplicate.restore_target.display_name === "string"
            ? duplicate.restore_target.display_name
            : "名前未設定",
      }
    : null;
  return {
    id: duplicate.id,
    name: typeof duplicate.name === "string" ? duplicate.name : "",
    extension: typeof duplicate.extension === "string" ? duplicate.extension : null,
    displayName:
      typeof duplicate.display_name === "string"
        ? duplicate.display_name
        : "名前未設定",
    fileSize: typeof duplicate.file_size === "number" ? duplicate.file_size : null,
    contentType:
      typeof duplicate.content_type === "string" ? duplicate.content_type : null,
    deletedAt: typeof duplicate.deleted_at === "string" ? duplicate.deleted_at : null,
    originalParent,
    uploadedBy,
    restoreTarget,
  };
}

function allowedActionsFrom(value: Record<string, unknown>) {
  const actions = value.allowed_actions;
  if (!Array.isArray(actions)) return [];
  return actions.filter((action): action is string => typeof action === "string");
}

function duplicateFilesFrom(value: Record<string, unknown>) {
  const files = value.duplicate_files;
  if (!Array.isArray(files)) return [];
  return files.flatMap((entry): DuplicateContentFile[] => {
    if (!isRecord(entry)) return [];
    if (typeof entry.id !== "number" || typeof entry.name !== "string") return [];
    return [
      {
        id: entry.id,
        name: entry.name,
        parent_id: typeof entry.parent_id === "number" ? entry.parent_id : null,
        parent_name:
          typeof entry.parent_name === "string" ? entry.parent_name : undefined,
        owner_display_name:
          typeof entry.owner_display_name === "string"
            ? entry.owner_display_name
            : undefined,
        created_at: typeof entry.created_at === "string" ? entry.created_at : undefined,
        file_size: typeof entry.file_size === "number" ? entry.file_size : undefined,
        deleted: typeof entry.deleted === "boolean" ? entry.deleted : undefined,
      },
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeDetailsFrom(value: Record<string, unknown>) {
  return Object.entries(value).reduce<Record<string, string | number | boolean | null>>(
    (details, [key, entry]) => {
      if (["string", "number", "boolean"].includes(typeof entry) || entry === null) {
        details[key] = entry as string | number | boolean | null;
      }
      return details;
    },
    {},
  );
}
