import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fetchDemoItems } from "./api";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DemoDrivePage } from "./DemoDrivePage";

vi.mock("./api", () => ({ fetchDemoItems: vi.fn() }));

beforeEach(() => {
  vi.mocked(fetchDemoItems).mockResolvedValue([
    { id: "documents", parent: null, name: "資料", size: null },
    { id: "guide", parent: null, name: "はじめに.pdf", size: "1.2 MB" },
    { id: "proposal", parent: "documents", name: "サービス紹介.pdf", size: "2.4 MB" },
  ]);
  sessionStorage.clear();
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});

function enterDemo() {
  sessionStorage.setItem("mitsubachi.demo.session", "demo-token");
}

describe("demo tenant", () => {
  it("shows the demo badge and browses sample folders without file API requests", async () => {
    enterDemo();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <DemoDrivePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText("demo")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "資料" }));
    expect(screen.getByText("サービス紹介.pdf")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "マイドライブ" }));
    expect(screen.getByText("はじめに.pdf")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("blocks upload, individual and bulk download, and dropped files with a modal", async () => {
    enterDemo();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <DemoDrivePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText("はじめに.pdf");
    for (const name of [
      "アップロード",
      "はじめに.pdfをダウンロード",
      "一括ダウンロード",
    ]) {
      await userEvent.click(screen.getByRole("button", { name, exact: true }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText(/デモテナントのため/)).toBeInTheDocument();
      await userEvent.click(
        within(dialog).getAllByRole("button", { name: "閉じる" })[0],
      );
    }
    fireEvent.drop(screen.getByRole("main"), {
      dataTransfer: { files: [new File(["demo"], "test.txt")] },
    });
    expect(
      within(screen.getByRole("dialog")).getByText(
        "デモテナントのため、アップロードはできません。",
      ),
    ).toBeInTheDocument();
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { bubbles: true, cancelable: true }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
