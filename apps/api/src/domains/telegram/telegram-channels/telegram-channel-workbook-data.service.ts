import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramChannelAnalyticsService } from './telegram-channel-analytics.service';
import { TelegramInvitePersistenceService } from './telegram-invite-persistence.service';

export const telegramChannelWorkbookInclude = {
  adminLinks: { include: { telegramUserAccountIntegration: true } },
  dataSources: true,
  sourceAccesses: true,
} satisfies Prisma.TelegramChannelInclude;

export type TelegramChannelWorkbookChannel = Prisma.TelegramChannelGetPayload<{
  include: typeof telegramChannelWorkbookInclude;
}>;

@Injectable()
export class TelegramChannelWorkbookDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: TelegramChannelAnalyticsService,
    private readonly telegramInvitePersistenceService: TelegramInvitePersistenceService,
  ) {}
  async load(workspaceId: string, channel: TelegramChannelWorkbookChannel) {
    const [
      audience,
      financialSummary,
      firstPost,
      lastPost,
      firstDaily,
      lastDaily,
      firstStatsPoint,
      lastStatsPoint,
      firstAudienceSnapshot,
      lastAudienceSnapshot,
      posts,
      postSnapshots,
      dailyStats,
      statsPoints,
      statsSnapshots,
      audienceSnapshots,
      inviteLinks,
      promos,
      campaigns,
    ] = await Promise.all([
      this.analyticsService.getActiveAudienceEstimate(channel.id),
      this.analyticsService.getChannelFinancialSummary(channel.id),
      this.prisma.telegramPost.findFirst({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { postDate: 'asc' },
      }),
      this.prisma.telegramPost.findFirst({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { postDate: 'desc' },
      }),
      this.prisma.telegramChannelDailyStats.findFirst({
        where: { telegramChannelId: channel.id },
        orderBy: { date: 'asc' },
      }),
      this.prisma.telegramChannelDailyStats.findFirst({
        where: { telegramChannelId: channel.id },
        orderBy: { date: 'desc' },
      }),
      this.prisma.telegramChannelStatsPoint.findFirst({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { date: 'asc' },
      }),
      this.prisma.telegramChannelStatsPoint.findFirst({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { date: 'desc' },
      }),
      this.prisma.telegramChannelAudienceSnapshot.findFirst({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { collectedAt: 'asc' },
      }),
      this.prisma.telegramChannelAudienceSnapshot.findFirst({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { collectedAt: 'desc' },
      }),
      this.prisma.telegramPost.findMany({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { postDate: 'asc' },
      }),
      this.prisma.telegramPostMetricSnapshot.findMany({
        where: {
          telegramPost: { workspaceId, telegramChannelId: channel.id },
        },
        include: { telegramPost: { select: { telegramMessageId: true } } },
        orderBy: { collectedAt: 'asc' },
      }),
      this.prisma.telegramChannelDailyStats.findMany({
        where: { telegramChannelId: channel.id },
        orderBy: { date: 'asc' },
      }),
      this.prisma.telegramChannelStatsPoint.findMany({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: [{ metric: 'asc' }, { series: 'asc' }, { date: 'asc' }],
      }),
      this.prisma.telegramChannelStatsSnapshot.findMany({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { snapshotDate: 'asc' },
      }),
      this.prisma.telegramChannelAudienceSnapshot.findMany({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { collectedAt: 'asc' },
      }),
      this.telegramInvitePersistenceService.findInviteLinksWithRequestedCountFallback(
        {
          workspaceId,
          where: { workspaceId, telegramChannelId: channel.id },
          orderBy: { createdAt: 'asc' },
        },
      ),
      this.prisma.promo.findMany({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.adCampaign.findMany({
        where: { workspaceId, telegramChannelId: channel.id },
        include: {
          promo: true,
          account: true,
          expenseTransaction: {
            include: { account: true, categoryRef: true, member: true },
          },
          inviteLinks: true,
          advertisingChannels: { include: { advertisingSource: true } },
          advertisingTelegramChannels: { include: { telegramChannel: true } },
          hypothesisLinks: { include: { hypothesis: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return {
      channel,
      audience,
      financialSummary,
      firstPost,
      lastPost,
      firstDaily,
      lastDaily,
      firstStatsPoint,
      lastStatsPoint,
      firstAudienceSnapshot,
      lastAudienceSnapshot,
      posts,
      postSnapshots,
      dailyStats,
      statsPoints,
      statsSnapshots,
      audienceSnapshots,
      inviteLinks,
      promos,
      campaigns,
    };
  }
}
