import { fireEvent, screen } from "@testing-library/react";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import { describe, expect, it, vi } from "vitest";
import type { TelegramCustomEmojiPackSummary } from "@telegram-system/shared";
import { customEmojiToken, TelegramCustomEmojiRenderer } from "./telegram-custom-emoji";
import { TelegramCustomEmojiPickerModal } from "./telegram-custom-emoji-picker-modal";
import { TelegramCustomEmojiPacksModal } from "./telegram-custom-emoji-packs-modal";

const pack: TelegramCustomEmojiPackSummary = { id: "pack_1", shortName: "team", title: "Team emoji", telegramLink: "https://t.me/addemoji/team", emojis: [
  { id: "emoji_1", documentId: "123", alt: "spark", kind: "STATIC", mimeType: "image/webp", isFree: true, needsRepainting: false, position: 0, assetUrl: "https://cdn.test/spark.webp", renderAssetUrl: null },
  { id: "emoji_2", documentId: "456", alt: "wave", kind: "ANIMATED", mimeType: "application/x-tgsticker", isFree: true, needsRepainting: false, position: 1, assetUrl: "https://cdn.test/wave.tgs", renderAssetUrl: "https://cdn.test/wave.json" },
] };

describe("Telegram custom emoji", () => {
  it("uses the canonical Telegram custom emoji token", () => expect(customEmojiToken(pack.emojis[0]!)).toBe("![spark](tg://emoji?id=123)"));
  it("renders browser-readable static assets", () => { render(<TelegramCustomEmojiRenderer emoji={pack.emojis[0]!} />); expect(screen.getByAltText("spark")).toHaveAttribute("src", "https://cdn.test/spark.webp"); });
  it("offers unified Standard and Premium picker tabs", () => { const onSelect = vi.fn(); render(<TelegramCustomEmojiPickerModal open onClose={() => {}} packs={[pack]} onSelect={onSelect} onSelectStandard={vi.fn()} />); expect(screen.getByRole("button", { name: "Standard" })).toHaveAttribute("aria-pressed", "true"); fireEvent.click(screen.getByRole("button", { name: "Premium" })); fireEvent.click(screen.getByRole("button", { name: "Insert spark" })); expect(onSelect).toHaveBeenCalledWith(pack.emojis[0]); });
  it("targets selected channels by default when importing a pack", () => { const onImport = vi.fn(); render(<TelegramCustomEmojiPacksModal open onClose={() => {}} currentChannelId="channel_1" channels={[{ id: "channel_1", title: "Main" }, { id: "channel_2", title: "Other" }]} packs={[pack]} onImport={onImport} onDetach={vi.fn()} />); fireEvent.change(screen.getByPlaceholderText("Telegram emoji pack link"), { target: { value: "https://t.me/addemoji/team" } }); fireEvent.click(screen.getByRole("button", { name: "Add Premium Emoji" })); expect(onImport).toHaveBeenCalledWith({ source: "https://t.me/addemoji/team", scope: "CHANNELS", channelIds: ["channel_1"] }); });
  it("shows the first emoji and deletes a pack with the trash action", () => { const onDetach = vi.fn(); render(<TelegramCustomEmojiPacksModal open onClose={() => {}} currentChannelId="channel_1" channels={[{ id: "channel_1", title: "Main" }]} packs={[pack]} onImport={vi.fn()} onDetach={onDetach} />); expect(screen.getByAltText("spark")).toHaveAttribute("src", "https://cdn.test/spark.webp"); fireEvent.click(screen.getByRole("button", { name: "Delete Team emoji" })); expect(onDetach).toHaveBeenCalledWith("pack_1", { scope: "CHANNELS", channelIds: ["channel_1"] }); });
});
