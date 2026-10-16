import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./api/errors";
import type { CurrentUser } from "./api/schemas";
import { cancelEmailChange, requestEmailChange, updateCurrentUser } from "./auth/api";
import { AuthContext } from "./auth/AuthContext";
import { ToastProvider } from "./components/ToastProvider";
import { UserSettingsPage } from "./UserSettingsPage";

vi.mock("./auth/api", async (original) => ({
  ...(await original<typeof import("./auth/api")>()),
  updateCurrentUser: vi.fn(),
  requestEmailChange: vi.fn(),
  cancelEmailChange: vi.fn(),
}));

const currentUser: CurrentUser = {
  id: 1,
  email: null,
  pending_email: null,
  name: "Current User",
  display_name: "表示名テスト",
  role: "member",
  suspended: false,
  organization_id: 7,
  organization_name: "映像コミュニティ",
  organization: { id: 7, name: "映像コミュニティ" },
  memberships: [],
};
const recentState = () => ({
  emailChangeUserId: 1,
  emailChangeReauthenticatedAt: Date.now(),
});

beforeEach(() => {
  vi.mocked(updateCurrentUser).mockReset();
  vi.mocked(requestEmailChange).mockReset();
  vi.mocked(cancelEmailChange).mockReset();
});

describe("UserSettingsPage", () => {
  it("requires the login screen before showing the new address form", () => {
    renderPage();
    expect(screen.getByDisplayValue("表示名テスト")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    expect(screen.queryByLabelText("新しいメールアドレス")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "再ログインして変更する" }),
    ).toHaveAttribute("href", "/login?intent=email_change");
    expect(requestEmailChange).not.toHaveBeenCalled();
  });

  it("keeps display name updates working without an email address", async () => {
    vi.mocked(updateCurrentUser).mockResolvedValue({
      ...currentUser,
      display_name: "新しい表示名",
    });
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByDisplayValue("表示名テスト");
    await user.clear(input);
    await user.type(input, "  新しい表示名  ");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(updateCurrentUser).toHaveBeenCalledWith({ displayName: "新しい表示名" });
    expect(await screen.findByText("表示名を保存しました。")).toBeInTheDocument();
  });

  it.each([
    { emailChangeUserId: 2, emailChangeReauthenticatedAt: Date.now() },
    { emailChangeUserId: 1, emailChangeReauthenticatedAt: Date.now() - 6 * 60_000 },
    { emailChangeUserId: 1, emailChangeReauthenticatedAt: Date.now() + 60_000 },
    { emailChangeUserId: 1, emailChangeReauthenticatedAt: "invalid" },
  ])("does not reuse invalid or expired reauthentication state: %j", (state) => {
    renderPage(currentUser, state);
    expect(screen.queryByLabelText("新しいメールアドレス")).not.toBeInTheDocument();
  });

  it("requests old address approval only after reauthentication", async () => {
    vi.mocked(requestEmailChange).mockResolvedValue({
      message: "ok",
      pending_email: null,
      email_change_stage: "awaiting_old_email_approval",
    });
    const user = userEvent.setup();
    renderPage(currentUser, recentState());
    await user.type(screen.getByLabelText("新しいメールアドレス"), "new@example.com");
    await user.click(screen.getByRole("button", { name: "変更承認メールを送信" }));
    expect(requestEmailChange).toHaveBeenCalledWith("new@example.com");
    expect(
      await screen.findByText("現在のメールアドレスに変更承認メールを送信しました。"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("新しいメールアドレス")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("new@example.com");
  });

  it.each([
    ["awaiting_old_email_approval", "現在のメールアドレスで承認待ち"],
    ["awaiting_new_email_confirmation", "新しいメールアドレスで確認待ち"],
  ] as const)(
    "shows %s without a stored address and permits cancellation",
    async (stage, heading) => {
      vi.mocked(cancelEmailChange).mockResolvedValue({ message: "ok" });
      renderPage({ ...currentUser, email_change_stage: stage });
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "再送" })).not.toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole("button", { name: "申請取消" }));
      expect(cancelEmailChange).toHaveBeenCalledOnce();
    },
  );

  it("returns to login when the server rejects a consumed or expired reauthentication", async () => {
    vi.mocked(requestEmailChange).mockRejectedValue(
      new ApiError(401, "再ログインが必要です", [], "reauthentication_required"),
    );
    renderPage(currentUser, recentState());
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("新しいメールアドレス"), "new@example.com");
    await user.click(screen.getByRole("button", { name: "変更承認メールを送信" }));
    expect(await screen.findByText("Reauthentication login")).toBeInTheDocument();
  });

  it("shows validation failures next to the form without claiming that mail was sent", async () => {
    vi.mocked(requestEmailChange).mockRejectedValue(
      new ApiError(422, "既に使用されています"),
    );
    renderPage(currentUser, recentState());
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("新しいメールアドレス"), "taken@example.com");
    await user.click(screen.getByRole("button", { name: "変更承認メールを送信" }));
    expect(await screen.findByText("既に使用されています")).toBeInTheDocument();
    expect(
      screen.queryByText("現在のメールアドレスに変更承認メールを送信しました。"),
    ).not.toBeInTheDocument();
  });
});

function renderPage(user: CurrentUser = currentUser, state?: unknown) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
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
          <MemoryRouter initialEntries={[{ pathname: "/settings/user", state }]}>
            <Routes>
              <Route path="/settings/user" element={<UserSettingsPage />} />
              <Route path="/login" element={<div>Reauthentication login</div>} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}
