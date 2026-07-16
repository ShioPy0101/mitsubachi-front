import { describe, expect, it, vi } from "vitest";

import { logout } from "./api";

describe("auth api", () => {
  it("logs out through the Rails session endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url === "/api/v1/csrf_token") {
          return new Response(JSON.stringify({ csrf_token: "csrf" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(null, { status: 204 });
      }),
    );

    await logout();

    expect(vi.mocked(fetch).mock.calls[1][0]).toBe("/api/v1/logout");
    expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({
      method: "DELETE",
      credentials: "same-origin",
    });
  });
});
