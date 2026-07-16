import { describe, expect, it, vi } from "vitest";

import { API_BASE_URL } from "../api/client";
import {
  adminDriveItemDownloadUrl,
  adminDriveItemPreviewUrl,
  adminDriveItemStreamUrl,
  createOrganization,
  createOrganizationInvite,
  fetchAdminDriveItem,
  fetchAuditEvent,
  fetchAuditEvents,
  fetchAuditLog,
  fetchAuditLogs,
  fetchDashboard,
  fetchOrganization,
  fetchUser,
  purgeAdminDriveItem,
  suspendUser,
  unsuspendUser,
} from "./api";

describe("admin api", () => {
  it("builds file access URLs from the existing drive delivery API", () => {
    expect(adminDriveItemPreviewUrl(5)).toBe(
      `${API_BASE_URL}/api/v1/admin/drive_items/5/preview`,
    );
    expect(adminDriveItemDownloadUrl(5)).toBe(
      `${API_BASE_URL}/api/v1/admin/drive_items/5/download`,
    );
    expect(adminDriveItemStreamUrl(5)).toBe(
      `${API_BASE_URL}/api/v1/admin/drive_items/5/stream`,
    );
  });

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

  it("allows recent dashboard drive items without parent_id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          data: {
            recent_drive_items: [
              {
                id: 1,
                name: "Root file",
                item_type: "file",
              },
            ],
          },
        }),
      ),
    );

    await expect(fetchDashboard()).resolves.toMatchObject({
      recent_drive_items: [{ id: 1, name: "Root file" }],
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

  it("fetches resource details through detail endpoints", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url === `${API_BASE_URL}/api/v1/admin/organizations/12`) {
          return jsonResponse({ data: { id: 12, name: "Org" } });
        }
        if (url === `${API_BASE_URL}/api/v1/admin/users/10`) {
          return jsonResponse({ data: userJson(10) });
        }
        if (url === `${API_BASE_URL}/api/v1/admin/drive_items/5`) {
          return jsonResponse({
            data: { id: 5, parent_id: null, name: "File", item_type: "file" },
          });
        }
        if (url === `${API_BASE_URL}/api/v1/admin/audit_logs/7`) {
          return jsonResponse({
            data: { id: 7, action: "user.update", change_set: { name: ["a", "b"] } },
          });
        }
        if (url === `${API_BASE_URL}/api/v1/admin/audit_events/8`) {
          return jsonResponse({
            data: { id: 8, action: "auth.login", outcome: "success" },
          });
        }
        return jsonResponse({});
      }),
    );

    await fetchOrganization(12);
    await fetchUser(10);
    await fetchAdminDriveItem(5);
    await fetchAuditLog(7);
    await fetchAuditEvent(8);

    const urls = vi.mocked(fetch).mock.calls.map(([url]) => url);
    expect(urls).toContain(`${API_BASE_URL}/api/v1/admin/organizations/12`);
    expect(urls).toContain(`${API_BASE_URL}/api/v1/admin/users/10`);
    expect(urls).toContain(`${API_BASE_URL}/api/v1/admin/drive_items/5`);
    expect(urls).toContain(`${API_BASE_URL}/api/v1/admin/audit_logs/7`);
    expect(urls).toContain(`${API_BASE_URL}/api/v1/admin/audit_events/8`);
  });

  it("parses audit events separately from audit logs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          data: [
            {
              id: 8,
              action: "auth.login_link.create",
              outcome: "failure",
              metadata: { reason: "invalid" },
            },
          ],
          meta: { current_page: 1, per_page: 20, total_pages: 1, total_count: 1 },
        }),
      ),
    );

    await expect(fetchAuditEvents("?outcome=failure")).resolves.toMatchObject({
      data: [{ outcome: "failure", metadata: { reason: "invalid" } }],
    });
  });

  it("posts organization creation requests to the system admin endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url === `${API_BASE_URL}/api/v1/csrf_token`) {
          return new Response(JSON.stringify({ csrf_token: "csrf" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            data: {
              id: 12,
              name: "New Organization",
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    await expect(
      createOrganization({ name: "New Organization" }),
    ).resolves.toMatchObject({
      id: 12,
      name: "New Organization",
    });

    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(
      `${API_BASE_URL}/api/v1/admin/organizations`,
    );
    expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ organization: { name: "New Organization" } }),
    });
  });

  it("posts organization invite creation with the route organization id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url === `${API_BASE_URL}/api/v1/csrf_token`) {
          return jsonResponse({ csrf_token: "csrf" });
        }
        return jsonResponse({
          data: {
            id: 1,
            organization_id: 12,
            organization_name: "Org",
            code: "invite-code",
            expires_at: "2026-07-31T23:59:59+09:00",
          },
        });
      }),
    );

    await expect(
      createOrganizationInvite({
        organizationId: 12,
        expiresAt: "2026-07-31T23:59:59+09:00",
      }),
    ).resolves.toMatchObject({ code: "invite-code" });

    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(
      `${API_BASE_URL}/api/v1/admin/organization_invites`,
    );
    expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        organization_invite: {
          organization_id: 12,
          expires_at: "2026-07-31T23:59:59+09:00",
        },
      }),
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
        return jsonResponse({ data: userJson(10) });
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

  it("uses DELETE for irreversible admin drive item purge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url === `${API_BASE_URL}/api/v1/csrf_token`) {
          return jsonResponse({ csrf_token: "csrf" });
        }
        return jsonResponse({ message: "ファイルを完全削除しました" });
      }),
    );

    await expect(purgeAdminDriveItem(5)).resolves.toMatchObject({
      message: "ファイルを完全削除しました",
    });

    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(
      `${API_BASE_URL}/api/v1/admin/drive_items/5/purge`,
    );
    expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({
      method: "DELETE",
      credentials: "include",
    });
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}

function userJson(id: number) {
  return {
    id,
    email: `user${id}@example.com`,
    name: `User ${id}`,
    role: "member",
  };
}
