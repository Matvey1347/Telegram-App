import { beforeEach, describe, expect, it } from "vitest";
import {
  readTelegramChannelMessageTemplateDrafts,
  writeTelegramChannelMessageTemplateDraft,
} from "./telegram-channel-message-template-draft";

describe("Telegram channel message template drafts", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("selected-workspace-id", "workspace-1");
  });

  it("preserves emoji preview metadata", () => {
    writeTelegramChannelMessageTemplateDraft(localStorage, {
      version: 1,
      id: "draft-1",
      form: {
        title: "Channel list",
        iconId: "icon-1",
        scopeMode: "CHANNELS",
        networkId: null,
        channelIds: [],
        bodyTemplate: "{{channel_title}}",
        overrideInviteLinks: false,
        inviteLinkOverrides: {},
      },
      preview: { icon: { type: "unicode", value: "📣" } },
    });

    expect(
      readTelegramChannelMessageTemplateDrafts(localStorage)[0],
    ).toMatchObject({
      form: { iconId: "icon-1" },
      preview: { icon: { type: "unicode", value: "📣" } },
    });
  });
});
