import type { CurrentUser } from "../api/schemas";

export type Role = CurrentUser["role"];

export function canUseAdmin(user: CurrentUser | null) {
  return user?.role === "organization_admin" || user?.role === "system_admin";
}

export function canUseSystemAdmin(user: CurrentUser | null) {
  return user?.role === "system_admin";
}

export function hasAllowedRole(user: CurrentUser | null, allowedRoles: Role[]) {
  return Boolean(user && allowedRoles.includes(user.role));
}
