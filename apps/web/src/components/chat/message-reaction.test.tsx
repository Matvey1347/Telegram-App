import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageBubble } from "./message-bubble";
import type { ChatCapabilities, ChatMessage } from "./types";

const capabilities: ChatCapabilities = { canSend: false, canReply: false, canEdit: false, canDelete: false, canReact: false, canForward: false, canUpload: false, canSendVoice: false, canFormatText: false };
const message: ChatMessage = { id: "message", text: "Hello", direction: "incoming", sentAt: "2026-01-01T00:00:00Z", reactions: [{ emoji: "custom:123", count: 1, iconPresentation: { type: "unicode", value: "🤝", telegramCustomEmojiId: "123", telegramCustomEmojiKind: "STATIC", telegramCustomEmojiAssetUrl: "data:image/webp;base64,AA==" } }] };

describe("custom reactions", () => {
  it("renders the original reaction asset instead of the Telegram document ID", () => {
    render(<ul><MessageBubble message={message} capabilities={capabilities} /></ul>);
    expect(screen.getByRole("img")).toHaveAttribute("src", "data:image/webp;base64,AA==");
    expect(screen.queryByText("custom:123")).not.toBeInTheDocument();
  });
});
