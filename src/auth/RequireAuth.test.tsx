import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { API_BASE_URL } from "../api/client";
import { AuthProvider } from "./AuthProvider";
import { RequireAuth } from "./RequireAuth";

describe("RequireAuth", () => {
  it("shows protected content when /api/v1/me returns 200", async () => {
    mockMe(jsonResponse({ data: currentUser() }));

    renderProtectedRoute();

    expect(await screen.findByText("Protected content")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(`${API_BASE_URL}/api/v1/me`);
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({
      credentials: "include",
    });
  });

  it("redirects to login when /api/v1/me returns 401", async () => {
    mockMe(jsonResponse({ error: "ログインが必要です。" }, 401));

    renderProtectedRoute();

    expect(await screen.findByText("Login page")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("shows an API connection error when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );

    renderProtectedRoute();

    expect(await screen.findByText("API接続を確認できません")).toBeInTheDocument();
    expect(screen.getByText(`${API_BASE_URL}/api/v1/me`)).toBeInTheDocument();
    expect(screen.getByText("network")).toBeInTheDocument();
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });

  it("does not treat 500 as unauthenticated", async () => {
    mockMe(jsonResponse({ error: "Service unavailable" }, 500));

    renderProtectedRoute();

    expect(await screen.findByText("API接続を確認できません")).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });

  it("does not loop requests under StrictMode remount checks", async () => {
    mockMe(jsonResponse({ data: currentUser() }));

    renderProtectedRoute({ strict: true });

    expect(await screen.findByText("Protected content")).toBeInTheDocument();
    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.length).toBeLessThanOrEqual(2);
    });
  });

  it("allows system-only routes for system admins", async () => {
    mockMe(jsonResponse({ data: currentUser({ role: "system_admin" }) }));

    renderProtectedRoute({ system: true });

    expect(await screen.findByText("Protected content")).toBeInTheDocument();
  });

  it("rejects system-only routes for organization admins", async () => {
    mockMe(jsonResponse({ data: currentUser({ role: "organization_admin" }) }));

    renderProtectedRoute({ system: true });

    expect(await screen.findByText("Forbidden page")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });
});

function renderProtectedRoute({
  strict = false,
  system = false,
}: {
  strict?: boolean;
  system?: boolean;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const ui = (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/drive"]}>
          <Routes>
            <Route element={<RequireAuth system={system} />}>
              <Route path="/drive" element={<div>Protected content</div>} />
            </Route>
            <Route path="/login" element={<div>Login page</div>} />
            <Route path="/403" element={<div>Forbidden page</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );

  return render(strict ? <StrictMode>{ui}</StrictMode> : ui);
}

function mockMe(response: Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(response.clone())),
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function currentUser({ role = "member" } = {}) {
  return {
    id: 1,
    organization_id: 7,
    organization_name: "Mitsubachi",
    email: "user@example.com",
    name: "User",
    role,
  };
}
