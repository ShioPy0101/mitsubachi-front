import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentUser } from "./api/schemas";
import { verifyEmailChange } from "./auth/api";
import { AuthContext } from "./auth/AuthContext";
import { EmailChangeVerifyPage } from "./EmailChangeVerifyPage";

vi.mock("./auth/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./auth/api")>();
  return {
    ...actual,
    verifyEmailChange: vi.fn(),
  };
});

describe("EmailChangeVerifyPage", () => {
  beforeEach(() => {
    vi.mocked(verifyEmailChange).mockReset();
  });

  it("verifies token from query string", async () => {
    vi.mocked(verifyEmailChange).mockResolvedValue({
      message: "ok",
      email: "new@example.com",
    });

    renderPage("/settings/email-change/verify?token=raw-token");

    await waitFor(() => expect(verifyEmailChange).toHaveBeenCalled());
    expect(vi.mocked(verifyEmailChange).mock.calls[0]?.[0]).toBe("raw-token");
    expect(await screen.findByText("メールアドレスを変更しました")).toBeInTheDocument();
    expect(screen.getByText("まもなく移動します。")).toBeInTheDocument();
  });

  it("redirects authenticated users back to user settings after success", async () => {
    vi.mocked(verifyEmailChange).mockResolvedValue({
      message: "ok",
      email: "new@example.com",
    });

    renderPage("/settings/email-change/verify?token=raw-token", {
      user: currentUser,
      isAuthenticated: true,
    });

    expect(await screen.findByText("メールアドレスを変更しました")).toBeInTheDocument();
    expect(screen.getByText("まもなく移動します。")).toBeInTheDocument();

    expect(
      await screen.findByText("settings redirected", undefined, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it("shows invalid link without token", () => {
    renderPage("/settings/email-change/verify");

    expect(screen.getByText("確認リンクが無効です")).toBeInTheDocument();
    expect(verifyEmailChange).not.toHaveBeenCalled();
  });

  it("shows verification failure", async () => {
    vi.mocked(verifyEmailChange).mockRejectedValue(new Error("期限切れです"));

    renderPage("/settings/email-change/verify?token=expired-token");

    expect(
      await screen.findByText("メールアドレスを変更できませんでした"),
    ).toBeInTheDocument();
    expect(screen.getByText("期限切れです")).toBeInTheDocument();
  });
});

const currentUser: CurrentUser = {
  id: 1,
  email: "current@example.com",
  pending_email: null,
  name: "Current User",
  display_name: "表示名テスト",
  role: "member",
  suspended: false,
  organization_id: 7,
  organization_name: "映像コミュニティ",
  organization: { id: 7, name: "映像コミュニティ" },
};

function renderPage(
  initialEntry: string,
  auth: { user: CurrentUser | null; isAuthenticated: boolean } = {
    user: null,
    isAuthenticated: false,
  },
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider
        value={{
          user: auth.user,
          status: auth.isAuthenticated ? "authenticated" : "unauthenticated",
          error: null,
          isLoading: false,
          isAuthenticated: auth.isAuthenticated,
          retryAuthCheck: vi.fn(),
        }}
      >
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route
              path="/settings/email-change/verify"
              element={<EmailChangeVerifyPage />}
            />
            <Route path="/settings/user" element={<div>settings redirected</div>} />
            <Route path="/login" element={<div>login redirected</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}
