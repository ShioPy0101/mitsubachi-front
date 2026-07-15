export type RawApiError =
  | { error: string }
  | { errors: string[] }
  | { error: { code?: string; message?: string } };

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details: string[];

  constructor(status: number, message: string, details: string[] = [], code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
    this.code = code;
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

export function parseApiError(status: number, body: unknown): ApiError {
  if (isRecord(body)) {
    if (typeof body.error === "string") {
      return new ApiError(status, body.error);
    }

    if (
      Array.isArray(body.errors) &&
      body.errors.every((item) => typeof item === "string")
    ) {
      const [first = statusMessages[status] ?? "リクエストに失敗しました。"] =
        body.errors;
      return new ApiError(status, first, body.errors);
    }

    if (isRecord(body.error)) {
      const message =
        typeof body.error.message === "string"
          ? body.error.message
          : (statusMessages[status] ?? "リクエストに失敗しました。");
      const code = typeof body.error.code === "string" ? body.error.code : undefined;
      return new ApiError(status, message, [], code);
    }
  }

  return new ApiError(status, statusMessages[status] ?? "リクエストに失敗しました。");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
