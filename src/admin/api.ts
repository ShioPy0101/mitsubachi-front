import { apiRequest } from "../api/client";
import {
  adminListSchema,
  driveItemSchema,
  organizationSchema,
  userSchema,
} from "../api/schemas";
import { z } from "zod";

export const adminKeys = {
  all: ["admin"] as const,
  dashboard: () => [...adminKeys.all, "dashboard"] as const,
  organizations: (query: string) => [...adminKeys.all, "organizations", query] as const,
  users: (query: string) => [...adminKeys.all, "users", query] as const,
  driveItems: (query: string) => [...adminKeys.all, "drive-items", query] as const,
  auditLogs: (query: string) => [...adminKeys.all, "audit-logs", query] as const,
};

export const auditLogSchema = z.object({
  id: z.number(),
  action: z.string().optional(),
  actor_user_id: z.number().nullable().optional(),
  actor_email: z.string().optional(),
  organization_id: z.number().nullable().optional(),
  organization_name: z.string().nullable().optional(),
  target_type: z.string().nullable().optional(),
  target_id: z.number().nullable().optional(),
  change_set: z.unknown().optional(),
  ip_address: z.string().nullable().optional(),
  user_agent: z.string().nullable().optional(),
  created_at: z.string().optional(),
});

export const dashboardSchema = z.object({
  organizations_count: z.number().optional(),
  users_count: z.number().optional(),
  active_users_count: z.number().optional(),
  drive_items_count: z.number().optional(),
  files_count: z.number().optional(),
  directories_count: z.number().optional(),
  total_storage_bytes: z.number().optional(),
  audit_logs_count: z.number().optional(),
  recent_users: z.array(userSchema).optional(),
  recent_drive_items: z.array(driveItemSchema).optional(),
});

export const dashboardResponseSchema = z.union([
  z.object({ data: dashboardSchema }).transform(({ data }) => data),
  dashboardSchema,
]);

export const organizationResponseSchema = z.union([
  z.object({ data: organizationSchema }).transform(({ data }) => data),
  organizationSchema,
]);

export type AuditLog = z.infer<typeof auditLogSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;

export async function fetchDashboard() {
  return dashboardResponseSchema.parse(
    await apiRequest<unknown>("/api/v1/admin/dashboard"),
  );
}

export async function fetchOrganizations(query: string) {
  return adminListSchema(organizationSchema).parse(
    await apiRequest<unknown>(`/api/v1/admin/organizations${query}`),
  );
}

export function createOrganization(input: { name: string }) {
  return apiRequest<unknown>("/api/v1/admin/organizations", {
    method: "POST",
    body: { organization: { name: input.name } },
  }).then((response) => organizationResponseSchema.parse(response));
}

export async function fetchUsers(query: string) {
  return adminListSchema(userSchema).parse(
    await apiRequest<unknown>(`/api/v1/admin/users${query}`),
  );
}

export async function fetchAdminDriveItems(query: string) {
  return adminListSchema(driveItemSchema).parse(
    await apiRequest<unknown>(`/api/v1/admin/drive_items${query}`),
  );
}

export async function fetchAuditLogs(query: string) {
  return adminListSchema(auditLogSchema).parse(
    await apiRequest<unknown>(`/api/v1/admin/audit_logs${query}`),
  );
}

export function suspendUser(id: number) {
  return apiRequest<unknown>(`/api/v1/admin/users/${id}/suspend`, { method: "PATCH" });
}

export function unsuspendUser(id: number) {
  return apiRequest<unknown>(`/api/v1/admin/users/${id}/unsuspend`, {
    method: "PATCH",
  });
}
