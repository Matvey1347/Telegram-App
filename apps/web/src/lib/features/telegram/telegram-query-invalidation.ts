import type { QueryClient } from "@tanstack/react-query";
import type { TelegramQrLoginAccount } from "@telegram-system/shared";
import {
  adCampaignKeys,
  telegramAccountKeys,
  telegramChannelKeys,
  telegramPostKeys,
} from "../../query-keys";
import { patchTelegramChannelCaches } from "./telegram-channel-cache";
import type { TelegramChannel } from "@/lib/api-types/telegram/telegram-channels";
import type { TelegramUserAccount } from "@/lib/api-types/telegram/telegram-sources";

function serializedDate(value: string | null | undefined) {
  return value ?? undefined;
}

/** Reuses the authoritative login result and refetches only sync-derived reads. */
export async function reconcileTelegramQrLoginSuccess(
  queryClient: QueryClient,
  account: TelegramQrLoginAccount,
) {
  queryClient.setQueryData<TelegramUserAccount[]>(
    telegramAccountKeys.accounts(),
    (current = []) =>
      current.map((existing) =>
        existing.id === account.id
          ? {
              ...existing,
              ...account,
              phoneMasked: account.phoneMasked ?? undefined,
              telegramUserId: account.telegramUserId ?? undefined,
              username: account.username ?? undefined,
              firstName: account.firstName ?? undefined,
              lastName: account.lastName ?? undefined,
              photoUrl: account.photoUrl ?? undefined,
              nameColor: account.nameColor ?? undefined,
              premiumCheckedAt: serializedDate(account.premiumCheckedAt),
              lastErrorMessage: account.lastErrorMessage ?? undefined,
              lastCheckedAt: serializedDate(account.lastCheckedAt),
              lastSyncedAt: serializedDate(account.lastSyncedAt),
            }
          : existing,
      ),
  );

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: telegramAccountKeys.accounts() }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.sourceChannels(),
    }),
    queryClient.invalidateQueries({ queryKey: telegramChannelKeys.sources() }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.publishingCapabilities(),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.analyticsSources(),
    }),
    queryClient.invalidateQueries({ queryKey: telegramChannelKeys.lists() }),
  ]);
}

/** A settings PATCH returns the channel; only its derived read models need GETs. */
export async function reconcileTelegramChannelSettings(
  queryClient: QueryClient,
  channel: TelegramChannel,
) {
  patchTelegramChannelCaches(queryClient, channel);
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.analytics(channel.id),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.audience(channel.id),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.financialSummary(channel.id),
    }),
  ]);
}

export async function invalidateTelegramAccessQueries(
  queryClient: QueryClient,
  { includeBots = true }: { includeBots?: boolean } = {},
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: telegramAccountKeys.accounts() }),
    ...(includeBots
      ? [
          queryClient.invalidateQueries({
            queryKey: telegramAccountKeys.bots(),
          }),
        ]
      : []),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.sourceChannels(),
    }),
    queryClient.invalidateQueries({ queryKey: telegramChannelKeys.sources() }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.publishingCapabilities(),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.analyticsSources(),
    }),
    queryClient.invalidateQueries({ queryKey: telegramChannelKeys.list() }),
  ]);
}

export async function invalidateTelegramChannelQueries(
  queryClient: QueryClient,
  channelId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: telegramChannelKeys.list() }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.detail(channelId),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.analytics(channelId),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramPostKeys.channelPosts(channelId),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.analyticsSources(channelId),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.audience(channelId),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.financialSummary(channelId),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.inviteLinks(channelId),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.audienceSnapshots(channelId),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramPostKeys.managedLists(channelId),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramPostKeys.managedCalendar(channelId),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramPostKeys.postGroups(channelId),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramPostKeys.linkTargets(channelId),
    }),
    queryClient.invalidateQueries({ queryKey: adCampaignKeys.list() }),
    queryClient.invalidateQueries({ queryKey: adCampaignKeys.performance() }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.campaigns(channelId),
    }),
  ]);
}
