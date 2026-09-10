import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IconAvatar } from "./icon-avatar";

describe("IconAvatar", () => {
  it("renders the saved Telegram Premium emoji animation instead of its fallback", () => {
    const { container } = render(
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
    render(
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

  it("keeps transparent image avatars free of the emoji fallback background", () => {
    render(
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

  it("renders the standard fallback when an avatar URL cannot be loaded", () => {
    render(
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
