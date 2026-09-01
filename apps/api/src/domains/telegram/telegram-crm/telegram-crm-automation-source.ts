import { createHash } from 'node:crypto';
import { buildStableTelegramPostUrl } from '../../../telegram/shared/telegram-post-url';
import { CrmAutomationSaleRow } from './telegram-crm-automation-sale';

export type CrmAutomationPostIdentity = {
  telegramPost: { telegramMessageId: string } | null;
  telegramChannel: { username: string | null; telegramChatId: string | null };
};

export function crmAutomationSourceFingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function crmAutomationPostUrl(placement: CrmAutomationPostIdentity) {
  const messageId = placement.telegramPost?.telegramMessageId;
  if (!messageId || !/^\d+$/.test(messageId)) return null;
  const username = placement.telegramChannel.username?.trim().replace(/^@/, '');
  if (username && /^[a-zA-Z0-9_]{5,}$/.test(username)) {
    return `https://t.me/${username}/${messageId}`;
  }
  return buildStableTelegramPostUrl({
    telegramChatId: placement.telegramChannel.telegramChatId,
    messageId,
  });
}

export function crmPublishedPlacementSource(
  sale: Pick<CrmAutomationSaleRow, 'placements'>,
) {
  if (
    !sale.placements.length ||
    sale.placements.some(
      (placement) =>
        !['PUBLISHED', 'COMPLETED'].includes(placement.status) ||
        !placement.publishedAt ||
        !placement.telegramPost?.telegramMessageId ||
        !crmAutomationPostUrl(placement),
    )
  ) {
    return null;
  }
  const eventOccurredAt = new Date(
    Math.max(...sale.placements.map((item) => item.publishedAt!.getTime())),
  );
  const placements = sale.placements.map((item) => ({
    channelTitle: item.telegramChannel.title,
    scheduledAt: item.publishedAt!,
    timezone: item.timezone,
    url: crmAutomationPostUrl(item),
  }));
  return {
    eventOccurredAt,
    placements,
    sourceVersion: crmAutomationSourceFingerprint(
      sale.placements.map((item) => ({
        id: item.id,
        status: item.status,
        publishedAt: item.publishedAt!.toISOString(),
        telegramMessageId: item.telegramPost!.telegramMessageId,
        channelTitle: item.telegramChannel.title,
        url: crmAutomationPostUrl(item),
      })),
    ),
  };
}
