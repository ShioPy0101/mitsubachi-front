import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { OperationLogDetailPage } from "./OperationLogDetailPage";

describe("OperationLogDetailPage", () => {
  it("失敗内容と削除済み参照のスナップショットを表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                id: 7,
                organization_id: null,
                organization_name: null,
                actor: { kind: "user", id: null, display_name: null },
                operation_type: "drive_item.purged",
                result: "failure",
                target: { type: "DriveItem", id: 123, display_name: null },
                change_set: {},
                metadata: {
                  actor_email: "deleted@example.com",
                  organization_name: "削除前Organization",
                  target_name: "DSCN3885.jpg",
                  error_code: "storage_delete_failed",
                  error_message: "ストレージから削除できませんでした",
                  http_status: 503,
                },
                ip_address: "192.0.2.1",
                user_agent: "test",
                request_id: "req-detail-7",
                occurred_at: "2026-07-28T00:00:00Z",
              },
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
        ),
      ),
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/system-admin/operation-logs/7"]}>
          <Routes>
            <Route
              path="/system-admin/operation-logs/:operationLogId"
              element={<OperationLogDetailPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("deleted@example.com")).toBeInTheDocument();
    expect(screen.getByText("削除前Organization")).toBeInTheDocument();
    expect(screen.getByText("DSCN3885.jpg")).toBeInTheDocument();
    expect(screen.getByText("storage_delete_failed")).toBeInTheDocument();
    expect(screen.getByText("ストレージから削除できませんでした")).toBeInTheDocument();
    expect(screen.getByText("503")).toBeInTheDocument();
    expect(screen.getByText("req-detail-7")).toBeInTheDocument();
  });
});
