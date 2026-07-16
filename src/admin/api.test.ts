import { describe, expect, it, vi } from "vitest";

import { API_BASE_URL } from "../api/client";
import { suspendUser, unsuspendUser } from "./api";

describe("admin api", () => {
  it("uses PATCH for user suspend operations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url === `${API_BASE_URL}/api/v1/csrf_token`) {
          return new Response(JSON.stringify({ csrf_token: "csrf" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    await suspendUser(10);
    await unsuspendUser(10);

    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(
      `${API_BASE_URL}/api/v1/admin/users/10/suspend`,
    );
    expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({ method: "PATCH" });
    expect(vi.mocked(fetch).mock.calls[2][0]).toBe(
      `${API_BASE_URL}/api/v1/admin/users/10/unsuspend`,
    );
    expect(vi.mocked(fetch).mock.calls[2][1]).toMatchObject({ method: "PATCH" });
  });
});
