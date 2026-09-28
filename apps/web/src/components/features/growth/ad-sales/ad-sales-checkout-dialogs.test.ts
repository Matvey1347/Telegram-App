import { describe, expect, it } from "vitest";
import { telegramMessageIdFromUrl } from "./ad-sales-checkout-dialogs";

describe("telegramMessageIdFromUrl", () => {
  it("uses the final path segment for a private Telegram post link", () => {
    expect(
      telegramMessageIdFromUrl("https://t.me/c/2206241428/8435"),
    ).toBe("8435");
  });

  it("rejects links without a numeric message ID", () => {
    expect(telegramMessageIdFromUrl("https://t.me/example_channel")).toBeUndefined();
  });
});
