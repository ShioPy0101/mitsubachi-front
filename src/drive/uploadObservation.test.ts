import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../api/client";
import { UPLOAD_OBSERVATION_INTERVAL_MS, UploadObservation } from "./uploadObservation";

vi.mock("../api/client", () => ({
  apiRequest: vi.fn().mockResolvedValue({}),
}));

describe("UploadObservation", () => {
  const randomUUID = vi.fn(() => "123e4567-e89b-42d3-a456-426614174000");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID },
    });
  });

  it("試験用URLなしでセッションIDを一度生成して30秒ごとに集約更新する", async () => {
    const observation = new UploadObservation(
      [new File(["secret"], "秘密の相対パス.txt")],
      4,
      "single",
    );
    await observation.start();
    await vi.advanceTimersByTimeAsync(UPLOAD_OBSERVATION_INTERVAL_MS);

    expect(randomUUID).toHaveBeenCalledTimes(2);
    expect(apiRequest).toHaveBeenCalledWith(
      expect.stringContaining("upload_metrics/123e4567"),
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(JSON.stringify(vi.mocked(apiRequest).mock.calls)).not.toContain(
      "秘密の相対パス",
    );
  });

  it("観測API失敗でも開始と完了を拒否しない", async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error("down"));
    const file = new File(["ok"], "name.txt");
    const observation = new UploadObservation([file], 1, "single");

    await expect(observation.start()).resolves.toBeUndefined();
    observation.begin(file);
    observation.finish(file, 201);
    await expect(observation.complete("completed")).resolves.toBeUndefined();
  });

  it("PerformanceObserver未対応でも例外にしない", () => {
    const original = globalThis.PerformanceObserver;
    Object.defineProperty(globalThis, "PerformanceObserver", {
      configurable: true,
      value: undefined,
    });
    expect(() => new UploadObservation([], 1, "single")).not.toThrow();
    Object.defineProperty(globalThis, "PerformanceObserver", {
      configurable: true,
      value: original,
    });
  });

  it("再試行回数とバックグラウンド滞在時間を最終集計する", async () => {
    let hidden = false;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
    const file = new File(["ok"], "name.txt");
    const observation = new UploadObservation([file], 1, "single");
    await observation.start();

    observation.begin(file);
    observation.finish(file, 503, "storage_unavailable");
    observation.begin(file, true);
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(2_000);
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    observation.finish(file, 201);
    await observation.complete("completed");

    const finalBody = vi.mocked(apiRequest).mock.calls.at(-1)?.[1]?.body;
    expect(finalBody).toEqual(
      expect.objectContaining({
        retry_count: 1,
        retried_files: 1,
        background_duration_ms: 2_000,
      }),
    );
  });
});
