import { allocateTelegramAdSalesTotalPrice } from '@telegram-system/shared';

export type TelegramAdSalesBotPriceShare = {
  channelId: string;
  amount: number;
};

export function splitTelegramAdSalesBotTotalPrice(
  total: number,
  channelIds: string[],
  audienceByChannelId: Record<string, number | null | undefined> = {},
): TelegramAdSalesBotPriceShare[] {
  const normalizedIds = channelIds.map((id) => id.trim()).filter(Boolean);
  const sortedIds = [...normalizedIds].sort((left, right) =>
    left.localeCompare(right),
  );
  return allocateTelegramAdSalesTotalPrice(
    total,
    sortedIds.map((channelId) => ({
      key: channelId,
      weight: audienceByChannelId[channelId],
    })),
  ).map((share) => ({ channelId: share.key, amount: share.amount }));
}
