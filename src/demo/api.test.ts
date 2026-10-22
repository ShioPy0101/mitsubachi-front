import { beforeEach, describe, expect, it, vi } from "vitest";
import { exchangeDemoLink, fetchDemoItems, requestDemoEmail } from "./api";
import { verifyDemoLoginLink, hasDemoSession } from "./session";
import { DEMO_API_ORIGIN, DEMO_ORIGIN } from "../features/flags";

beforeEach(() => sessionStorage.clear());

describe("demo API isolation", () => {
  it("requests an email preview from the dedicated API without cookies", async () => {
    const email = {
      to: "demo@tenant.example",
      subject: "ログイン",
      body: "認証メール",
      url: `${DEMO_ORIGIN}/demo/verify?token=demo`,
    };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ email })));
    vi.stubGlobal("fetch", fetch);
    expect(await requestDemoEmail()).toEqual(email);
    expect(fetch).toHaveBeenCalledWith(
      `${DEMO_API_ORIGIN}/api/v1/demo/login`,
      expect.objectContaining({ credentials: "omit" }),
    );
  });
  it("exchanges a link for a separate bearer session and uses it for the catalog", async () => {
    const fetch = vi
      .fn<typeof window.fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: "signed-demo-session" })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })));
    vi.stubGlobal("fetch", fetch);
    expect(await verifyDemoLoginLink("signed-login-link")).toBe(true);
    expect(hasDemoSession()).toBe(true);
    expect(await fetchDemoItems()).toEqual([]);
    const init = fetch.mock.calls[1]?.[1];
    expect(fetch.mock.calls[1]?.[0]).toBe(`${DEMO_API_ORIGIN}/api/v1/demo/items`);
    expect(init?.credentials).toBe("omit");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer signed-demo-session",
    );
  });
  it("rejects invalid links and does not create a demo session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    expect(await verifyDemoLoginLink("invalid")).toBe(false);
    expect(hasDemoSession()).toBe(false);
    await expect(exchangeDemoLink("invalid")).rejects.toThrow(
      "ログインし直してください",
    );
  });
});
