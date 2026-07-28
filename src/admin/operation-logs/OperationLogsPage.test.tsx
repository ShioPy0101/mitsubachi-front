import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { OperationLogsPage } from "./OperationLogsPage";

describe("OperationLogsPage", () => {
  it("操作履歴を新APIから表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  id: 1,
                  organization_id: 1,
                  actor: { kind: "user", id: 2, display_name: "山田" },
                  operation_type: "drive_item.deleted",
                  result: "success",
                  target: { type: "DriveItem", id: 3, display_name: "資料.pdf" },
                  change_set: {},
                  metadata: {},
                  ip_address: "192.0.2.1",
                  user_agent: "test",
                  request_id: "req-1",
                  occurred_at: "2026-07-28T00:00:00Z",
                },
              ],
              meta: { current_page: 1, per_page: 20, total_pages: 1, total_count: 1 },
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
        ),
      ),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/system-admin/operation-logs"]}>
          <Routes>
            <Route
              path="/system-admin/operation-logs"
              element={<OperationLogsPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("ファイルを削除")).toBeInTheDocument();
    expect(screen.getByText("山田")).toBeInTheDocument();
  });
});
