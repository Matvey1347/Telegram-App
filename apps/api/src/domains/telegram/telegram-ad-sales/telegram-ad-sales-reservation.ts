import { TelegramAdPlacementStatus } from '@prisma/client';

export const ACTIVE_TELEGRAM_AD_PLACEMENT_STATUSES: TelegramAdPlacementStatus[] =
  [
    TelegramAdPlacementStatus.RESERVED,
    TelegramAdPlacementStatus.SCHEDULED,
    TelegramAdPlacementStatus.PUBLISHED,
    TelegramAdPlacementStatus.COMPLETED,
  ];

export function telegramAdSalesAdvisoryLockKey(
  channelId: string,
  dateKey: string,
) {
  const source = `${channelId}:${dateKey}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) | 0;
  }
  return hash;
}
