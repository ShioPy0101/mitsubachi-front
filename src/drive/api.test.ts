import { describe, expect, it, vi } from "vitest";

import { API_BASE_URL } from "../api/client";
import {
  fetchDriveItems,
  purgeDriveItem,
  previewUrl,
  streamUrl,
  uploadFile,
  downloadDriveItem,
} from "./api";

describe("drive api", () => {
  it("accepts array responses directly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Response(
            JSON.stringify([
              {
                id: 1,
                parent_id: null,
                name: "Reports",
                item_type: "directory",
              },
            ]),
            { headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    await expect(fetchDriveItems(null)).resolves.toHaveLength(1);
  });

  it("uploads multipart without setting json content type", async () => {
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
            id: 1,
            parent_id: null,
            name: "quarterly.report",
            item_type: "file",
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    await uploadFile({
      file: new File(["content"], "quarterly.report.pdf", { type: "application/pdf" }),
      name: "quarterly.report",
      parentId: null,
    });

    const [, request] = vi.mocked(fetch).mock.calls[1];
    expect(request?.body).toBeInstanceOf(FormData);
    expect((request?.headers as Headers).get("Content-Type")).toBeNull();
  });

  it("uses native browser download for single downloads", () => {
    const append = vi.spyOn(document.body, "append");
    const click = vi.fn();
    const remove = vi.fn();
    const anchor = {
      href: "",
      click,
      remove,
    } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    downloadDriveItem(10);

    expect(append).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
    expect(anchor.href).toBe(`${API_BASE_URL}/api/v1/drive_items/10/download`);
  });

  it("uses DELETE for irreversible trash purge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url === `${API_BASE_URL}/api/v1/csrf_token`) {
          return new Response(JSON.stringify({ csrf_token: "csrf" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ message: "完全削除しました" }), {
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    await expect(purgeDriveItem(20)).resolves.toMatchObject({
      message: "完全削除しました",
    });

    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toBe(
      `${API_BASE_URL}/api/v1/drive_items/20/purge`,
    );
    expect(vi.mocked(fetch).mock.calls[1]?.[1]?.method).toBe("DELETE");
  });

  it("builds preview and stream URLs without internal paths", () => {
    expect(previewUrl(1)).toBe(`${API_BASE_URL}/api/v1/drive_items/1/preview`);
    expect(streamUrl(1)).toBe(`${API_BASE_URL}/api/v1/drive_items/1/stream`);
  });
});
