import { describe, expect, it } from "vitest";
import { appendChannelEndingSignature } from "./channel-ending-signature";

const channel = {
  title: "Science",
  username: "science_news",
  presentationIconPresentation: { type: "unicode" as const, value: "📣", telegramCustomEmojiId: "123456789" },
};

describe("channel ending signature", () => {
  it("appends real custom emoji markup and channel link preserving user text", () => {
    expect(appendChannelEndingSignature("Авторский текст  ", channel)).toBe("Авторский текст  \n\n![📣](tg://emoji?id=123456789) [Science](https://t.me/science_news)");
  });
  it("never duplicates a signature or an existing channel link", () => {
    const ending = appendChannelEndingSignature("", channel);
    expect(appendChannelEndingSignature(ending, channel)).toBe(ending);
    const existing = "Другой текст https://t.me/science_news";
    expect(appendChannelEndingSignature(existing, channel)).toBe(existing);
  });
  it("uses a normal fallback without custom emoji and refuses absent or unsafe links", () => {
    expect(appendChannelEndingSignature("", { title: "Private", inviteLink: "https://t.me/+hash" })).toBe("📣 [Private](https://t.me/+hash)");
    expect(appendChannelEndingSignature("Original", { inviteLink: "javascript:alert(1)" })).toBe("Original");
    expect(appendChannelEndingSignature("Original", { title: "No link" })).toBe("Original");
  });
});
