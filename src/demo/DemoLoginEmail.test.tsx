import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DemoLoginEmail } from "./DemoLoginEmail";
import { DEMO_ORIGIN } from "../features/flags";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
});
describe("demo email", () => {
  it("displays the actual email preview and its dedicated-host login URL", () => {
    render(
      <MemoryRouter>
        <DemoLoginEmail
          email={{
            to: "demo@tenant.example",
            subject: "【Mitsubachi】ログインリンクのご案内",
            body: "Mitsubachiへのログインリクエストを受け付けました。",
            url: `${DEMO_ORIGIN}/demo/verify?token=test`,
          }}
          onClose={() => {}}
        />
      </MemoryRouter>,
    );
    const modal = screen.getByRole("dialog", { name: "デモ用の認証メール" });
    expect(within(modal).getByText("宛先: demo@tenant.example")).toBeInTheDocument();
    expect(within(modal).getByText(/件名:/)).toBeInTheDocument();
    expect(within(modal).getByText(/ログインリクエスト/)).toBeInTheDocument();
    expect(within(modal).getByRole("link").getAttribute("href")).toBe(
      `${DEMO_ORIGIN}/demo/verify?token=test`,
    );
  });
});
