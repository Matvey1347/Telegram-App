import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TelegramPostPreviewModal } from "./post-preview-modal";

vi.mock("./telegram-post-preview", () => ({
  TelegramPostPreview: ({
    imageUrls,
    hasMedia,
  }: {
    imageUrls: string[];
    hasMedia?: boolean;
  }) => (
    <div
      data-testid="post-preview"
      data-image-urls={imageUrls.join(",")}
      data-has-media={String(Boolean(hasMedia))}
    />
  ),
}));

const basePost = {
  id: "post-1",
  telegramChannelId: "channel-1",
  telegramMessageId: "101",
  postDate: "2026-08-23T10:00:00.000Z",
  text: "A synchronized post",
  imageUrls: ["https://cdn.example.test/telegram/post-image.jpg"],
  hasMedia: true,
  manualOwnViews: 0,
  manualOwnReactions: 0,
  excludeFromAnalytics: false,
};

describe("TelegramPostPreviewModal", () => {
  it("renders persisted image URLs directly", () => {
    render(
      <TelegramPostPreviewModal
        open
        onClose={vi.fn()}
        channelTitle="Channel"
        post={basePost}
      />,
    );

    expect(screen.getByTestId("post-preview")).toHaveAttribute(
      "data-image-urls",
      "https://cdn.example.test/telegram/post-image.jpg",
    );
    expect(
      screen.queryByText("Media preview is available only for image posts."),
    ).not.toBeInTheDocument();
  });

  it("keeps the unsupported-media placeholder when no image URL exists", () => {
    render(
      <TelegramPostPreviewModal
        open
        onClose={vi.fn()}
        channelTitle="Channel"
        post={{ ...basePost, mediaKind: "video", imageUrls: [] }}
      />,
    );

    expect(screen.getByTestId("post-preview")).toHaveAttribute(
      "data-has-media",
      "true",
    );
    expect(
      screen.getByText("Media preview is available only for image posts."),
    ).toBeVisible();
  });
});
