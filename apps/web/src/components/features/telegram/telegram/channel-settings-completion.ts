import type { TelegramChannel } from "@/lib/api";
import type { ChannelSettingsDraft } from "./channel-settings-draft";

export type ChannelSettingsCompletionStatus = "empty" | "partial" | "complete";

type OverallCompletionOptions = {
  draft?: ChannelSettingsDraft;
  includeBot?: boolean;
  scheduleStatus?: ChannelSettingsCompletionStatus;
};

function positive(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function completionFromValues(
  values: boolean[],
): ChannelSettingsCompletionStatus {
  const configured = values.filter(Boolean).length;
  if (configured === 0) return "empty";
  return configured === values.length ? "complete" : "partial";
}

export function getChannelSettingsCompletion(
  channel: TelegramChannel,
  draft?: ChannelSettingsDraft,
) {
  const botConnection = channel.preview?.systemBotConnection;
  const sourcesCount = channel.preview?.sourcesCount ?? 0;
  return {
    appearance: [
      Boolean(
        draft?.presentationIconId ||
        channel.presentationIconId ||
        channel.presentationIconPresentation,
      ),
      Boolean((draft?.tgStatUrl ?? channel.tgStatUrl)?.trim()),
      Boolean((draft?.description ?? channel.shortDescription)?.trim()),
      Boolean(draft?.defaultInviteLinkId ?? channel.defaultInviteLinkId),
      Boolean(draft?.botInviteLinkId ?? channel.botInviteLinkId),
      (
        draft?.folderDefaultInviteLinkIds ??
        channel.folderDefaultInviteLinkIds ??
        []
      ).length > 0,
      (
        draft?.mutualPromotionInviteLinkIds ??
        channel.mutualPromotionInviteLinkIds ??
        []
      ).length > 0,
    ].every(Boolean)
      ? "complete"
      : "empty",
    economics: completionFromValues([
      positive(draft?.adBaseCpm ?? channel.adBaseCpm),
      positive(draft?.targetCpa ?? channel.targetCpa),
      positive(draft?.stopCpaFrom ?? channel.stopCpaFrom),
    ]),
    seed:
      (draft?.seedDisabled ?? channel.seedDisabled)
        ? "complete"
        : completionFromValues([
            positive(
              draft?.seedSubscribersCount ?? channel.seedSubscribersCount,
            ),
            positive(
              draft?.knownFakeSubscribersCount ??
                channel.knownFakeSubscribersCount,
            ),
            positive(draft?.ownViewsPerPost ?? channel.ownViewsPerPost),
            positive(draft?.ownReactionsPerPost ?? channel.ownReactionsPerPost),
          ]),
    bot: botConnection?.connected
      ? "complete"
      : botConnection &&
          !["UNVERIFIED", "NOT_CONFIGURED"].includes(botConnection.status)
        ? "partial"
        : "empty",
    sources:
      sourcesCount > 0
        ? (draft?.autoSyncEnabled ?? channel.autoSyncEnabled) === false
          ? "partial"
          : "complete"
        : "empty",
  } as const;
}

export function getOverallChannelSettingsCompletion(
  channel: TelegramChannel,
  {
    draft,
    includeBot = true,
    scheduleStatus = channel.preview?.hasPublicationSchedule
      ? "complete"
      : "empty",
  }: OverallCompletionOptions = {},
) {
  const completion = getChannelSettingsCompletion(channel, draft);
  const statuses: ChannelSettingsCompletionStatus[] = [
    completion.appearance,
    completion.economics,
    scheduleStatus,
    completion.seed,
    ...(includeBot ? [completion.bot] : []),
    completion.sources,
  ];
  const score = statuses.reduce(
    (total, status) =>
      total + (status === "complete" ? 1 : status === "partial" ? 0.5 : 0),
    0,
  );

  return {
    percent: Math.round((score / statuses.length) * 100),
    statuses,
  };
}
