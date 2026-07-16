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
};

const mocks = vi.hoisted(() => ({
  fetchDriveItems: vi.fn(),
  fetchDriveItem: vi.fn(),
  fetchTrash: vi.fn(),
  uploadFile: vi.fn<(input: UploadFileInput) => Promise<unknown>>(),
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
  bulkDelete: vi.fn(),
  bulkDownload: vi.fn(),
  bulkRestore: vi.fn(),
  createDirectory: vi.fn(),
  deleteDriveItem: vi.fn(),
  downloadDriveItem: vi.fn(),
  previewUrl: vi.fn((id: number) => `/preview/${id}`),
  renameDriveItem: vi.fn(),
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
    mocks.uploadFile.mockResolvedValue({
      id: 1,
      parent_id: 42,
      name: "report",
      item_type: "file",
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
