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
  dashboard: (organizationId: number | null = null) =>
    [...adminKeys.all, organizationId, "dashboard"] as const,
  organizations: (query: string) => [...adminKeys.all, "organizations", query] as const,
  organization: (id: number) => [...adminKeys.all, "organizations", id] as const,
  users: (organizationId: number | null, query: string) =>
    [...adminKeys.all, organizationId, "users", query] as const,
  user: (organizationId: number | null, id: number) =>
    [...adminKeys.all, organizationId, "users", id] as const,
  driveItems: (organizationId: number | null, query: string) =>
    [...adminKeys.all, organizationId, "drive-items", query] as const,
  driveItem: (organizationId: number | null, id: number) =>
    [...adminKeys.all, organizationId, "drive-items", id] as const,
  auditLogs: (organizationId: number | null, query: string) =>
    [...adminKeys.all, organizationId, "audit-logs", query] as const,
  auditLog: (organizationId: number | null, id: number) =>
    [...adminKeys.all, organizationId, "audit-logs", id] as const,
  auditEvents: (organizationId: number | null, query: string) =>
    [...adminKeys.all, organizationId, "audit-events", query] as const,
  auditEvent: (organizationId: number | null, id: number) =>
    [...adminKeys.all, organizationId, "audit-events", id] as const,
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
  actor_name: z.string().nullable().optional(),
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

export function adminOrganizationIdFromParam(value: string | undefined): number | null {
  if (value === undefined) return null;
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

export function adminPath(organizationId: number | null, suffix: string) {
  if (organizationId === null) return `/api/v1/admin${suffix}`;

  return `/api/v1/organizations/${organizationId}/admin${suffix}`;
}

export function adminUiPath(organizationId: number | null, suffix: string) {
  if (organizationId === null) return `/system-admin${suffix}`;

  return `/organizations/${organizationId}/admin${suffix}`;
}

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

export async function fetchDashboard(
  organizationId: number | null = null,
): Promise<Dashboard> {
  return parseEnvelope(
    dashboardSchema,
    await apiRequest<unknown>(adminPath(organizationId, "/dashboard")),
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
  return apiRequest<unknown>(adminPath(input.organizationId, "/organization_invites"), {
    method: "POST",
    body: {
      organization_invite: {
        organization_id: input.organizationId,
        expires_at: input.expiresAt,
      },
    },
  }).then((response) => parseEnvelope(organizationInviteSchema, response));
}

export async function fetchUsers(
  query: string,
  organizationId: number | null = null,
): Promise<AdminList<AdminUser>> {
  return parseAdminList(
    userSchema,
    await apiRequest<unknown>(`${adminPath(organizationId, "/users")}${query}`),
  );
}

export async function fetchUser(
  id: number,
  organizationId: number | null = null,
): Promise<AdminUser> {
  return parseEnvelope(
    userSchema,
    await apiRequest<unknown>(adminPath(organizationId, `/users/${id}`)),
  );
}

export function updateUser(input: {
  id: number;
  name: string;
  email: string;
  role: AdminUser["role"];
  organizationId?: number | null;
  scopedOrganizationId?: number | null;
}): Promise<AdminUser> {
  return apiRequest<unknown>(
    adminPath(input.scopedOrganizationId ?? null, `/users/${input.id}`),
    {
      method: "PATCH",
      body: {
        user: {
          name: input.name,
          email: input.email,
          role: input.role,
          organization_id: input.organizationId,
        },
      },
    },
  ).then((response) => parseEnvelope(userSchema, response));
}

export function suspendUser(
  id: number,
  organizationId: number | null = null,
): Promise<AdminUser> {
  return apiRequest<unknown>(adminPath(organizationId, `/users/${id}/suspend`), {
    method: "PATCH",
  }).then((response) => parseEnvelope(userSchema, response));
}

export function unsuspendUser(
  id: number,
  organizationId: number | null = null,
): Promise<AdminUser> {
  return apiRequest<unknown>(adminPath(organizationId, `/users/${id}/unsuspend`), {
    method: "PATCH",
  }).then((response) => parseEnvelope(userSchema, response));
}

export async function fetchAdminDriveItems(
  query: string,
  organizationId: number | null = null,
): Promise<AdminList<AdminDriveItem>> {
  return parseAdminList(
    adminDriveItemSchema,
    await apiRequest<unknown>(`${adminPath(organizationId, "/drive_items")}${query}`),
  );
}

export async function fetchAdminDriveItem(
  id: number,
  organizationId: number | null = null,
): Promise<AdminDriveItem> {
  return parseEnvelope(
    adminDriveItemSchema,
    await apiRequest<unknown>(adminPath(organizationId, `/drive_items/${id}`)),
  );
}

export function deleteAdminDriveItem(
  id: number,
  organizationId: number | null = null,
): Promise<AdminDriveItem> {
  return apiRequest<unknown>(adminPath(organizationId, `/drive_items/${id}`), {
    method: "DELETE",
  }).then((response) => parseEnvelope(adminDriveItemSchema, response));
}

export function restoreAdminDriveItem(
  id: number,
  organizationId: number | null = null,
): Promise<AdminDriveItem> {
  return apiRequest<unknown>(adminPath(organizationId, `/drive_items/${id}/restore`), {
    method: "PATCH",
  }).then((response) => parseEnvelope(adminDriveItemSchema, response));
}

export function purgeAdminDriveItem(
  id: number,
  organizationId: number | null = null,
): Promise<{ message: string }> {
  return apiRequest<unknown>(adminPath(organizationId, `/drive_items/${id}/purge`), {
    method: "DELETE",
  }).then((response) =>
    z
      .object({
        message: z.string(),
      })
      .parse(response),
  );
}

export function adminDriveItemPreviewUrl(
  id: number,
  organizationId: number | null = null,
) {
  return apiUrl(adminPath(organizationId, `/drive_items/${id}/preview`));
}

export function adminDriveItemDownloadUrl(
  id: number,
  organizationId: number | null = null,
) {
  return apiUrl(adminPath(organizationId, `/drive_items/${id}/download`));
}

export function adminDriveItemStreamUrl(
  id: number,
  organizationId: number | null = null,
) {
  return apiUrl(adminPath(organizationId, `/drive_items/${id}/stream`));
}

export async function fetchAuditLogs(
  query: string,
  organizationId: number | null = null,
): Promise<AdminList<AuditLog>> {
  return parseAdminList(
    auditLogSchema,
    await apiRequest<unknown>(`${adminPath(organizationId, "/audit_logs")}${query}`),
  );
}

export async function fetchAuditLog(
  id: number,
  organizationId: number | null = null,
): Promise<AuditLog> {
  return parseEnvelope(
    auditLogSchema,
    await apiRequest<unknown>(adminPath(organizationId, `/audit_logs/${id}`)),
  );
}

export async function fetchAuditEvents(
  query: string,
  organizationId: number | null = null,
): Promise<AdminList<AuditEvent>> {
  return parseAdminList(
    auditEventSchema,
    await apiRequest<unknown>(`${adminPath(organizationId, "/audit_events")}${query}`),
  );
}

export async function fetchAuditEvent(
  id: number,
  organizationId: number | null = null,
): Promise<AuditEvent> {
  return parseEnvelope(
    auditEventSchema,
    await apiRequest<unknown>(adminPath(organizationId, `/audit_events/${id}`)),
  );
}
