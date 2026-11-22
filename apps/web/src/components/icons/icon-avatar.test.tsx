import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { workspaceKeys } from "@/lib/query-keys";
import { IconAvatar } from "./icon-avatar";

function renderWithQuery(
  ui: ReactNode,
  packs?: Awaited<ReturnType<typeof import("@/lib/api").telegramChannelsApi.customEmojiPacks>>["packs"],
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (packs) {
    client.setQueryData(workspaceKeys.telegramCustomEmojiPacks(), { packs });
  }
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("IconAvatar", () => {
  it("renders the saved Telegram Premium emoji animation instead of its fallback", () => {
    const { container } = renderWithQuery(
      <IconAvatar
        label="Test workspace"
        icon={{
          type: "unicode",
          value: "💬",
          name: "Premium bubble",
          telegramCustomEmojiId: "5368324170671202286",
          telegramCustomEmojiKind: "ANIMATED",
          telegramCustomEmojiAssetUrl: "https://cdn.example.com/emoji.tgs",
          telegramCustomEmojiRenderAssetUrl:
            "https://cdn.example.com/emoji.json",
        }}
      />,
    );

    expect(screen.getByLabelText("Premium bubble")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("💬");
  });

  it("renders a static Telegram Premium emoji asset", () => {
    renderWithQuery(
      <IconAvatar
        icon={{
          type: "unicode",
          value: "✅",
          telegramCustomEmojiId: "premium-static",
          telegramCustomEmojiKind: "STATIC",
          telegramCustomEmojiAssetUrl: "https://cdn.example.com/emoji.webp",
        }}
      />,
    );

    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://cdn.example.com/emoji.webp",
    );
  });

  it("resolves a channel avatar Premium emoji from the current workspace pack", () => {
    renderWithQuery(
      <IconAvatar
        label="Channel"
        icon={{ type: "unicode", value: "📣", telegramCustomEmojiId: "avatar-id" }}
      />,
      [
        {
          id: "channel-avatar:workspace",
          shortName: "channelavatars_by_bot",
          title: "Channel avatars",
          telegramLink: "https://t.me/addemoji/channelavatars_by_bot",
          emojis: [
            {
              id: "avatar-icon",
              documentId: "avatar-id",
              alt: "📣",
              mimeType: "image/png",
              kind: "STATIC",
              isFree: false,
              needsRepainting: false,
              position: 0,
              assetUrl: "https://cdn.example.test/channel.png",
              renderAssetUrl: null,
            },
          ],
        },
      ],
    );

    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://cdn.example.test/channel.png",
    );
  });

  it("keeps transparent image avatars free of the emoji fallback background", () => {
    renderWithQuery(
      <IconAvatar
        label="Custom image"
        icon={{
          type: "image",
          id: "custom-image",
          url: "https://cdn.example.com/custom-image.png",
        }}
      />,
    );

    expect(screen.getByRole("img", { name: "Custom image" })).toHaveClass(
      "bg-transparent",
    );
    expect(screen.getByRole("img", { name: "Custom image" })).not.toHaveClass(
      "bg-neutral-800",
      "border-neutral-700",
    );
  });

  it("shows a fallback for a successfully loaded one-pixel Telegram placeholder", () => {
    renderWithQuery(<IconAvatar label="Manager" icon={{ type: "image", id: "peer", url: "https://t.me/i/userpic/320/manager.jpg" }} />);
    const image = screen.getByRole("img", { name: "Manager" });
    Object.defineProperties(image, { naturalWidth: { value: 1 }, naturalHeight: { value: 1 } });
    fireEvent.load(image);
    expect(screen.queryByRole("img", { name: "Manager" })).toBeNull();
    expect(screen.getByText("M")).toBeInTheDocument();
  });

  it("renders the standard fallback when an avatar URL cannot be loaded", () => {
    renderWithQuery(
      <IconAvatar
        label="Admin"
        icon={{
          type: "image",
          id: "broken-avatar",
          url: "https://invalid.test/avatar.jpg",
        }}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "Admin" }));

    expect(screen.queryByRole("img", { name: "Admin" })).toBeNull();
    expect(screen.getByText("A")).toBeInTheDocument();
  });
});
