import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { API_BASE_URL, clearCsrfToken } from "../api/client";
import { ToastProvider } from "../components/ToastProvider";
import { PublicSharePage } from "./PublicSharePage";

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

    if (url === `${API_BASE_URL}/api/v1/public/shares/raw-token/unlock`) {
      expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
      return Promise.resolve(unlockResponse);
    }

    return Promise.resolve(jsonResponse({ error: "not found" }, 404));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function publicShare() {
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
      },
    ],
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
