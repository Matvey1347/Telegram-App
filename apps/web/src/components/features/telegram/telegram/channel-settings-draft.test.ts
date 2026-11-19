import { describe, expect, it } from "vitest";
import {
  buildChannelSettingsPayload,
  channelSettingsDraftIsInvalid,
  createChannelSettingsDraft,
} from "./channel-settings-draft";

describe("channel settings description", () => {
  it("loads, trims and saves the short description", () => {
    const draft = createChannelSettingsDraft({
      description: "Telegram bio must not appear here",
      shortDescription: "Existing description",
      botInviteLinkId: "invite-bot",
      broadcastInviteLinkId: "invite-broadcast",
      audienceTransferInviteLinkId: "invite-transfer",
      internalCpm: 175,
    } as never);
    expect(draft.description).toBe("Existing description");
    draft.description = "  Updated description  ";

    expect(buildChannelSettingsPayload(draft)).toEqual(
      expect.objectContaining({
        shortDescription: "Updated description",
        botInviteLinkId: "invite-bot",
        broadcastInviteLinkId: "invite-broadcast",
        audienceTransferInviteLinkId: "invite-transfer",
        internalCpm: 175,
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

  it("rejects a negative internal CPM", () => {
    const draft = createChannelSettingsDraft({} as never);
    draft.internalCpm = "-1";

    expect(channelSettingsDraftIsInvalid(draft)).toBe(true);
  });

  it("omits an untouched icon so a later automatic avatar cannot be erased by a stale draft", () => {
    const draft = createChannelSettingsDraft({ presentationIconId: null } as never);
    draft.description = "Edited while the avatar was generating";
    expect(buildChannelSettingsPayload(draft)).not.toHaveProperty("presentationIconId");
    const existing = createChannelSettingsDraft({ presentationIconId: "old-avatar" } as never);
    expect(buildChannelSettingsPayload(existing)).not.toHaveProperty("presentationIconId");
  });

  it("saves only explicit manual icon choices, including clearing an icon", () => {
    const draft = createChannelSettingsDraft({ presentationIconId: "avatar" } as never);
    draft.presentationIconDirty = true;
    draft.presentationIconId = "manual-icon";
    expect(buildChannelSettingsPayload(draft)).toHaveProperty("presentationIconId", "manual-icon");
    draft.presentationIconId = "";
    expect(buildChannelSettingsPayload(draft)).toHaveProperty("presentationIconId", null);
    draft.presentationIconId = "new-avatar-from-command";
    draft.presentationIconDirty = false;
    expect(buildChannelSettingsPayload(draft)).not.toHaveProperty("presentationIconId");
  });
});
