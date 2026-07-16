import type { CurrentUser } from "../api/schemas";

export function canUseAdmin(user: CurrentUser | null) {
  return user?.role === "organization_admin" || user?.role === "system_admin";
}
