import { apiRequest } from "./api/client";
import { groupResponseSchema, type Group } from "./api/schemas";

export const groupKeys = {
  detail: (organizationId: number) => ["group", organizationId] as const,
};

export async function fetchGroup(organizationId: number): Promise<Group> {
  const response = await apiRequest<unknown>(
    `/api/v1/organizations/${organizationId}/group`,
  );
  return groupResponseSchema.parse(response).data;
}
