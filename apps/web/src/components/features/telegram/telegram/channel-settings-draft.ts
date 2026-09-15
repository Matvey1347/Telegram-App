import type { TelegramChannel } from "@/lib/api";
import {
  DEFAULT_TELEGRAM_CHANNEL_POST_SYNC_LIMIT,
  MAX_TELEGRAM_CHANNEL_POST_SYNC_LIMIT,
} from "@telegram-system/shared";

export type ChannelSettingsDraft = {
  presentationIconId: string;
  description: string;
  tgStatUrl: string;
  defaultInviteLinkId: string;
  botInviteLinkId: string;
  folderDefaultInviteLinkIds: string[];
  mutualPromotionInviteLinkIds: string[];
  adBaseCpm: string;
  adBaseCurrency: string;
  targetCpa: string;
  stopCpaFrom: string;
  seedDisabled: boolean;
  seedSubscribersCount: string;
  knownFakeSubscribersCount: string;
  ownViewsPerPost: string;
  ownReactionsPerPost: string;
  autoSyncEnabled: boolean;
  postSyncLimit: number;
};

export function createChannelSettingsDraft(
  channel: TelegramChannel,
): ChannelSettingsDraft {
  return {
    presentationIconId: channel.presentationIconId || "",
    description: channel.shortDescription || "",
    tgStatUrl: channel.tgStatUrl || "",
    defaultInviteLinkId: channel.defaultInviteLinkId || "",
    botInviteLinkId: channel.botInviteLinkId || "",
    folderDefaultInviteLinkIds: channel.folderDefaultInviteLinkIds ?? [],
    mutualPromotionInviteLinkIds: channel.mutualPromotionInviteLinkIds ?? [],
    adBaseCpm: channel.adBaseCpm == null ? "" : String(channel.adBaseCpm),
    adBaseCurrency: channel.adBaseCurrency || channel.kpiCurrency || "USD",
    targetCpa: channel.targetCpa == null ? "" : String(channel.targetCpa),
    stopCpaFrom: channel.stopCpaFrom == null ? "" : String(channel.stopCpaFrom),
    seedDisabled: channel.seedDisabled ?? false,
    seedSubscribersCount: String(channel.seedSubscribersCount ?? 0),
    knownFakeSubscribersCount: String(channel.knownFakeSubscribersCount ?? 0),
    ownViewsPerPost: String(channel.ownViewsPerPost ?? 0),
    ownReactionsPerPost: String(channel.ownReactionsPerPost ?? 0),
    autoSyncEnabled: channel.autoSyncEnabled ?? true,
    postSyncLimit:
      channel.postSyncLimit ?? DEFAULT_TELEGRAM_CHANNEL_POST_SYNC_LIMIT,
  };
}

function nonNegative(value: string) {
  return Math.max(0, Number(value) || 0);
}

function optionalNumber(value: string) {
  return value.trim() ? nonNegative(value) : null;
}

export function buildChannelSettingsPayload(draft: ChannelSettingsDraft) {
  const seedValue = (value: string) =>
    draft.seedDisabled ? 0 : nonNegative(value);
  return {
    presentationIconId: draft.presentationIconId || null,
    shortDescription: draft.description.trim() || null,
    tgStatUrl: draft.tgStatUrl.trim() || null,
    defaultInviteLinkId: draft.defaultInviteLinkId || null,
    botInviteLinkId: draft.botInviteLinkId || null,
    folderDefaultInviteLinkIds: draft.folderDefaultInviteLinkIds,
    mutualPromotionInviteLinkIds: draft.mutualPromotionInviteLinkIds,
    adBaseCpm: optionalNumber(draft.adBaseCpm),
    adBaseCurrency: draft.adBaseCurrency,
    kpiCurrency: draft.adBaseCurrency,
    targetCpa: optionalNumber(draft.targetCpa),
    stopCpaFrom: optionalNumber(draft.stopCpaFrom),
    seedDisabled: draft.seedDisabled,
    seedSubscribersCount: seedValue(draft.seedSubscribersCount),
    knownFakeSubscribersCount: seedValue(draft.knownFakeSubscribersCount),
    ownViewsPerPost: seedValue(draft.ownViewsPerPost),
    ownReactionsPerPost: seedValue(draft.ownReactionsPerPost),
    autoSyncEnabled: draft.autoSyncEnabled,
    postSyncLimit: draft.postSyncLimit,
  };
}

export function channelSettingsDraftIsInvalid(draft: ChannelSettingsDraft) {
  const numericValues = [draft.adBaseCpm, draft.targetCpa, draft.stopCpaFrom];
  const hasInvalidNumber = numericValues.some(
    (value) =>
      value.trim() && (!Number.isFinite(Number(value)) || Number(value) < 0),
  );
  const hasInvalidKpi =
    draft.targetCpa.trim() &&
    draft.stopCpaFrom.trim() &&
    Number(draft.targetCpa) >= Number(draft.stopCpaFrom);
  const hasInvalidPostSyncLimit =
    !Number.isInteger(draft.postSyncLimit) ||
    draft.postSyncLimit < 1 ||
    draft.postSyncLimit > MAX_TELEGRAM_CHANNEL_POST_SYNC_LIMIT;
  return Boolean(hasInvalidNumber || hasInvalidKpi || hasInvalidPostSyncLimit);
}
