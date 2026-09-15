import { describe, expect, it } from "vitest";
import {
  buildChannelSettingsPayload,
  createChannelSettingsDraft,
} from "./channel-settings-draft";

describe("channel settings description", () => {
  it("loads, trims and saves the short description", () => {
    const draft = createChannelSettingsDraft({
      description: "Telegram bio must not appear here",
      shortDescription: "Existing description",
      botInviteLinkId: "invite-bot",
    } as never);
    expect(draft.description).toBe("Existing description");
    draft.description = "  Updated description  ";

    expect(buildChannelSettingsPayload(draft)).toEqual(
      expect.objectContaining({
        shortDescription: "Updated description",
        botInviteLinkId: "invite-bot",
      }),
    );
  });

  it("clears a whitespace-only description", () => {
    const draft = createChannelSettingsDraft({} as never);
    draft.description = "   ";

    expect(buildChannelSettingsPayload(draft)).toEqual(
      expect.objectContaining({ shortDescription: null }),
    );
  });
});
