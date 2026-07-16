import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  AuditChangeSetView,
  AuditMetadataView,
  formatAuditAction,
  formatAuditOutcome,
  summarizeChangeSet,
} from "./auditFormat";

describe("audit format helpers", () => {
  it("keeps unknown actions visible while formatting known actions", () => {
    expect(formatAuditAction("organization.create")).toBe("組織を作成");
    expect(formatAuditAction("custom.unknown")).toBe("custom.unknown");
  });

  it("summarizes Rails change_set tuples for list views", () => {
    expect(
      summarizeChangeSet({
        name: ["old", "new"],
        role: ["member", "system_admin"],
      }),
    ).toBe("2項目を変更");
  });

  it("renders change_set before and after values", () => {
    render(<AuditChangeSetView changeSet={{ name: ["old", "new"] }} />);

    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("old")).toBeInTheDocument();
    expect(screen.getByText("new")).toBeInTheDocument();
  });

  it("masks sensitive metadata values", () => {
    render(
      <AuditMetadataView
        metadata={{
          request_id: "req-1",
          invite_code: "secret-code",
          nested: { authorization: "Bearer secret" },
        }}
      />,
    );

    expect(screen.getByText("req-1")).toBeInTheDocument();
    expect(screen.queryByText("secret-code")).not.toBeInTheDocument();
    expect(screen.queryByText("Bearer secret")).not.toBeInTheDocument();
    expect(screen.getAllByText(/[*]{8}/)).toHaveLength(2);
  });

  it("formats known audit event outcomes with text", () => {
    expect(formatAuditOutcome("success")).toBe("成功");
    expect(formatAuditOutcome("failure")).toBe("失敗");
    expect(formatAuditOutcome("denied")).toBe("拒否");
    expect(formatAuditOutcome("other")).toBe("other");
  });
});
