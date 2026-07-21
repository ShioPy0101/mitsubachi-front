import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/errors";
import { formatAppErrorReport, normalizeAppError } from "../errors/appError";
import { ErrorBoundary } from "./ErrorBoundary";
import { ErrorReportPanel } from "./ErrorReportPanel";

describe("ErrorReportPanel", () => {
  it("copies a safe reportable error with request id and api path", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const error = normalizeAppError(
      new ApiError(
        500,
        "アップロード処理に失敗しました。 authorization=Bearer secret",
        [],
        "internal_error",
        "/api/v1/drive_items?token=secret",
        undefined,
        undefined,
        "request-1",
        { item_name: "DSCN0942.mp4", token: "secret" },
      ),
      {
        operation: "ファイルアップロード",
        page: "共有ドライブ / h1 / world",
        safeDetails: { itemType: "file", itemName: "DSCN0942.mp4" },
      },
    );

    render(<ErrorReportPanel error={error} />);
    expect(screen.queryByText(/Request ID:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("エラー内容をコピー"));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const copied = writeText.mock.calls[0]?.[0] as string;
    expect(copied).toContain("Request ID: request-1");
    expect(copied).toContain("操作: ファイルアップロード");
    expect(copied).toContain("APIパス: /api/v1/drive_items");
    expect(copied).toContain("item_name: DSCN0942.mp4");
    expect(copied).not.toMatch(/Bearer secret|token: secret|Authorization|Cookie/i);
    expect(await screen.findByText("コピーしました。")).toBeInTheDocument();
  });

  it("does not show copy controls for name conflicts", () => {
    const error = normalizeAppError(
      new ApiError(
        409,
        "同じ名前のファイルが存在します。",
        [],
        "duplicate_name",
        "/api/v1/drive_items",
      ),
      { operation: "ファイルアップロード", page: "共有ドライブ" },
    );

    render(<ErrorReportPanel error={error} />);

    expect(
      screen.getByText("別名を指定すると同じ操作を再実行できます。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("エラー内容をコピー")).not.toBeInTheDocument();
    expect(screen.queryByText("詳細を表示")).not.toBeInTheDocument();
    expect(screen.queryByText(/Request ID:/)).not.toBeInTheDocument();
  });

  it("shows a manual copy field when clipboard fails", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    const error = normalizeAppError(new Error("失敗しました"), {
      operation: "検索",
      page: "共有ドライブ",
    });

    render(<ErrorReportPanel error={error} />);
    fireEvent.click(screen.getByText("エラー内容をコピー"));

    expect(await screen.findByText("手動コピー用エラー内容")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Mitsubachi エラー報告/)).toBeInTheDocument();
  });

  it("formats without undefined fields", () => {
    const report = formatAppErrorReport(
      normalizeAppError(null, { operation: "プレビュー", page: "共有ドライブ" }),
    );

    expect(report).toContain("Mitsubachi エラー報告");
    expect(report).not.toContain("undefined");
  });
});

describe("ErrorBoundary", () => {
  it("shows fallback UI when a child throws", () => {
    const Broken = () => {
      throw new Error("render failed");
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const preventErrorLog = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener("error", preventErrorLog);

    try {
      render(
        <ErrorBoundary>
          <Broken />
        </ErrorBoundary>,
      );

      expect(screen.getByText("エラーが発生しました")).toBeInTheDocument();
      expect(screen.getByText("エラー内容をコピー")).toBeInTheDocument();
    } finally {
      window.removeEventListener("error", preventErrorLog);
    }
  });

  it("renders children normally", () => {
    render(
      <ErrorBoundary>
        <p>通常画面</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("通常画面")).toBeInTheDocument();
  });
});
