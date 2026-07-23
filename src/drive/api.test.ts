import { describe, expect, it, vi } from "vitest";

import { API_BASE_URL } from "../api/client";
import {
  fetchDriveItems,
  normalizeRestorePreview,
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

  it("sends trash duplicate resolution flags as explicit multipart fields", async () => {
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
            name: "report",
            item_type: "file",
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    await uploadFile({
      file: new File(["content"], "report.txt", { type: "text/plain" }),
      name: "report",
      parentId: 42,
      allowTrashDuplicate: true,
      replaceTrashedDriveItemId: 99,
    });

    const form = vi.mocked(fetch).mock.calls[1]?.[1]?.body as FormData;
    expect(form.get("allow_trash_duplicate")).toBe("true");
    expect(form.get("replace_trashed_drive_item_id")).toBe("99");
    expect(form.get("parent_id")).toBe("42");
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

  it("keeps active content duplicate restore preview conflicts", () => {
    const preview = normalizeRestorePreview({
      items: [
        {
          item_id: 1,
          item_type: "file",
          restore_target_id: 10,
          conflict_type: "active_content_duplicate",
          parent_exists: true,
          existing_item_id: 20,
          recommended_resolution: "skip",
          children_count: 0,
          descendant_conflict_count: 0,
          before: {
            name: "child.txt",
            parent_id: 10,
            parent_path: "/共有ドライブ/folder",
            state: "trashed",
            restorable: false,
            reason: "組織内に同じ内容のファイルがあります",
          },
          after: {
            name: "child.txt",
            parent_id: 10,
            parent_path: "/共有ドライブ/folder",
            restorable: false,
            resolution: "skip",
            existing_item_will_be_purged: false,
            state: "skipped",
            impact: "同じ内容の有効なファイルがあるため復元できません",
          },
        },
      ],
      summary: {
        total_count: 1,
        conflict_count: 1,
        restorable_count: 0,
        skipped_count: 1,
        rename_count: 0,
        purge_existing_count: 0,
      },
    });

    expect(preview.items[0]?.conflictType).toBe("active_content_duplicate");
  });
});
