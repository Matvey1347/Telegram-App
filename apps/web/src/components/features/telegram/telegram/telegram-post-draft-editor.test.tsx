import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { TelegramPostDraftEditor } from "./telegram-post-draft-editor";

const { resolveCustomEmojiDocuments } = vi.hoisted(() => ({
  resolveCustomEmojiDocuments: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  telegramChannelsApi: {
    resolveCustomEmojiDocuments: (...args: unknown[]) =>
      resolveCustomEmojiDocuments(...args),
  },
}));

vi.mock("./telegram-post-preview", () => ({
  TelegramPostPreview: (props: Record<string, unknown>) => (
    <div
      data-testid="preview"
      data-plain={String(props.plainText)}
      data-html={String(props.formattedHtml)}
      data-media={JSON.stringify(props.mediaItems)}
      data-buttons={JSON.stringify(props.buttonRows)}
      data-custom-emoji-packs={JSON.stringify(props.customEmojiPacks)}
    />
  ),
}));
vi.mock("./telegram-text-editor", () => ({
  TelegramTextEditor: ({ onChange }: { onChange: (text: string) => void }) => (
    <button type="button" onClick={() => onChange("Edited text")}>
      Edit text
    </button>
  ),
}));
vi.mock("./telegram-post-media-upload", () => ({
  TelegramPostMediaUpload: () => <div>Media editor</div>,
}));

describe("TelegramPostDraftEditor", () => {
  it("preserves normalized formatting, media and buttons until text is edited", () => {
    const onChange = vi.fn();
    const draft = {
      title: "Imported",
      text: "**Bold**",
      plainText: "Bold",
      formattedHtml: "<b>Bold</b>",
      imageUrls: ["https://cdn.test/photo.jpg"],
      mediaItems: [
        { kind: "PHOTO" as const, url: "https://cdn.test/photo.jpg" },
      ],
      buttonRows: [
        [
          {
            text: "Open",
            url: "https://example.test",
            style: "primary" as const,
          },
        ],
      ],
    };
    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false } },
          })
        }
      >
        <TelegramPostDraftEditor
          draft={draft}
          channelTitle="Channel"
          onChange={onChange}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("preview")).toHaveAttribute("data-plain", "Bold");
    expect(screen.getByTestId("preview")).toHaveAttribute(
      "data-html",
      "<b>Bold</b>",
    );
    expect(screen.getByTestId("preview").getAttribute("data-media")).toContain(
      "photo.jpg",
    );
    expect(
      screen.getByTestId("preview").getAttribute("data-buttons"),
    ).toContain("Open");

    fireEvent.click(screen.getByRole("button", { name: "Edit text" }));
    expect(onChange).toHaveBeenCalledWith({
      ...draft,
      text: "Edited text",
      plainText: undefined,
      formattedHtml: undefined,
    });
  });

  it("loads assets for Premium emoji imported with the post", async () => {
    resolveCustomEmojiDocuments.mockResolvedValueOnce({
      packs: [
        {
          id: "pack-1",
          shortName: "sparkles",
          title: "Sparkles",
          telegramLink: "https://t.me/addemoji/sparkles",
          emojis: [
            {
              id: "emoji-1",
              documentId: "5440660757194744323",
              alt: "‼️",
              kind: "STATIC",
              mimeType: "image/webp",
              isFree: false,
              needsRepainting: false,
              position: 0,
              assetUrl: "https://cdn.test/emoji.webp",
              renderAssetUrl: null,
            },
          ],
        },
      ],
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false } },
          })
        }
      >
        <TelegramPostDraftEditor
          channelTitle="Channel"
          onChange={vi.fn()}
          draft={{
            title: "Imported",
            text: "![‼️](tg://emoji?id=5440660757194744323)",
            imageUrls: [],
            buttonRows: [],
          }}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(resolveCustomEmojiDocuments).toHaveBeenCalledWith(
        ["5440660757194744323"],
        expect.any(Function),
        expect.any(AbortSignal),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId("preview")).toHaveAttribute(
        "data-custom-emoji-packs",
        expect.stringContaining("emoji.webp"),
      );
    });
  });
});
