import { describe, expect, it, vi } from "vitest";

import { API_BASE_URL } from "../api/client";
import { fetchCurrentUser, logout } from "./api";

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
});
