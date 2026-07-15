import { describe, expect, it, vi } from "vitest";

import { apiRequest, clearCsrfToken } from "./client";
import { ApiError } from "./errors";

describe("apiRequest", () => {
  it("sends same-origin credentials and json body", async () => {
    mockFetch([jsonResponse({ csrf_token: "csrf" }), jsonResponse({ ok: true })]);

    await apiRequest("/api/v1/drive_items", {
      method: "POST",
      body: { name: "Reports" },
    });

    const [, request] = vi.mocked(fetch).mock.calls[1];
    expect(request).toMatchObject({ credentials: "same-origin" });
    expect((request?.headers as Headers).get("Content-Type")).toBe("application/json");
    expect((request?.headers as Headers).get("X-CSRF-Token")).toBe("csrf");
    expect(request?.body).toBe(JSON.stringify({ name: "Reports" }));
  });

  it("does not set Content-Type for FormData", async () => {
    clearCsrfToken();
    const form = new FormData();
    form.append("name", "report");
    mockFetch([jsonResponse({ csrf_token: "csrf" }), jsonResponse({ ok: true })]);

    await apiRequest("/api/v1/drive_items", { method: "POST", body: form });

    const [, request] = vi.mocked(fetch).mock.calls[1];
    expect((request?.headers as Headers).get("Content-Type")).toBeNull();
    expect(request?.body).toBe(form);
  });

  it.each([
    [
      { error: "指定されたファイルが見つかりません" },
      "指定されたファイルが見つかりません",
    ],
    [{ errors: ["Name has already been taken"] }, "Name has already been taken"],
    [
      { error: { code: "forbidden", message: "この操作を実行する権限がありません" } },
      "この操作を実行する権限がありません",
    ],
  ])("parses api errors", async (body, message) => {
    mockFetch([jsonResponse(body, 403)]);

    await expect(apiRequest("/api/v1/admin/users")).rejects.toThrow(message);
  });

  it("maps non-json errors by status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Response("Service unavailable", { status: 503 })),
    );

    await expect(apiRequest("/api/v1/drive_items/1/download")).rejects.toThrow(
      "Service unavailable",
    );
  });

  it("retries a clear csrf failure once", async () => {
    clearCsrfToken();
    mockFetch([
      jsonResponse({ csrf_token: "old" }),
      jsonResponse(
        { error: { code: "invalid_csrf_token", message: "CSRF token invalid" } },
        422,
      ),
      jsonResponse({ csrf_token: "new" }),
      jsonResponse({ ok: true }),
    ]);

    await apiRequest("/api/v1/drive_items", {
      method: "POST",
      body: { name: "Reports" },
    });

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(4);
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(responses: Response[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      const response = responses.shift();
      if (!response) throw new ApiError(500, "No mocked response");
      return response;
    }),
  );
}
