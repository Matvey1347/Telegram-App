import { describe, expect, it } from "vitest";
import {
  getChannelSettingsCompletion,
  getOverallChannelSettingsCompletion,
} from "./channel-settings-completion";

describe("getOverallChannelSettingsCompletion", () => {
  it("includes the publication schedule in the same setup percentage used by cards", () => {
    const channel = {
      presentationIconId: "icon-1",
      shortDescription: "Short description",
      tgStatUrl: "https://tgstat.com/channel/1",
      defaultInviteLinkId: "invite-1",
      botInviteLinkId: "invite-bot",
      broadcastInviteLinkId: "invite-newsletter",
      audienceTransferInviteLinkId: "invite-transfer",
      folderDefaultInviteLinkIds: ["invite-folder"],
      mutualPromotionInviteLinkIds: ["invite-vp"],
      adBaseCpm: 100,
      targetCpa: 10,
      stopCpaFrom: 20,
      seedDisabled: true,
      preview: {
        hasPublicationSchedule: false,
        sourcesCount: 1,
        systemBotConnection: { connected: true },
      },
    } as never;

    expect(getOverallChannelSettingsCompletion(channel).percent).toBe(83);
    expect(
      getOverallChannelSettingsCompletion(channel, {
        scheduleStatus: "complete",
      }).percent,
    ).toBe(100);
  });

  it("excludes bot setup for channels where bot management is unavailable", () => {
    const channel = {
      presentationIconId: "icon-1",
      shortDescription: "Short description",
      tgStatUrl: "https://tgstat.com/channel/1",
      defaultInviteLinkId: "invite-1",
      botInviteLinkId: "invite-bot",
      broadcastInviteLinkId: "invite-newsletter",
      audienceTransferInviteLinkId: "invite-transfer",
      folderDefaultInviteLinkIds: ["invite-folder"],
      mutualPromotionInviteLinkIds: ["invite-vp"],
      adBaseCpm: 100,
      targetCpa: 10,
      stopCpaFrom: 20,
      seedDisabled: true,
      preview: {
        hasPublicationSchedule: true,
        sourcesCount: 1,
      },
    } as never;

    expect(
      getOverallChannelSettingsCompletion(channel, { includeBot: false })
        .percent,
    ).toBe(100);
  });

  it("does not count Appearance until every required field is configured", () => {
    const channel = {
      presentationIconId: "icon-1",
      shortDescription: "Short description",
      tgStatUrl: "https://tgstat.com/channel/1",
      defaultInviteLinkId: "invite-1",
      broadcastInviteLinkId: "invite-newsletter",
      audienceTransferInviteLinkId: "invite-transfer",
      folderDefaultInviteLinkIds: ["invite-folder"],
      mutualPromotionInviteLinkIds: ["invite-vp"],
      preview: { sourcesCount: 0 },
    } as {
      botInviteLinkId?: string;
    };

    expect(getChannelSettingsCompletion(channel as never).appearance).toBe(
      "empty",
    );

    channel.botInviteLinkId = "invite-bot";
    expect(getChannelSettingsCompletion(channel as never).appearance).toBe(
      "complete",
    );
  });

  it("includes newsletter and audience-transfer links in setup progress", () => {
    const channel = {
      presentationIconId: "icon-1",
      shortDescription: "Short description",
      tgStatUrl: "https://tgstat.com/channel/1",
      defaultInviteLinkId: "invite-1",
      botInviteLinkId: "invite-bot",
      folderDefaultInviteLinkIds: ["invite-folder"],
      mutualPromotionInviteLinkIds: ["invite-vp"],
    } as Record<string, unknown>;

    expect(getChannelSettingsCompletion(channel as never).appearance).toBe(
      "empty",
    );

    channel.broadcastInviteLinkId = "invite-newsletter";
    channel.audienceTransferInviteLinkId = "invite-transfer";
    expect(getChannelSettingsCompletion(channel as never).appearance).toBe(
      "complete",
    );
  });
});
