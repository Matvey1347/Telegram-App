import { describe, expect, it } from "vitest";
import {
  isTelegramInviteLink,
  telegramInviteLinkOptionLabel,
} from "./telegram-invite-link-options";

describe("Telegram invite-link option presentation", () => {
  it("retains purpose names for option search and accessible text", () => {
    const link = {
      name: "Imported MTProto link",
      isDefaultForChannel: true,
      isDefaultForBot: true,
    };
    expect(telegramInviteLinkOptionLabel(link)).toBe(
      "Imported MTProto link · Default · Bot",
    );
    expect(isTelegramInviteLink("https://t.me/+Abc_12")).toBe(true);
    expect(isTelegramInviteLink("https://example.com/+Abc_12")).toBe(false);
  });
});
