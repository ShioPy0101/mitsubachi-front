import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_BASE_URL, clearCsrfToken } from "../api/client";
import { ToastProvider } from "../components/ToastProvider";
import { PublicSharePage } from "./PublicSharePage";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function showModal(
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  });
});

describe("PublicSharePage password unlock", () => {
  it("shows share contents after a correct password", async () => {
    clearCsrfToken();
    const fetchMock = mockPasswordFlow({
      unlockResponse: jsonResponse({ unlocked: true }),
    });

    renderPublicSharePage();

    const input = await screen.findByLabelText("パスワード");
    await userEvent.type(input, "correct-password");
    await userEvent.click(screen.getByRole("button", { name: "表示" }));

    expect(await screen.findByText("公開ファイル.pdf")).toBeInTheDocument();
    expect(screen.queryByText("パスワードが必要です")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/v1/public/shares/raw-token/unlock`,
      expect.objectContaining({
        body: JSON.stringify({ password: "correct-password" }),
        credentials: "include",
        method: "POST",
      }),
    );
  });

  it("shows an inline error for a wrong password", async () => {
    clearCsrfToken();
    mockPasswordFlow({
      unlockResponse: jsonResponse(
        {
          error: { code: "invalid_password", message: "パスワードが正しくありません" },
        },
        401,
      ),
    });

    renderPublicSharePage();

    const input = await screen.findByLabelText("パスワード");
    await userEvent.type(input, "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "表示" }));

    expect(await screen.findByText("パスワードが正しくありません")).toBeInTheDocument();
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.getByText("パスワードが必要です")).toBeInTheDocument();
  });

  it("shows an inline error for the public share password error code", async () => {
    clearCsrfToken();
    mockPasswordFlow({
      unlockResponse: jsonResponse(
        {
          error: {
            code: "invalid_share_password",
            message: "パスワードが正しくありません",
          },
        },
        401,
      ),
    });

    renderPublicSharePage();

    const input = await screen.findByLabelText("パスワード");
    await userEvent.type(input, "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "表示" }));

    expect(await screen.findByText("パスワードが正しくありません")).toBeInTheDocument();
    expect(screen.getByText("パスワードが必要です")).toBeInTheDocument();
  });

  it("does not call the unlock API for an empty password", async () => {
    clearCsrfToken();
    const fetchMock = mockPasswordFlow({
      unlockResponse: jsonResponse({ unlocked: true }),
    });

    renderPublicSharePage();

    await screen.findByLabelText("パスワード");
    await userEvent.click(screen.getByRole("button", { name: "表示" }));

    expect(screen.getByText("パスワードを入力してください")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a system error and clears loading state when unlock returns 5xx", async () => {
    clearCsrfToken();
    mockPasswordFlow({
      unlockResponse: jsonResponse(
        { error: { code: "internal_error", message: "Internal Server Error" } },
        500,
      ),
    });

    renderPublicSharePage();

    const input = await screen.findByLabelText("パスワード");
    await userEvent.type(input, "correct-password");
    await userEvent.click(screen.getByRole("button", { name: "表示" }));

    expect(
      await screen.findByText("認証処理に失敗しました。時間をおいて再度お試しください"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "表示" })).toBeEnabled();
  });

  it("keeps the submit button disabled while unlock is pending", async () => {
    clearCsrfToken();
    let resolveUnlock: (response: Response) => void = () => undefined;
    mockPasswordFlow({
      unlockResponse: new Promise<Response>((resolve) => {
        resolveUnlock = resolve;
      }),
    });

    renderPublicSharePage();

    const input = await screen.findByLabelText("パスワード");
    await userEvent.type(input, "correct-password");
    await userEvent.click(screen.getByRole("button", { name: "表示" }));

    expect(screen.getByRole("button", { name: "確認中..." })).toBeDisabled();

    resolveUnlock(jsonResponse({ unlocked: true }));

    expect(await screen.findByText("公開ファイル.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "確認中..." })).not.toBeInTheDocument();
  });

  it("prevents duplicate submits while unlock is pending", async () => {
    clearCsrfToken();
    let resolveUnlock: (response: Response) => void = () => undefined;
    const fetchMock = mockPasswordFlow({
      unlockResponse: new Promise<Response>((resolve) => {
        resolveUnlock = resolve;
      }),
    });

    renderPublicSharePage();

    const input = await screen.findByLabelText("パスワード");
    await userEvent.type(input, "correct-password");
    const submitButton = screen.getByRole("button", { name: "表示" });
    await userEvent.click(submitButton);
    await userEvent.click(screen.getByRole("button", { name: "確認中..." }));

    expect(
      fetchMock.mock.calls.filter(
        ([url]) => url === `${API_BASE_URL}/api/v1/public/shares/raw-token/unlock`,
      ),
    ).toHaveLength(1);

    resolveUnlock(jsonResponse({ unlocked: true }));
    expect(await screen.findByText("公開ファイル.pdf")).toBeInTheDocument();
  });

  it("submits with the Enter key", async () => {
    clearCsrfToken();
    const fetchMock = mockPasswordFlow({
      unlockResponse: jsonResponse({ unlocked: true }),
    });

    renderPublicSharePage();

    const input = await screen.findByLabelText("パスワード");
    await userEvent.type(input, "correct-password{Enter}");

    expect(await screen.findByText("公開ファイル.pdf")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/v1/public/shares/raw-token/unlock`,
      expect.objectContaining({
        body: JSON.stringify({ password: "correct-password" }),
        credentials: "include",
        method: "POST",
      }),
    );
  });

  it("opens a file preview inside the public share page", async () => {
    clearCsrfToken();
    mockPublicShare(publicShare({ content_type: "image/jpeg", extension: "jpg" }));

    renderPublicSharePage();

    await screen.findByText("公開ファイル.pdf");
    await userEvent.click(screen.getByRole("button", { name: "プレビュー" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "公開ファイル.pdf" })).toHaveAttribute(
      "src",
      `${API_BASE_URL}/api/v1/public/shares/raw-token/items/21/preview`,
    );
  });

  it("shows a folder share list and opens a subfolder", async () => {
    clearCsrfToken();
    const fetchMock = mockPublicShare(folderShare(), {
      root: itemsResponse([
        folderItem({ id: 30, name: "documents" }),
        fileItem({
          id: 31,
          name: "movie.mp4",
          extension: "mp4",
          content_type: "video/mp4",
        }),
      ]),
      byParent: {
        30: itemsResponse(
          [fileItem({ id: 32, parent_id: 30, name: "spec.pdf" })],
          [
            folderItem({ id: 12, name: "shared-folder" }),
            folderItem({ id: 30, name: "documents" }),
          ],
        ),
      },
    });

    renderPublicSharePage();

    expect(await screen.findByText("documents")).toBeInTheDocument();
    expect(screen.getByText("movie.mp4")).toBeInTheDocument();

    await userEvent.click(
      await screen.findByRole("button", { name: "documents を開く" }),
    );

    expect(await screen.findByText("spec.pdf")).toBeInTheDocument();
    expect(screen.queryByText("movie.mp4")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/v1/public/shares/raw-token/items?parent_id=30`,
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("navigates back only inside the shared root breadcrumbs", async () => {
    clearCsrfToken();
    mockPublicShare(folderShare(), {
      root: itemsResponse([folderItem({ id: 30, name: "documents" })]),
      byParent: {
        30: itemsResponse(
          [fileItem({ id: 32, parent_id: 30, name: "spec.pdf" })],
          [
            folderItem({ id: 12, name: "shared-folder" }),
            folderItem({ id: 30, name: "documents" }),
          ],
        ),
      },
    });

    renderPublicSharePage();

    expect(await screen.findByRole("button", { name: "共有ルート" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "root" })).not.toBeInTheDocument();

    await userEvent.click(
      await screen.findByRole("button", { name: "documents を開く" }),
    );
    expect(await screen.findByText("spec.pdf")).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("button", { name: "共有ルート" }));
    expect(await screen.findByText("documents")).toBeInTheDocument();
    expect(screen.queryByText("spec.pdf")).not.toBeInTheDocument();
  });

  it("opens a previewable file from the browser card", async () => {
    clearCsrfToken();
    mockPublicShare(folderShare(), {
      root: itemsResponse([
        fileItem({
          id: 31,
          name: "image.png",
          extension: "png",
          content_type: "image/png",
        }),
      ]),
    });

    renderPublicSharePage();

    await userEvent.click(
      await screen.findByRole("button", { name: "image.png をプレビュー" }),
    );

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "image.png" })).toHaveAttribute(
      "src",
      `${API_BASE_URL}/api/v1/public/shares/raw-token/items/31/preview`,
    );
  });

  it("hides download actions when the share disallows downloads", async () => {
    clearCsrfToken();
    mockPublicShare(folderShare({ allow_download: false }), {
      root: itemsResponse([fileItem({ id: 31, downloadable: false })]),
    });

    renderPublicSharePage();

    expect(await screen.findByText("公開ファイル.pdf")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "ダウンロード" }),
    ).not.toBeInTheDocument();
  });

  it("shows loading, error, and empty states for folder item loading", async () => {
    clearCsrfToken();
    let resolveItems: (response: Response) => void = () => undefined;
    const fetchMock = mockPublicShare(folderShare(), {
      root: new Promise<Response>((resolve) => {
        resolveItems = resolve;
      }),
    });

    renderPublicSharePage();

    expect(await screen.findByText("フォルダを読み込んでいます")).toBeInTheDocument();
    resolveItems(jsonResponse({ items: [] }));
    expect(await screen.findByText("このフォルダは空です。")).toBeInTheDocument();

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === `${API_BASE_URL}/api/v1/public/shares/raw-token`) {
        expect(init).toEqual(expect.objectContaining({ credentials: "include" }));
        return Promise.resolve(jsonResponse(folderShare()));
      }
      if (url === `${API_BASE_URL}/api/v1/public/shares/raw-token/items`) {
        return Promise.resolve(jsonResponse({ error: { code: "not_found" } }, 404));
      }
      return Promise.resolve(jsonResponse({ error: "not found" }, 404));
    });

    renderPublicSharePage();
    expect(
      await screen.findByText("フォルダを読み込めませんでした。"),
    ).toBeInTheDocument();
  });
});

function renderPublicSharePage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/share/raw-token"]}>
          <Routes>
            <Route path="/share/:token" element={<PublicSharePage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function mockPasswordFlow({
  unlockResponse,
}: {
  unlockResponse: Response | Promise<Response>;
}) {
  let shareRequests = 0;
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === `${API_BASE_URL}/api/v1/csrf_token`) {
      expect(init).toEqual(expect.objectContaining({ credentials: "include" }));
      return Promise.resolve(jsonResponse({ csrf_token: "csrf" }));
    }

    if (url === `${API_BASE_URL}/api/v1/public/shares/raw-token`) {
      expect(init).toEqual(expect.objectContaining({ credentials: "include" }));
      shareRequests += 1;
      return Promise.resolve(
        shareRequests === 1
          ? jsonResponse({ password_required: true })
          : jsonResponse(publicShare()),
      );
    }

    if (url === `${API_BASE_URL}/api/v1/public/shares/raw-token/items`) {
      expect(init).toEqual(expect.objectContaining({ credentials: "include" }));
      return Promise.resolve(itemsResponse(publicShareAfterUnlock().items));
    }

    if (url === `${API_BASE_URL}/api/v1/public/shares/raw-token/unlock`) {
      expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
      return Promise.resolve(unlockResponse);
    }

    return Promise.resolve(jsonResponse({ error: "not found" }, 404));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mockPublicShare(
  share = publicShare(),
  itemResponses: {
    root?: Response | Promise<Response>;
    byParent?: Record<number, Response | Promise<Response>>;
  } = {},
) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === `${API_BASE_URL}/api/v1/public/shares/raw-token`) {
      expect(init).toEqual(expect.objectContaining({ credentials: "include" }));
      return Promise.resolve(jsonResponse(share));
    }

    if (url === `${API_BASE_URL}/api/v1/public/shares/raw-token/items`) {
      expect(init).toEqual(expect.objectContaining({ credentials: "include" }));
      return mockResponse(itemResponses.root ?? itemsResponse(publicShareItems(share)));
    }

    const parentMatch = url.match(
      new RegExp(
        `^${API_BASE_URL}/api/v1/public/shares/raw-token/items\\?parent_id=(\\d+)$`,
      ),
    );
    if (parentMatch) {
      expect(init).toEqual(expect.objectContaining({ credentials: "include" }));
      const parentId = Number(parentMatch[1]);
      return mockResponse(
        itemResponses.byParent?.[parentId] ?? jsonResponse({ items: [] }),
      );
    }

    return Promise.resolve(jsonResponse({ error: "not found" }, 404));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function publicShareAfterUnlock() {
  return publicShare();
}

function publicShareItems(share: Record<string, unknown>) {
  const items = share.items;
  return Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
}

function publicShare(overrides: Record<string, unknown> = {}) {
  return {
    id: 12,
    name: "公開",
    allow_download: true,
    allow_bulk_download: false,
    password_required: true,
    items: [
      {
        id: 21,
        parent_id: null,
        name: "公開ファイル.pdf",
        item_type: "file",
        extension: "pdf",
        content_type: "application/pdf",
        file_size: 128,
        ...overrides,
      },
    ],
  };
}

function folderShare(overrides: Record<string, unknown> = {}) {
  return {
    ...publicShare(overrides),
    items: [],
  };
}

function fileItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 21,
    parent_id: null,
    name: "公開ファイル.pdf",
    kind: "file",
    item_type: "file",
    extension: "pdf",
    content_type: "application/pdf",
    file_size: 128,
    size: 128,
    previewable: true,
    downloadable: true,
    ...overrides,
  };
}

function folderItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 30,
    parent_id: null,
    name: "documents",
    kind: "folder",
    item_type: "directory",
    previewable: false,
    downloadable: false,
    ...overrides,
  };
}

function itemsResponse(
  items: Record<string, unknown>[],
  breadcrumbs: Record<string, unknown>[] = [],
) {
  return jsonResponse({
    current_folder: breadcrumbs.at(-1) ?? null,
    breadcrumbs,
    items,
  });
}

function mockResponse(response: Response | Promise<Response>) {
  if (response instanceof Response) return Promise.resolve(response.clone());

  return response;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
