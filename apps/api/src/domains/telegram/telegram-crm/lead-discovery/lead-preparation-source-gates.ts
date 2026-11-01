import type { TelegramLeadSource } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { TelegramLeadPolicy } from './lead-policy.service';
/** A single bounded catalog check shared by selected context and collection freshness. */
export async function leadUnapprovedOwnSourceIds(
  prisma: PrismaService,
  workspaceId: string,
  sources: TelegramLeadSource[],
) {
  const telegram = sources.filter(
    (source) => source.type === 'TELEGRAM_CHANNEL' && !source.allowOwnChannel,
  );
  if (!telegram.length) return new Set<string>();
  const own = await prisma.telegramChannel.findMany({
    where: {
      workspaceId,
      OR: [
        {
          telegramChatId: {
            in: telegram.flatMap((source) =>
              source.channelId
                ? [source.channelId, `-100${source.channelId}`]
                : [],
            ),
          },
        },
        {
          username: {
            in: telegram.flatMap((source) =>
              source.username ? [source.username] : [],
            ),
            mode: 'insensitive',
          },
        },
      ],
    },
    select: { telegramChatId: true, username: true },
    take: 1001,
  });
  if (own.length > 1000) return new Set(telegram.map((source) => source.id));
  return new Set(
    telegram
      .filter((source) =>
        own.some(
          (channel) =>
            (source.channelId &&
              channel.telegramChatId?.replace(/^-100/, '') ===
                source.channelId) ||
            (source.username &&
              channel.username?.toLowerCase() ===
                source.username.toLowerCase()),
        ),
      )
      .map((source) => source.id),
  );
}
export async function leadEligiblePreparationSources(
  prisma: PrismaService,
  policy: TelegramLeadPolicy,
  workspaceId: string,
) {
  const sources = await prisma.telegramLeadSource.findMany({
    where: { workspaceId },
    take: 1001,
  });
  if (sources.length > 1000) return [];
  const own = await leadUnapprovedOwnSourceIds(prisma, workspaceId, sources);
  return sources
    .filter((source) => {
      try {
        policy.assertProcessing(source, 'ai', false);
        return !own.has(source.id);
      } catch {
        return false;
      }
    })
    .map((source) => source.id);
}
