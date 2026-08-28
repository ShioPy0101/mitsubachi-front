import { Play } from "lucide-react";
import { useEffect, useState } from "react";

import { FileTypeIcon } from "./FileTypeIcon";

type ThumbnailItem = {
  name: string;
  item_type?: string | null;
  kind?: string | null;
  extension?: string | null;
  content_type?: string | null;
};

export function MediaThumbnail({ item, src }: { item: ThumbnailItem; src: string }) {
  const [failed, setFailed] = useState(false);
  const mediaType = item.content_type?.toLowerCase() ?? "";
  const supported = mediaType.startsWith("image/") || mediaType.startsWith("video/");

  useEffect(() => setFailed(false), [src]);

  if (!supported || failed) {
    return (
      <span className="media-thumbnail-fallback" data-testid="thumbnail-fallback">
        <FileTypeIcon item={item} />
      </span>
    );
  }

  return (
    <span className="media-thumbnail-visual">
      <img
        src={src}
        alt={item.name}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
      {mediaType.startsWith("video/") ? (
        <span className="media-thumbnail-video" aria-label="動画">
          <Play size={22} fill="currentColor" aria-hidden="true" />
        </span>
      ) : null}
    </span>
  );
}
