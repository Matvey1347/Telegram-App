import { describe, expect, it } from "vitest";
import {
  telegramInviteLinkDefaultBadgeClassName,
  telegramInviteLinkOptionLabel,
} from "./telegram-invite-link-options";

describe("Telegram invite-link option presentation", () => {
  it("renders a compact blue default icon without a text label", () => {
    const link = {
      name: "Imported MTProto link",
      isDefaultForChannel: true,
      isDefaultForBot: true,
    };
    expect(telegramInviteLinkOptionLabel(link)).toBe(
      "Imported MTProto link · Default · Bot",
    );
    expect(telegramInviteLinkDefaultBadgeClassName(link)).toContain(
      "after:content-['★']",
    );
    expect(telegramInviteLinkDefaultBadgeClassName(link)).not.toContain(
      "Default",
    );
    expect(telegramInviteLinkDefaultBadgeClassName(link)).toContain(
      "after:text-sky-300",
    );
  });
});
