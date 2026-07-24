import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/errors";
import { ToastProvider } from "../components/ToastProvider";
import { DrivePage } from "./DrivePage";

type UploadFileInput = {
  file: File;
  name: string;
  parentId: number | null;
  allowDuplicateContent?: boolean;
  duplicateContentAction?: "upload_anyway";
  nameConflictAction?: "auto_rename";
  operationId?: string;
  allowTrashDuplicate?: boolean;
  replaceTrashedDriveItemId?: number;
  onProgress?: (progress: { loaded: number; total?: number; percent?: number }) => void;
};

type CreateDirectoryInput = {
  name: string;
  parentId: number | null;
};

const mocks = vi.hoisted(() => ({
  fetchDriveItems: vi.fn(),
  fetchDriveItem: vi.fn(),
  fetchTrash: vi.fn(),
  uploadFile: vi.fn<(input: UploadFileInput) => Promise<unknown>>(),
  searchDriveItems: vi.fn(),
  bulkMove: vi.fn(),
  bulkPurge: vi.fn(),
  bulkRestore: vi.fn(),
  bulkRestorePreview: vi.fn(),
  moveDriveItem: vi.fn(),
  createExternalShare: vi.fn(),
  regenerateExternalSharePassword: vi.fn(),
  createDirectory: vi.fn<(input: CreateDirectoryInput) => Promise<unknown>>(),
  purgeDriveItem: vi.fn(),
  restorePreview: vi.fn(),
  restoreDriveItem: vi.fn(),
}));

vi.mock("./api", () => ({
  driveKeys: {
    all: ["drive-items"] as const,
    list: (parentId: number | null) => ["drive-items", "list", { parentId }] as const,
    detail: (id: number) => ["drive-items", "detail", id] as const,
    trash: () => ["drive-items", "trash"] as const,
  },
  fetchDriveItems: mocks.fetchDriveItems,
  fetchDriveItem: mocks.fetchDriveItem,
  fetchTrash: mocks.fetchTrash,
  uploadFile: mocks.uploadFile,
  searchDriveItems: mocks.searchDriveItems,
  bulkDelete: vi.fn(),
  bulkDownload: vi.fn(),
  bulkMove: mocks.bulkMove,
  bulkPurge: mocks.bulkPurge,
  bulkRestore: mocks.bulkRestore,
  bulkRestorePreview: mocks.bulkRestorePreview,
  createDirectory: mocks.createDirectory,
  deleteDriveItem: vi.fn(),
  purgeDriveItem: mocks.purgeDriveItem,
  downloadDriveItem: vi.fn(),
  previewUrl: vi.fn((id: number) => `/preview/${id}`),
  renameDriveItem: vi.fn(),
  moveDriveItem: mocks.moveDriveItem,
  restoreDriveItem: mocks.restoreDriveItem,
  restorePreview: mocks.restorePreview,
  normalizeRestorePreview: (value: unknown) => value,
  streamUrl: vi.fn((id: number) => `/stream/${id}`),
}));

vi.mock("../externalShares/api", () => ({
  createExternalShare: mocks.createExternalShare,
  regenerateExternalSharePassword: mocks.regenerateExternalSharePassword,
}));

describe("DrivePage drag and drop upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchDriveItems.mockResolvedValue([]);
    mocks.fetchDriveItem.mockResolvedValue({
      id: 42,
      parent_id: null,
      name: "Reports",
      item_type: "directory",
    });
    mocks.fetchTrash.mockResolvedValue([]);
    mocks.uploadFile.mockImplementation((input) => {
      input.onProgress?.({
        loaded: input.file.size,
        total: input.file.size,
        percent: 100,
      });
      return Promise.resolve({
        id: 1,
        parent_id: 42,
        name: "report",
        item_type: "file",
      });
    });
    mocks.searchDriveItems.mockResolvedValue({
      data: [],
      meta: { current_page: 1, per_page: 50, total_pages: 0, total_count: 0 },
    });
    mocks.bulkMove.mockResolvedValue({ message: "移動しました" });
    mocks.bulkRestore.mockResolvedValue({ message: "復元しました" });
    mocks.restorePreview.mockResolvedValue(restorePreviewResponse());
    mocks.bulkRestorePreview.mockResolvedValue(restorePreviewResponse());
    mocks.moveDriveItem.mockResolvedValue({
      data: { id: 1, parent_id: 2, name: "moved", item_type: "file" },
    });
    mocks.createExternalShare.mockResolvedValue({
      id: 12,
      name: "公開",
      share_url: "https://front.example/share/raw-token",
      folder_share_mode: "snapshot",
      allow_download: true,
      allow_bulk_download: true,
      password_required: false,
    });
    mocks.regenerateExternalSharePassword.mockResolvedValue({
      id: 12,
      name: "公開",
      folder_share_mode: "snapshot",
      allow_download: true,
      allow_bulk_download: true,
      password_required: true,
      generated_password: "N3wPassw0rdValue",
    });
    mocks.purgeDriveItem.mockResolvedValue({ message: "完全削除しました" });
    mocks.restoreDriveItem.mockResolvedValue({
      id: 77,
      parent_id: 42,
      name: "trashed",
      extension: "txt",
      item_type: "file",
    });
    mocks.createDirectory.mockImplementation(({ name, parentId }) =>
      Promise.resolve({
        id: name === "素材" ? 100 : 101,
        parent_id: parentId,
        name,
        item_type: "directory",
      }),
    );
    HTMLDialogElement.prototype.showModal = vi.fn(function showModal(
      this: HTMLDialogElement,
    ) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
      this.open = false;
    });
  });

  it("uploads dropped files to the current folder and refreshes the list", async () => {
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    const file = new File(["content"], "report.pdf", { type: "application/pdf" });
    fireEvent.drop(driveDropTarget(container), {
      dataTransfer: dataTransferWithFiles([file]),
    });

    await waitFor(() => {
      expect(mocks.uploadFile.mock.calls[0]?.[0]).toMatchObject({
        file,
        name: "report",
        parentId: 42,
      });
    });
    await waitFor(() => {
      expect(mocks.fetchDriveItems).toHaveBeenCalledTimes(2);
    });
  });

  it("uses the same upload path for file input selection", async () => {
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    const file = new File(["content"], "selected.txt", { type: "text/plain" });
    fireEvent.change(fileInput(container), { target: { files: [file] } });

    await waitFor(() => {
      expect(mocks.uploadFile.mock.calls[0]?.[0]).toMatchObject({
        file,
        name: "selected",
        parentId: 42,
      });
    });
  });

  it("uploads multiple dropped files sequentially", async () => {
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    const first = new File(["a"], "first.txt", { type: "text/plain" });
    const second = new File(["b"], "second.txt", { type: "text/plain" });
    fireEvent.drop(driveDropTarget(container), {
      dataTransfer: dataTransferWithFiles([first, second]),
    });

    await waitFor(() => {
      expect(mocks.uploadFile).toHaveBeenCalledTimes(2);
    });
    expect(mocks.uploadFile.mock.calls[0]?.[0].file).toBe(first);
    expect(mocks.uploadFile.mock.calls[1]?.[0].file).toBe(second);
  });

  it("uploads every file in a dropped folder when directory entries are returned in chunks", async () => {
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    const files = Array.from(
      { length: 101 },
      (_, index) =>
        new File([`content-${index}`], `clip-${index}.txt`, { type: "text/plain" }),
    );
    // このテストでは進捗表示を検証しないため、再描画を増やさずAPIの完了だけを明示する。
    mocks.uploadFile.mockImplementation(() => Promise.resolve({ id: 1 }));
    fireEvent.drop(driveDropTarget(container), {
      dataTransfer: dataTransferWithDirectory("素材", files),
    });

    await waitFor(() => {
      expect(mocks.uploadFile).toHaveBeenCalledTimes(101);
    });
    expect(mocks.uploadFile.mock.calls[0]?.[0]).toMatchObject({
      file: files[0],
      name: "clip-0",
      parentId: 100,
    });
    expect(mocks.uploadFile.mock.calls[100]?.[0]).toMatchObject({
      file: files[100],
      name: "clip-100",
      parentId: 100,
    });
  });

  it("keeps a dropped folder batch scanning until directory traversal finishes", async () => {
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    const file = new File(["content"], "clip.txt", { type: "text/plain" });
    const transfer = deferredDirectoryDataTransfer("素材", [file]);
    fireEvent.drop(driveDropTarget(container), { dataTransfer: transfer.dataTransfer });

    expect(await screen.findByText("ファイルを確認しています")).toBeInTheDocument();
    expect(screen.getByText("0件検出済み")).toBeInTheDocument();
    expect(
      screen.queryByText(/アップロード処理が完了しました/),
    ).not.toBeInTheDocument();
    expect(mocks.uploadFile).not.toHaveBeenCalled();

    transfer.resolveNextChunk();
    expect(await screen.findByText("1件検出済み")).toBeInTheDocument();
    expect(
      screen.queryByText(/アップロード処理が完了しました/),
    ).not.toBeInTheDocument();
    expect(mocks.uploadFile).not.toHaveBeenCalled();

    transfer.resolveNextChunk();
    await waitFor(() => expect(mocks.uploadFile).toHaveBeenCalledTimes(1));
  });

  it("marks a folder batch completed only after scanning and every upload result finish", async () => {
    const uploadResolvers: Array<() => void> = [];
    mocks.uploadFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          uploadResolvers.push(() => resolve({ id: 1 }));
        }),
    );
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    const files = [
      new File(["a"], "first.txt", { type: "text/plain" }),
      new File(["b"], "second.txt", { type: "text/plain" }),
    ];
    fireEvent.drop(driveDropTarget(container), {
      dataTransfer: dataTransferWithDirectory("素材", files),
    });

    await waitFor(() => expect(mocks.uploadFile).toHaveBeenCalledTimes(2));
    expect(screen.getByText("0 / 2 件完了")).toBeInTheDocument();

    uploadResolvers[0]?.();
    await waitFor(() => expect(screen.getByText("1 / 2 件完了")).toBeInTheDocument());
    expect(
      screen.queryByText(/アップロード処理が完了しました/),
    ).not.toBeInTheDocument();

    uploadResolvers[1]?.();
    expect(
      await screen.findByText("2件のアップロード処理が完了しました"),
    ).toBeInTheDocument();
  });

  it("does not reject dropped folders with more than 1000 files", async () => {
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    const files = Array.from(
      { length: 1001 },
      (_, index) =>
        new File([`content-${index}`], `large-${index}.txt`, { type: "text/plain" }),
    );
    const transfer = deferredDirectoryDataTransfer("素材", files);
    fireEvent.drop(driveDropTarget(container), {
      dataTransfer: transfer.dataTransfer,
    });
    transfer.resolveNextChunk();

    expect(await screen.findByText("1001件検出済み")).toBeInTheDocument();
    expect(mocks.uploadFile).not.toHaveBeenCalled();
    expect(
      screen.queryByText("アップロードできるファイル数の上限を超えています。"),
    ).not.toBeInTheDocument();
  });

  it("refreshes the Drive list and shows completion toast once per folder batch", async () => {
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");
    const initialCurrentFolderFetches = mocks.fetchDriveItems.mock.calls.filter(
      ([parentId]) => parentId === 42,
    ).length;

    const files = [
      new File(["a"], "first.txt", { type: "text/plain" }),
      new File(["b"], "second.txt", { type: "text/plain" }),
      new File(["c"], "third.txt", { type: "text/plain" }),
    ];
    mocks.uploadFile.mockImplementation(() => Promise.resolve({ id: 1 }));
    fireEvent.drop(driveDropTarget(container), {
      dataTransfer: dataTransferWithDirectory("素材", files),
    });

    await waitFor(() => {
      expect(screen.getAllByText("3 / 3 件アップロードしました。")).toHaveLength(1);
    });
    const currentFolderFetches = mocks.fetchDriveItems.mock.calls.filter(
      ([parentId]) => parentId === 42,
    ).length;
    expect(currentFolderFetches).toBe(initialCurrentFolderFetches + 2);
  });

  it("does not call the upload API for non-file drops", async () => {
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    fireEvent.drop(driveDropTarget(container), {
      dataTransfer: {
        types: ["text/plain"],
        files: [],
        items: [],
      },
    });

    expect(mocks.uploadFile).not.toHaveBeenCalled();
  });

  it("shows and hides the drag overlay", async () => {
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    const target = driveDropTarget(container);
    fireEvent.dragEnter(target, {
      dataTransfer: dataTransferWithFiles([
        new File(["content"], "report.pdf", { type: "application/pdf" }),
      ]),
    });

    expect(
      screen.getByText("ここにファイルをドロップしてアップロード"),
    ).toBeInTheDocument();

    fireEvent.dragLeave(target, {
      dataTransfer: dataTransferWithFiles([
        new File(["content"], "report.pdf", { type: "application/pdf" }),
      ]),
    });

    expect(
      screen.queryByText("ここにファイルをドロップしてアップロード"),
    ).not.toBeInTheDocument();
  });

  it("shows an error toast when upload fails", async () => {
    mocks.uploadFile.mockRejectedValueOnce(
      new Error("ファイルサイズが上限を超えています。"),
    );
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    fireEvent.drop(driveDropTarget(container), {
      dataTransfer: dataTransferWithFiles([
        new File(["content"], "large.zip", { type: "application/zip" }),
      ]),
    });

    expect(await screen.findByText(/アップロードに失敗しました/)).toBeInTheDocument();
  });

  it("opens a rename-and-retry dialog without copy controls when upload name conflicts", async () => {
    mocks.uploadFile.mockRejectedValueOnce(
      new ApiError(
        409,
        "同じ名前のファイルが存在します。",
        [],
        "duplicate_name",
        "/api/v1/drive_items",
        "name",
        "report.pdf",
        "request-upload-409",
        { suggested_name: "report（1）", suggested_filename: "report（1）.pdf" },
      ),
    );
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    const file = new File(["content"], "report.pdf", { type: "application/pdf" });
    fireEvent.drop(driveDropTarget(container), {
      dataTransfer: dataTransferWithFiles([file]),
    });

    expect(await screen.findByText("名前の重複")).toBeInTheDocument();
    expect(
      screen.getAllByText("同じ名前のファイルが存在します。").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue("report（1）").length).toBeGreaterThan(0);
    expect(screen.queryByText("エラー内容をコピー")).not.toBeInTheDocument();

    mocks.uploadFile.mockResolvedValueOnce({
      id: 4,
      parent_id: 42,
      name: "report（1）",
      item_type: "file",
    });
    fireEvent.click(screen.getByText("名前を変更して再試行"));

    await waitFor(() => {
      expect(mocks.uploadFile.mock.calls[1]?.[0]).toMatchObject({
        file,
        name: "report（1）",
        parentId: 42,
      });
    });
  });

  it("allows an intentional upload of active duplicate content", async () => {
    mocks.uploadFile.mockRejectedValueOnce(
      new ApiError(
        409,
        "同じ内容のファイルがすでに存在します。",
        [],
        "active_content_duplicate",
        "/api/v1/drive_items",
        "name",
        "report.pdf",
        "request-content-409",
        { suggested_name: "report（1）", duplicate_kind: "same_content" },
        [
          {
            id: 9,
            name: "report.pdf",
            parent_id: 42,
            parent_name: "Reports",
            owner_display_name: "佐藤",
            created_at: "2026-07-19T10:00:00.000Z",
            file_size: 4,
            deleted: false,
          },
        ],
      ),
    );
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    const file = new File(["same"], "report.pdf", { type: "application/pdf" });
    fireEvent.drop(driveDropTarget(container), {
      dataTransfer: dataTransferWithFiles([file]),
    });

    expect(
      await screen.findByRole("heading", { name: "同じ内容のファイルがあります" }),
    ).toBeInTheDocument();
    const dialog = within(openDialog("同じ内容のファイルがあります"));
    expect(
      dialog.getAllByText("同じ内容のファイルがすでに存在します。").length,
    ).toBeGreaterThan(0);
    expect(dialog.getAllByText("report.pdf").length).toBeGreaterThan(0);
    expect(dialog.getAllByText("保存先: Reports").length).toBeGreaterThan(0);
    expect(dialog.getAllByText("アップロード者: 佐藤").length).toBeGreaterThan(0);
    expect(dialog.queryByLabelText("名前")).not.toBeInTheDocument();
    expect(dialog.queryByText("名前を変更して再試行")).not.toBeInTheDocument();
    expect(dialog.queryByText("エラー内容をコピー")).not.toBeInTheDocument();

    fireEvent.click(dialog.getByRole("button", { name: "同じ内容でもアップロード" }));

    await waitFor(() => expect(mocks.uploadFile).toHaveBeenCalledTimes(2));
    expect(mocks.uploadFile.mock.calls[1]?.[0]).toMatchObject({
      allowDuplicateContent: true,
      duplicateContentAction: "upload_anyway",
      file,
      nameConflictAction: "auto_rename",
      parentId: 42,
    });
    expect(mocks.uploadFile.mock.calls[1]?.[0].operationId).toMatch(
      /^duplicate-content-single-/,
    );
  });

  it("bulk uploads unresolved duplicate content items with auto rename", async () => {
    mocks.uploadFile
      .mockRejectedValueOnce(duplicateContentError("同じ内容のファイルです。"))
      .mockRejectedValueOnce(duplicateContentError("同じ内容のファイルです。"))
      .mockResolvedValueOnce({
        id: 11,
        parent_id: 42,
        name: "first",
        item_type: "file",
      })
      .mockRejectedValueOnce(new Error("容量が不足しています。"));
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    const first = new File(["same-a"], "first.txt", { type: "text/plain" });
    const second = new File(["same-b"], "second.txt", { type: "text/plain" });
    fireEvent.drop(driveDropTarget(container), {
      dataTransfer: dataTransferWithFiles([first, second]),
    });

    expect(
      await screen.findByRole("button", {
        name: "同じ内容でもすべてアップロード（2件）",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "同じ内容のファイルがあります" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "同じ内容でもすべてアップロード（2件）",
      }),
    );

    const confirm = within(openDialog("同じ内容でもすべてアップロード"));
    expect(
      confirm.getByText(
        /同じ内容のファイルがすでに存在する2件を、新しいファイルとしてアップロードします/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(confirm.getByRole("button", { name: "2件をアップロード" }));

    await waitFor(() => expect(mocks.uploadFile).toHaveBeenCalledTimes(4));
    const firstRetry = mocks.uploadFile.mock.calls[2]?.[0];
    const secondRetry = mocks.uploadFile.mock.calls[3]?.[0];
    expect(firstRetry).toMatchObject({
      file: first,
      allowDuplicateContent: true,
      duplicateContentAction: "upload_anyway",
      nameConflictAction: "auto_rename",
    });
    expect(secondRetry).toMatchObject({
      file: second,
      allowDuplicateContent: true,
      duplicateContentAction: "upload_anyway",
      nameConflictAction: "auto_rename",
    });
    expect(firstRetry?.operationId).toMatch(/^duplicate-content-bulk-/);
    expect(secondRetry?.operationId).toBe(firstRetry?.operationId);
    expect(
      await screen.findByText(/一括処理結果: 完了: 1件 \/ 失敗: 1件/),
    ).toBeInTheDocument();
    expect(screen.getAllByText("容量が不足しています。").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", {
        name: "同じ内容でもすべてアップロード（2件）",
      }),
    ).not.toBeInTheDocument();
  });

  it("excludes all unresolved duplicate content items without retrying other errors", async () => {
    mocks.uploadFile
      .mockRejectedValueOnce(duplicateContentError("同じ内容のファイルです。"))
      .mockRejectedValueOnce(new Error("容量が不足しています。"));
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    fireEvent.drop(driveDropTarget(container), {
      dataTransfer: dataTransferWithFiles([
        new File(["same"], "same.txt", { type: "text/plain" }),
        new File(["large"], "large.zip", { type: "application/zip" }),
      ]),
    });

    fireEvent.click(
      await screen.findByRole("button", {
        name: "同じ内容の項目をすべて除外（1件）",
      }),
    );

    await waitFor(() => expect(mocks.uploadFile).toHaveBeenCalledTimes(2));
    const detailsButton = screen.queryAllByRole("button", { name: "詳細を表示" })[0];
    if (detailsButton) fireEvent.click(detailsButton);
    expect(screen.getByText("同じ内容のため除外しました")).toBeInTheDocument();
    expect(screen.getAllByText("容量が不足しています。").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", {
        name: "同じ内容でもすべてアップロード（1件）",
      }),
    ).not.toBeInTheDocument();
  });

  it("resolves trash duplicate content by restoring the duplicate item", async () => {
    const file = new File(["same"], "report.txt", { type: "text/plain" });
    mocks.uploadFile.mockRejectedValueOnce(trashDuplicateError());
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    fireEvent.drop(driveDropTarget(container), {
      dataTransfer: dataTransferWithFiles([file]),
    });

    expect(
      await screen.findByRole("heading", {
        name: "同じ内容のファイルがゴミ箱にあります",
      }),
    ).toBeInTheDocument();
    const dialog = within(openDialog("同じ内容のファイルがゴミ箱にあります"));
    expect(dialog.getByText("復元する")).toBeInTheDocument();
    expect(dialog.getByText("ゴミ箱で確認")).toBeInTheDocument();
    expect(dialog.getByText("キャンセル")).toBeInTheDocument();
    expect(dialog.getByText("report.txt")).toBeInTheDocument();
    expect(dialog.getByText("/Reports")).toBeInTheDocument();
    expect(dialog.getByText("佐藤")).toBeInTheDocument();
    expect(dialog.getByText("4 B")).toBeInTheDocument();
    expect(dialog.queryByLabelText("名前")).not.toBeInTheDocument();
    expect(dialog.queryByText("名前を変更して再試行")).not.toBeInTheDocument();

    await waitFor(() => expect(dialog.getByText("復元する")).not.toBeDisabled());
    fireEvent.click(dialog.getByText("復元する"));

    await waitFor(() => expect(mocks.restoreDriveItem).toHaveBeenCalledWith(199));
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByText("詳細を表示"));
    expect(await screen.findByText("ゴミ箱から復元済み")).toBeInTheDocument();
    expect(
      screen.getByText("「report.txt」をゴミ箱から復元しました"),
    ).toBeInTheDocument();
  });

  it("opens trash from trash duplicate content conflict", async () => {
    const file = new File(["same"], "report.txt", { type: "text/plain" });
    mocks.uploadFile.mockRejectedValueOnce(trashDuplicateError());
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    fireEvent.drop(driveDropTarget(container), {
      dataTransfer: dataTransferWithFiles([file]),
    });
    await screen.findByRole("heading", {
      name: "同じ内容のファイルがゴミ箱にあります",
    });
    const dialog = within(openDialog("同じ内容のファイルがゴミ箱にあります"));
    fireEvent.click(dialog.getByText("ゴミ箱で確認"));

    expect(await screen.findByRole("heading", { name: "ゴミ箱" })).toBeInTheDocument();
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
  });

  it("cancels only the trash duplicate upload item", async () => {
    const conflictFile = new File(["same"], "report.txt", { type: "text/plain" });
    const okFile = new File(["ok"], "ok.txt", { type: "text/plain" });
    mocks.uploadFile
      .mockRejectedValueOnce(trashDuplicateError())
      .mockResolvedValueOnce({
        id: 6,
        parent_id: 42,
        name: "ok",
        item_type: "file",
      });
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    fireEvent.drop(driveDropTarget(container), {
      dataTransfer: dataTransferWithFiles([conflictFile, okFile]),
    });
    await screen.findByRole("heading", {
      name: "同じ内容のファイルがゴミ箱にあります",
    });
    const dialog = within(openDialog("同じ内容のファイルがゴミ箱にあります"));
    await waitFor(() => expect(dialog.getByText("キャンセル")).not.toBeDisabled());
    fireEvent.click(dialog.getByText("キャンセル"));

    await waitFor(() => expect(mocks.uploadFile).toHaveBeenCalledTimes(2));
    expect(mocks.restoreDriveItem).not.toHaveBeenCalled();
    const detailsButton = screen.queryAllByRole("button", { name: "詳細を表示" })[0];
    if (detailsButton) fireEvent.click(detailsButton);
    expect(screen.getByText("キャンセルしました")).toBeInTheDocument();
    expect(screen.getByText("完了")).toBeInTheDocument();
  });

  it("keeps trash duplicate conflict open when restore fails", async () => {
    const file = new File(["same"], "report.txt", { type: "text/plain" });
    mocks.uploadFile.mockRejectedValueOnce(trashDuplicateError());
    mocks.restoreDriveItem.mockRejectedValueOnce(
      new ApiError(404, "対象が存在しないか、アクセスできません。", [], "not_found"),
    );
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    fireEvent.drop(driveDropTarget(container), {
      dataTransfer: dataTransferWithFiles([file]),
    });
    await screen.findByRole("heading", {
      name: "同じ内容のファイルがゴミ箱にあります",
    });
    const dialog = within(openDialog("同じ内容のファイルがゴミ箱にあります"));
    await waitFor(() => expect(dialog.getByText("復元する")).not.toBeDisabled());
    fireEvent.click(dialog.getByText("復元する"));

    await waitFor(() => expect(mocks.restoreDriveItem).toHaveBeenCalledWith(199));
    expect(
      screen.getByRole("heading", { name: "同じ内容のファイルがゴミ箱にあります" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("ゴミ箱から復元済み")).not.toBeInTheDocument();
  });

  it("shows parent-missing resolution choices when trash duplicate restore returns invalid_parent", async () => {
    const file = new File(["same"], "report.txt", { type: "text/plain" });
    mocks.uploadFile.mockRejectedValueOnce(trashDuplicateError());
    mocks.restoreDriveItem.mockRejectedValueOnce(
      new ApiError(404, "復元先フォルダが見つかりません", [], "invalid_parent"),
    );
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    fireEvent.drop(driveDropTarget(container), {
      dataTransfer: dataTransferWithFiles([file]),
    });
    await screen.findByRole("heading", {
      name: "同じ内容のファイルがゴミ箱にあります",
    });
    fireEvent.click(screen.getByText("復元する"));

    expect(
      await screen.findByRole("heading", { name: "元の保存先に復元できません" }),
    ).toBeInTheDocument();
    const dialog = within(openDialog("元の保存先に復元できません"));
    expect(dialog.getByText("ゴミ箱で確認")).toBeInTheDocument();
    expect(
      dialog.getByText("元のファイルを完全削除して、新規にアップロードする"),
    ).toBeInTheDocument();
    expect(dialog.getByText("キャンセル")).toBeInTheDocument();
    expect(dialog.queryByText("復元する")).not.toBeInTheDocument();
    expect(dialog.queryByLabelText("名前")).not.toBeInTheDocument();
    expect(dialog.queryByText("名前を変更して再試行")).not.toBeInTheDocument();
    expect(dialog.getByText("削除済み、または存在しません")).toBeInTheDocument();
  });

  it("opens trash after invalid_parent without re-uploading", async () => {
    const file = new File(["same"], "report.txt", { type: "text/plain" });
    mocks.uploadFile.mockRejectedValueOnce(trashDuplicateError());
    mocks.restoreDriveItem.mockRejectedValueOnce(
      new ApiError(404, "復元先フォルダが見つかりません", [], "invalid_parent"),
    );
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    fireEvent.drop(driveDropTarget(container), {
      dataTransfer: dataTransferWithFiles([file]),
    });
    await screen.findByRole("heading", {
      name: "同じ内容のファイルがゴミ箱にあります",
    });
    fireEvent.click(screen.getByText("復元する"));
    await screen.findByRole("heading", { name: "元の保存先に復元できません" });
    fireEvent.click(screen.getByText("ゴミ箱で確認"));

    expect(await screen.findByRole("heading", { name: "ゴミ箱" })).toBeInTheDocument();
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
  });

  it("confirms purge before uploading with replace_trashed_drive_item_id", async () => {
    const file = new File(["same"], "report.txt", { type: "text/plain" });
    mocks.uploadFile.mockRejectedValueOnce(trashDuplicateError());
    mocks.restoreDriveItem.mockRejectedValueOnce(
      new ApiError(404, "復元先フォルダが見つかりません", [], "invalid_parent"),
    );
    mocks.uploadFile.mockResolvedValueOnce({
      id: 11,
      parent_id: 42,
      name: "report",
      item_type: "file",
    });
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    fireEvent.drop(driveDropTarget(container), {
      dataTransfer: dataTransferWithFiles([file]),
    });
    await screen.findByRole("heading", {
      name: "同じ内容のファイルがゴミ箱にあります",
    });
    fireEvent.click(screen.getByText("復元する"));
    await screen.findByRole("heading", { name: "元の保存先に復元できません" });
    fireEvent.click(
      screen.getByText("元のファイルを完全削除して、新規にアップロードする"),
    );
    expect(
      await screen.findByRole("heading", { name: "元のファイルを完全削除しますか？" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("完全削除してアップロード"));

    await waitFor(() => {
      expect(mocks.uploadFile.mock.calls[1]?.[0]).toMatchObject({
        file,
        name: "report",
        parentId: 42,
        replaceTrashedDriveItemId: 99,
      });
    });
    expect(mocks.uploadFile.mock.calls[1]?.[0].allowTrashDuplicate).toBeUndefined();
  });

  it("returns from purge confirmation without losing the original file object", async () => {
    const file = new File(["same"], "report.txt", { type: "text/plain" });
    mocks.uploadFile.mockRejectedValueOnce(trashDuplicateError());
    mocks.restoreDriveItem.mockRejectedValueOnce(
      new ApiError(404, "復元先フォルダが見つかりません", [], "invalid_parent"),
    );
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    fireEvent.drop(driveDropTarget(container), {
      dataTransfer: dataTransferWithFiles([file]),
    });
    await screen.findByRole("heading", {
      name: "同じ内容のファイルがゴミ箱にあります",
    });
    fireEvent.click(screen.getByText("復元する"));
    await screen.findByRole("heading", { name: "元の保存先に復元できません" });
    fireEvent.click(
      screen.getByText("元のファイルを完全削除して、新規にアップロードする"),
    );
    fireEvent.click(await screen.findByText("戻る"));

    expect(
      screen.getByRole("heading", { name: "元の保存先に復元できません" }),
    ).toBeInTheDocument();
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
  });

  it("restores a single non-conflicting trash item without showing state changed warning", async () => {
    mocks.fetchTrash.mockResolvedValue([
      {
        id: 29,
        parent_id: 42,
        name: "simple",
        item_type: "file",
        extension: "txt",
        deleted_at: "2026-07-23T10:00:00+09:00",
      },
    ]);
    mocks.restorePreview.mockResolvedValueOnce(
      restorePreviewResponse({
        itemId: 29,
        beforeName: "simple.txt",
        afterName: "simple.txt",
        conflictType: "none",
        resolution: "restore",
      }),
    );

    renderDrivePage("/trash");

    fireEvent.click(await screen.findByLabelText("simpleを選択"));
    fireEvent.click(screen.getByRole("button", { name: "復元" }));

    await waitFor(() => {
      expect(mocks.restoreDriveItem).toHaveBeenCalledWith(29, "preview-token");
    });
    expect(
      screen.queryByRole("heading", { name: "復元内容の確認" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "確認後に復元先の状態が変更されました。内容を再確認してください",
      ),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("復元しました。")).toBeInTheDocument();
  });

  it("shows restore preview with before and after names for a single name conflict", async () => {
    mocks.fetchTrash.mockResolvedValue([
      {
        id: 30,
        parent_id: 42,
        name: "conflict",
        item_type: "file",
        extension: "txt",
        deleted_at: "2026-07-23T10:00:00+09:00",
      },
    ]);
    mocks.restorePreview.mockResolvedValueOnce(
      restorePreviewResponse({
        itemId: 30,
        beforeName: "conflict.txt",
        afterName: "conflict (1).txt",
        conflictType: "name_conflict",
      }),
    );
    renderDrivePage("/trash");

    fireEvent.click(await screen.findByLabelText("conflictを選択"));
    fireEvent.click(screen.getByRole("button", { name: "復元" }));

    expect(
      await screen.findByRole("heading", { name: "復元内容の確認" }),
    ).toBeInTheDocument();
    expect(screen.getByText("競合 1 件")).toBeInTheDocument();
    expect(screen.getAllByText("conflict.txt").length).toBeGreaterThan(0);
    expect(screen.getByText("conflict (1).txt")).toBeInTheDocument();
    expect(
      screen.getByText("復元先に同名のファイルまたはフォルダーがあります"),
    ).toBeInTheDocument();
  });

  it("updates restore preview immediately when automatic rename is selected", async () => {
    mocks.fetchTrash.mockResolvedValue([
      { id: 31, parent_id: 42, name: "conflict", item_type: "file", extension: "txt" },
    ]);
    mocks.restorePreview.mockResolvedValueOnce(
      restorePreviewResponse({
        itemId: 31,
        beforeName: "conflict.txt",
        afterName: "conflict.txt",
        conflictType: "name_conflict",
        resolution: "trash_existing",
      }),
    );
    mocks.restorePreview.mockResolvedValueOnce(
      restorePreviewResponse({
        itemId: 31,
        beforeName: "conflict.txt",
        afterName: "conflict (1).txt",
        conflictType: "name_conflict",
        resolution: "rename",
      }),
    );
    renderDrivePage("/trash");

    fireEvent.click(await screen.findByLabelText("conflictを選択"));
    fireEvent.click(screen.getByRole("button", { name: "復元" }));
    const select = await screen.findByLabelText("解決方法");
    fireEvent.change(select, { target: { value: "rename" } });

    expect(await screen.findByText("conflict (1).txt")).toBeInTheDocument();
  });

  it("shows destructive warning when purge existing is selected", async () => {
    mocks.fetchTrash.mockResolvedValue([
      { id: 32, parent_id: 42, name: "conflict", item_type: "file", extension: "txt" },
    ]);
    mocks.restorePreview.mockResolvedValueOnce(
      restorePreviewResponse({
        itemId: 32,
        beforeName: "conflict.txt",
        afterName: "conflict.txt",
        conflictType: "name_conflict",
        resolution: "trash_existing",
      }),
    );
    renderDrivePage("/trash");

    fireEvent.click(await screen.findByLabelText("conflictを選択"));
    fireEvent.click(screen.getByRole("button", { name: "復元" }));

    await waitFor(() => {
      expect(
        screen.getAllByText((_, node) =>
          Boolean(
            node?.textContent?.includes("existing.txt") &&
            node.textContent.includes("ゴミ箱へ移動します"),
          ),
        ).length,
      ).toBeGreaterThan(0);
    });
    expect(
      screen.getAllByText((_, node) =>
        Boolean(
          node?.textContent?.includes("existing.txt") &&
          node.textContent.includes("既存の項目はゴミ箱へ移動されます"),
        ),
      ).length,
    ).toBeGreaterThan(0);
  });

  it("shows root restore and select destination choices for missing parent", async () => {
    mocks.fetchTrash.mockResolvedValue([
      { id: 33, parent_id: 999, name: "orphan", item_type: "file", extension: "txt" },
    ]);
    mocks.restorePreview.mockResolvedValueOnce(
      restorePreviewResponse({
        itemId: 33,
        beforeName: "orphan.txt",
        afterName: "orphan.txt",
        conflictType: "missing_parent",
        resolution: "restore_to_root",
        beforeParentPath: "削除済み、または存在しません",
        afterParentPath: "/共有ドライブ",
      }),
    );
    renderDrivePage("/trash");

    fireEvent.click(await screen.findByLabelText("orphanを選択"));
    fireEvent.click(screen.getByRole("button", { name: "復元" }));

    expect(await screen.findByText("親フォルダなし")).toBeInTheDocument();
    expect(screen.getAllByText("共有ドライブのルートに復元").length).toBeGreaterThan(0);
    expect(screen.getByText("別のフォルダを選択")).toBeInTheDocument();
    expect(screen.getByText("/共有ドライブ")).toBeInTheDocument();
  });

  it("keeps all restore conflicts in one preview modal and supports bulk changes", async () => {
    mocks.fetchTrash.mockResolvedValue([
      { id: 34, parent_id: 42, name: "a", item_type: "file", extension: "txt" },
      { id: 35, parent_id: 42, name: "b", item_type: "file", extension: "txt" },
    ]);
    mocks.bulkRestorePreview.mockResolvedValueOnce(
      restorePreviewResponse({
        items: [
          restorePreviewItem({
            itemId: 34,
            beforeName: "a.txt",
            afterName: "a (1).txt",
          }),
          restorePreviewItem({
            itemId: 35,
            beforeName: "b.txt",
            afterName: "b (1).txt",
          }),
        ],
      }),
    );
    mocks.bulkRestorePreview.mockResolvedValueOnce(
      restorePreviewResponse({
        items: [
          restorePreviewItem({
            itemId: 34,
            beforeName: "a.txt",
            afterName: null,
            resolution: "skip",
          }),
          restorePreviewItem({
            itemId: 35,
            beforeName: "b.txt",
            afterName: null,
            resolution: "skip",
          }),
        ],
      }),
    );
    renderDrivePage("/trash");

    fireEvent.click(await screen.findByLabelText("aを選択"));
    fireEvent.click(screen.getByLabelText("bを選択"));
    fireEvent.click(screen.getByRole("button", { name: "復元" }));

    expect(
      await screen.findByRole("heading", { name: "復元内容の確認（2件）" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("a.txt").length).toBeGreaterThan(0);
    expect(screen.getAllByText("b.txt").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    fireEvent.click(screen.getByText("すべてスキップ"));
    expect(await screen.findByText("スキップ 2 件")).toBeInTheDocument();
  });

  it("allows changing one item after bulk restore resolution is applied", async () => {
    mocks.fetchTrash.mockResolvedValue([
      { id: 36, parent_id: 42, name: "a", item_type: "file", extension: "txt" },
      { id: 37, parent_id: 42, name: "b", item_type: "file", extension: "txt" },
    ]);
    mocks.bulkRestorePreview
      .mockResolvedValueOnce(
        restorePreviewResponse({
          items: [
            restorePreviewItem({
              itemId: 36,
              beforeName: "a.txt",
              afterName: "a (1).txt",
            }),
            restorePreviewItem({
              itemId: 37,
              beforeName: "b.txt",
              afterName: "b (1).txt",
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        restorePreviewResponse({
          items: [
            restorePreviewItem({
              itemId: 36,
              beforeName: "a.txt",
              afterName: "a.txt",
              resolution: "trash_existing",
            }),
            restorePreviewItem({
              itemId: 37,
              beforeName: "b.txt",
              afterName: "b.txt",
              resolution: "trash_existing",
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        restorePreviewResponse({
          items: [
            restorePreviewItem({
              itemId: 36,
              beforeName: "a.txt",
              afterName: "a (1).txt",
              resolution: "rename",
            }),
            restorePreviewItem({
              itemId: 37,
              beforeName: "b.txt",
              afterName: "b.txt",
              resolution: "trash_existing",
            }),
          ],
        }),
      );
    renderDrivePage("/trash");

    fireEvent.click(await screen.findByLabelText("aを選択"));
    fireEvent.click(screen.getByLabelText("bを選択"));
    fireEvent.click(screen.getByRole("button", { name: "復元" }));
    await screen.findByRole("heading", { name: "復元内容の確認（2件）" });
    fireEvent.click(screen.getByText("すべて現在の同名項目をゴミ箱へ移して復元"));
    const selects = await screen.findAllByLabelText("解決方法");
    fireEvent.change(selects[0], { target: { value: "rename" } });

    expect(await screen.findByText("a (1).txt")).toBeInTheDocument();
    expect(mocks.bulkRestorePreview).toHaveBeenCalledTimes(3);
  });

  it("refreshes preview when restore execution returns restore_state_changed", async () => {
    mocks.fetchTrash.mockResolvedValue([
      { id: 38, parent_id: 42, name: "stale", item_type: "file", extension: "txt" },
    ]);
    mocks.restorePreview.mockResolvedValueOnce(
      restorePreviewResponse({
        itemId: 38,
        beforeName: "stale.txt",
        afterName: "stale (1).txt",
      }),
    );
    mocks.restoreDriveItem.mockRejectedValueOnce(
      new ApiError(
        409,
        "確認後に復元先の状態が変更されました。内容を再確認してください",
        [],
        "restore_state_changed",
        "/api/v1/drive_items/38/restore",
        undefined,
        undefined,
        "request-stale",
        {},
        [],
        undefined,
        [],
        restorePreviewResponse({
          itemId: 38,
          beforeName: "stale.txt",
          afterName: "stale (2).txt",
        }),
      ),
    );
    renderDrivePage("/trash");

    fireEvent.click(await screen.findByLabelText("staleを選択"));
    fireEvent.click(screen.getByRole("button", { name: "復元" }));
    await screen.findByText("stale (1).txt");
    fireEvent.click(screen.getByRole("button", { name: "復元実行" }));

    expect(await screen.findByText("stale (2).txt")).toBeInTheDocument();
  });

  it("prevents duplicate submissions while an upload is in progress", async () => {
    let resolveUpload: (() => void) | undefined;
    mocks.uploadFile.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = () =>
          resolve({
            id: 1,
            parent_id: 42,
            name: "report",
            item_type: "file",
          });
      }),
    );
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    const target = driveDropTarget(container);
    const file = new File(["content"], "report.pdf", { type: "application/pdf" });
    fireEvent.drop(target, { dataTransfer: dataTransferWithFiles([file]) });
    fireEvent.drop(target, { dataTransfer: dataTransferWithFiles([file]) });

    await waitFor(() => {
      expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
    });

    resolveUpload?.();
  });

  it("shows upload progress while a file is uploading", async () => {
    let resolveUpload: (() => void) | undefined;
    mocks.uploadFile.mockImplementation(
      (input) =>
        new Promise((resolve) => {
          input.onProgress?.({ loaded: 5, total: 10, percent: 50 });
          resolveUpload = () =>
            resolve({
              id: 1,
              parent_id: 42,
              name: "movie",
              item_type: "file",
            });
        }),
    );
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    fireEvent.change(fileInput(container), {
      target: { files: [new File(["1234567890"], "movie.mp4", { type: "video/mp4" })] },
    });

    expect(await screen.findByText("アップロード状況")).toBeInTheDocument();
    expect(await screen.findByText(/50%/)).toBeInTheDocument();
    resolveUpload?.();
  });

  it("uploads a selected folder with its relative path hierarchy", async () => {
    const { container } = renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");
    const file = new File(["content"], "clip001.mp4", { type: "video/mp4" });
    Object.defineProperty(file, "webkitRelativePath", {
      value: "素材/camera-a/clip001.mp4",
    });

    fireEvent.change(directoryInput(container), { target: { files: [file] } });

    await waitFor(() => {
      expect(mocks.createDirectory).toHaveBeenCalledWith({
        name: "素材",
        parentId: 42,
      });
      expect(mocks.createDirectory).toHaveBeenCalledWith({
        name: "camera-a",
        parentId: 100,
      });
      expect(mocks.uploadFile.mock.calls[0]?.[0]).toMatchObject({
        file,
        name: "clip001",
        parentId: 101,
      });
    });
  });

  it("keeps the folder form open without copy controls when the name already exists", async () => {
    mocks.createDirectory.mockRejectedValueOnce(
      new ApiError(
        409,
        "同じ名前のフォルダが存在します。",
        [],
        "duplicate_name",
        "/api/v1/drive_items",
        "name",
        "素材",
        "request-folder-409",
      ),
    );
    renderDrivePage("/drive/folder/42");
    await screen.findByText("Reports");

    fireEvent.click(screen.getByRole("button", { name: "新しいフォルダ" }));
    fireEvent.change(screen.getAllByLabelText("名前")[0], {
      target: { value: "素材" },
    });
    fireEvent.click(screen.getByText("作成"));

    expect(
      await screen.findByText("同じ名前のフォルダが存在します。"),
    ).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("素材").length).toBeGreaterThan(0);
    expect(screen.queryByText("エラー内容をコピー")).not.toBeInTheDocument();

    mocks.createDirectory.mockResolvedValueOnce({
      id: 200,
      parent_id: 42,
      name: "素材2",
      item_type: "directory",
    });
    fireEvent.change(screen.getAllByLabelText("名前")[0], {
      target: { value: "素材2" },
    });
    fireEvent.click(screen.getByText("作成"));

    await waitFor(() => {
      expect(mocks.createDirectory.mock.calls.at(-1)?.[0]).toEqual({
        name: "素材2",
        parentId: 42,
      });
    });
  });

  it("shows search results from organization scope", async () => {
    mocks.searchDriveItems.mockResolvedValue({
      data: [
        {
          id: 9,
          parent_id: null,
          parent_name: "素材",
          name: "meeting",
          item_type: "file",
          extension: "mp4",
          content_type: "video/mp4",
          owner_display_name: "佐藤",
        },
      ],
      meta: { current_page: 1, per_page: 50, total_pages: 1, total_count: 1 },
    });

    renderDrivePage("/drive?q=meeting&scope=organization");

    expect(await screen.findByText("meeting.mp4")).toBeInTheDocument();
    expect(screen.getByText("佐藤")).toBeInTheDocument();
    expect(mocks.searchDriveItems).toHaveBeenCalledWith(
      expect.objectContaining({ query: "meeting", scope: "organization" }),
    );
  });

  it("keeps organization scope when selected before entering a search keyword", async () => {
    renderDrivePage("/drive");

    const scopeSelect = screen.getByLabelText("検索範囲");
    fireEvent.change(scopeSelect, { target: { value: "organization" } });

    await waitFor(() => expect(scopeSelect).toHaveValue("organization"));
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    expect(scopeSelect).toHaveValue("organization");

    fireEvent.change(screen.getByPlaceholderText("ファイル名、拡張子、作成者名"), {
      target: { value: "meeting" },
    });

    await waitFor(() => {
      expect(mocks.searchDriveItems).toHaveBeenCalledWith(
        expect.objectContaining({ query: "meeting", scope: "organization" }),
      );
    });
  });

  it("shows all breadcrumbs and navigates from an intermediate breadcrumb", async () => {
    mocks.fetchDriveItem.mockResolvedValueOnce({
      id: 40,
      parent_id: 30,
      name: "world",
      item_type: "directory",
      breadcrumbs: [
        { id: null, name: "共有ドライブ" },
        { id: 10, name: "h1" },
        { id: 20, name: "h2" },
        { id: 30, name: "h3" },
        { id: 40, name: "world" },
      ],
    });

    renderDrivePage("/drive/folder/40");

    expect(await screen.findByText("h1")).toBeInTheDocument();
    expect(screen.getByText("h2")).toBeInTheDocument();
    expect(screen.getByText("h3")).toBeInTheDocument();
    expect(
      screen.getByText("world", { selector: "[aria-current='page']" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("h2"));

    await waitFor(() => {
      expect(mocks.fetchDriveItem).toHaveBeenCalledWith(20);
    });
  });

  it("moves a file to a folder by drag and drop", async () => {
    mocks.fetchDriveItems.mockResolvedValue([
      {
        id: 1,
        parent_id: null,
        name: "clip",
        item_type: "file",
        extension: "mp4",
        content_type: "image/png",
      },
      { id: 2, parent_id: null, name: "素材", item_type: "directory" },
    ]);
    const { container } = renderDrivePage("/drive");

    await screen.findByText("clip.mp4");
    const source = driveItemDragAreaByName("clip.mp4");
    const target = screen.getByText("素材").closest("tr");
    if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      throw new Error("drag area or target row was not rendered");
    }

    const dataTransfer = driveItemDataTransfer();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    expect(target).toHaveClass("drop-target");
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => {
      expect(mocks.bulkMove).toHaveBeenCalledWith([1], 2);
    });
    expect(mocks.moveDriveItem).not.toHaveBeenCalled();
    expect(container.querySelector(".dragging-row")).not.toBeInTheDocument();
  });

  it("starts item drag from the central item information area only", async () => {
    mocks.fetchDriveItems.mockResolvedValue([
      {
        id: 1,
        parent_id: null,
        name: "clip",
        item_type: "file",
        extension: "mp4",
        owner_display_name: "佐藤",
        updated_at: "2026-07-20T02:00:00.000Z",
        file_size: 2048,
      },
      { id: 2, parent_id: null, name: "素材", item_type: "directory" },
    ]);
    renderDrivePage("/drive");

    await screen.findByText("clip.mp4");
    const dragArea = driveItemDragAreaByName("clip.mp4");
    const dragTargets = [
      screen.getByText("clip.mp4"),
      dragArea.querySelector(".drive-item-owner"),
      dragArea.querySelector(".drive-item-updated"),
      dragArea.querySelector(".drive-item-size"),
      dragArea,
    ];

    for (const target of dragTargets) {
      if (!(target instanceof HTMLElement)) {
        throw new Error("drag target was not rendered");
      }
      const transfer = driveItemDataTransfer();
      fireEvent.dragStart(target, { dataTransfer: transfer });
      expect(transfer.setData).toHaveBeenCalledWith(
        "application/x-mitsubachi-drive-items",
        JSON.stringify({ itemIds: [1] }),
      );
    }

    const checkboxTransfer = driveItemDataTransfer();
    fireEvent.dragStart(screen.getByLabelText("clipを選択"), {
      dataTransfer: checkboxTransfer,
    });
    expect(checkboxTransfer.setData).not.toHaveBeenCalled();

    const menuTransfer = driveItemDataTransfer();
    fireEvent.dragStart(screen.getByRole("button", { name: "clipの操作メニュー" }), {
      dataTransfer: menuTransfer,
    });
    expect(menuTransfer.setData).not.toHaveBeenCalled();

    const downloadTransfer = driveItemDataTransfer();
    fireEvent.dragStart(screen.getByRole("button", { name: "clipをダウンロード" }), {
      dataTransfer: downloadTransfer,
    });
    expect(downloadTransfer.setData).not.toHaveBeenCalled();
  });

  it("opens a file preview from every central information cell and its whitespace", async () => {
    mocks.fetchDriveItems.mockResolvedValue([
      {
        id: 1,
        parent_id: null,
        name: "clip",
        item_type: "file",
        extension: "mp4",
        owner_display_name: "佐藤",
        updated_at: "2026-07-20T02:00:00.000Z",
        file_size: 2048,
        content_type: "image/png",
      },
    ]);
    renderDrivePage("/drive");

    await screen.findByText("clip.mp4");
    const area = driveItemDragAreaByName("clip.mp4");
    const targets = [
      screen.getByText("clip.mp4"),
      area.querySelector(".drive-item-owner"),
      area.querySelector(".drive-item-updated"),
      area.querySelector(".drive-item-size"),
      area,
    ];

    for (const target of targets) {
      if (!(target instanceof HTMLElement)) throw new Error("central target missing");
      clickCentralArea("clip.mp4", target);
      expect(await screen.findByRole("heading", { name: "clip" })).toBeInTheDocument();
      fireEvent.click(openDialogCloseButton("clip"));
    }
  });

  it("opens a directory from the central information area", async () => {
    mocks.fetchDriveItems.mockResolvedValue([
      { id: 9, parent_id: null, name: "素材", item_type: "directory" },
    ]);
    renderDrivePage("/drive");

    await screen.findByText("素材");
    clickCentralArea("素材");

    await waitFor(() => {
      expect(mocks.fetchDriveItem).toHaveBeenCalledWith(9);
    });
  });

  it("does not open preview after a central-area drag is activated", async () => {
    mocks.fetchDriveItems.mockResolvedValue([
      {
        id: 1,
        parent_id: null,
        name: "clip",
        item_type: "file",
        extension: "mp4",
        content_type: "image/png",
      },
      { id: 2, parent_id: null, name: "素材", item_type: "directory" },
    ]);
    renderDrivePage("/drive");

    await screen.findByText("clip.mp4");
    const area = driveItemDragAreaByName("clip.mp4");
    fireEvent.pointerDown(area, { clientX: 10, clientY: 10 });
    fireEvent.dragStart(area, { dataTransfer: driveItemDataTransfer() });
    fireEvent.pointerUp(area, { clientX: 30, clientY: 10 });

    expect(screen.queryByRole("heading", { name: "clip" })).not.toBeInTheDocument();
  });

  it("does not open preview from checkbox, download, or action menu controls", async () => {
    mocks.fetchDriveItems.mockResolvedValue([
      {
        id: 1,
        parent_id: null,
        name: "clip",
        item_type: "file",
        extension: "mp4",
        content_type: "image/png",
      },
    ]);
    renderDrivePage("/drive");

    await screen.findByText("clip.mp4");
    fireEvent.click(screen.getByLabelText("clipを選択"));
    fireEvent.click(screen.getByRole("button", { name: "clipをダウンロード" }));
    fireEvent.click(screen.getByRole("button", { name: "clipの操作メニュー" }));

    expect(screen.queryByRole("heading", { name: "clip" })).not.toBeInTheDocument();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("opens a file with Enter and Space from the central information area", async () => {
    mocks.fetchDriveItems.mockResolvedValue([
      {
        id: 1,
        parent_id: null,
        name: "clip",
        item_type: "file",
        extension: "mp4",
        content_type: "image/png",
      },
    ]);
    renderDrivePage("/drive");

    const area = await screen.findByRole("button", { name: "clip.mp4を開く" });
    fireEvent.keyDown(area, { key: "Enter" });
    expect(await screen.findByRole("heading", { name: "clip" })).toBeInTheDocument();
    fireEvent.click(openDialogCloseButton("clip"));

    fireEvent.keyDown(area, { key: " " });
    expect(await screen.findByRole("heading", { name: "clip" })).toBeInTheDocument();
  });

  it("moves a folder to another folder by drag and drop", async () => {
    mocks.fetchDriveItems.mockResolvedValue([
      { id: 1, parent_id: null, name: "before", item_type: "directory" },
      { id: 2, parent_id: null, name: "after", item_type: "directory" },
    ]);
    renderDrivePage("/drive");

    await screen.findByText("before");
    const source = driveItemDragAreaByName("before");
    const target = screen.getByText("after").closest("tr");
    if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      throw new Error("rows were not rendered");
    }

    const dataTransfer = driveItemDataTransfer();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => {
      expect(mocks.bulkMove).toHaveBeenCalledWith([1], 2);
    });
  });

  it("moves selected files together by drag and drop", async () => {
    mocks.fetchDriveItems.mockResolvedValue([
      { id: 1, parent_id: null, name: "a", item_type: "file", extension: "txt" },
      { id: 2, parent_id: null, name: "b", item_type: "file", extension: "txt" },
      { id: 3, parent_id: null, name: "folder", item_type: "directory" },
    ]);
    renderDrivePage("/drive");

    fireEvent.click(await screen.findByLabelText("aを選択"));
    fireEvent.click(screen.getByLabelText("bを選択"));
    const source = driveItemDragAreaByName("a.txt");
    const target = screen.getByText("folder").closest("tr");
    if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      throw new Error("rows were not rendered");
    }

    const dataTransfer = driveItemDataTransfer();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => {
      expect(mocks.bulkMove).toHaveBeenCalledWith([1, 2], 3);
    });
  });

  it("moves only the dragged item when it is not selected", async () => {
    mocks.fetchDriveItems.mockResolvedValue([
      { id: 1, parent_id: null, name: "selected", item_type: "file", extension: "txt" },
      { id: 2, parent_id: null, name: "dragged", item_type: "file", extension: "txt" },
      { id: 3, parent_id: null, name: "folder", item_type: "directory" },
    ]);
    renderDrivePage("/drive");

    fireEvent.click(await screen.findByLabelText("selectedを選択"));
    const source = driveItemDragAreaByName("dragged.txt");
    const target = screen.getByText("folder").closest("tr");
    if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      throw new Error("rows were not rendered");
    }

    const dataTransfer = driveItemDataTransfer();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => {
      expect(mocks.bulkMove).toHaveBeenCalledWith([2], 3);
    });
  });

  it("does not move when dropping on a file or itself", async () => {
    mocks.fetchDriveItems.mockResolvedValue([
      { id: 1, parent_id: null, name: "folder", item_type: "directory" },
      { id: 2, parent_id: null, name: "file", item_type: "file", extension: "txt" },
    ]);
    renderDrivePage("/drive");

    await screen.findByText("folder");
    const source = driveItemDragAreaByName("folder");
    const fileTarget = screen.getByText("file.txt").closest("tr");
    if (!(source instanceof HTMLElement) || !(fileTarget instanceof HTMLElement)) {
      throw new Error("rows were not rendered");
    }

    const dataTransfer = driveItemDataTransfer();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.drop(fileTarget, { dataTransfer });
    fireEvent.drop(source, { dataTransfer });

    expect(mocks.bulkMove).not.toHaveBeenCalled();
  });

  it("does not treat external file drops as item moves", async () => {
    mocks.fetchDriveItems.mockResolvedValue([
      { id: 3, parent_id: null, name: "folder", item_type: "directory" },
    ]);
    renderDrivePage("/drive");
    const target = (await screen.findByText("folder")).closest("tr");
    if (!(target instanceof HTMLElement)) throw new Error("row was not rendered");

    fireEvent.drop(target, {
      dataTransfer: dataTransferWithFiles([
        new File(["content"], "external.txt", { type: "text/plain" }),
      ]),
    });

    expect(mocks.bulkMove).not.toHaveBeenCalled();
  });

  it("shows a resolvable name conflict without copy controls when drag move fails with 409", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    mocks.bulkMove.mockRejectedValueOnce(
      new ApiError(
        409,
        "同じ名前のファイルが移動先に存在します",
        [],
        "duplicate_name",
        "/api/v1/drive_items/bulk_move",
        "name",
        "sample.mp4",
        "request-409",
        { conflicting_name: "sample.mp4" },
      ),
    );
    mocks.fetchDriveItems.mockResolvedValue([
      { id: 1, parent_id: null, name: "sample", item_type: "file", extension: "mp4" },
      { id: 2, parent_id: null, name: "納品データ", item_type: "directory" },
    ]);
    renderDrivePage("/drive");

    await screen.findByText("sample.mp4");
    const source = driveItemDragAreaByName("sample.mp4");
    const target = screen.getByText("納品データ").closest("tr");
    if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      throw new Error("rows were not rendered");
    }

    const dataTransfer = driveItemDataTransfer();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    expect(
      await screen.findAllByText("同じ名前のファイルが移動先に存在します"),
    ).not.toHaveLength(0);
    expect(
      screen.getByText("別名を指定すると同じ操作を再実行できます。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("エラー内容をコピー")).not.toBeInTheDocument();
    expect(screen.queryByText(/Request ID:/)).not.toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("shows and copies a reportable error when drag move fails unexpectedly", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    mocks.bulkMove.mockRejectedValueOnce(
      new ApiError(
        500,
        "サーバーで処理に失敗しました",
        [],
        "internal_error",
        "/api/v1/drive_items/bulk_move",
        undefined,
        undefined,
        "request-500",
      ),
    );
    mocks.fetchDriveItems.mockResolvedValue([
      { id: 1, parent_id: null, name: "sample", item_type: "file", extension: "mp4" },
      { id: 2, parent_id: null, name: "納品データ", item_type: "directory" },
    ]);
    renderDrivePage("/drive");

    await screen.findByText("sample.mp4");
    const source = driveItemDragAreaByName("sample.mp4");
    const target = screen.getByText("納品データ").closest("tr");
    if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      throw new Error("rows were not rendered");
    }

    const dataTransfer = driveItemDataTransfer();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    expect(await screen.findAllByText("サーバーで処理に失敗しました")).not.toHaveLength(
      0,
    );
    fireEvent.click(screen.getByText("エラー内容をコピー"));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const copied = writeText.mock.calls[0]?.[0] as string;
    expect(copied).toContain("操作: ドラッグ移動");
    expect(copied).toContain("HTTPステータス: 500");
    expect(copied).toContain("APIパス: /api/v1/drive_items/bulk_move");
    expect(copied).toContain("Request ID: request-500");
    expect(copied).toContain("移動先: 納品データ");
  });

  it("opens the move dialog from the item menu and moves to root", async () => {
    mocks.fetchDriveItems.mockImplementation((parentId: number | null) => {
      if (parentId === 10) return Promise.resolve([]);
      return Promise.resolve([
        { id: 1, parent_id: 10, name: "clip", item_type: "file", extension: "mp4" },
      ]);
    });
    mocks.fetchDriveItem.mockResolvedValue({
      id: 10,
      parent_id: null,
      name: "素材",
      item_type: "directory",
      breadcrumbs: [
        { id: null, name: "共有ドライブ" },
        { id: 10, name: "素材" },
      ],
    });
    renderDrivePage("/drive");

    fireEvent.click(await screen.findByRole("button", { name: "clipの操作メニュー" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "移動" }));

    expect(await screen.findByText("1件の項目を移動")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "共有ドライブへ" }));
    fireEvent.click(screen.getByRole("button", { name: "ここに移動" }));

    await waitFor(() => {
      expect(mocks.bulkMove).toHaveBeenCalledWith([1], null);
    });
  });

  it("renders the action menu in a portal without being clipped by the list", async () => {
    mocks.fetchDriveItems.mockResolvedValue([
      { id: 1, parent_id: null, name: "clip", item_type: "file", extension: "mp4" },
      { id: 2, parent_id: null, name: "next", item_type: "file", extension: "txt" },
    ]);
    mockMenuRects({ anchorTop: 120, anchorBottom: 160, anchorRight: 420 });
    renderDrivePage("/drive");

    fireEvent.click(await screen.findByRole("button", { name: "clipの操作メニュー" }));
    const menu = await screen.findByRole("menu");

    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveAttribute("data-placement", "bottom");
    expect(menu).toHaveStyle({ visibility: "visible" });
    expect(Number.parseFloat(menu.style.top)).toBeGreaterThan(160);
  });

  it("opens the action menu upward near the viewport bottom", async () => {
    mocks.fetchDriveItems.mockResolvedValue([
      { id: 1, parent_id: null, name: "last", item_type: "file", extension: "txt" },
    ]);
    mockMenuRects({ anchorTop: 560, anchorBottom: 596, anchorRight: 780 });
    renderDrivePage("/drive");

    fireEvent.click(await screen.findByRole("button", { name: "lastの操作メニュー" }));
    const menu = await screen.findByRole("menu");

    expect(menu).toHaveAttribute("data-placement", "top");
    expect(Number.parseFloat(menu.style.top)).toBeLessThan(560);
  });

  it("keeps the action menu inside the right viewport edge", async () => {
    mocks.fetchDriveItems.mockResolvedValue([
      { id: 1, parent_id: null, name: "right", item_type: "file", extension: "txt" },
    ]);
    mockMenuRects({ anchorTop: 120, anchorBottom: 160, anchorRight: 820 });
    renderDrivePage("/drive");

    fireEvent.click(await screen.findByRole("button", { name: "rightの操作メニュー" }));
    const menu = await screen.findByRole("menu");

    expect(Number.parseFloat(menu.style.left) + 168).toBeLessThanOrEqual(800 - 8);
  });

  it("closes the action menu on Escape, outside click, and scroll", async () => {
    mocks.fetchDriveItems.mockResolvedValue([
      { id: 1, parent_id: null, name: "clip", item_type: "file", extension: "mp4" },
    ]);
    mockMenuRects({ anchorTop: 120, anchorBottom: 160, anchorRight: 420 });
    renderDrivePage("/drive");

    fireEvent.click(await screen.findByRole("button", { name: "clipの操作メニュー" }));
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "clipの操作メニュー" }));
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "clipの操作メニュー" }));
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    fireEvent.scroll(window);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens the move dialog from the selection toolbar and disables forbidden destinations", async () => {
    mocks.fetchDriveItems.mockImplementation((parentId: number | null) => {
      if (parentId === null) {
        return Promise.resolve([
          { id: 10, parent_id: null, name: "parent", item_type: "directory" },
          { id: 20, parent_id: null, name: "destination", item_type: "directory" },
        ]);
      }
      if (parentId === 10) {
        return Promise.resolve([
          { id: 1, parent_id: 10, name: "folder", item_type: "directory" },
          { id: 2, parent_id: 10, name: "file", item_type: "file", extension: "txt" },
          { id: 3, parent_id: 10, name: "other", item_type: "directory" },
        ]);
      }
      return Promise.resolve([]);
    });
    mocks.fetchDriveItem.mockResolvedValue({
      id: 10,
      parent_id: null,
      name: "parent",
      item_type: "directory",
      breadcrumbs: [
        { id: null, name: "共有ドライブ" },
        { id: 10, name: "parent" },
      ],
    });
    renderDrivePage("/drive/folder/10");

    fireEvent.click(await screen.findByLabelText("folderを選択"));
    fireEvent.click(screen.getByLabelText("fileを選択"));
    fireEvent.click(screen.getByRole("button", { name: "移動" }));

    expect(await screen.findByText("2件の項目を移動")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ここに移動" })).toBeDisabled();
    expect(screen.getByText("現在と同じ場所です。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "共有ドライブへ" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "ここに移動" })).not.toBeDisabled();
    });
  });

  it("permanently deletes a selected trashed file after confirmation", async () => {
    mocks.fetchTrash.mockResolvedValue([
      {
        id: 20,
        parent_id: null,
        name: "report",
        item_type: "file",
        extension: "pdf",
      },
    ]);
    renderDrivePage("/trash");

    fireEvent.click(await screen.findByLabelText("reportを選択"));
    fireEvent.click(screen.getAllByRole("button", { name: "完全削除" }).at(-1)!);

    expect(
      screen.getByText("「report」を完全に削除します。この操作は取り消せません。"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "完全削除" }).at(-1)!);

    await waitFor(() => {
      expect(mocks.purgeDriveItem).toHaveBeenCalledWith(20);
    });
    await waitFor(() => {
      expect(mocks.fetchTrash.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("permanently deletes multiple selected trashed files", async () => {
    mocks.fetchTrash.mockResolvedValue([
      { id: 20, parent_id: null, name: "report", item_type: "file", extension: "pdf" },
      { id: 21, parent_id: null, name: "archive", item_type: "directory" },
    ]);
    renderDrivePage("/trash");

    fireEvent.click(await screen.findByLabelText("reportを選択"));
    fireEvent.click(screen.getByLabelText("archiveを選択"));
    fireEvent.click(screen.getAllByRole("button", { name: "完全削除" }).at(-1)!);

    expect(
      screen.getByText("選択した項目を完全に削除します。この操作は取り消せません。"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "完全削除" }).at(-1)!);

    await waitFor(() => {
      expect(mocks.bulkPurge).toHaveBeenCalledWith([20, 21]);
      expect(mocks.purgeDriveItem).not.toHaveBeenCalled();
    });
  });

  it("creates a password-protected external share with server-generated password", async () => {
    mocks.fetchDriveItems.mockResolvedValue([
      { id: 20, parent_id: null, name: "report", item_type: "file", extension: "pdf" },
    ]);
    mocks.createExternalShare.mockResolvedValue({
      id: 12,
      name: "公開",
      share_url: "https://front.example/share/raw-token",
      folder_share_mode: "snapshot",
      allow_download: true,
      allow_bulk_download: true,
      password_required: true,
      generated_password: "G7mK9xT4pQ2wN8rC",
    });
    renderDrivePage("/drive");

    fireEvent.click(await screen.findByLabelText("reportを選択"));
    fireEvent.click(screen.getByRole("button", { name: "外部公開" }));
    fireEvent.click(screen.getByLabelText("パスワード保護を有効にする"));
    fireEvent.click(screen.getByRole("button", { name: "公開リンクを作成" }));

    await waitFor(() => {
      expect(mocks.createExternalShare.mock.calls[0]?.[0]).toMatchObject({
        driveItemIds: [20],
        passwordProtected: true,
      });
    });
    expect(await screen.findByLabelText("生成されたパスワード")).toHaveValue(
      "G7mK9xT4pQ2wN8rC",
    );
    expect(
      screen.getByText(
        "このパスワードは再表示できません。安全な方法で共有してください。",
      ),
    ).toBeInTheDocument();
  });

  it("regenerates an external share password after confirmation", async () => {
    mocks.fetchDriveItems.mockResolvedValue([
      { id: 20, parent_id: null, name: "report", item_type: "file", extension: "pdf" },
    ]);
    mocks.createExternalShare.mockResolvedValue({
      id: 12,
      name: "公開",
      share_url: "https://front.example/share/raw-token",
      folder_share_mode: "snapshot",
      allow_download: true,
      allow_bulk_download: true,
      password_required: true,
      generated_password: "G7mK9xT4pQ2wN8rC",
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderDrivePage("/drive");

    fireEvent.click(await screen.findByLabelText("reportを選択"));
    fireEvent.click(screen.getByRole("button", { name: "外部公開" }));
    fireEvent.click(screen.getByLabelText("パスワード保護を有効にする"));
    fireEvent.click(screen.getByRole("button", { name: "公開リンクを作成" }));
    await screen.findByDisplayValue("G7mK9xT4pQ2wN8rC");

    fireEvent.click(screen.getByRole("button", { name: "パスワードを再発行" }));

    await waitFor(() => {
      expect(mocks.regenerateExternalSharePassword.mock.calls[0]?.[0]).toBe(12);
    });
    expect(await screen.findByDisplayValue("N3wPassw0rdValue")).toBeInTheDocument();
  });

  it("stops media when preview is closed or unmounted", async () => {
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => undefined);
    const load = vi
      .spyOn(HTMLMediaElement.prototype, "load")
      .mockImplementation(() => undefined);
    mocks.fetchDriveItems.mockResolvedValue([
      {
        id: 7,
        parent_id: null,
        name: "clip",
        item_type: "file",
        extension: "mp4",
        content_type: "video/mp4",
      },
    ]);
    const view = renderDrivePage("/drive");

    await screen.findByText("clip.mp4");
    clickCentralArea("clip.mp4");
    fireEvent.click(openDialogCloseButton("clip"));

    await waitFor(() => expect(pause).toHaveBeenCalled());
    expect(load).toHaveBeenCalled();

    await screen.findByText("clip.mp4");
    clickCentralArea("clip.mp4");
    view.unmount();

    expect(pause).toHaveBeenCalledTimes(2);
  });
});

function renderDrivePage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/drive" element={<DrivePage />} />
            <Route path="/drive/folder/:folderId" element={<DrivePage />} />
            <Route path="/trash" element={<DrivePage mode="trash" />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function driveDropTarget(container: HTMLElement) {
  const target = container.querySelector(".drive-page");
  if (!(target instanceof HTMLElement)) throw new Error("Drive page was not rendered.");
  return target;
}

function fileInput(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("File input was not rendered.");
  }
  return input;
}

function directoryInput(container: HTMLElement) {
  const input = container.querySelectorAll('input[type="file"]')[1];
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Directory input was not rendered.");
  }
  return input;
}

function driveItemDragAreaByName(name: string) {
  const dragArea = screen
    .getAllByText(name)
    .map((element) => element.closest(".drive-item-info-action"))
    .find((element): element is HTMLElement => element instanceof HTMLElement);
  if (!(dragArea instanceof HTMLElement)) {
    throw new Error(`Drag area for ${name} was not rendered.`);
  }
  return dragArea;
}

function clickCentralArea(
  name: string,
  target: HTMLElement = driveItemDragAreaByName(name),
) {
  fireEvent.pointerDown(target, { clientX: 10, clientY: 10 });
  fireEvent.pointerUp(target, { clientX: 12, clientY: 12 });
}

function mockMenuRects({
  anchorTop,
  anchorBottom,
  anchorRight,
}: {
  anchorTop: number;
  anchorBottom: number;
  anchorRight: number;
}) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function rect(this: HTMLElement) {
      if (this.classList.contains("item-menu")) {
        return domRect({
          top: 0,
          left: 0,
          right: 168,
          bottom: 88,
          width: 168,
          height: 88,
        });
      }
      if (this.getAttribute("aria-label")?.endsWith("の操作メニュー")) {
        return domRect({
          top: anchorTop,
          left: anchorRight - 40,
          right: anchorRight,
          bottom: anchorBottom,
          width: 40,
          height: anchorBottom - anchorTop,
        });
      }
      return domRect({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
    },
  );
}

function domRect(input: {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}) {
  return {
    ...input,
    x: input.left,
    y: input.top,
    toJSON: () => input,
  } as DOMRect;
}

function dataTransferWithFiles(files: File[]) {
  return {
    types: ["Files"],
    files,
    items: files.map((file) => ({
      kind: "file",
      getAsFile: () => file,
    })),
  };
}

function dataTransferWithDirectory(name: string, files: File[]) {
  type MockFileEntry = {
    isFile: true;
    isDirectory: false;
    name: string;
    file: (success: (file: File) => void) => void;
  };

  const entries: MockFileEntry[] = files.map((file) => ({
    isFile: true,
    isDirectory: false,
    name: file.name,
    file: (success: (file: File) => void) => success(file),
  }));
  const chunks = [entries.slice(0, 100), entries.slice(100), []];
  let chunkIndex = 0;
  const directory = {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => ({
      readEntries: (success: (entries: MockFileEntry[]) => void) => {
        success(chunks[chunkIndex] ?? []);
        chunkIndex += 1;
      },
    }),
  };

  return {
    types: ["Files"],
    files: [],
    items: [
      {
        kind: "file",
        getAsFile: () => null,
        webkitGetAsEntry: () => directory,
      },
    ],
  };
}

function deferredDirectoryDataTransfer(name: string, files: File[]) {
  type MockFileEntry = {
    isFile: true;
    isDirectory: false;
    name: string;
    file: (success: (file: File) => void) => void;
  };

  const entries: MockFileEntry[] = files.map((file) => ({
    isFile: true,
    isDirectory: false,
    name: file.name,
    file: (success: (file: File) => void) => success(file),
  }));
  const chunks = [entries, []];
  const pendingReads: Array<(entries: MockFileEntry[]) => void> = [];
  const directory = {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => ({
      readEntries: (success: (entries: MockFileEntry[]) => void) => {
        pendingReads.push(success);
      },
    }),
  };

  return {
    dataTransfer: {
      types: ["Files"],
      files: [],
      items: [
        {
          kind: "file",
          getAsFile: () => null,
          webkitGetAsEntry: () => directory,
        },
      ],
    },
    resolveNextChunk: () => {
      const resolve = pendingReads.shift();
      if (!resolve) throw new Error("No pending directory read");
      resolve(chunks.shift() ?? []);
    },
  };
}

function trashDuplicateError() {
  return new ApiError(
    409,
    "同じ内容のファイルがゴミ箱にあります",
    [],
    "trash_content_duplicate",
    "/api/v1/drive_items",
    undefined,
    undefined,
    "request-trash-409",
    { duplicate_kind: "trash_content" },
    [],
    {
      id: 99,
      name: "report",
      extension: "txt",
      displayName: "report.txt",
      fileSize: 4,
      contentType: "text/plain",
      deletedAt: "2026-07-23T14:22:00+09:00",
      originalParent: { id: 42, name: "Reports", path: "/Reports" },
      uploadedBy: { id: 10, displayName: "佐藤" },
      restoreTarget: { id: 199, type: "file", displayName: "report.txt" },
    },
    ["restore", "upload_anyway", "cancel"],
  );
}

function duplicateContentError(message: string) {
  return new ApiError(
    409,
    message,
    [],
    "duplicate_content",
    "/api/v1/drive_items",
    "name",
    "same.txt",
    "request-content-409",
    { duplicate_kind: "same_content" },
    [
      {
        id: 9,
        name: "same.txt",
        parent_id: 42,
        parent_name: "Reports",
        owner_display_name: "佐藤",
        created_at: "2026-07-19T10:00:00.000Z",
        file_size: 4,
        deleted: false,
      },
    ],
  );
}

function restorePreviewResponse(
  input: {
    itemId?: number;
    beforeName?: string;
    afterName?: string | null;
    conflictType?:
      "none" | "name_conflict" | "missing_parent" | "name_conflict_and_missing_parent";
    resolution?:
      | "restore"
      | "rename"
      | "trash_existing"
      | "select_destination"
      | "restore_to_root"
      | "skip";
    beforeParentPath?: string | null;
    afterParentPath?: string | null;
    items?: ReturnType<typeof restorePreviewItem>[];
  } = {},
) {
  const items = input.items ?? [
    restorePreviewItem({
      itemId: input.itemId,
      beforeName: input.beforeName,
      afterName: input.afterName,
      conflictType: input.conflictType,
      resolution: input.resolution,
      beforeParentPath: input.beforeParentPath,
      afterParentPath: input.afterParentPath,
    }),
  ];
  return {
    confirmationToken: "preview-token",
    items,
    summary: {
      totalCount: items.length,
      conflictCount: items.filter((item) => item.conflictType !== "none").length,
      restorableCount: items.filter((item) => item.after.restorable).length,
      skippedCount: items.filter((item) => item.after.resolution === "skip").length,
      renameCount: items.filter(
        (item) => item.before.name !== item.after.name && item.after.name !== null,
      ).length,
      purgeExistingCount: items.filter((item) => item.after.existingItemWillBePurged)
        .length,
    },
  };
}

function restorePreviewItem(
  input: {
    itemId?: number;
    beforeName?: string;
    afterName?: string | null;
    conflictType?:
      "none" | "name_conflict" | "missing_parent" | "name_conflict_and_missing_parent";
    resolution?:
      | "restore"
      | "rename"
      | "trash_existing"
      | "select_destination"
      | "restore_to_root"
      | "skip";
    beforeParentPath?: string | null;
    afterParentPath?: string | null;
  } = {},
) {
  const conflictType = input.conflictType ?? "name_conflict";
  const resolution =
    input.resolution ?? (conflictType === "none" ? "restore" : "rename");
  return {
    itemId: input.itemId ?? 30,
    itemType: "file" as const,
    restoreTargetId: input.itemId ?? 30,
    conflictType,
    parentExists: !conflictType.includes("missing_parent"),
    existingItemId: conflictType.includes("name_conflict") ? 500 : null,
    existingItemType: conflictType.includes("name_conflict") ? ("file" as const) : null,
    recommendedResolution: resolution,
    autoRenamedName: input.afterName ?? null,
    childrenCount: 0,
    descendantConflictCount: 0,
    before: {
      name: input.beforeName ?? "conflict.txt",
      parentId: 42,
      parentPath: input.beforeParentPath ?? "/共有ドライブ/Reports",
      state: "trashed",
      restorable: conflictType === "none",
      reason:
        conflictType === "missing_parent"
          ? "元の復元先フォルダは削除されています"
          : conflictType.includes("name_conflict")
            ? "復元先に同名のファイルまたはフォルダーがあります"
            : null,
    },
    after: {
      name:
        input.afterName === undefined
          ? conflictType === "none"
            ? (input.beforeName ?? "conflict.txt")
            : "conflict (1).txt"
          : input.afterName,
      parentId: resolution === "restore_to_root" ? null : 42,
      parentPath: input.afterParentPath ?? "/共有ドライブ/Reports",
      restorable: resolution !== "skip",
      resolution,
      existingItemWillBePurged: false,
      existingItemWillBeTrashed: resolution === "trash_existing",
      existingItem:
        resolution === "trash_existing"
          ? {
              id: 500,
              itemType: "file" as const,
              name: "existing.txt",
              parentPath: "/共有ドライブ/Reports",
              purgeNote: "既存の項目はゴミ箱へ移動されます",
            }
          : null,
      state: resolution === "skip" ? "skipped" : "active",
      impact:
        resolution === "skip"
          ? "この項目は復元されません"
          : resolution === "trash_existing"
            ? "既存の項目をゴミ箱へ移動します"
            : resolution === "restore"
              ? "そのまま復元します"
              : "自動リネームして復元します",
    },
  };
}

function driveItemDataTransfer() {
  const store = new Map<string, string>();
  return {
    types: ["application/x-mitsubachi-drive-items"],
    effectAllowed: "move",
    dropEffect: "move",
    setData: vi.fn((type: string, value: string) => {
      store.set(type, value);
    }),
    getData: vi.fn((type: string) => store.get(type) ?? ""),
  };
}

function openDialogCloseButton(title: string) {
  const dialog = openDialog(title);
  const button = dialog?.querySelector('button[aria-label="閉じる"]');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Open dialog close button was not rendered.");
  }
  return button;
}

function openDialog(title: string) {
  const dialog = Array.from(document.querySelectorAll("dialog")).find((element) =>
    element.textContent?.includes(title),
  );
  if (!(dialog instanceof HTMLDialogElement)) {
    throw new Error(`Open dialog was not rendered: ${title}`);
  }
  return dialog;
}
