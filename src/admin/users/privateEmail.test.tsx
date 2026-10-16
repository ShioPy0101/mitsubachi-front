import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../../components/ToastProvider";
import { fetchUser, fetchUsers, updateUser, type AdminUser } from "../api";
import { AdminUserDetailPage } from "./AdminUserDetailPage";
import { AdminUserEditPage } from "./AdminUserEditPage";
import { AdminUsersPage } from "./AdminUsersPage";

vi.mock("../api", async (original) => ({
  ...(await original<typeof import("../api")>()),
  fetchUser: vi.fn(),
  fetchUsers: vi.fn(),
  updateUser: vi.fn(),
}));
const user: AdminUser = {
  id: 1,
  email: null,
  name: "Member",
  display_name: "メンバー表示名",
  role: "member",
  suspended: false,
  memberships: [],
  organization: { id: 7, name: "Group" },
  organization_id: 7,
};

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
  vi.mocked(fetchUser).mockResolvedValue(user);
  vi.mocked(fetchUsers).mockResolvedValue({
    data: [user],
    meta: { current_page: 1, per_page: 25, total_count: 1, total_pages: 1 },
  });
  vi.mocked(updateUser).mockReset();
  vi.mocked(updateUser).mockResolvedValue(user);
});

describe("admin private email identities", () => {
  it("lists users by display name and explains exact email search", async () => {
    renderPage("/system-admin/users");
    expect(
      await screen.findByRole("cell", { name: "メンバー表示名" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Email" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/メールアドレスは完全一致で検索します/),
    ).toBeInTheDocument();
  });

  it("uses display name in suspension confirmation instead of null email", async () => {
    renderPage("/system-admin/users/1");
    await userEvent.setup().click(await screen.findByRole("button", { name: "停止" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "メンバー表示名 の状態を変更しますか？",
    );
  });

  it("does not submit an empty replacement email when updating another field", async () => {
    renderPage("/system-admin/users/1/edit");
    const input =
      await screen.findByLabelText("新しいメールアドレス（変更する場合のみ）");
    expect(input).toHaveValue("");
    await userEvent.setup().click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(vi.mocked(updateUser).mock.calls[0]?.[0]).toMatchObject({
        id: 1,
        email: undefined,
      }),
    );
  });
});

function renderPage(path: string) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/system-admin/users" element={<AdminUsersPage />} />
            <Route
              path="/system-admin/users/:userId"
              element={<AdminUserDetailPage />}
            />
            <Route
              path="/system-admin/users/:userId/edit"
              element={<AdminUserEditPage />}
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}
