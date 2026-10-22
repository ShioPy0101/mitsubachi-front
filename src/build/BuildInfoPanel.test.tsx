import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BuildInfoPanel } from "./BuildInfoPanel";

describe("administrative build information", () => {
  it("distinguishes frontend bundle, deployed frontend, backend build, and backend runtime", () => {
    render(
      <BuildInfoPanel
        frontend={{ commit: "a".repeat(40), built_at: "2026-10-21T00:00:00Z" }}
        release={{
          commit: "b".repeat(40),
          built_at: "2026-10-22T00:00:00Z",
          deployed_at: "2026-10-22T01:00:00Z",
        }}
        backend={{
          environment: "production",
          commit: "c".repeat(40),
          built_at: "2026-10-23T00:00:00Z",
          deployed_at: "2026-10-23T01:00:00Z",
        }}
      />,
    );
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("a".repeat(40))).toBeInTheDocument();
    expect(within(rows[2]).getByText("b".repeat(40))).toBeInTheDocument();
    expect(within(rows[2]).getByText("2026-10-22T01:00:00Z")).toBeInTheDocument();
    expect(within(rows[3]).getByText("2026-10-23T00:00:00Z")).toBeInTheDocument();
    expect(within(rows[4]).getByText("稼働中（production）")).toBeInTheDocument();
  });
  it("marks missing values as unrecorded", () => {
    render(<BuildInfoPanel frontend={{ commit: null, built_at: null }} />);
    expect(screen.getAllByText("未記録").length).toBeGreaterThan(0);
  });
});
