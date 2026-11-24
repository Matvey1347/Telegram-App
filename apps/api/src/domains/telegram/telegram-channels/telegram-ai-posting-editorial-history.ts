import type { PrismaService } from '../../../prisma/prisma.service';

export async function readAiPostingEditorialHistory(
  prisma: PrismaService,
  workspaceId: string,
  channelId: string,
  historyMode: string,
  historyFrom?: string,
) {
  const rows = await prisma.telegramManagedPost.findMany({
    where: {
      workspaceId,
      telegramChannelId: channelId,
      OR: [
        { aiPostingSphereId: { not: null } },
        { aiPostingRubricId: { not: null } },
      ],
      AND: [
        {
          OR: [
            {
              status: 'DRAFT',
              aiPostingReviewStatus: 'APPROVED',
              aiPostingRecheckRequired: false,
              imageUrls: { isEmpty: false },
            },
            { status: 'SCHEDULED' },
            { status: 'PUBLISHED' },
          ],
        },
      ],
      adSalePlacements: { none: {} },
      mutualPromotionDelivery: { is: null },
      postBatchDelivery: { is: null },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: {
      title: true,
      aiPostingSphereId: true,
      aiPostingRubricId: true,
      telegramPost: {
        select: {
          performance: {
            select: {
              scoreFinal: true,
              score24h: true,
              excludedFromNorm: true,
              publishedAt: true,
              origin: true,
            },
          },
        },
      },
    },
  });
  const since =
    historyMode === 'since' && historyFrom ? Date.parse(historyFrom) : 0;
  const cutoff = Math.max(Date.now() - 60 * 86_400_000, since || 0);
  const performanceByRubric = new Map<string, number[]>();
  for (const row of rows) {
    const sample = row.telegramPost?.performance;
    if (
      !row.aiPostingRubricId ||
      !sample ||
      sample.excludedFromNorm ||
      +sample.publishedAt < cutoff ||
      ['AD', 'MUTUAL_PROMO'].includes(sample.origin) ||
      historyMode === 'none'
    )
      continue;
    const score = sample.scoreFinal ?? sample.score24h;
    if (score == null || !Number.isFinite(score)) continue;
    const scores = performanceByRubric.get(row.aiPostingRubricId) ?? [];
    scores.push(score);
    performanceByRubric.set(row.aiPostingRubricId, scores);
  }
  const rubricBoost = new Map<string, number>();
  for (const [rubricId, scores] of performanceByRubric) {
    if (scores.length >= 5) {
      const median = scores.sort((left, right) => left - right)[
        Math.floor(scores.length / 2)
      ];
      // A strong rubric can gain at most one extra place before usage balances it again.
      rubricBoost.set(rubricId, median >= 1.25 ? 1 : median < 0.75 ? -1 : 0);
    }
  }
  return {
    rubricBoost,
    titles: rows.slice(0, 60).map(({ title }) => title),
    usage: rows.map((row) => ({
      sphere: row.aiPostingSphereId ? { id: row.aiPostingSphereId } : null,
      rubric: row.aiPostingRubricId ? { id: row.aiPostingRubricId } : null,
    })),
  };
}
