import { z } from "zod";

import { apiRequest } from "../api/client";

const flowerOrganizationSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    name: z.string(),
  })
  .transform((organization) => ({
    id: String(organization.id),
    name: organization.name,
  }));

const flowerActivationSchema = z.object({
  user_code: z.string(),
  organizations: z.array(flowerOrganizationSchema),
});

const flowerApprovalSchema = z.object({
  status: z.string(),
});

export type FlowerActivation = z.infer<typeof flowerActivationSchema>;
export type FlowerOrganization = FlowerActivation["organizations"][number];
export type FlowerApproval = z.infer<typeof flowerApprovalSchema>;

export const flowerKeys = {
  all: ["flower"] as const,
  activation: (userCode: string) =>
    [...flowerKeys.all, "activation", userCode] as const,
};

export async function fetchFlowerActivation(
  userCode: string,
  options: { signal?: AbortSignal } = {},
) {
  const params = new URLSearchParams({ user_code: userCode });
  return flowerActivationSchema.parse(
    await apiRequest<unknown>(`/flower/activate?${params.toString()}`, {
      signal: options.signal,
    }),
  );
}

export async function approveFlowerDeviceAuthorization(input: {
  userCode: string;
  organizationId: string;
}) {
  return flowerApprovalSchema.parse(
    await apiRequest<unknown>("/api/v1/flower/device_authorizations/approve", {
      method: "POST",
      body: {
        user_code: input.userCode,
        organization_id: input.organizationId,
      },
    }),
  );
}
