import { apiRequest } from "../api/client";
import { meSchema, type CurrentUser } from "../api/schemas";

export const authKeys = {
  me: ["auth", "me"] as const,
};

export async function fetchCurrentUser(
  options: { signal?: AbortSignal } = {},
): Promise<CurrentUser> {
  const response = await apiRequest<unknown>("/api/v1/me", {
    signal: options.signal,
  });
  return meSchema.parse(response).user;
}

export function login(email: string) {
  return apiRequest<{ message?: string }>("/api/v1/auth/login", {
    method: "POST",
    body: { email },
  });
}

export function registerByInvite(email: string, inviteCode: string) {
  return apiRequest<{ message?: string }>("/api/v1/auth/create", {
    method: "POST",
    body: { email, invite_code: inviteCode },
  });
}

export function verifyEmailToken(token: string) {
  return apiRequest<{ message?: string }>("/api/v1/auth/verify", {
    method: "POST",
    body: { token },
  });
}

export function logout() {
  return apiRequest<unknown>("/api/v1/logout", {
    method: "DELETE",
  });
}
