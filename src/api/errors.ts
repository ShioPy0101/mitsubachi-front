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

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details: string[];
  readonly url?: string;
  readonly field?: string;
  readonly conflictingName?: string;
  readonly requestId?: string;
  readonly safeDetails?: Record<string, string | number | boolean | null>;

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
        typeof body.error.request_id === "string"
          ? body.error.request_id
          : undefined;
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
