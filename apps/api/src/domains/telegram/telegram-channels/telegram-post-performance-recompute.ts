import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { flagCrossPromotionPosts } from './telegram-post-performance-cross-promotion';
import {
  computeTelegramPostPerformance,
  TELEGRAM_POST_PERFORMANCE_LOOKBACK_DAYS,
  TELEGRAM_POST_PERFORMANCE_METHOD_VERSION,
} from './telegram-post-performance-math';

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 500;
const RECALC_AFTER_MS = 20 * 60 * 60 * 1000;

const performancePostSelect = {
  id: true,
  telegramChannelId: true,
  telegramMessageId: true,
  text: true,
  formattedText: true,
  postDate: true,
  viewsCount: true,
  reactionsCount: true,
  forwardsCount: true,
  commentsCount: true,
  hasMedia: true,
  mediaKind: true,
  imageUrls: true,
  excludeFromAnalytics: true,
  metricSnapshots: {
    select: {
      collectedAt: true,
      viewsCount: true,
      reactionsCount: true,
      forwardsCount: true,
      commentsCount: true,
    },
    orderBy: { collectedAt: 'asc' as const },
  },
  adSalePlacements: { select: { id: true } },
  managedPosts: {
    select: {
      id: true,
      aiPostingGeneration: { select: { id: true } },
      adSalePlacements: { select: { id: true } },
      mutualPromotionDelivery: { select: { id: true } },
    },
  },
} as const;

export type PerformanceChannelSetting = {
  telegramChannelId: string;
  workspaceId: string;
  timezone: string;
};

export async function recomputeTelegramPostPerformanceBatch(
  prisma: PrismaService,
  settings: PerformanceChannelSetting[],
  priorityIds: string[],
  now = new Date(),
  batchLimit = BATCH_SIZE,
) {
  if (!settings.length) return 0;
  priorityIds = [...new Set(priorityIds)].slice(0, batchLimit);
  const channelIds = settings.map((item) => item.telegramChannelId);
  const staleBefore = new Date(now.getTime() - RECALC_AFTER_MS);
  const priorityRows = priorityIds.length
    ? await prisma.telegramPost.findMany({
        where: { id: { in: priorityIds } },
        select: performancePostSelect,
      })
    : [];
  const backfillRows = await prisma.telegramPost.findMany({
    where: {
      telegramChannelId: { in: channelIds },
      OR: [
        { performance: null },
        {
          performance: {
            is: {
              methodVersion: { not: TELEGRAM_POST_PERFORMANCE_METHOD_VERSION },
            },
          },
        },
        {
          postDate: { gte: new Date(now.getTime() - 8 * DAY_MS) },
          performance: { is: { computedAt: { lt: staleBefore } } },
        },
      ],
      ...(priorityIds.length ? { id: { notIn: priorityIds } } : {}),
    },
    orderBy: { postDate: 'asc' },
    take: Math.max(0, batchLimit - priorityRows.length),
    select: performancePostSelect,
  });
  const rows = [...priorityRows, ...backfillRows];
  if (!rows.length) return 0;
  const settingsByChannel = new Map(
    settings.map((item) => [item.telegramChannelId, item]),
  );
  const operations: Prisma.PrismaPromise<unknown>[] = [];
  for (const channelId of [
    ...new Set(rows.map((row) => row.telegramChannelId)),
  ]) {
    const channelRows = rows.filter(
      (row) => row.telegramChannelId === channelId,
    );
    const firstDate = Math.min(
      ...channelRows.map((row) => row.postDate.getTime()),
    );
    const lastDate = Math.max(
      ...channelRows.map((row) => row.postDate.getTime()),
    );
    const comparableRows = await prisma.telegramPost.findMany({
      where: {
        telegramChannelId: channelId,
        postDate: {
          gte: new Date(
            firstDate - TELEGRAM_POST_PERFORMANCE_LOOKBACK_DAYS * DAY_MS,
          ),
          lte: new Date(lastDate),
        },
      },
      select: performancePostSelect,
    });
    const allRows = new Map(
      [...comparableRows, ...channelRows].map((row) => [row.id, row]),
    );
    const mapped = await flagCrossPromotionPosts(prisma, channelId, [
      ...allRows.values(),
    ]);
    const mappedById = new Map(mapped.map((row) => [row.id, row]));
    const comparable = [...mappedById.values()];
    const timezone = settingsByChannel.get(channelId)?.timezone || 'UTC';
    for (const row of channelRows) {
      const input = mappedById.get(row.id);
      if (!input) continue;
      const result = computeTelegramPostPerformance(
        input,
        comparable.filter((candidate) => candidate.id !== row.id),
        timezone,
        now,
      );
      operations.push(
        prisma.telegramPostPerformance.upsert({
          where: { telegramPostId: row.id },
          create: result,
          update: result,
          select: { telegramPostId: true },
        }),
      );
    }
  }
  if (operations.length) await prisma.$transaction(operations);
  return operations.length;
}

export async function recomputeTelegramPostPerformanceForChannel(
  prisma: PrismaService,
  workspaceId: string,
  channelId: string,
  postIds: string[],
  now = new Date(),
) {
  const setting = await prisma.telegramAiPostingSettings.findFirst({
    where: { workspaceId, telegramChannelId: channelId },
    select: {
      workspaceId: true,
      telegramChannelId: true,
      telegramChannel: {
        select: { workspace: { select: { timezone: true } } },
      },
    },
  });
  if (!setting) return 0;
  return recomputeTelegramPostPerformanceBatch(
    prisma,
    [
      {
        workspaceId: setting.workspaceId,
        telegramChannelId: setting.telegramChannelId,
        timezone: setting.telegramChannel.workspace?.timezone || 'UTC',
      },
    ],
    postIds,
    now,
  );
}
