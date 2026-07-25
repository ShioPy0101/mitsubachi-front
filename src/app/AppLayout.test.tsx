import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AuthContext, type AuthContextValue } from "../auth/AuthContext";
import { ToastProvider } from "../components/ToastProvider";
import { AppLayout } from "./AppLayout";

describe("AppLayout organization navigation", () => {
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
});

function renderLayout() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthContext.Provider value={authValue()}>
          <MemoryRouter initialEntries={["/organizations/1/drive"]}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route
                  path="/organizations/:organizationId/drive"
                  element={<LocationProbe />}
                />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function authValue(): AuthContextValue {
  return {
    status: "authenticated",
    user: {
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
    },
    error: null,
    isLoading: false,
    isAuthenticated: true,
    retryAuthCheck: vi.fn(),
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}
