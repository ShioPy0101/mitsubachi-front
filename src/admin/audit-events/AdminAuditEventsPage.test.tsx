import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { API_BASE_URL } from "../../api/client";
import { AuthContext } from "../../auth/AuthContext";
import { AdminLayout } from "../components/AdminScaffold";
import { AdminAuditEventsPage } from "./AdminAuditEventsPage";

describe("AdminAuditEventsPage", () => {
  it("renders the admin layout and active navigation", async () => {
    mockAuditEvents();

    renderAdminRoute("/admin/audit-events");

    expect(
      await screen.findByRole("heading", { name: "管理画面" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "システムイベント" })).toHaveClass(
      "active",
    );
  });

  it("passes filters to the API request and can reset them", async () => {
    mockAuditEvents();

    renderAdminRoute("/admin/audit-events?actor_user_id=42&outcome=success&page=3");

    await screen.findByText("ファイルを作成");
    expect(lastAuditEventsUrl()).toContain("actor_user_id=42");
    expect(lastAuditEventsUrl()).toContain("outcome=success");
    expect(lastAuditEventsUrl()).toContain("page=3");

    fireEvent.click(screen.getByRole("button", { name: "条件をリセット" }));

    await waitFor(() => {
      expect(lastAuditEventsUrl()).toMatch(/page=1$/);
    });
  });

  it("renders outcome badges and stable table cells for long text", async () => {
    mockAuditEvents();

    renderAdminRoute("/admin/audit-events");

    const row = await screen.findByRole("row", {
      name: /2026\/07\/17 05:34:30 ファイルを作成/,
    });

    expect(within(row).getByText("成功")).toHaveClass("status-success");
    expect(
      within(row).getByText("very-long-admin-email-address@example.com"),
    ).toHaveClass("cell-primary");
    expect(within(row).getByText("Very Long Organization Name")).toHaveClass(
      "cell-primary",
    );
    expect(within(row).getByText("2026/07/17 05:34:30")).toHaveClass("audit-cell-time");
    expect(within(row).getByRole("link", { name: /監査イベント詳細/ })).toHaveAttribute(
      "aria-label",
      "2026/07/17 05:34:30 の監査イベント詳細を表示",
    );
  });

  it("renders the empty state", async () => {
    mockAuditEvents({ data: [] });

    renderAdminRoute("/admin/audit-events");

    expect(
      await screen.findByText("条件に一致する項目はありません。"),
    ).toBeInTheDocument();
  });

  it("renders API errors with status and retry action", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ error: "server error" }, 500)),
    );

    renderAdminRoute("/admin/audit-events");

    expect(await screen.findByText(/HTTPステータス: 500/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
  });

  it("renders pagination controls and page size selector", async () => {
    mockAuditEvents({
      meta: { current_page: 2, per_page: 50, total_pages: 4, total_count: 175 },
    });

    renderAdminRoute("/admin/audit-events?page=2&per_page=50");

    expect(await screen.findByText("総件数 175")).toBeInTheDocument();
    expect(screen.getByDisplayValue("50")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /前へ/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /次へ/ })).toBeEnabled();
  });
});

function renderAdminRoute(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider
        value={{
          user: {
            id: 1,
            email: "admin@example.com",
            name: "Admin",
            role: "system_admin",
            suspended: false,
            organization_id: 1,
            organization_name: "Admin Org",
            organization: { id: 1, name: "Admin Org" },
          },
          status: "authenticated",
          error: null,
          isLoading: false,
          isAuthenticated: true,
          retryAuthCheck: vi.fn(),
        }}
      >
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route element={<AdminLayout />}>
              <Route path="/admin/audit-events" element={<AdminAuditEventsPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

function mockAuditEvents({
  data = [auditEvent()],
  meta = { current_page: 1, per_page: 25, total_pages: 1, total_count: data.length },
}: {
  data?: unknown[];
  meta?: unknown;
} = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => jsonResponse({ data, meta })),
  );
}

function auditEvent() {
  return {
    id: 10,
    action: "drive_item.create",
    outcome: "success",
    actor_user_id: 42,
    actor_email: "very-long-admin-email-address@example.com",
    organization_id: 7,
    organization_name: "Very Long Organization Name",
    target_type: "DriveItem",
    target_id: 14,
    ip_address: "127.0.0.1",
    occurred_at: "2026-07-17T05:34:30+09:00",
  };
}

function lastAuditEventsUrl() {
  const calls = vi.mocked(fetch).mock.calls.map(([url]) => requestUrl(url));
  const url = [...calls]
    .reverse()
    .find((value) => value.startsWith(`${API_BASE_URL}/api/v1/admin/audit_events`));
  if (!url) throw new Error("audit events request was not sent");
  return url;
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
