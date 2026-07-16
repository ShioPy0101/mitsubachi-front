import { z } from "zod";

export const organizationSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const userSchema = z.object({
  id: z.number(),
  email: z.string(),
  name: z.string().nullable().optional(),
  role: z.enum(["member", "organization_admin", "system_admin"]),
  suspended: z.boolean().optional().default(false),
  organization: organizationSchema.nullable().optional(),
});

export const meSchema = z.object({
  user: userSchema,
});

export const driveItemSchema = z.object({
  id: z.number(),
  organization_id: z.number().optional(),
  owner_user_id: z.number().nullable().optional(),
  parent_id: z.number().nullable(),
  name: z.string(),
  item_type: z.enum(["file", "directory"]),
  extension: z.string().nullable().optional(),
  content_type: z.string().nullable().optional(),
  file_size: z.number().nullable().optional(),
  deleted_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
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
