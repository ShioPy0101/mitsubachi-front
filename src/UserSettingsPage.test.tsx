import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentUser } from "./api/schemas";
import { cancelEmailChange, requestEmailChange, updateCurrentUser } from "./auth/api";
import { AuthContext } from "./auth/AuthContext";
import { ToastProvider } from "./components/ToastProvider";
import { UserSettingsPage } from "./UserSettingsPage";

vi.mock("./auth/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./auth/api")>();
  return {
    ...actual,
    updateCurrentUser: vi.fn(),
    requestEmailChange: vi.fn(),
    cancelEmailChange: vi.fn(),
  };
});

const currentUser: CurrentUser = {
  id: 1,
  email: "current@example.com",
  pending_email: null,
  name: "Current User",
  display_name: "丸山拓真",
  role: "member",
  suspended: false,
  organization_id: 7,
  organization_name: "映像コミュニティ",
  organization: { id: 7, name: "映像コミュニティ" },
};

describe("UserSettingsPage", () => {
  beforeEach(() => {
    vi.mocked(updateCurrentUser).mockReset();
    vi.mocked(requestEmailChange).mockReset();
    vi.mocked(cancelEmailChange).mockReset();
  });

  it("shows current user and disables unchanged display name save", () => {
    renderPage(currentUser);

    expect(screen.getByDisplayValue("丸山拓真")).toBeInTheDocument();
    expect(screen.getByText("current@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("updates display name with trimmed value", async () => {
    vi.mocked(updateCurrentUser).mockResolvedValue({
      ...currentUser,
      display_name: "しお",
    });
    const user = userEvent.setup();
    renderPage(currentUser);

    const input = screen.getByDisplayValue("丸山拓真");
    await user.clear(input);
    await user.type(input, "  しお  ");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(updateCurrentUser).toHaveBeenCalledWith({ displayName: "しお" });
    expect(await screen.findByText("表示名を保存しました。")).toBeInTheDocument();
  });

  it("shows pending email state and can resend or cancel", async () => {
    vi.mocked(requestEmailChange).mockResolvedValue({ message: "ok" });
    vi.mocked(cancelEmailChange).mockResolvedValue({ message: "ok" });
    const user = userEvent.setup();
    renderPage({ ...currentUser, pending_email: "new@example.com" });

    expect(screen.getByText("new@example.com")).toBeInTheDocument();
    expect(screen.getByText("確認待ち")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "再送" }));
    expect(requestEmailChange).toHaveBeenCalledWith("new@example.com");

    await user.click(screen.getByRole("button", { name: "申請取消" }));
    expect(cancelEmailChange).toHaveBeenCalled();
  });

  it("requests email change from input", async () => {
    vi.mocked(requestEmailChange).mockResolvedValue({
      message: "ok",
      pending_email: "new@example.com",
    });
    const user = userEvent.setup();
    renderPage(currentUser);

    await user.type(screen.getByLabelText("新しいメールアドレス"), "new@example.com");
    await user.click(screen.getByRole("button", { name: "確認メールを送信" }));

    expect(requestEmailChange).toHaveBeenCalledWith("new@example.com");
    expect(await screen.findByText("確認メールを送信しました。")).toBeInTheDocument();
  });
});

function renderPage(user: CurrentUser) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthContext.Provider
          value={{
            user,
            status: "authenticated",
            error: null,
            isLoading: false,
            isAuthenticated: true,
            retryAuthCheck: vi.fn(),
          }}
        >
          <UserSettingsPage />
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}
