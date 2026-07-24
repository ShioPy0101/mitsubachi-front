import { describe, expect, it, vi } from "vitest";

import { API_BASE_URL, clearCsrfToken } from "../api/client";
import {
  cancelEmailChange,
  fetchCurrentUser,
  logout,
  requestEmailChange,
  updateCurrentUser,
  verifyEmailChange,
} from "./api";

describe("auth api", () => {
  it("fetches current user through /api/v1/me", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                id: 1,
                organization_id: 7,
                organization_name: "Mitsubachi",
                email: "user@example.com",
                pending_email: "pending@example.com",
                name: "User",
                role: "member",
              },
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
        ),
      ),
    );

    await expect(fetchCurrentUser()).resolves.toMatchObject({
      email: "user@example.com",
      pending_email: "pending@example.com",
      organization: { id: 7, name: "Mitsubachi" },
    });

    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(`${API_BASE_URL}/api/v1/me`);
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({
      credentials: "include",
    });
  });

  it("logs out through the Rails session endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url === `${API_BASE_URL}/api/v1/csrf_token`) {
          return new Response(JSON.stringify({ csrf_token: "csrf" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(null, { status: 204 });
      }),
    );

    await logout();

    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(`${API_BASE_URL}/api/v1/logout`);
    expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({
      method: "DELETE",
      credentials: "include",
    });
  });

  it("updates current user display name", async () => {
    stubCsrfBackedFetch({
      data: {
        id: 1,
        organization_id: 7,
        organization_name: "Mitsubachi",
        email: "user@example.com",
        display_name: "新しい表示名",
        role: "member",
      },
    });

    await expect(
      updateCurrentUser({ displayName: "新しい表示名" }),
    ).resolves.toMatchObject({
      display_name: "新しい表示名",
    });

    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(`${API_BASE_URL}/api/v1/me`);
    expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({
      method: "PATCH",
      credentials: "include",
    });
  });

  it("requests, verifies, and cancels email changes", async () => {
    clearCsrfToken();
    stubCsrfBackedFetch({ message: "ok", pending_email: "new@example.com" });

    await requestEmailChange("new@example.com");
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(
      `${API_BASE_URL}/api/v1/me/email_change`,
    );
    expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({ method: "POST" });

    vi.mocked(fetch).mockClear();
    clearCsrfToken();
    stubCsrfBackedFetch({ message: "ok", email: "new@example.com" });
    await verifyEmailChange("token");
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(
      `${API_BASE_URL}/api/v1/me/email_change/verify`,
    );

    vi.mocked(fetch).mockClear();
    clearCsrfToken();
    stubCsrfBackedFetch({ message: "ok" });
    await cancelEmailChange();
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(
      `${API_BASE_URL}/api/v1/me/email_change`,
    );
    expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({ method: "DELETE" });
  });
});

function stubCsrfBackedFetch(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      if (url === `${API_BASE_URL}/api/v1/csrf_token`) {
        return Promise.resolve(
          new Response(JSON.stringify({ csrf_token: "csrf" }), {
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    }),
  );
}
