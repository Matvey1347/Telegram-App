import { render, screen } from "@testing-library/react";
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
});
