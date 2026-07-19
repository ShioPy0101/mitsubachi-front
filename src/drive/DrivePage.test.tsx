import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../components/ToastProvider";
import { DrivePage } from "./DrivePage";

type UploadFileInput = {
  file: File;
  name: string;
  parentId: number | null;
  onProgress?: (progress: { loaded: number; total?: number; percent?: number }) => void;
};

const mocks = vi.hoisted(() => ({
  fetchDriveItems: vi.fn(),
  fetchDriveItem: vi.fn(),
  fetchTrash: vi.fn(),
  uploadFile: vi.fn<(input: UploadFileInput) => Promise<unknown>>(),
  searchDriveItems: vi.fn(),
  bulkMove: vi.fn(),
  moveDriveItem: vi.fn(),
  createDirectory: vi.fn(),
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

    fireEvent.dragStart(source, { dataTransfer: driveItemDataTransfer() });
    fireEvent.dragOver(target, { dataTransfer: driveItemDataTransfer() });
    expect(target).toHaveClass("drop-target");
    fireEvent.drop(target, { dataTransfer: driveItemDataTransfer() });

    await waitFor(() => {
      expect(mocks.moveDriveItem).toHaveBeenCalledWith({ id: 1, parentId: 2 });
    });
    expect(container.querySelector(".dragging-row")).not.toBeInTheDocument();
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

    fireEvent.dragStart(source, { dataTransfer: driveItemDataTransfer() });
    fireEvent.drop(target, { dataTransfer: driveItemDataTransfer() });

    await waitFor(() => {
      expect(mocks.bulkMove).toHaveBeenCalledWith([1, 2], 3);
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
  return {
    types: ["application/x-mitsubachi-drive-item"],
    effectAllowed: "move",
    dropEffect: "move",
    setData: vi.fn(),
    getData: vi.fn(),
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
