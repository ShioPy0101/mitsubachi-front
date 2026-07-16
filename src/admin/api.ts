import { z } from "zod";

import { apiRequest, apiUrl } from "../api/client";
import {
  adminMetaSchema,
  driveItemSchema,
  organizationSchema,
  type AdminMeta,
  userSchema,
} from "../api/schemas";

export const adminKeys = {
  all: ["admin"] as const,
  dashboard: () => [...adminKeys.all, "dashboard"] as const,
  organizations: (query: string) => [...adminKeys.all, "organizations", query] as const,
  organization: (id: number) => [...adminKeys.all, "organizations", id] as const,
  users: (query: string) => [...adminKeys.all, "users", query] as const,
  user: (id: number) => [...adminKeys.all, "users", id] as const,
  driveItems: (query: string) => [...adminKeys.all, "drive-items", query] as const,
  driveItem: (id: number) => [...adminKeys.all, "drive-items", id] as const,
  auditLogs: (query: string) => [...adminKeys.all, "audit-logs", query] as const,
  auditLog: (id: number) => [...adminKeys.all, "audit-logs", id] as const,
  auditEvents: (query: string) => [...adminKeys.all, "audit-events", query] as const,
  auditEvent: (id: number) => [...adminKeys.all, "audit-events", id] as const,
};

export const adminOrganizationSchema = organizationSchema.extend({
  users_count: z.number().optional(),
  drive_items_count: z.number().optional(),
  storage_bytes: z.number().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const adminDriveItemSchema = driveItemSchema.extend({
  organization_name: z.string().optional(),
  owner_email: z.string().optional(),
  upload_ip_address: z.string().nullable().optional(),
  uploaded_at: z.string().nullable().optional(),
});

export const auditLogSchema = z.object({
  id: z.number(),
  action: z.string(),
  actor_user_id: z.number().nullable().optional(),
  actor_email: z.string().nullable().optional(),
  organization_id: z.number().nullable().optional(),
  organization_name: z.string().nullable().optional(),
  target_type: z.string().nullable().optional(),
  target_id: z.number().nullable().optional(),
  change_set: z.record(z.string(), z.tuple([z.unknown(), z.unknown()])).optional(),
  ip_address: z.string().nullable().optional(),
  user_agent: z.string().nullable().optional(),
  created_at: z.string().optional(),
});

export const auditEventSchema = z.object({
  id: z.number(),
  organization_id: z.number().nullable().optional(),
  organization_name: z.string().nullable().optional(),
  actor_user_id: z.number().nullable().optional(),
  actor_email: z.string().nullable().optional(),
  action: z.string(),
  outcome: z.string(),
  target_type: z.string().nullable().optional(),
  target_id: z.number().nullable().optional(),
  change_set: z.record(z.string(), z.tuple([z.unknown(), z.unknown()])).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  ip_address: z.string().nullable().optional(),
  user_agent: z.string().nullable().optional(),
  request_id: z.string().nullable().optional(),
  occurred_at: z.string().optional(),
  created_at: z.string().optional(),
});

export const organizationInviteSchema = z.object({
  id: z.number(),
  organization_id: z.number(),
  organization_name: z.string(),
  code: z.string(),
  expires_at: z.string(),
  used_at: z.string().nullable().optional(),
  used_by_user_id: z.number().nullable().optional(),
  stand_by_at: z.string().nullable().optional(),
  stand_by_user_id: z.number().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
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

export type AdminOrganization = z.infer<typeof adminOrganizationSchema>;
export type AdminUser = z.infer<typeof userSchema>;
export type AdminDriveItem = z.infer<typeof adminDriveItemSchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type OrganizationInvite = z.infer<typeof organizationInviteSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
export type AdminList<T> = { data: T[]; meta: AdminMeta };

function parseEnvelope<T>(schema: z.ZodType<T>, payload: unknown): T {
  const envelopeSchema = z.object({ data: z.unknown() });
  const enveloped = envelopeSchema.safeParse(payload);
  return schema.parse(enveloped.success ? enveloped.data.data : payload);
}

function parseAdminList<T>(schema: z.ZodType<T>, payload: unknown): AdminList<T> {
  const base = z
    .object({
      data: z.array(z.unknown()),
      meta: adminMetaSchema,
    })
    .parse(payload);

  return {
    data: base.data.map((item) => schema.parse(item)),
    meta: base.meta,
  };
}

export async function fetchDashboard(): Promise<Dashboard> {
  return parseEnvelope(
    dashboardSchema,
    await apiRequest<unknown>("/api/v1/admin/dashboard"),
  );
}

export async function fetchOrganizations(
  query: string,
): Promise<AdminList<AdminOrganization>> {
  return parseAdminList(
    adminOrganizationSchema,
    await apiRequest<unknown>(`/api/v1/admin/organizations${query}`),
  );
}

export async function fetchOrganization(id: number): Promise<AdminOrganization> {
  return parseEnvelope(
    adminOrganizationSchema,
    await apiRequest<unknown>(`/api/v1/admin/organizations/${id}`),
  );
}

export function createOrganization(input: {
  name: string;
}): Promise<AdminOrganization> {
  return apiRequest<unknown>("/api/v1/admin/organizations", {
    method: "POST",
    body: { organization: { name: input.name } },
  }).then((response) => parseEnvelope(adminOrganizationSchema, response));
}

export function updateOrganization(input: {
  id: number;
  name: string;
}): Promise<AdminOrganization> {
  return apiRequest<unknown>(`/api/v1/admin/organizations/${input.id}`, {
    method: "PATCH",
    body: { organization: { name: input.name } },
  }).then((response) => parseEnvelope(adminOrganizationSchema, response));
}

export function createOrganizationInvite(input: {
  organizationId: number;
  expiresAt: string;
}): Promise<OrganizationInvite> {
  return apiRequest<unknown>("/api/v1/admin/organization_invites", {
    method: "POST",
    body: {
      organization_invite: {
        organization_id: input.organizationId,
        expires_at: input.expiresAt,
      },
    },
  }).then((response) => parseEnvelope(organizationInviteSchema, response));
}

export async function fetchUsers(query: string): Promise<AdminList<AdminUser>> {
  return parseAdminList(
    userSchema,
    await apiRequest<unknown>(`/api/v1/admin/users${query}`),
  );
}

export async function fetchUser(id: number): Promise<AdminUser> {
  return parseEnvelope(
    userSchema,
    await apiRequest<unknown>(`/api/v1/admin/users/${id}`),
  );
}

export function updateUser(input: {
  id: number;
  name: string;
  email: string;
  role: AdminUser["role"];
  organizationId?: number | null;
}): Promise<AdminUser> {
  return apiRequest<unknown>(`/api/v1/admin/users/${input.id}`, {
    method: "PATCH",
    body: {
      user: {
        name: input.name,
        email: input.email,
        role: input.role,
        organization_id: input.organizationId,
      },
    },
  }).then((response) => parseEnvelope(userSchema, response));
}

export function suspendUser(id: number): Promise<AdminUser> {
  return apiRequest<unknown>(`/api/v1/admin/users/${id}/suspend`, {
    method: "PATCH",
  }).then((response) => parseEnvelope(userSchema, response));
}

export function unsuspendUser(id: number): Promise<AdminUser> {
  return apiRequest<unknown>(`/api/v1/admin/users/${id}/unsuspend`, {
    method: "PATCH",
  }).then((response) => parseEnvelope(userSchema, response));
}

export async function fetchAdminDriveItems(
  query: string,
): Promise<AdminList<AdminDriveItem>> {
  return parseAdminList(
    adminDriveItemSchema,
    await apiRequest<unknown>(`/api/v1/admin/drive_items${query}`),
  );
}

export async function fetchAdminDriveItem(id: number): Promise<AdminDriveItem> {
  return parseEnvelope(
    adminDriveItemSchema,
    await apiRequest<unknown>(`/api/v1/admin/drive_items/${id}`),
  );
}

export function deleteAdminDriveItem(id: number): Promise<AdminDriveItem> {
  return apiRequest<unknown>(`/api/v1/admin/drive_items/${id}`, {
    method: "DELETE",
  }).then((response) => parseEnvelope(adminDriveItemSchema, response));
}

export function restoreAdminDriveItem(id: number): Promise<AdminDriveItem> {
  return apiRequest<unknown>(`/api/v1/admin/drive_items/${id}/restore`, {
    method: "PATCH",
  }).then((response) => parseEnvelope(adminDriveItemSchema, response));
}

export function purgeAdminDriveItem(id: number): Promise<{ message: string }> {
  return apiRequest<unknown>(`/api/v1/admin/drive_items/${id}/purge`, {
    method: "DELETE",
  }).then((response) =>
    z
      .object({
        message: z.string(),
      })
      .parse(response),
  );
}

export function adminDriveItemPreviewUrl(id: number) {
  return apiUrl(`/api/v1/admin/drive_items/${id}/preview`);
}

export function adminDriveItemDownloadUrl(id: number) {
  return apiUrl(`/api/v1/admin/drive_items/${id}/download`);
}

export function adminDriveItemStreamUrl(id: number) {
  return apiUrl(`/api/v1/admin/drive_items/${id}/stream`);
}

export async function fetchAuditLogs(query: string): Promise<AdminList<AuditLog>> {
  return parseAdminList(
    auditLogSchema,
    await apiRequest<unknown>(`/api/v1/admin/audit_logs${query}`),
  );
}

export async function fetchAuditLog(id: number): Promise<AuditLog> {
  return parseEnvelope(
    auditLogSchema,
    await apiRequest<unknown>(`/api/v1/admin/audit_logs/${id}`),
  );
}

export async function fetchAuditEvents(query: string): Promise<AdminList<AuditEvent>> {
  return parseAdminList(
    auditEventSchema,
    await apiRequest<unknown>(`/api/v1/admin/audit_events${query}`),
  );
}

export async function fetchAuditEvent(id: number): Promise<AuditEvent> {
  return parseEnvelope(
    auditEventSchema,
    await apiRequest<unknown>(`/api/v1/admin/audit_events/${id}`),
  );
}
