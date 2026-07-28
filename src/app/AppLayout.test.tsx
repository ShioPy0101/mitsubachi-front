import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthContext, type AuthContextValue } from "../auth/AuthContext";
import { ToastProvider } from "../components/ToastProvider";
import { AppLayout } from "./AppLayout";

describe("AppLayout organization navigation", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-color-mode");
    document.documentElement.style.colorScheme = "";
  });

  it("shows organization switcher and navigates to selected organization drive", () => {
    renderLayout();

    fireEvent.change(screen.getByLabelText("Organizationを切り替え"), {
      target: { value: "2" },
    });

    expect(screen.getByTestId("location")).toHaveTextContent("/organizations/2/drive");
    expect(screen.getByText("新しい組織に参加")).toHaveAttribute(
      "href",
      "/organizations/join",
    );
  });

  it("drops the previous folder id when switching organizations", () => {
    renderLayout({ initialEntry: "/organizations/1/drive/folder/99" });

    fireEvent.change(screen.getByLabelText("Organizationを切り替え"), {
      target: { value: "2" },
    });

    expect(screen.getByTestId("location")).toHaveTextContent("/organizations/2/drive");
    expect(screen.getByTestId("location")).not.toHaveTextContent("folder/99");
    expect(localStorage.getItem("mitsubachi.currentOrganizationId")).toBe("2");
  });

  it("shows organization management only for the current managed organization", () => {
    const { unmount } = renderLayout();

    expect(screen.getByRole("link", { name: /組織管理/ })).toHaveAttribute(
      "href",
      "/organizations/1/admin/dashboard",
    );

    unmount();
    renderLayout({ initialEntry: "/organizations/2/drive" });

    expect(screen.queryByRole("link", { name: /組織管理/ })).not.toBeInTheDocument();
  });

  it("shows system management only to system admins", () => {
    renderLayout({ user: authUser({ role: "system_admin" }) });

    expect(screen.getByText("システム管理")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "組織" })).toHaveAttribute(
      "href",
      "/system-admin/organizations",
    );
    expect(screen.getByRole("link", { name: "監査ログ" })).toHaveAttribute(
      "href",
      "/system-admin/audit-events",
    );
  });

  it("toggles and persists the color mode", () => {
    renderLayout();

    const toggle = screen.getByRole("button", { name: "黒モードへ切り替え" });
    fireEvent.click(toggle);

    expect(document.documentElement.dataset.colorMode).toBe("dark");
    expect(localStorage.getItem("mitsubachi.colorMode")).toBe("dark");
    expect(screen.getByRole("button", { name: "白モードへ切り替え" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

function renderLayout({
  initialEntry = "/organizations/1/drive",
  user = authUser(),
}: {
  initialEntry?: string;
  user?: AuthContextValue["user"];
} = {}) {
  return render(renderLayoutElement({ initialEntry, user }));
}

function renderLayoutElement({
  initialEntry = "/organizations/1/drive",
  user = authUser(),
}: {
  initialEntry?: string;
  user?: AuthContextValue["user"];
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthContext.Provider value={authValue(user)}>
          <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route
                  path="/organizations/:organizationId/drive"
                  element={<LocationProbe />}
                />
                <Route
                  path="/organizations/:organizationId/drive/folder/:folderId"
                  element={<LocationProbe />}
                />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function authValue(user: AuthContextValue["user"] = authUser()): AuthContextValue {
  return {
    status: "authenticated",
    user,
    error: null,
    isLoading: false,
    isAuthenticated: true,
    retryAuthCheck: vi.fn(),
  };
}

function authUser(
  overrides: Partial<NonNullable<AuthContextValue["user"]>> = {},
): NonNullable<AuthContextValue["user"]> {
  return {
    id: 1,
    email: "user@example.com",
    name: "User",
    display_name: "丸山",
    role: "member",
    suspended: false,
    organization: { id: 1, name: "映像制作部" },
    memberships: [
      {
        organization: { id: 1, name: "映像制作部" },
        role: "organization_admin",
        status: "active",
      },
      {
        organization: { id: 2, name: "大学プロジェクト" },
        role: "member",
        status: "active",
      },
    ],
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}
