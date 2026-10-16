import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { API_BASE_URL } from "../api/client";
import { AuthProvider } from "./AuthProvider";
import { RequireAuth } from "./RequireAuth";
import { VerifyPage } from "./VerifyPage";

describe("VerifyPage", () => {
  it("cancels the initial session check before verifying a magic link", async () => {
    const events: string[] = [];
    let meRequestCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (url === `${API_BASE_URL}/api/v1/me`) {
          meRequestCount += 1;
          if (meRequestCount === 1) {
            events.push("me:start");
            return new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => {
                events.push("me:abort");
                reject(new DOMException("Aborted", "AbortError"));
              });
            });
          }

          events.push("me:authenticated");
          return Promise.resolve(jsonResponse({ data: currentUser() }));
        }
        if (url === `${API_BASE_URL}/api/v1/csrf_token`) {
          events.push("csrf");
          return Promise.resolve(jsonResponse({ csrf_token: "csrf" }));
        }
        if (url === `${API_BASE_URL}/api/v1/auth/verify`) {
          events.push("verify");
          return Promise.resolve(jsonResponse({ message: "ok" }));
        }

        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    renderVerificationRoute();

    expect(await screen.findByText("Protected content")).toBeInTheDocument();
    await waitFor(() => {
      expect(events.indexOf("me:abort")).toBeLessThan(events.indexOf("verify"));
    });
    expect(events).toContain("me:authenticated");
  });
  it.each([true, false])(
    "returns to settings only when the server grants reauthentication: %s",
    async (granted) => {
      vi.stubGlobal(
        "fetch",
        vi.fn((input) => {
          const url = String(input);
          const body = url.endsWith("/csrf_token")
            ? { csrf_token: "csrf" }
            : url.endsWith("/auth/verify")
              ? { message: "ok", email_change_reauthenticated: granted }
              : { data: { ...currentUser(), email: null } };
          return Promise.resolve(jsonResponse(body));
        }),
      );
      renderVerificationRoute("/auth/verify?token=reauth-token&intent=email_change");
      if (granted) {
        expect(await screen.findByText("Email change settings")).toBeInTheDocument();
        expect(screen.getByTestId("reauth-state")).toHaveTextContent(
          '"emailChangeUserId":1',
        );
        expect(screen.getByTestId("reauth-state")).not.toHaveTextContent(
          "reauth-token",
        );
      } else {
        expect(await screen.findByText("Protected content")).toBeInTheDocument();
        expect(screen.queryByText("Email change settings")).not.toBeInTheDocument();
      }
    },
  );
});

function renderVerificationRoute(path = "/auth/verify?token=magic-link-token") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/auth/verify" element={<VerifyPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/drive" element={<div>Protected content</div>} />
              <Route path="/settings/user" element={<SettingsDestination />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function currentUser() {
  return {
    id: 1,
    organization_id: 7,
    organization_name: "Mitsubachi",
    email: "user@example.com",
    name: "User",
    role: "member",
  };
}

function SettingsDestination() {
  const location = useLocation();
  return (
    <>
      <h1>Email change settings</h1>
      <p data-testid="reauth-state">{JSON.stringify(location.state)}</p>
    </>
  );
}
