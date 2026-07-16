import { File, FileAudio, FileText, FileVideo, Folder } from "lucide-react";

import type { DriveItem } from "../api/schemas";

export function FileTypeIcon({ item }: { item: DriveItem }) {
  if (item.item_type === "directory") return <Folder size={20} aria-hidden="true" />;
  if (item.content_type?.startsWith("video/"))
    return <FileVideo size={20} aria-hidden="true" />;
  if (item.content_type?.startsWith("audio/"))
    return <FileAudio size={20} aria-hidden="true" />;
  if (item.content_type === "application/pdf")
    return <FileText size={20} aria-hidden="true" />;
  return <File size={20} aria-hidden="true" />;
}
