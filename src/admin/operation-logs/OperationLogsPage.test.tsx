import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { OperationLogsPage } from "./OperationLogsPage";

describe("OperationLogsPage", () => {
  it("長い値と削除済み対象のスナップショットを判別可能に表示する", async () => {
    const actorEmail =
      "very-long-operation-log-actor-address@example.enterprise.invalid";
    const longAction =
      "custom.operation.with.a.very.long.internal.action.name.for.fallback";
    const longTarget =
      "監査対象として保存された非常に長いファイル名_四半期報告書_最終版.pdf";
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
                  organization_name: "第一Organization株式会社",
                  actor: { kind: "user", id: 2, display_name: actorEmail },
                  operation_type: longAction,
                  result: "success",
                  target: { type: "DriveItem", id: 3, display_name: longTarget },
                  change_set: {},
                  metadata: {},
                  ip_address: "192.0.2.1",
                  user_agent: "test",
                  request_id: "req-1",
                  occurred_at: "2026-07-28T00:00:00Z",
                },
                {
                  id: 2,
                  organization_id: 9,
                  organization_name: null,
                  actor: { kind: "user", id: null, display_name: null },
                  operation_type: "drive_item.purged",
                  result: "failure",
                  target: { type: "DriveItem", id: 99, display_name: null },
                  change_set: {},
                  metadata: {
                    actor_email: "deleted@example.com",
                    organization_name: "削除前Organization",
                    target_name: "DSCN3885.jpg",
                  },
                  ip_address: null,
                  user_agent: null,
                  request_id: "req-2",
                  occurred_at: "2026-07-28T01:00:00Z",
                },
              ],
              meta: { current_page: 1, per_page: 20, total_pages: 1, total_count: 2 },
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
    expect(await screen.findByTitle(actorEmail)).toHaveTextContent(actorEmail);
    expect(screen.getByTitle(longAction)).toHaveTextContent(longAction);
    expect(screen.getByTitle(longTarget)).toHaveTextContent(longTarget);
    expect(screen.getByTitle("第一Organization株式会社")).toBeInTheDocument();
    expect(screen.getByTitle("削除前Organization")).toBeInTheDocument();
    expect(screen.getByTitle("DSCN3885.jpg（完全削除済み）")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "失敗" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "操作履歴一覧" })).toHaveClass(
      "operation-log-table-wrapper",
    );
  });
});
