import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { PrivacyPolicyPage } from "./PrivacyPolicyPage";

describe("PrivacyPolicyPage", () => {
  it("shows the privacy policy and a login link", () => {
    render(
      <MemoryRouter>
        <PrivacyPolicyPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "プライバシーポリシー" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ログインへ戻る/ })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByText("第2条（取得する情報）")).toBeInTheDocument();
    expect(screen.getByText("第18条（準拠法および管轄裁判所）")).toBeInTheDocument();
    expect(
      screen.getByText("mitsubachiunit@gmail.com", { exact: false }),
    ).toBeInTheDocument();
  });
});
