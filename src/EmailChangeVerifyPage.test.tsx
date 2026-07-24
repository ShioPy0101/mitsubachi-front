import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { verifyEmailChange } from "./auth/api";
import { EmailChangeVerifyPage } from "./EmailChangeVerifyPage";

vi.mock("./auth/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./auth/api")>();
  return {
    ...actual,
    verifyEmailChange: vi.fn(),
  };
});

describe("EmailChangeVerifyPage", () => {
  beforeEach(() => {
    vi.mocked(verifyEmailChange).mockReset();
  });

  it("verifies token from query string", async () => {
    vi.mocked(verifyEmailChange).mockResolvedValue({
      message: "ok",
      email: "new@example.com",
    });

    renderPage("/settings/email-change/verify?token=raw-token");

    await waitFor(() => expect(verifyEmailChange).toHaveBeenCalled());
    expect(vi.mocked(verifyEmailChange).mock.calls[0]?.[0]).toBe("raw-token");
    expect(await screen.findByText("メールアドレスを変更しました")).toBeInTheDocument();
  });

  it("shows invalid link without token", () => {
    renderPage("/settings/email-change/verify");

    expect(screen.getByText("確認リンクが無効です")).toBeInTheDocument();
    expect(verifyEmailChange).not.toHaveBeenCalled();
  });

  it("shows verification failure", async () => {
    vi.mocked(verifyEmailChange).mockRejectedValue(new Error("期限切れです"));

    renderPage("/settings/email-change/verify?token=expired-token");

    expect(
      await screen.findByText("メールアドレスを変更できませんでした"),
    ).toBeInTheDocument();
    expect(screen.getByText("期限切れです")).toBeInTheDocument();
  });
});

function renderPage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/settings/email-change/verify"
            element={<EmailChangeVerifyPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
