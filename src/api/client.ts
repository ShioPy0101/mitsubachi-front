import { ApiError, parseApiError } from "./errors";

type ApiRequestOptions = Omit<RequestInit, "body" | "credentials"> & {
  body?: unknown;
  retryCsrf?: boolean;
};

let csrfToken: string | null = null;

export function clearCsrfToken() {
  csrfToken = null;
}

export async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;

  const response = await fetch("/api/v1/csrf_token", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const body = (await readResponseBody(response)) as { csrf_token?: unknown };
  if (!response.ok || typeof body.csrf_token !== "string") {
    throw parseApiError(response.status, body);
  }
  csrfToken = body.csrf_token;
  return csrfToken;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  return requestWithCsrfRetry<T>(path, options, false);
}

async function requestWithCsrfRetry<T>(
  path: string,
  options: ApiRequestOptions,
  hasRetried: boolean,
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }

  if (requiresCsrf(method)) {
    headers.set("X-CSRF-Token", await getCsrfToken());
  }

  const response = await fetch(path, {
    ...options,
    body,
    credentials: "same-origin",
    headers,
  });
  const responseBody = await readResponseBody(response);

  if (!response.ok) {
    const error = parseApiError(response.status, responseBody);
    if (isCsrfFailure(error) && !hasRetried && options.retryCsrf !== false) {
      clearCsrfToken();
      return requestWithCsrfRetry<T>(path, options, true);
    }
    throw error;
  }

  return responseBody as T;
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;

  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text ? { error: text } : null;
}

function requiresCsrf(method: string) {
  return ["POST", "PATCH", "PUT", "DELETE"].includes(method);
}

function isCsrfFailure(error: ApiError) {
  return (
    error.status === 422 &&
    (error.code === "invalid_csrf_token" ||
      error.message.toLowerCase().includes("csrf") ||
      error.message.includes("認証トークン"))
  );
}
