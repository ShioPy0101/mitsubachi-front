import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authKeys, verifyEmailChange } from "./auth/api";
import { EmailChangeVerifyPage } from "./EmailChangeVerifyPage";

vi.mock("./auth/api", async (original) => ({
  ...(await original<typeof import("./auth/api")>()),
  verifyEmailChange: vi.fn(),
}));

beforeEach(() => vi.mocked(verifyEmailChange).mockReset());

describe("new address confirmation page", () => {
  it("waits for an explicit click, sends once, clears old session data, and links to login", async () => {
    vi.mocked(verifyEmailChange).mockResolvedValue({ message: "ok", email: null });
    const client = renderPage("/settings/email-change/verify?token=new-token");
    expect(verifyEmailChange).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .dblClick(screen.getByRole("button", { name: "メールアドレスの変更を確定する" }));
    expect(verifyEmailChange).toHaveBeenCalledOnce();
    expect(vi.mocked(verifyEmailChange).mock.calls[0]?.[0]).toBe("new-token");
    expect(
      await screen.findByRole("heading", { name: "メールアドレスを変更しました" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ログイン画面へ" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(
      screen.getByText("新しいメールアドレスでログインし直してください。"),
    ).toBeInTheDocument();
    expect(client.getQueryData(authKeys.me)).toBeNull();
    expect(client.getQueryData(["drive", "old-user"])).toBeUndefined();
    expect(screen.getByTestId("url")).not.toHaveTextContent("new-token");
  });

  it("shows an invalid link without a token and never sends", () => {
    renderPage("/settings/email-change/verify");
    expect(
      screen.getByRole("heading", { name: "確認リンクが無効です" }),
    ).toBeInTheDocument();
    expect(verifyEmailChange).not.toHaveBeenCalled();
  });

  it("shows failure and keeps existing user data until the server confirms a change", async () => {
    vi.mocked(verifyEmailChange).mockRejectedValue(
      new Error("確認リンクの有効期限が切れています"),
    );
    const client = renderPage("/settings/email-change/verify?token=expired-token");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "メールアドレスの変更を確定する" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "有効期限が切れています",
    );
    expect(
      screen.queryByRole("heading", { name: "メールアドレスを変更しました" }),
    ).not.toBeInTheDocument();
    expect(client.getQueryData(authKeys.me)).toEqual({ id: 1, email: null });
  });
});

function Url() {
  const location = useLocation();
  return (
    <p data-testid="url">
      {location.pathname}
      {location.search}
    </p>
  );
}
function renderPage(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(authKeys.me, { id: 1, email: null });
  client.setQueryData(["drive", "old-user"], { private: true });
  render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/settings/email-change/verify"
              element={
                <>
                  <EmailChangeVerifyPage />
                  <Url />
                </>
              }
            />
            <Route path="/login" element={<div>login</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
  return client;
}
