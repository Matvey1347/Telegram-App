import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramPostMetricsService } from './telegram-post-metrics.service';
import { buildTelegramAiPostingPerformanceReadModel } from './telegram-ai-posting-performance-read';
import {
  dueAgeTargetsInPreviousHour,
  selectMetricSnapshotAtWindow,
  type PerformanceSnapshot,
} from './telegram-post-performance-math';
import {
  recomputeTelegramPostPerformanceForChannel,
  recomputeTelegramPostPerformanceBatch,
  type PerformanceChannelSetting,
} from './telegram-post-performance-recompute';

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 500;
type DuePost = {
  id: string;
  telegramChannelId: string;
  postDate: Date;
  metricSnapshots: PerformanceSnapshot[];
};

@Injectable()
export class TelegramAiPostingPerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly postMetrics: TelegramPostMetricsService,
  ) {}

  async read(userId: string, channelId: string, daysValue?: number) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const hasSettings = await this.prisma.telegramAiPostingSettings.findFirst({
      where: { workspaceId, telegramChannelId: channelId },
      select: { id: true },
    });
    if (!hasSettings)
      throw new NotFoundException('AI_POSTING_SETTINGS_REQUIRED');
    const days = daysValue ?? 28;
    if (!Number.isInteger(days) || days < 1 || days > 365)
      throw new BadRequestException('AI_POSTING_PERFORMANCE_RANGE_INVALID');
    const now = new Date();
    const from = new Date(now.getTime() - days * DAY_MS);
    const rows = await this.prisma.telegramPostPerformance.findMany({
      where: {
        telegramPost: { telegramChannelId: channelId },
        publishedAt: { gte: from, lte: now },
      },
      orderBy: { publishedAt: 'desc' },
      take: 5_000,
      select: {
        telegramPostId: true,
        origin: true,
        publishedAt: true,
        views24h: true,
        views72h: true,
        views168h: true,
        score24h: true,
        scoreFinal: true,
        norm24h: true,
        normSampleSize: true,
        normReason: true,
        engagementPer1k24h: true,
        lengthBand: true,
        hasMedia: true,
        endsWithQuestion: true,
        publishHour: true,
        publishWeekday: true,
        excludedReason: true,
        manualClassification: true,
        telegramPost: { select: { text: true, formattedText: true } },
      },
    });
    return {
      channelId,
      from,
      to: now,
      days,
      ...buildTelegramAiPostingPerformanceReadModel(rows),
    };
  }

  async classifyPosts(
    userId: string,
    channelId: string,
    telegramPostIds: string[],
    classification: 'AD' | 'MUTUAL_PROMO' | 'EXCLUDED' | null,
  ) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const ids = [...new Set(telegramPostIds)].slice(0, 100);
    if (!ids.length || ids.length !== new Set(telegramPostIds).size)
      throw new BadRequestException('AI_POSTING_PERFORMANCE_POST_IDS_INVALID');
    const posts = await this.prisma.telegramPost.findMany({
      where: { id: { in: ids }, telegramChannelId: channelId },
      select: { id: true },
    });
    if (posts.length !== ids.length)
      throw new NotFoundException('AI_POSTING_PERFORMANCE_POST_NOT_FOUND');
    await this.prisma.telegramPostPerformance.updateMany({
      where: {
        telegramPostId: { in: ids },
        telegramPost: { telegramChannelId: channelId },
      },
      data: { manualClassification: classification },
    });
    await recomputeTelegramPostPerformanceForChannel(
      this.prisma,
      workspaceId,
      channelId,
      ids,
    );
    return { updated: ids.length, classification };
  }

  async processScheduledBatch(now = new Date()) {
    const settings = await this.channelSettings();
    if (!settings.length)
      return { dueChannels: 0, syncedChannels: 0, backfilled: 0, failed: 0 };
    const channels = new Map(
      settings.map((item) => [item.telegramChannelId, item]),
    );
    const channelIds = [...channels.keys()];
    const duePosts = await this.dueAgePosts(channelIds, now);
    const dueByChannel = new Map<string, DuePost[]>();
    for (const post of duePosts) {
      const neededTargets = dueAgeTargetsInPreviousHour(
        post.postDate,
        now,
      ).filter(
        (target) =>
          !selectMetricSnapshotAtWindow(
            post.postDate,
            post.metricSnapshots,
            target.hours,
            target.toleranceHours,
            now,
          ),
      );
      if (!neededTargets.length) continue;
      dueByChannel.set(post.telegramChannelId, [
        ...(dueByChannel.get(post.telegramChannelId) ?? []),
        post,
      ]);
    }

    const postCounts = await this.prisma.telegramPost.groupBy({
      by: ['telegramChannelId'],
      where: {
        telegramChannelId: { in: channelIds },
        postDate: { gte: new Date(now.getTime() - 8 * DAY_MS), lte: now },
      },
      _count: { _all: true },
    });
    const countsByChannel = new Map(
      postCounts.map((row) => [row.telegramChannelId, row._count._all]),
    );
    const priorityIds: string[] = [];
    let syncedChannels = 0;
    let failed = 0;
    for (const [channelId, posts] of dueByChannel) {
      const channel = channels.get(channelId);
      if (!channel) continue;
      try {
        await this.postMetrics.syncPostsMetricsForWorkspace(
          channel.workspaceId,
          channelId,
          {
            postLimit: (countsByChannel.get(channelId) ?? 0) + 5,
            captureAgeSnapshots: true,
          },
        );
        syncedChannels += 1;
        priorityIds.push(...posts.map((post) => post.id));
      } catch {
        failed += 1;
      }
    }
    const backfilled = await recomputeTelegramPostPerformanceBatch(
      this.prisma,
      settings,
      priorityIds,
      now,
    );
    return {
      dueChannels: dueByChannel.size,
      syncedChannels,
      backfilled,
      failed,
    };
  }

  async backfillBatch(limit = BATCH_SIZE, now = new Date()) {
    return recomputeTelegramPostPerformanceBatch(
      this.prisma,
      await this.channelSettings(),
      [],
      now,
      limit,
    );
  }

  private async channelSettings(): Promise<PerformanceChannelSetting[]> {
    const rows = await this.prisma.telegramAiPostingSettings.findMany({
      where: { telegramChannel: { isActive: true } },
      select: {
        workspaceId: true,
        telegramChannelId: true,
        telegramChannel: {
          select: { workspace: { select: { timezone: true } } },
        },
      },
    });
    return rows.map((row) => ({
      workspaceId: row.workspaceId,
      telegramChannelId: row.telegramChannelId,
      timezone: row.telegramChannel.workspace?.timezone || 'UTC',
    }));
  }

  private async dueAgePosts(
    channelIds: string[],
    now: Date,
  ): Promise<DuePost[]> {
    return this.prisma.telegramPost.findMany({
      where: {
        telegramChannelId: { in: channelIds },
        postDate: {
          gte: new Date(now.getTime() - (168 + 1) * 60 * 60 * 1000),
          lte: new Date(now.getTime() - 23 * 60 * 60 * 1000),
        },
      },
      select: {
        id: true,
        telegramChannelId: true,
        postDate: true,
        metricSnapshots: {
          where: { collectedAt: { gte: new Date(now.getTime() - 8 * DAY_MS) } },
          select: {
            collectedAt: true,
            viewsCount: true,
            reactionsCount: true,
            forwardsCount: true,
            commentsCount: true,
          },
          orderBy: { collectedAt: 'asc' },
        },
      },
    });
  }
}
