import { describe, expect, it } from "vitest";
import { isDemoHost, resolveFeatureFlags } from "./flags";

describe("feature flags", () => {
  it("enables only explicitly configured features", () => {
    expect(resolveFeatureFlags({}).demoTenant).toBe(false);
    expect(resolveFeatureFlags({ VITE_FEATURE_DEMO_TENANT: "true" }).demoTenant).toBe(
      true,
    );
    expect(resolveFeatureFlags({ VITE_FEATURE_DEMO_TENANT: "false" }).demoTenant).toBe(
      false,
    );
    expect(
      resolveFeatureFlags({ VITE_FEATURE_DEMO_TENANT: "invalid" }).demoTenant,
    ).toBe(false);
  });
  it("matches only the dedicated demo hostname", () => {
    expect(isDemoHost("demo.mitsubachi.shiosalt.com")).toBe(true);
    expect(isDemoHost("mitsubachi.shiosalt.com")).toBe(false);
    expect(isDemoHost("demo.mitsubachi.shiosalt.com.example.com")).toBe(false);
  });
});
