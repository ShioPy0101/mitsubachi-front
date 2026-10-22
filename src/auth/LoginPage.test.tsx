import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginPage } from "../auth/LoginPage";
import { ToastProvider } from "../components/ToastProvider";
import { redirectToDemo } from "../features/flags";

const demoConfig = vi.hoisted(() => ({ enabled: true }));

vi.mock("../features/flags", async (original) => ({
  ...(await original<typeof import("../features/flags")>()),
  redirectToDemo: vi.fn(),
  featureFlags: {
    get demoTenant() {
      return demoConfig.enabled;
    },
  },
}));

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  demoConfig.enabled = true;
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});

function renderLogin() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("demo entry", () => {
  it("redirects immediately when the designated email is entered without sending email", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    renderLogin();
    await userEvent.type(
      screen.getByLabelText("メールアドレス"),
      "DEMO@tenant.example",
    );
    expect(redirectToDemo).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not redirect other emails or when the feature is disabled", async () => {
    renderLogin();
    await userEvent.type(screen.getByLabelText("メールアドレス"), "member@example.com");
    expect(redirectToDemo).not.toHaveBeenCalled();
    demoConfig.enabled = false;
    await userEvent.clear(screen.getByLabelText("メールアドレス"));
    await userEvent.type(
      screen.getByLabelText("メールアドレス"),
      "demo@tenant.example",
    );
    expect(redirectToDemo).not.toHaveBeenCalled();
  });
});
