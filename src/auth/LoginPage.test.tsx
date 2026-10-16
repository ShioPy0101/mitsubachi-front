import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../components/ToastProvider";
import { login } from "./api";
import { LoginPage } from "./LoginPage";

vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  login: vi.fn(),
}));

beforeEach(() => vi.mocked(login).mockReset());

describe("email change reauthentication login", () => {
  it("shows the login form even for the email change entry and sends the dedicated intent", async () => {
    vi.mocked(login).mockResolvedValue({ message: "ok" });
    renderPage("/login?intent=email_change");
    const user = userEvent.setup();
    expect(
      screen.getByRole("heading", { name: "メールアドレス変更のため再ログイン" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "招待コードで登録する" }),
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("メールアドレス"), "old@example.com");
    await user.click(screen.getByRole("button", { name: "メールを送信" }));
    expect(login).toHaveBeenCalledWith("old@example.com", "email_change");
    expect(
      await screen.findByText(
        "ログインリンクを送信しました。メール内のリンクから続けてください。",
      ),
    ).toHaveAttribute("role", "status");
    expect(screen.getByLabelText("メールアドレス")).toHaveValue("");
  });

  it("retains ordinary login without granting an email change intent", async () => {
    vi.mocked(login).mockResolvedValue({ message: "ok" });
    renderPage("/login");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("メールアドレス"), "old@example.com");
    await user.click(screen.getByRole("button", { name: "メールを送信" }));
    expect(login).toHaveBeenCalledWith("old@example.com", undefined);
    expect(
      screen.getByRole("button", { name: "招待コードで登録する" }),
    ).toBeInTheDocument();
  });
});

function renderPage(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <LoginPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}
