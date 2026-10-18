import { describe, expect, it } from "vitest";
import { hasInvalidTelegramInlineButtons } from "./telegram-inline-buttons";

describe("hasInvalidTelegramInlineButtons", () => {
  it("allows a blank editor row but rejects a labelled button without a link", () => {
    expect(
      hasInvalidTelegramInlineButtons([
        [{ text: "", url: "", style: "default" }],
      ]),
    ).toBe(false);
    expect(
      hasInvalidTelegramInlineButtons([
        [{ text: "Open", url: "", style: "default" }],
      ]),
    ).toBe(true);
  });

  it("accepts Telegram button URL protocols", () => {
    expect(
      hasInvalidTelegramInlineButtons([
        [{ text: "Open", url: "https://example.com", style: "primary" }],
        [{ text: "Open chat", url: "tg://resolve?domain=telegram", style: "default" }],
      ]),
    ).toBe(false);
  });
});
