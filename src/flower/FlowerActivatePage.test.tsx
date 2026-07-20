import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { API_BASE_URL } from "../api/client";
import { ToastProvider } from "../components/ToastProvider";
import { FlowerActivatePage } from "./FlowerActivatePage";

describe("FlowerActivatePage", () => {
  it("shows user code and approves the selected organization", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url === `${API_BASE_URL}/flower/activate?user_code=55ZZ-9KGZ`) {
          return Promise.resolve(
            jsonResponse({
              user_code: "55ZZ-9KGZ",
              organizations: [{ id: "7", name: "Design Team" }],
            }),
          );
        }
        if (url === `${API_BASE_URL}/api/v1/csrf_token`) {
          return Promise.resolve(jsonResponse({ csrf_token: "csrf-token" }));
        }
        if (url === `${API_BASE_URL}/api/v1/flower/device_authorizations/approve`) {
          return Promise.resolve(jsonResponse({ status: "approved" }));
        }
        return Promise.resolve(jsonResponse({ error: "not found" }, 404));
      }),
    );

    renderFlowerActivatePage();

    expect(await screen.findByText("55ZZ-9KGZ")).toBeInTheDocument();
    expect(screen.getByLabelText("連携する組織")).toHaveValue("7");

    await user.click(screen.getByRole("button", { name: /Flower連携を許可/ }));

    expect(
      await screen.findByRole("heading", { name: "Flower連携を許可しました" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("この画面を閉じて、After Effectsへ戻ってください。"),
    ).toBeInTheDocument();

    const [, approveRequest] = vi.mocked(fetch).mock.calls[2];
    expect(approveRequest).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ user_code: "55ZZ-9KGZ", organization_id: "7" }),
    });
    expect((approveRequest?.headers as Headers).get("X-CSRF-Token")).toBe("csrf-token");
  });

  it("shows a missing-code error without calling the API", () => {
    vi.stubGlobal("fetch", vi.fn());

    renderFlowerActivatePage("/flower/activate");

    expect(
      screen.getByRole("heading", { name: "承認コードがありません" }),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("explains expired activation errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              error: {
                code: "expired_token",
                message: "Device authorization expired.",
                request_id: "req_1",
              },
            },
            400,
          ),
        ),
      ),
    );

    renderFlowerActivatePage();

    expect(
      await screen.findByText(
        "承認コードの期限が切れています。After Effectsで新しいコードを発行してください。",
      ),
    ).toBeInTheDocument();
  });
});

function renderFlowerActivatePage(path = "/flower/activate?user_code=55ZZ-9KGZ") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/flower/activate" element={<FlowerActivatePage />} />
            <Route path="/drive" element={<div>Drive page</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
