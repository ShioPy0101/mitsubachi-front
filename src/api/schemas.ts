import { z } from "zod";

export const organizationSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const userSchema = z
  .object({
    id: z.number(),
    email: z.string(),
    name: z.string().nullable().optional(),
    display_name: z.string().nullable().optional(),
    role: z.enum(["member", "organization_admin", "system_admin"]),
    suspended: z.boolean().optional().default(false),
    organization_id: z.number().nullable().optional(),
    organization_name: z.string().nullable().optional(),
    organization: organizationSchema.nullable().optional(),
  })
  .transform((user) => ({
    ...user,
    organization:
      user.organization ??
      (typeof user.organization_id === "number" && user.organization_name
        ? { id: user.organization_id, name: user.organization_name }
        : user.organization),
  }));

export const meSchema = z.union([
  z.object({ user: userSchema }),
  z.object({ data: userSchema }).transform(({ data }) => ({ user: data })),
]);

const breadcrumbSchema = z.object({
  id: z.number().nullable(),
  name: z.string(),
});

export const driveItemSchema = z.object({
  id: z.number(),
  organization_id: z.number().optional(),
  owner_user_id: z.number().nullable().optional(),
  owner_display_name: z.string().nullable().optional(),
  parent_id: z.number().nullable().optional(),
  parent_name: z.string().nullable().optional(),
  name: z.string(),
  item_type: z.enum(["file", "directory"]),
  extension: z.string().nullable().optional(),
  content_type: z.string().nullable().optional(),
  file_size: z.number().nullable().optional(),
  deleted_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  breadcrumbs: z.array(breadcrumbSchema).optional(),
});

export const driveItemsSchema = z.array(driveItemSchema);

export const adminMetaSchema = z.object({
  current_page: z.number(),
  per_page: z.number(),
  total_pages: z.number(),
  total_count: z.number(),
});

export const adminListSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    meta: adminMetaSchema,
  });

export type CurrentUser = z.infer<typeof userSchema>;
export type DriveItem = z.infer<typeof driveItemSchema>;
export type AdminMeta = z.infer<typeof adminMetaSchema>;


export const groupMemberSchema = z.object({
  id: z.number(),
  display_name: z.string(),
  role: z.enum(["member", "organization_admin", "system_admin"]),
  joined_at: z.string().optional(),
  suspended: z.boolean(),
});

export const groupSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable().optional(),
  member_count: z.number(),
  current_user_role: z.enum(["member", "organization_admin", "system_admin"]),
  members: z.array(groupMemberSchema),
});

export const groupResponseSchema = z.object({ data: groupSchema });
export const driveSearchResponseSchema = z.object({
  data: z.array(driveItemSchema),
  meta: adminMetaSchema,
});

export type Group = z.infer<typeof groupSchema>;
