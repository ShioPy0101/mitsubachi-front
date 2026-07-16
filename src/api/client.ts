import { ApiError, ApiNetworkError, parseApiError } from "./errors";

type ApiRequestOptions = Omit<RequestInit, "body" | "credentials"> & {
  body?: unknown;
  retryCsrf?: boolean;
};

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (!rawApiBaseUrl) {
  throw new Error("VITE_API_BASE_URL is not configured");
}

export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, "");

let csrfToken: string | null = null;

export function clearCsrfToken() {
  csrfToken = null;
}

export async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;

  const response = await apiFetch("/api/v1/csrf_token", {
    headers: { Accept: "application/json" },
  });
  const body = (await readResponseBody(response)) as { csrf_token?: unknown };
  if (!response.ok || typeof body.csrf_token !== "string") {
    throw parseApiError(response.status, body, apiUrl("/api/v1/csrf_token"));
  }
  csrfToken = body.csrf_token;
  return csrfToken;
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = apiUrl(path);
  const headers = new Headers(init.headers);

  if (
    init.body !== undefined &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  try {
    return await fetch(url, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch (error) {
    throw new ApiNetworkError(url, error);
  }
}

export function apiUrl(path: string) {
  if (!path.startsWith("/")) {
    throw new Error(`API path must start with "/": ${path}`);
  }
  return `${API_BASE_URL}${path}`;
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

  const response = await apiFetch(path, {
    ...options,
    body,
    headers,
  });
  const responseBody = await readResponseBody(response);

  if (!response.ok) {
    const error = parseApiError(response.status, responseBody, apiUrl(path));
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
