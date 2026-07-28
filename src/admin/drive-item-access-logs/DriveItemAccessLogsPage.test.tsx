import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DriveItemAccessLogsPage } from "./DriveItemAccessLogsPage";

describe("DriveItemAccessLogsPage", () => {
  it("長い値を省略可能なセルで表示し、Organization名と整形済みサイズを示す", async () => {
    const email = "very-long-user-email-address-for-layout@example.enterprise.invalid";
    const filename =
      "四半期報告書_最終確認版_関連資料を含む非常に長いファイル名_2026年度.pdf";
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  id: 9,
                  organization_id: 1,
                  organization_name: "長い名称を持つOrganization株式会社",
                  actor: { kind: "user", id: 2, display_name: email },
                  action: "download",
                  drive_item: { id: 3, filename },
                  metadata: {
                    file_size: 2516582,
                    content_type: "application/vnd.example.very-long-content-type",
                  },
                  ip_address: "2001:db8:1234:5678::1",
                  user_agent: null,
                  request_id: "req-9",
                  batch_id: null,
                  occurred_at: "2026-07-28T00:00:00Z",
                },
                {
                  id: 10,
                  organization_id: 2,
                  actor: { kind: "anonymous", id: null, display_name: null },
                  action: "preview",
                  drive_item: { id: null, filename: null },
                  metadata: {},
                  ip_address: null,
                  user_agent: null,
                  request_id: "req-10",
                  batch_id: null,
                  occurred_at: "2026-07-28T01:00:00Z",
                },
                {
                  id: 11,
                  organization_id: 1,
                  organization_name: "長い名称を持つOrganization株式会社",
                  actor: { kind: "user", id: 2, display_name: email },
                  action: "stream",
                  drive_item: { id: 4, filename: "配信用動画.mp4" },
                  metadata: { file_size: 322122547, content_type: "video/mp4" },
                  ip_address: "192.0.2.1",
                  user_agent: null,
                  request_id: "req-11",
                  batch_id: null,
                  occurred_at: "2026-07-28T02:00:00Z",
                },
              ],
              meta: { current_page: 1, per_page: 20, total_pages: 1, total_count: 3 },
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
        ),
      ),
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/system-admin/file-access-logs"]}>
          <Routes>
            <Route
              path="/system-admin/file-access-logs"
              element={<DriveItemAccessLogsPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect((await screen.findAllByTitle(email))[0]).toHaveTextContent(email);
    expect(screen.getByTitle(filename)).toHaveTextContent(filename);
    expect(
      screen.getAllByTitle("長い名称を持つOrganization株式会社")[0],
    ).toBeInTheDocument();
    expect(screen.getByText("2.4 MB")).toBeInTheDocument();
    expect(screen.getByTitle("ダウンロード")).toBeInTheDocument();
    expect(screen.getByTitle("プレビュー")).toBeInTheDocument();
    expect(screen.getByTitle("ストリーミング")).toBeInTheDocument();
    expect(screen.getByText("307 MB")).toBeInTheDocument();
    expect(screen.getAllByTitle("—").length).toBeGreaterThan(0);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "詳細" })[0]).toHaveAttribute(
      "href",
      "/system-admin/file-access-logs/9",
    );
    expect(
      screen.getByRole("region", { name: "ファイルアクセス履歴一覧" }),
    ).toHaveClass("access-log-table-wrapper");
  });
});
