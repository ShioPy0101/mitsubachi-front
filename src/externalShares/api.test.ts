import { describe, expect, it, vi } from "vitest";

import { API_BASE_URL, clearCsrfToken } from "../api/client";
import {
  createExternalShare,
  publicDownloadUrl,
  publicPreviewUrl,
  regenerateExternalSharePassword,
  type ExternalShare,
} from "./api";

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
            generated_password: "G7mK9xT4pQ2wN8rC",
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
      passwordProtected: true,
      folderShareMode: "snapshot",
    });

    expect(result.share_url).toBe("https://front.example/share/raw-token");
    expect(result.generated_password).toBe("G7mK9xT4pQ2wN8rC");
    const [, request] = vi.mocked(fetch).mock.calls[1];
    expect(JSON.parse(request?.body as string)).toMatchObject({
      external_share: {
        drive_item_ids: [21, 35, 140],
        password_protected: true,
        folder_share_mode: "snapshot",
      },
    });
  });

  it("regenerates an external share password", async () => {
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
            folder_share_mode: "snapshot",
            allow_download: true,
            allow_bulk_download: true,
            generated_password: "nEwP4ssw0rd",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const result = await regenerateExternalSharePassword(12);

    expect(result.generated_password).toBe("nEwP4ssw0rd");
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(
      `${API_BASE_URL}/api/v1/external_shares/12/regenerate_password`,
    );
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
