import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  moveDriveItem: vi.fn(),
  createDirectory: vi.fn<(input: CreateDirectoryInput) => Promise<unknown>>(),
  purgeDriveItem: vi.fn(),
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
  bulkRestore: vi.fn(),
  createDirectory: mocks.createDirectory,
  deleteDriveItem: vi.fn(),
  purgeDriveItem: mocks.purgeDriveItem,
  downloadDriveItem: vi.fn(),
  previewUrl: vi.fn((id: number) => `/preview/${id}`),
  renameDriveItem: vi.fn(),
  moveDriveItem: mocks.moveDriveItem,
  restoreDriveItem: vi.fn(),
  streamUrl: vi.fn((id: number) => `/stream/${id}`),
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
      input.onProgress?.({ loaded: input.file.size, total: input.file.size, percent: 100 });
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
    mocks.moveDriveItem.mockResolvedValue({ data: { id: 1, parent_id: 2, name: "moved", item_type: "file" } });
    mocks.purgeDriveItem.mockResolvedValue({ message: "完全削除しました" });
    mocks.createDirectory.mockImplementation(({ name, parentId }) =>
      Promise.resolve({
        id: name === "素材" ? 100 : 101,
        parent_id: parentId,
        name,
        item_type: "directory",
      }),
    );
    HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
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
    expect(screen.getAllByText("同じ名前のファイルが存在します。").length).toBeGreaterThan(0);
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

  it("shows duplicate content as an informational rename choice", async () => {
    mocks.uploadFile.mockRejectedValueOnce(
      new ApiError(
        409,
        "同じ内容のファイルがすでに存在します。",
        [],
        "duplicate_content",
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

    expect(await screen.findByText("名前の重複")).toBeInTheDocument();
    expect(screen.getAllByText("同じ内容のファイルがすでに存在します。").length).toBeGreaterThan(0);
    expect(screen.getAllByText("report.pdf").length).toBeGreaterThan(0);
    expect(screen.getAllByText("保存先: Reports").length).toBeGreaterThan(0);
    expect(screen.getAllByText("アップロード者: 佐藤").length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue("report（1）").length).toBeGreaterThan(0);
    expect(screen.queryByText("エラー内容をコピー")).not.toBeInTheDocument();

    mocks.uploadFile.mockResolvedValueOnce({
      id: 5,
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
        allowDuplicateContent: true,
      });
    });
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
      expect(mocks.createDirectory).toHaveBeenCalledWith({ name: "素材", parentId: 42 });
      expect(mocks.createDirectory).toHaveBeenCalledWith({ name: "camera-a", parentId: 100 });
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
    fireEvent.change(screen.getAllByLabelText("名前")[0], { target: { value: "素材" } });
    fireEvent.click(screen.getByText("作成"));

    expect(await screen.findByText("同じ名前のフォルダが存在します。")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("素材").length).toBeGreaterThan(0);
    expect(screen.queryByText("エラー内容をコピー")).not.toBeInTheDocument();

    mocks.createDirectory.mockResolvedValueOnce({
      id: 200,
      parent_id: 42,
      name: "素材2",
      item_type: "directory",
    });
    fireEvent.change(screen.getAllByLabelText("名前")[0], { target: { value: "素材2" } });
    fireEvent.click(screen.getByText("作成"));

    await waitFor(() => {
      expect(mocks.createDirectory.mock.calls.at(-1)?.[0]).toEqual({ name: "素材2", parentId: 42 });
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
    expect(screen.getByText("world", { selector: "[aria-current='page']" })).toBeInTheDocument();

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
        content_type: "video/mp4",
      },
      { id: 2, parent_id: null, name: "素材", item_type: "directory" },
    ]);
    const { container } = renderDrivePage("/drive");

    const source = (await screen.findByText("clip.mp4")).closest("tr");
    const target = screen.getByText("素材").closest("tr");
    if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      throw new Error("rows were not rendered");
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

  it("starts item drag from row whitespace but not from interactive controls", async () => {
    mocks.fetchDriveItems.mockResolvedValue([
      { id: 1, parent_id: null, name: "clip", item_type: "file", extension: "mp4" },
      { id: 2, parent_id: null, name: "素材", item_type: "directory" },
    ]);
    renderDrivePage("/drive");

    const source = (await screen.findByText("clip.mp4")).closest("tr");
    if (!(source instanceof HTMLElement)) throw new Error("row was not rendered");

    const rowTransfer = driveItemDataTransfer();
    fireEvent.dragStart(source, { dataTransfer: rowTransfer });
    expect(rowTransfer.setData).toHaveBeenCalledWith(
      "application/x-mitsubachi-drive-items",
      JSON.stringify({ itemIds: [1] }),
    );

    const checkboxTransfer = driveItemDataTransfer();
    fireEvent.dragStart(screen.getByLabelText("clipを選択"), { dataTransfer: checkboxTransfer });
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

  it("moves a folder to another folder by drag and drop", async () => {
    mocks.fetchDriveItems.mockResolvedValue([
      { id: 1, parent_id: null, name: "before", item_type: "directory" },
      { id: 2, parent_id: null, name: "after", item_type: "directory" },
    ]);
    renderDrivePage("/drive");

    const source = (await screen.findByText("before")).closest("tr");
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
    const source = screen.getByText("a.txt").closest("tr");
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
    const source = screen.getByText("dragged.txt").closest("tr");
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

    const source = (await screen.findByText("folder")).closest("tr");
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

    const source = (await screen.findByText("sample.mp4")).closest("tr");
    const target = screen.getByText("納品データ").closest("tr");
    if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      throw new Error("rows were not rendered");
    }

    const dataTransfer = driveItemDataTransfer();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    expect(await screen.findAllByText("同じ名前のファイルが移動先に存在します")).not.toHaveLength(0);
    expect(screen.getByText("別名を指定すると同じ操作を再実行できます。")).toBeInTheDocument();
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

    const source = (await screen.findByText("sample.mp4")).closest("tr");
    const target = screen.getByText("納品データ").closest("tr");
    if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      throw new Error("rows were not rendered");
    }

    const dataTransfer = driveItemDataTransfer();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    expect(await screen.findAllByText("サーバーで処理に失敗しました")).not.toHaveLength(0);
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
      expect(mocks.purgeDriveItem).toHaveBeenCalledWith(20);
      expect(mocks.purgeDriveItem).toHaveBeenCalledWith(21);
    });
  });

  it("stops media when preview is closed or unmounted", async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
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

    fireEvent.click(await screen.findByText("clip.mp4"));
    fireEvent.click(openDialogCloseButton("clip"));

    await waitFor(() => expect(pause).toHaveBeenCalled());
    expect(load).toHaveBeenCalled();

    fireEvent.click(await screen.findByText("clip.mp4"));
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
  const dialog = Array.from(document.querySelectorAll("dialog")).find((element) =>
    element.textContent?.includes(title),
  );
  const button = dialog?.querySelector('button[aria-label="閉じる"]');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Open dialog close button was not rendered.");
  }
  return button;
}
