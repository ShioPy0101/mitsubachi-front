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
  auditable_type: z.string().nullable().optional(),
  auditable_id: z.number().nullable().optional(),
  metadata: z.unknown().optional(),
  created_at: z.string().optional(),
});

export const dashboardSchema = z.object({
  organizations_count: z.number().optional(),
  users_count: z.number().optional(),
  drive_items_count: z.number().optional(),
  audit_logs_count: z.number().optional(),
});

export type AuditLog = z.infer<typeof auditLogSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;

export async function fetchDashboard() {
  return dashboardSchema.parse(await apiRequest<unknown>("/api/v1/admin/dashboard"));
}

export async function fetchOrganizations(query: string) {
  return adminListSchema(organizationSchema).parse(
    await apiRequest<unknown>(`/api/v1/admin/organizations${query}`),
  );
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
  return apiRequest<unknown>(`/api/v1/admin/users/${id}/suspend`, { method: "POST" });
}

export function unsuspendUser(id: number) {
  return apiRequest<unknown>(`/api/v1/admin/users/${id}/unsuspend`, { method: "POST" });
}
