import { describe, expect, it } from "vitest";
import { normalizeTelegramChannelMessageTemplateDraft } from "./telegram-channel-message-template-draft";

describe("Telegram channel message template draft migration", () => {
  it("rejects legacy drafts created while editing a saved template", () => {
    const payload = {
      title: "Channel list",
      iconId: "icon-1",
      scopeMode: "CHANNELS",
      networkId: null,
      channelIds: [],
      bodyTemplate: "{{channel_title}}",
      overrideInviteLinks: false,
      inviteLinkOverrides: {},
    };
    expect(
      normalizeTelegramChannelMessageTemplateDraft(payload, 1, 0, {
        savedTemplateId: "saved-1",
      }),
    ).toBeNull();
  });
});
