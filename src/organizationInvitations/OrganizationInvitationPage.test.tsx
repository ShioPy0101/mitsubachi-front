import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthContext, type AuthContextValue } from "../auth/AuthContext";
import { ToastProvider } from "../components/ToastProvider";
import { JoinOrganizationPage } from "./JoinOrganizationPage";
import {
  OrganizationInvitationJoinedPage,
  OrganizationInvitationPage,
} from "./OrganizationInvitationPage";

const mocks = vi.hoisted(() => ({
  fetchOrganizationInvitation: vi.fn(),
  acceptOrganizationInvitation: vi.fn(),
}));

vi.mock("./api", () => ({
  organizationInvitationKeys: {
    detail: (token: string) => ["organization-invitation", token] as const,
  },
  fetchOrganizationInvitation: mocks.fetchOrganizationInvitation,
  acceptOrganizationInvitation: mocks.acceptOrganizationInvitation,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchOrganizationInvitation.mockResolvedValue(invitation());
  mocks.acceptOrganizationInvitation.mockResolvedValue({
    message: "組織に参加しました",
    membership: {
      organization: { id: 12, name: "映像制作部" },
      role: "member",
      status: "active",
    },
  });
});

describe("OrganizationInvitationPage", () => {
  it("redirects unauthenticated users to login while keeping invitation path", async () => {
    renderInvitation({ auth: authValue({ status: "unauthenticated" }) });

    expect(await screen.findByText("Login page")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
  });

  it("shows account mismatch and blocks accept action", async () => {
    renderInvitation({
      auth: authValue({ email: "other@example.com" }),
    });

    expect(await screen.findByText("アカウントが一致しません")).toBeInTheDocument();
    expect(screen.getAllByText(/invitee@example.com/).length).toBeGreaterThan(0);
    expect(screen.queryByText("この組織に参加する")).not.toBeInTheDocument();
    expect(mocks.acceptOrganizationInvitation).not.toHaveBeenCalled();
  });

  it("accepts invitation and opens success screen", async () => {
    renderInvitation();

    fireEvent.click(await screen.findByText("この組織に参加する"));

    await waitFor(() => {
      expect(mocks.acceptOrganizationInvitation).toHaveBeenCalledWith("join-token");
    });
    expect(await screen.findByText("組織に参加しました")).toBeInTheDocument();
    expect(screen.getByText("この組織を開く")).toHaveAttribute(
      "href",
      "/organizations/12/drive",
    );
  });
});

describe("JoinOrganizationPage", () => {
  it("moves to invitation confirmation without accepting directly", () => {
    render(
      <MemoryRouter initialEntries={["/organizations/join"]}>
        <Routes>
          <Route path="/organizations/join" element={<JoinOrganizationPage />} />
          <Route path="/organization-invitations/:token" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("招待コードまたは招待URL"), {
      target: { value: "https://front.example/organization-invitations/abc123" },
    });
    fireEvent.click(screen.getByText("招待を確認"));

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/organization-invitations/abc123",
    );
    expect(mocks.acceptOrganizationInvitation).not.toHaveBeenCalled();
  });
});

function renderInvitation({
  auth = authValue(),
}: {
  auth?: AuthContextValue;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthContext.Provider value={auth}>
          <MemoryRouter initialEntries={["/organization-invitations/join-token"]}>
            <Routes>
              <Route
                path="/organization-invitations/:token"
                element={<OrganizationInvitationPage />}
              />
              <Route
                path="/organization-invitations/:token/joined"
                element={<OrganizationInvitationJoinedPage />}
              />
              <Route
                path="/login"
                element={
                  <>
                    <div>Login page</div>
                    <LocationProbe />
                  </>
                }
              />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function authValue({
  status = "authenticated",
  email = "invitee@example.com",
}: {
  status?: AuthContextValue["status"];
  email?: string;
} = {}): AuthContextValue {
  const authenticated = status === "authenticated";
  return {
    status,
    user: authenticated
      ? {
          id: 1,
          email,
          name: "User",
          display_name: "丸山",
          role: "member",
          suspended: false,
          organization: { id: 1, name: "既存組織" },
          memberships: [
            {
              organization: { id: 1, name: "既存組織" },
              role: "member",
              status: "active",
            },
          ],
        }
      : null,
    error: null,
    isLoading: status === "checking",
    isAuthenticated: authenticated,
    retryAuthCheck: vi.fn(),
  };
}

function invitation() {
  return {
    token: "join-token",
    organization: { id: 12, name: "映像制作部" },
    invited_by: {
      id: 2,
      display_name: "管理者",
      email: "admin@example.com",
    },
    email: "invitee@example.com",
    role: "member",
    expires_at: "2026-07-30T10:00:00Z",
    accepted_at: null,
    revoked_at: null,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}
