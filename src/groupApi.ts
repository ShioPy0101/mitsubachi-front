import { apiRequest } from "./api/client";
import { groupResponseSchema, type Group } from "./api/schemas";

export const groupKeys = {
  detail: ["group"] as const,
};

export async function fetchGroup(): Promise<Group> {
  const response = await apiRequest<unknown>("/api/v1/group");
  return groupResponseSchema.parse(response).data;
}
