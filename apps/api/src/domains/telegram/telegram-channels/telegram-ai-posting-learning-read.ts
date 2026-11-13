import type { PrismaService } from '../../../prisma/prisma.service';
import { buildTelegramAiPostingLearningBlock } from './telegram-ai-posting-learning';

export async function readTelegramAiPostingLearningBlock(
  prisma: PrismaService,
  channelId: string,
  config: Record<string, unknown>,
) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  if (
    config.historyMode === 'since' &&
    typeof config.historyFrom === 'string'
  ) {
    const configured = new Date(config.historyFrom);
    if (!Number.isNaN(configured.getTime()) && configured > cutoff)
      cutoff.setTime(configured.getTime());
  }
  if (config.historyMode === 'none')
    return buildTelegramAiPostingLearningBlock([], {
      historyMode: 'none',
      now,
    });
  const performanceModel = (
    prisma as unknown as {
      telegramPostPerformance?: PrismaService['telegramPostPerformance'];
    }
  ).telegramPostPerformance;
  const rows = performanceModel
    ? await performanceModel.findMany({
        where: {
          telegramPost: { telegramChannelId: channelId },
          publishedAt: { gte: cutoff, lte: now },
        },
        orderBy: { publishedAt: 'desc' },
        take: 5_000,
        select: {
          origin: true,
          score24h: true,
          scoreFinal: true,
          publishedAt: true,
          excludedFromNorm: true,
          lengthBand: true,
          hasMedia: true,
          endsWithQuestion: true,
          telegramPost: { select: { text: true, formattedText: true } },
        },
      })
    : [];
  return buildTelegramAiPostingLearningBlock(
    rows.map((row) => ({ ...row, ...row.telegramPost })),
    {
      historyMode: config.historyMode as string,
      historyFrom: config.historyFrom as string,
      now,
    },
  );
}
