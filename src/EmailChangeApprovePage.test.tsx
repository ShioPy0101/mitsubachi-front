import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { approveEmailChange, verifyEmailChange } from "./auth/api";
import { EmailChangeApprovePage } from "./EmailChangeApprovePage";

vi.mock("./auth/api", async (original) => ({
  ...(await original<typeof import("./auth/api")>()),
  approveEmailChange: vi.fn(),
  verifyEmailChange: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(approveEmailChange).mockReset();
  vi.mocked(verifyEmailChange).mockReset();
});

describe("old address approval page", () => {
  it("never approves on mount or StrictMode remount and waits for an explicit click", async () => {
    vi.mocked(approveEmailChange).mockResolvedValue({
      message: "ok",
      email_change_stage: "awaiting_new_email_confirmation",
    });
    renderPage("/settings/email-change/approve?token=old-token");
    expect(approveEmailChange).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .dblClick(screen.getByRole("button", { name: "変更を承認する" }));
    expect(approveEmailChange).toHaveBeenCalledOnce();
    expect(vi.mocked(approveEmailChange).mock.calls[0]?.[0]).toBe("old-token");
    expect(verifyEmailChange).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("heading", {
        name: "現在のメールアドレスで承認しました",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("新しいメールアドレスに確認メールを送信しました。"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("url")).not.toHaveTextContent("old-token");
  });

  it("does not send without a token", () => {
    renderPage("/settings/email-change/approve");
    expect(
      screen.getByRole("heading", { name: "承認リンクが無効です" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "変更を承認する" }),
    ).not.toBeInTheDocument();
    expect(approveEmailChange).not.toHaveBeenCalled();
  });

  it("shows expiration or replay errors without claiming the address changed", async () => {
    vi.mocked(approveEmailChange).mockRejectedValue(
      new Error("この確認リンクは既に使用されています"),
    );
    renderPage("/settings/email-change/approve?token=used-token");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "変更を承認する" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("既に使用されています");
    expect(
      screen.queryByText("新しいメールアドレスに確認メールを送信しました。"),
    ).not.toBeInTheDocument();
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
  return render(
    <StrictMode>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
      >
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/settings/email-change/approve"
              element={
                <>
                  <EmailChangeApprovePage />
                  <Url />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}
