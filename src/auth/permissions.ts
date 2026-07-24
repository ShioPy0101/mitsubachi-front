import type { CurrentUser } from "../api/schemas";

export type Role = CurrentUser["role"];

export function canUseAdmin(user: CurrentUser | null, organizationId?: number | null) {
  if (user?.role === "system_admin" || user?.system_admin) return true;
  if (!user || organizationId == null) return user?.role === "organization_admin";

  return user.memberships.some(
    (membership) =>
      membership.organization.id === organizationId &&
      membership.status === "active" &&
      membership.role === "organization_admin",
  );
}

export function canUseSystemAdmin(user: CurrentUser | null) {
  return user?.role === "system_admin";
}

export function hasAllowedRole(user: CurrentUser | null, allowedRoles: Role[]) {
  return Boolean(user && allowedRoles.includes(user.role));
}
