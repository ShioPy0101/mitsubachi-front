import { describe, expect, it, vi } from "vitest";
import { fetchFrontendReleaseInfo, frontendBuildInfo } from "./info";

describe("build information", () => {
  it("embeds the source commit and an actual build timestamp", () => {
    expect(frontendBuildInfo.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(Number.isNaN(Date.parse(frontendBuildInfo.built_at!))).toBe(false);
  });
  it("reads the currently served release independently of the loaded bundle", async () => {
    const info = {
      commit: "b".repeat(40),
      built_at: "2026-10-23T00:00:00Z",
      deployed_at: "2026-10-23T01:00:00Z",
    };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(info)));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchFrontendReleaseInfo()).toEqual(info);
    expect(fetch).toHaveBeenCalledWith("/release-info.json", {
      cache: "no-store",
      credentials: "omit",
    });
  });
  it("leaves missing or non-JSON release metadata unrecorded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>SPA fallback</html>")),
    );
    expect(await fetchFrontendReleaseInfo()).toBeNull();
  });
});
