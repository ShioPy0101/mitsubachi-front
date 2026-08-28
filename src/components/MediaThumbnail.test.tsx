import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MediaThumbnail } from "./MediaThumbnail";

describe("MediaThumbnail", () => {
  it("画像thumbnailをlazy loadingする", () => {
    render(
      <MediaThumbnail
        item={{ name: "photo.jpg", content_type: "image/jpeg", extension: "jpg" }}
        src="/thumbnail/1"
      />,
    );

    expect(screen.getByRole("img", { name: "photo.jpg" })).toHaveAttribute(
      "loading",
      "lazy",
    );
  });

  it("動画thumbnailへ動画表示を重ねる", () => {
    render(
      <MediaThumbnail
        item={{ name: "movie.mp4", content_type: "video/mp4", extension: "mp4" }}
        src="/thumbnail/2"
      />,
    );

    expect(screen.getByLabelText("動画")).toBeInTheDocument();
  });

  it("非対応形式とload errorは既存file iconへfallbackする", () => {
    const { rerender } = render(
      <MediaThumbnail
        item={{
          name: "document.pdf",
          content_type: "application/pdf",
          extension: "pdf",
        }}
        src="/thumbnail/3"
      />,
    );
    expect(screen.getByTestId("thumbnail-fallback")).toBeInTheDocument();

    rerender(
      <MediaThumbnail
        item={{ name: "broken.jpg", content_type: "image/jpeg", extension: "jpg" }}
        src="/thumbnail/4"
      />,
    );
    fireEvent.error(screen.getByRole("img", { name: "broken.jpg" }));
    expect(screen.getByTestId("thumbnail-fallback")).toBeInTheDocument();

    rerender(
      <MediaThumbnail
        item={{ name: "replaced.jpg", content_type: "image/jpeg", extension: "jpg" }}
        src="/thumbnail/5"
      />,
    );
    expect(screen.getByRole("img", { name: "replaced.jpg" })).toHaveAttribute(
      "src",
      "/thumbnail/5",
    );
  });
});
