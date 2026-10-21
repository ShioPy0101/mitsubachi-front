// 公開 UI の切り替え専用。サーバー側の認証・認可の代わりには使用しない。
export function resolveFeatureFlags(env: { VITE_FEATURE_DEMO_TENANT?: string }) {
  return { demoTenant: env.VITE_FEATURE_DEMO_TENANT === "true" } as const;
}

export const featureFlags = resolveFeatureFlags(import.meta.env);
export const DEMO_ORIGIN = "https://demo.mitsubachi.shiosalt.com";
export const DEMO_API_ORIGIN = "https://mitsubachi-demo-api.shiosalt.com";

export function isDemoHost(hostname = window.location.hostname) {
  return hostname === new URL(DEMO_ORIGIN).hostname;
}

export function redirectToDemo() {
  window.location.assign(`${DEMO_ORIGIN}/login`);
}
