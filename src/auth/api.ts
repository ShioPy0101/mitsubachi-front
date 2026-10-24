import { apiRequest, clearCsrfToken } from "../api/client";
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

export function login(email: string, intent?: "email_change") {
  return apiRequest<{ message?: string }>("/api/v1/auth/login", {
    method: "POST",
    body: intent ? { email, intent } : { email },
  });
}

export function registerByInvite(
  email: string,
  inviteCode: string,
  displayName?: string,
) {
  return apiRequest<{ message?: string }>("/api/v1/auth/create", {
    method: "POST",
    body: { email, invite_code: inviteCode, display_name: displayName },
  });
}

export async function verifyEmailToken(token: string) {
  const response = await apiRequest<{
    message?: string;
    email_change_reauthenticated?: boolean;
  }>("/api/v1/auth/verify", {
    method: "POST",
    body: { token },
  });
  // session再生成後は、次の状態変更時に新sessionのCSRF tokenを取得する。
  clearCsrfToken();
  return response;
}

export async function updateCurrentUser(input: {
  displayName: string;
}): Promise<CurrentUser> {
  const response = await apiRequest<unknown>("/api/v1/me", {
    method: "PATCH",
    body: { display_name: input.displayName },
  });
  return meSchema.parse(response).user;
}

export function requestEmailChange(email: string) {
  return apiRequest<{
    message?: string;
    pending_email?: string | null;
    email_change_stage?: CurrentUser["email_change_stage"];
  }>("/api/v1/me/email_change", {
    method: "POST",
    body: { email },
  });
}

export function approveEmailChange(token: string) {
  return apiRequest<{
    message?: string;
    email_change_stage?: CurrentUser["email_change_stage"];
  }>("/api/v1/me/email_change/approve", {
    method: "POST",
    body: { token },
  });
}

export async function verifyEmailChange(token: string) {
  const response = await apiRequest<{ message?: string; email?: string | null }>(
    "/api/v1/me/email_change/verify",
    {
      method: "POST",
      body: { token },
    },
  );
  clearCsrfToken();
  return response;
}

export function cancelEmailChange() {
  return apiRequest<{ message?: string }>("/api/v1/me/email_change", {
    method: "DELETE",
  });
}

export function logout() {
  return apiRequest<unknown>("/api/v1/logout", {
    method: "DELETE",
  });
}
