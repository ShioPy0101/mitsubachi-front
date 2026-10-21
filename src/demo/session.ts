import { z } from "zod";

export const DEMO_EMAIL = "demo@tenant.example";
const LINK_KEY = "mitsubachi.demo.loginLink";
const SESSION_KEY = "mitsubachi.demo.session";

// デモの確認リンクは実際の認証情報とは分離し、同じタブ内でのみ利用する。
// サーバーの Cookie や認証キャッシュは変更せず、実テナントの権限を付与しない。
export function createDemoLoginLink() {
  const token = crypto.randomUUID();
  sessionStorage.setItem(
    LINK_KEY,
    JSON.stringify({ token, expiresAt: Date.now() + 15 * 60 * 1000 }),
  );
  return new URL(`/demo/verify?token=${token}`, window.location.origin).href;
}

export function verifyDemoLoginLink(token: string | null) {
  const stored = sessionStorage.getItem(LINK_KEY);
  if (!stored || !token) return false;
  try {
    const link = z
      .object({ token: z.string(), expiresAt: z.number() })
      .parse(JSON.parse(stored));
    if (link.token !== token || link.expiresAt <= Date.now()) return false;
    sessionStorage.removeItem(LINK_KEY);
    sessionStorage.setItem(SESSION_KEY, "active");
    return true;
  } catch {
    return false;
  }
}

export function hasDemoSession() {
  return sessionStorage.getItem(SESSION_KEY) === "active";
}

export function endDemoSession() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(LINK_KEY);
}
