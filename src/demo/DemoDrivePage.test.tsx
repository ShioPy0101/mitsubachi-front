import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DemoDrivePage } from "./DemoDrivePage";
import { createDemoLoginLink, endDemoSession, verifyDemoLoginLink } from "./session";

beforeEach(() => {
  sessionStorage.clear();
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});

function enterDemo() {
  const url = new URL(createDemoLoginLink());
  expect(verifyDemoLoginLink(url.searchParams.get("token"))).toBe(true);
  return url;
}

describe("demo tenant", () => {
  it("requires an unexpired single-use email link and supports ending the session", () => {
    const url = new URL(createDemoLoginLink());
    expect(verifyDemoLoginLink("wrong")).toBe(false);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 16 * 60 * 1000);
    expect(verifyDemoLoginLink(url.searchParams.get("token"))).toBe(false);
    vi.restoreAllMocks();
    const validUrl = enterDemo();
    expect(verifyDemoLoginLink(validUrl.searchParams.get("token"))).toBe(false);
    endDemoSession();
    expect(sessionStorage.getItem("mitsubachi.demo.session")).toBeNull();
  });

  it("shows the demo badge and browses sample folders without file API requests", async () => {
    enterDemo();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(
      <MemoryRouter>
        <DemoDrivePage />
      </MemoryRouter>,
    );
    expect(screen.getByText("demo")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "資料" }));
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
      <MemoryRouter>
        <DemoDrivePage />
      </MemoryRouter>,
    );
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
