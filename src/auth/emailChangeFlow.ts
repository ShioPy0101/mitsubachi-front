export const EMAIL_CHANGE_LOGIN_PATH = "/login?intent=email_change";
export const EMAIL_CHANGE_REAUTHENTICATION_TTL = 5 * 60 * 1000;

export type EmailChangeReauthentication = {
  emailChangeReauthenticatedAt: number;
  emailChangeUserId: number;
};

// UIの再認証案内にだけ使う。変更権限・有効期限・一度限りの利用はAPIでも検証する。
export function hasRecentEmailChangeReauthentication(
  state: unknown,
  userId: number,
  now = Date.now(),
): boolean {
  if (!state || typeof state !== "object") return false;
  const value = state as Partial<EmailChangeReauthentication>;
  if (
    value.emailChangeUserId !== userId ||
    typeof value.emailChangeReauthenticatedAt !== "number"
  )
    return false;
  const age = now - value.emailChangeReauthenticatedAt;
  return age >= 0 && age < EMAIL_CHANGE_REAUTHENTICATION_TTL;
}
