import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UploadMetricsPage } from "./UploadMetricsPage";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  summary: vi.fn(),
  timeseries: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api")>();
  return {
    ...original,
    fetchUploadMetrics: mocks.list,
    fetchUploadMetricSummary: mocks.summary,
    fetchUploadMetricTimeseries: mocks.timeseries,
  };
});

describe("UploadMetricsPage", () => {
  beforeEach(() => {
    mocks.list.mockResolvedValue({
      data: [],
      meta: { current_page: 1, per_page: 20, total_pages: 1, total_count: 0 },
    });
    mocks.summary.mockResolvedValue({
      session_count: 0,
      total_bytes: 0,
      total_files: 0,
      session_success_rate: 0,
      failed_sessions: 0,
      partial_failure_sessions: 0,
      abandoned_sessions: 0,
      file_failure_rate: 0,
      retry_rate: 0,
      retry_count: 0,
      average_throughput_bytes_per_second: 0,
      p50_throughput_bytes_per_second: 0,
      p95_elapsed_ms: 0,
      max_upload_bytes: 0,
    });
    mocks.timeseries.mockResolvedValue([]);
  });

  it("24時間・7日・30日とOrganization・状態フィルターを表示する", async () => {
    renderPage();
    expect(await screen.findByText("セッション数")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "24時間" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "7日" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "30日" })).toBeInTheDocument();
    expect(screen.getByLabelText("Organization ID")).toBeInTheDocument();
    expect(screen.getByLabelText("状態")).toBeInTheDocument();
  });

  it("条件適用時に同じ条件で概要・グラフ・一覧を再取得する", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("セッション数");
    await user.selectOptions(screen.getByLabelText("期間"), "7d");
    await user.type(screen.getByLabelText("Organization ID"), "2");
    await user.click(screen.getByRole("button", { name: "適用" }));
    expect(
      await screen.findByText("条件に一致する項目はありません。"),
    ).toBeInTheDocument();
    expect(mocks.summary).toHaveBeenLastCalledWith(
      expect.stringContaining("period=7d"),
    );
    expect(mocks.timeseries).toHaveBeenLastCalledWith(
      expect.stringContaining("organization_id=2"),
    );
    expect(mocks.list).toHaveBeenLastCalledWith(
      expect.stringContaining("organization_id=2"),
    );
  });
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UploadMetricsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
