import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AuthContext, type AuthContextValue } from "../../auth/AuthContext";
import { AdminLayout } from "./AdminScaffold";

describe("AdminLayout organization context", () => {
  it("shows system-wide context without the normal organization switcher", () => {
    renderAdminLayout({
      initialEntry: "/system-admin/dashboard",
      user: authUser({ role: "system_admin" }),
    });

    expect(screen.getByRole("heading", { name: "システム管理" })).toBeInTheDocument();
    expect(screen.getByText("システム全体")).toBeInTheDocument();
    expect(screen.getByText("システム全体を管理しています")).toBeInTheDocument();
    expect(screen.queryByLabelText("Organizationを切り替え")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "組織" })).toHaveAttribute(
      "href",
      "/system-admin/organizations",
    );
  });

  it("shows the managed organization and a drive return link on organization admin pages", () => {
    renderAdminLayout({ initialEntry: "/organizations/1/admin/dashboard" });

    expect(screen.getByRole("heading", { name: "組織管理" })).toBeInTheDocument();
    expect(screen.getByText("映像制作部")).toBeInTheDocument();
    expect(screen.getByText("この組織を管理しています")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "共有ドライブへ戻る" })).toHaveAttribute(
      "href",
      "/organizations/1/drive",
    );
  });

  it("leaves organization admin when the current user cannot manage that organization", () => {
    renderAdminLayout({
      initialEntry: "/organizations/2/admin/dashboard",
      user: authUser(),
    });

    expect(screen.getByTestId("location")).toHaveTextContent("/organizations/2/drive");
  });
});

function renderAdminLayout({
  initialEntry,
  user = authUser(),
}: {
  initialEntry: string;
  user?: AuthContextValue["user"];
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authValue(user)}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route element={<AdminLayout />}>
              <Route
                path="/system-admin/dashboard"
                element={<div>System dashboard</div>}
              />
              <Route
                path="/organizations/:organizationId/admin/dashboard"
                element={<div>Organization dashboard</div>}
              />
            </Route>
            <Route
              path="/organizations/:organizationId/drive"
              element={<LocationProbe />}
            />
            <Route path="/403" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
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
