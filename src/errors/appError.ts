import { ApiError, ApiNetworkError } from "../api/errors";

export type AppError = {
  code: string;
  level: "info" | "warn" | "danger";
  message: string;
  status?: number;
  apiPath?: string;
  requestId?: string;
  operation?: string;
  occurredAt: string;
  page?: string;
  causeType?: "api" | "network" | "frontend";
  safeDetails?: Record<string, string | number | boolean | null>;
};

const secretKeyPattern =
  /token|access_token|refresh_token|authorization|cookie|csrf|password|secret|signature/i;

export function normalizeAppError(
  error: unknown,
  context: {
    operation?: string;
    page?: string;
    safeDetails?: Record<string, string | number | boolean | null | undefined>;
  } = {},
): AppError {
  const occurredAt = new Date().toISOString();
  if (error instanceof ApiError) {
    return {
      code: error.code ?? codeForStatus(error.status),
      level: levelFor(error.code ?? codeForStatus(error.status), error.status),
      message: sanitizeText(error.message),
      status: error.status,
      apiPath: safeApiPath(error.url),
      requestId: error.requestId,
      operation: context.operation,
      occurredAt,
      page: context.page,
      causeType: "api",
      safeDetails: sanitizeDetails({ ...error.safeDetails, ...context.safeDetails }),
    };
  }

  if (error instanceof ApiNetworkError) {
    return {
      code: "network_error",
      level: "danger",
      message: error.message,
      apiPath: safeApiPath(error.url),
      operation: context.operation,
      occurredAt,
      page: context.page,
      causeType: "network",
      safeDetails: sanitizeDetails(context.safeDetails),
    };
  }

  return {
    code: "frontend_error",
    level: "danger",
    message: sanitizeText(error instanceof Error ? error.message : "予期しないエラーが発生しました。"),
    operation: context.operation,
    occurredAt,
    page: context.page,
    causeType: "frontend",
    safeDetails: sanitizeDetails(context.safeDetails),
  };
}

export function formatAppErrorReport(error: AppError, note = "") {
  const lines = [
    "Mitsubachi エラー報告",
    "",
    `発生日時: ${formatDateTime(error.occurredAt)}`,
  ];
  append(lines, "画面", error.page);
  append(lines, "操作", error.operation);
  lines.push("結果: 失敗", "");
  append(lines, "エラーコード", error.code);
  append(lines, "HTTPステータス", error.status);
  append(lines, "APIパス", error.apiPath);
  append(lines, "メッセージ", error.message);
  append(lines, "Request ID", error.requestId);

  const details = Object.entries(error.safeDetails ?? {});
  if (details.length > 0) {
    lines.push("", "対象:");
    for (const [key, value] of details) append(lines, detailLabel(key), value);
  }

  lines.push("", "環境:");
  append(lines, "ブラウザとOS", sanitizeText(navigator.userAgent));
  lines.push("", "補足:", sanitizeText(note));
  return lines.join("\n");
}

export function sanitizeText(value: unknown) {
  const text =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : "";
  return text
    .replace(/[?&](token|access_token|refresh_token|signature|csrf)=[^&#\s]+/gi, "?[REDACTED]")
    .replace(/(authorization|cookie|csrf|password|secret|signature|token)\s*[:=]\s*[^\s,;}]+/gi, "[REDACTED]")
    .slice(0, 500);
}

export function isNameConflictAppError(error: AppError) {
  return ["duplicate_name", "name_conflict", "duplicate_content", "auto_rename_required"].includes(error.code);
}

export function isReportableAppError(error: AppError) {
  return error.level === "danger";
}

function sanitizeDetails(details?: Record<string, string | number | boolean | null | undefined>) {
  if (!details) return undefined;
  return Object.entries(details).reduce<Record<string, string | number | boolean | null>>(
    (safe, [key, value]) => {
      if (value === undefined || secretKeyPattern.test(key)) return safe;
      safe[key] = typeof value === "string" ? sanitizeText(value) : value;
      return safe;
    },
    {},
  );
}

function append(lines: string[], label: string, value: unknown) {
  if (value === undefined || value === null || value === "") return;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    lines.push(`${label}: ${value}`);
  }
}

function codeForStatus(status: number) {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "duplicate_name";
  if (status === 413) return "payload_too_large";
  if (status === 422) return "validation_failed";
  if (status >= 500) return "internal_error";
  return "api_error";
}

function levelFor(code: string, status: number): AppError["level"] {
  if (["duplicate_name", "name_conflict", "duplicate_content", "auto_rename_required"].includes(code)) {
    return "info";
  }
  if (status === 409 || status === 413 || status === 422) return "warn";
  return "danger";
}

function safeApiPath(value?: string) {
  if (!value) return undefined;
  try {
    return new URL(value, window.location.origin).pathname;
  } catch {
    return undefined;
  }
}

function detailLabel(key: string) {
  return {
    itemType: "種類",
    itemName: "名前",
    targetFolder: "移動先",
  }[key] ?? key;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}
