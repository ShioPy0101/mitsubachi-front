import { apiRequest } from "../api/client";
import {
  membershipSchema,
  organizationInvitationSchema,
  type Membership,
  type OrganizationInvitation,
} from "../api/schemas";

export const organizationInvitationKeys = {
  detail: (token: string) => ["organization-invitation", token] as const,
};

export async function fetchOrganizationInvitation(
  token: string,
  options: { signal?: AbortSignal } = {},
): Promise<OrganizationInvitation> {
  const response = await apiRequest<unknown>(
    `/api/v1/organization_invitations/${encodeURIComponent(token)}`,
    { signal: options.signal },
  );
  return organizationInvitationSchema.parse(
    (response as { invitation?: unknown }).invitation,
  );
}

export async function acceptOrganizationInvitation(
  token: string,
): Promise<{ message: string; membership: Membership }> {
  const response = await apiRequest<unknown>(
    `/api/v1/organization_invitations/${encodeURIComponent(token)}/accept`,
    { method: "POST" },
  );
  const body = response as { message?: unknown; membership?: unknown };
  return {
    message: typeof body.message === "string" ? body.message : "組織に参加しました",
    membership: membershipSchema.parse(body.membership),
  };
}
