import { describe, expect, it, vi } from "vitest";

import { API_BASE_URL, clearCsrfToken } from "../api/client";
import { createExternalShare, publicDownloadUrl, publicPreviewUrl, type ExternalShare } from "./api";

describe("external share api", () => {
  it("creates one external share for selected DriveItems", async () => {
    clearCsrfToken();
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url === `${API_BASE_URL}/api/v1/csrf_token`) {
          return new Response(JSON.stringify({ csrf_token: "csrf" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            id: 12,
            name: "納品データ",
            share_url: "https://front.example/share/raw-token",
            folder_share_mode: "snapshot",
            allow_download: true,
            allow_bulk_download: true,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const result: ExternalShare = await createExternalShare({
      name: "納品データ",
      driveItemIds: [21, 35, 140],
      expiresAt: "2026-07-29T14:59:59.000Z",
      allowDownload: true,
      allowBulkDownload: true,
      password: null,
      folderShareMode: "snapshot",
    });

    expect(result.share_url).toBe("https://front.example/share/raw-token");
    const [, request] = vi.mocked(fetch).mock.calls[1];
    expect(JSON.parse(request?.body as string)).toMatchObject({
      external_share: {
        drive_item_ids: [21, 35, 140],
        folder_share_mode: "snapshot",
      },
    });
  });

  it("builds public file URLs without storage paths", () => {
    expect(publicPreviewUrl("raw/token", 5)).toBe(
      `${API_BASE_URL}/api/v1/public/shares/raw%2Ftoken/items/5/preview`,
    );
    expect(publicDownloadUrl("raw/token", 5)).toBe(
      `${API_BASE_URL}/api/v1/public/shares/raw%2Ftoken/items/5/download`,
    );
  });
});
