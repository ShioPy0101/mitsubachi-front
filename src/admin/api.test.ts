import { describe, expect, it, vi } from "vitest";

import { API_BASE_URL } from "../api/client";
import { fetchAuditLogs, fetchDashboard, suspendUser, unsuspendUser } from "./api";

describe("admin api", () => {
  it("parses dashboard metrics from the Rails data envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Response(
            JSON.stringify({
              data: {
                organizations_count: 2,
                users_count: 10,
                active_users_count: 8,
                drive_items_count: 30,
                files_count: 20,
                directories_count: 10,
                total_storage_bytes: 4096,
              },
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    await expect(fetchDashboard()).resolves.toMatchObject({
      organizations_count: 2,
      users_count: 10,
      drive_items_count: 30,
    });
  });

  it("parses Rails audit log target and change_set fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  id: 1,
                  actor_user_id: 2,
                  actor_email: "admin@example.com",
                  action: "user.suspend",
                  target_type: "User",
                  target_id: 3,
                  change_set: { suspended: [false, true] },
                },
              ],
              meta: {
                current_page: 1,
                per_page: 25,
                total_pages: 1,
                total_count: 1,
              },
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    await expect(fetchAuditLogs("?page=1")).resolves.toMatchObject({
      data: [
        {
          target_type: "User",
          target_id: 3,
          change_set: { suspended: [false, true] },
        },
      ],
    });
  });

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
