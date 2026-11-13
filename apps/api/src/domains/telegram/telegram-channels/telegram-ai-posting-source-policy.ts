import type { Prisma } from '@prisma/client';

const TELEGRAM_CHANNEL_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export function isValidTelegramAiPostingSourceId(value: unknown): value is string {
  return typeof value === 'string' && TELEGRAM_CHANNEL_ID_PATTERN.test(value);
}

export function telegramAiPostingSourceWhere(
  workspaceId: string,
  targetChannelId: string,
  sourceChannelIds?: readonly string[],
): Prisma.TelegramChannelWhereInput {
  return {
    workspaceId,
    isActive: true,
    id: {
      not: targetChannelId,
      ...(sourceChannelIds ? { in: [...sourceChannelIds] } : {}),
    },
    adminLinks: { some: {} },
  };
}
