import { describe, expect, it } from "vitest";

import { meSchema, organizationInvitationSchema } from "./schemas";
import { adminDriveItemSchema } from "../admin/api";

describe("private email identity responses", () => {
  it("parses Rails /me data and retains the pending change stage with null addresses", () => {
    const result = meSchema.parse({
      user: { id: 1, email: null, display_name: "User" },
      data: {
        id: 1,
        email: null,
        pending_email: null,
        role: "member",
        email_change_stage: "awaiting_old_email_approval",
      },
    });
    expect(result.user.email).toBeNull();
    expect(result.user.email_change_stage).toBe("awaiting_old_email_approval");
  });

  it("parses invitations with an undisclosed inviter address", () => {
    expect(
      organizationInvitationSchema.parse({
        token: "invite",
        organization: { id: 1, name: "Group" },
        invited_by: { id: 2, display_name: "Admin", email: null },
        email: null,
        role: "member",
        expires_at: "2026-10-16T12:00:00Z",
      }).invited_by?.email,
    ).toBeNull();
  });

  it("parses files with an undisclosed owner address", () => {
    expect(
      adminDriveItemSchema.parse({
        id: 1,
        name: "Report",
        item_type: "file",
        owner_email: null,
      }).owner_email,
    ).toBeNull();
  });
});
