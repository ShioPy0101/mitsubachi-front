import { exchangeDemoLink } from "./api";

export const DEMO_EMAIL = "demo@tenant.example";
const SESSION_KEY = "mitsubachi.demo.session";

// デモ専用 API の署名 token だけを保持し、実テナントの Cookie や認証状態は変更しない。
export async function verifyDemoLoginLink(token: string | null) {
  if (!token) return false;
  try {
    sessionStorage.setItem(SESSION_KEY, await exchangeDemoLink(token));
    return true;
  } catch {
    return false;
  }
}

export function hasDemoSession() {
  return Boolean(sessionStorage.getItem(SESSION_KEY));
}

export function endDemoSession() {
  sessionStorage.removeItem(SESSION_KEY);
}
