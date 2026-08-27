import { BadRequestException, Injectable } from '@nestjs/common';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramChannelPostsQueryDto } from './dto';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelAnalyticsService } from './telegram-channel-analytics.service';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';

@Injectable()
export class TelegramChannelContentReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: TelegramChannelAnalyticsService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramChannelCatalogService: TelegramChannelCatalogService,
  ) {}

  async promosByChannel(userId: string, channelId: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelCatalogService.findOne(userId, channelId);
    return this.prisma.promo.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      include: {
        icon: true,
        telegramChannel: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async posts(
    userId: string,
    channelId: string,
    query: TelegramChannelPostsQueryDto = {},
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const channel = await this.telegramChannelCatalogService.findOne(
      userId,
      channelId,
    );
    const pagination = normalizePagination(query);
    const search = query.search?.trim();
    const fromDate = query.from ? new Date(query.from) : null;
    const toDate = query.to ? new Date(query.to) : null;
    if (
      (fromDate && Number.isNaN(fromDate.getTime())) ||
      (toDate && Number.isNaN(toDate.getTime()))
    ) {
      throw new BadRequestException('Post date range is invalid');
    }
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('Post date range is invalid');
    }
    const where: any = {
      workspaceId,
      telegramChannelId: channelId,
      ...(fromDate || toDate
        ? {
            postDate: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { text: { contains: search, mode: 'insensitive' } },
              {
                formattedText: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                telegramMessageId: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const [items, totalItems] = await Promise.all([
      this.prisma.telegramPost.findMany({
        where,
        orderBy: [{ postDate: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.telegramPost.count({ where }),
    ]);
    return createPaginatedResponse(
      items.map((post) => ({
        ...post,
        imageUrls: post.imageUrls.filter((url) => /^https?:\/\//i.test(url)),
        primaryTelegramMessageUrl:
          this.telegramChannelAccessService.telegramMessageUrl(
            channel,
            post.telegramMessageId,
          ),
      })),
      totalItems,
      pagination,
    );
  }

  async publishedPostsForSelect(userId: string, channelId: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelCatalogService.findOne(userId, channelId);
    return this.prisma.telegramPost.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: [{ postDate: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        telegramMessageId: true,
        postDate: true,
        text: true,
      },
    });
  }

  async analytics(
    userId: string,
    channelId: string,
    from?: string,
    to?: string,
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const channel = await this.telegramChannelCatalogService.findOne(
      userId,
      channelId,
    );
    const fromDate = from
      ? new Date(from)
      : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const toDate = to ? new Date(to) : new Date();
    const maxRangeDays = 366;
    const safeFromDate = Number.isNaN(fromDate.getTime())
      ? new Date(Date.now() - 30 * 24 * 3600 * 1000)
      : fromDate;
    const safeToDate = Number.isNaN(toDate.getTime()) ? new Date() : toDate;
    if (safeFromDate > safeToDate) {
      throw new BadRequestException('from must be before to');
    }
    const maxRangeMs = maxRangeDays * 24 * 3600 * 1000;
    const effectiveFromDate =
      safeToDate.getTime() - safeFromDate.getTime() > maxRangeMs
        ? new Date(safeToDate.getTime() - maxRangeMs)
        : safeFromDate;
    const emptyFinancialSummary = {
      totalAdSpend: 0,
      campaignsCount: 0,
      totalJoinedSubscribers: 0,
      avgCpa: null,
      activeSubscribersEstimate: null,
      paidActiveSubscribersEstimate: null,
      activeCpa: null,
      avgActiveRate: null,
      avgRetention7d: null,
      dataQuality: null,
      dataQualityReason: null,
      dataQualityWarning: null,
      hasExternalTrafficAnomaly: false,
      hasSubscriberBasePollution: false,
      kpiStatus: 'unknown',
      kpiLabel: '-',
    } as const;
    const [
      dailyStats,
      postsAggregate,
      postsTotal,
      inviteLinksAggregate,
      inviteLinksCount,
      financialSummary,
      channelStatsSnapshot,
      channelStatsPoints,
    ] = await Promise.all([
      this.prisma.telegramChannelDailyStats.findMany({
        where: {
          telegramChannelId: channelId,
          date: { gte: effectiveFromDate, lte: safeToDate },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.telegramPost.aggregate({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          postDate: { gte: effectiveFromDate, lte: safeToDate },
        },
        _sum: {
          viewsCount: true,
          forwardsCount: true,
          reactionsCount: true,
          commentsCount: true,
        },
      }),
      this.prisma.telegramPost.count({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          postDate: { gte: effectiveFromDate, lte: safeToDate },
        },
      }),
      this.prisma.telegramInviteLink.aggregate({
        where: { workspaceId, telegramChannelId: channelId },
        _sum: {
          joinedCount: true,
          requestedCount: true,
        },
      }),
      this.prisma.telegramInviteLink.count({
        where: { workspaceId, telegramChannelId: channelId },
      }),
      this.analyticsService
        .getChannelFinancialSummary(channelId)
        .catch(() => emptyFinancialSummary),
      this.prisma.telegramChannelStatsSnapshot.findFirst({
        where: { workspaceId, telegramChannelId: channelId },
        orderBy: { syncedAt: 'desc' },
      }),
      this.prisma.telegramChannelStatsPoint.findMany({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          date: { gte: effectiveFromDate, lte: safeToDate },
        },
        orderBy: [{ date: 'asc' }, { metric: 'asc' }, { series: 'asc' }],
        take: 5000,
      }),
    ]);
    return {
      source: 'mtproto',
      channel,
      summary: {
        subscribersCurrent: channel.currentSubscribersCount ?? null,
        joinedHistoricalByLinks: Number(
          inviteLinksAggregate._sum.joinedCount || 0,
        ),
        joinedToday: null,
        leftToday: null,
        netGrowthToday: null,
        leftTotal: null,
        netGrowth: null,
        inviteLinksCount,
        campaignsCount: financialSummary.campaignsCount,
        postsTotal,
        viewsTotal: Number(postsAggregate._sum.viewsCount || 0),
        forwardsTotal: Number(postsAggregate._sum.forwardsCount || 0),
        reactionsTotal: Number(postsAggregate._sum.reactionsCount || 0),
        commentsTotal: Number(postsAggregate._sum.commentsCount || 0),
        requestedJoinsTotal: Number(
          inviteLinksAggregate._sum.requestedCount || 0,
        ),
        totalAdSpend: financialSummary.totalAdSpend,
        totalJoinedSubscribers: financialSummary.totalJoinedSubscribers,
        avgCpa: financialSummary.avgCpa,
        activeCpa: financialSummary.activeCpa,
      },
      dailyStats,
      recentEvents: [],
      channelStatsSnapshot,
      channelStatsPoints,
      financialSummary,
      range: {
        from: effectiveFromDate.toISOString(),
        to: safeToDate.toISOString(),
        maxRangeDays,
      },
    };
  }
}
