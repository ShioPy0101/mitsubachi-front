import { z } from "zod";

import { DEMO_API_ORIGIN, DEMO_ORIGIN } from "../features/flags";

const emailSchema = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  url: z.url().refine((value) => {
    const url = new URL(value);
    return url.origin === DEMO_ORIGIN && url.pathname === "/demo/verify";
  }),
});
export type DemoEmail = z.infer<typeof emailSchema>;
const itemSchema = z.object({
  id: z.string(),
  parent: z.string().nullable(),
  name: z.string(),
  size: z.string().nullable(),
});

// 実テナントの API クライアント・Cookie・CSRF token を共有しない。
async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${DEMO_API_ORIGIN}/api/v1/demo/${path}`, {
    ...init,
    credentials: "omit",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "デモ用の認証メールからログインし直してください。"
        : "デモ API に接続できませんでした。しばらく待ってから再試行してください。",
    );
  return response.json() as Promise<unknown>;
}

export async function requestDemoEmail() {
  return z.object({ email: emailSchema }).parse(
    await request("login", {
      method: "POST",
      body: JSON.stringify({ email: "demo@tenant.example" }),
    }),
  ).email;
}

export async function exchangeDemoLink(token: string) {
  return z
    .object({ token: z.string().min(1) })
    .parse(await request("verify", { method: "POST", body: JSON.stringify({ token }) }))
    .token;
}

export async function fetchDemoItems() {
  const token = sessionStorage.getItem("mitsubachi.demo.session") ?? "";
  return z
    .object({ items: z.array(itemSchema) })
    .parse(await request("items", { headers: { Authorization: `Bearer ${token}` } }))
    .items;
}
