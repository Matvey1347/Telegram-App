import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  buildDataQualityWarning,
  calculateEffectiveSubscribers,
  classifyViewRate,
  maxDataQuality,
  type DataQuality,
} from '../../../common/analytics/data-quality';
import { TelegramChannelFinancialReadService } from './telegram-channel-financial-read.service';

@Injectable()
export class TelegramChannelAnalyticsService {
  private readonly rollingPostsWindow = 50;

  constructor(
    private prisma: PrismaService,
    private readonly financialReadService: TelegramChannelFinancialReadService,
  ) {}

  private average(values: number[]) {
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  }

  private numberOrNull(value: unknown) {
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private findChannelById(id: string) {
    return this.prisma.telegramChannel.findUnique({ where: { id } });
  }

  async getActiveAudienceEstimate(channelId: string) {
    const channel = await this.findChannelById(channelId);
    if (!channel) throw new NotFoundException('Telegram channel not found');

    const postsWindow = this.rollingPostsWindow;
    const posts = await this.prisma.telegramPost.findMany({
      where: {
        workspaceId: channel.workspaceId,
        telegramChannelId: channel.id,
        excludeFromAnalytics: false,
      },
      orderBy: { postDate: 'desc' },
      take: postsWindow,
    });

    const rawViews = posts.map((post) => Number(post.viewsCount || 0));
    const ownViewsPerPost = Math.max(0, Number(channel.ownViewsPerPost || 0));
    const ownReactionsPerPost = Math.max(
      0,
      Number(channel.ownReactionsPerPost || 0),
    );
    const adjustedViews = posts.map((post) =>
      Math.max(
        0,
        Number(post.viewsCount || 0) -
          ownViewsPerPost -
          Number(post.manualOwnViews || 0),
      ),
    );
    const rawReactions = posts.map((post) => Number(post.reactionsCount || 0));
    const adjustedReactions = posts.map((post) =>
      Math.max(
        0,
        Number(post.reactionsCount || 0) -
          ownReactionsPerPost -
          Number(post.manualOwnReactions || 0),
      ),
    );
    const avgViewsAdjusted = this.average(adjustedViews);
    const subscribersCount = channel.currentSubscribersCount ?? null;
    const knownFakeSubscribersCount = Math.max(
      0,
      Number(channel.knownFakeSubscribersCount || 0),
    );
    const {
      effectiveSubscribers,
      subscriberBaseQuality,
      hasSubscriberBasePollution,
    } = calculateEffectiveSubscribers({
      totalSubscribers: subscribersCount,
      knownFakeSubscribersCount,
      manualSubscriberBaseQuality: channel.subscriberBaseQuality,
    });
    const rawActiveSubscribersEstimate =
      avgViewsAdjusted == null ? null : Math.round(avgViewsAdjusted);
    const rawViewRate =
      effectiveSubscribers && rawActiveSubscribersEstimate != null
        ? (rawActiveSubscribersEstimate / effectiveSubscribers) * 100
        : null;
    const cappedActiveSubscribersEstimate =
      effectiveSubscribers == null || rawActiveSubscribersEstimate == null
        ? null
        : Math.min(rawActiveSubscribersEstimate, effectiveSubscribers);
    const cappedViewRate =
      rawViewRate == null ? null : Math.min(rawViewRate, 100);
    const classified = classifyViewRate(rawViewRate);
    let dataQuality: DataQuality = classified.dataQuality;
    let dataQualityReason = classified.reason;
    let hasExternalTrafficAnomaly = classified.hasExternalTrafficAnomaly;
    if (
      subscriberBaseQuality === 'polluted' ||
      subscriberBaseQuality === 'suspicious'
    ) {
      dataQuality = maxDataQuality(dataQuality, 'suspicious');
      dataQualityReason = 'subscriber_base_polluted';
    }
    if (subscriberBaseQuality === 'invalid') {
      dataQuality = 'invalid';
      dataQualityReason = 'missing_subscribers_or_views';
      hasExternalTrafficAnomaly = false;
    }
    const dataQualityWarning = buildDataQualityWarning(
      dataQuality,
      dataQualityReason,
    );
    const activeSubscribersEstimate = cappedActiveSubscribersEstimate;
    const viewRate = cappedViewRate;
    const organicActiveSubscribersEstimate = 0;
    const paidActiveSubscribersEstimate =
      activeSubscribersEstimate == null ? null : activeSubscribersEstimate;

    return {
      subscribersCount,
      knownFakeSubscribersCount,
      effectiveSubscribersCount: effectiveSubscribers,
      subscriberBaseQuality,
      ownViewsPerPost,
      ownReactionsPerPost,
      rawActiveSubscribersEstimate,
      activeSubscribersEstimate,
      cappedActiveSubscribersEstimate,
      organicActiveSubscribersEstimate,
      paidActiveSubscribersEstimate,
      rawViewRate,
      viewRate,
      cappedViewRate,
      avgViewsRaw: this.average(rawViews),
      avgViewsAdjusted,
      avgReactionsRaw: this.average(rawReactions),
      avgReactionsAdjusted: this.average(adjustedReactions),
      rawAvgViews: this.average(rawViews),
      rawAvgReactions: this.average(rawReactions),
      dataQuality,
      dataQualityReason,
      dataQualityWarning,
      hasExternalTrafficAnomaly,
      hasSubscriberBasePollution,
      postsWindow,
      postsUsed: posts.length,
    };
  }

  async createAudienceSnapshot(channelId: string, source = 'sync') {
    const channel = await this.findChannelById(channelId);
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const analytics = await this.getActiveAudienceEstimate(channelId);
    return this.prisma.telegramChannelAudienceSnapshot.create({
      data: {
        workspaceId: channel.workspaceId,
        telegramChannelId: channel.id,
        subscribersCount: analytics.subscribersCount,
        pendingJoinRequestsCount: channel.pendingJoinRequestsCount,
        activeSubscribersEstimate: analytics.activeSubscribersEstimate,
        viewRate: analytics.viewRate,
        avgViewsRaw: analytics.avgViewsRaw,
        avgViewsAdjusted: analytics.avgViewsAdjusted,
        avgReactionsRaw: analytics.avgReactionsRaw,
        avgReactionsAdjusted: analytics.avgReactionsAdjusted,
        rawAvgViews: analytics.rawAvgViews,
        rawAvgReactions: analytics.rawAvgReactions,
        rawViewRate: analytics.rawViewRate,
        effectiveSubscribersCount: analytics.effectiveSubscribersCount,
        cappedActiveSubscribersEstimate:
          analytics.cappedActiveSubscribersEstimate,
        cappedViewRate: analytics.cappedViewRate,
        dataQuality: analytics.dataQuality,
        dataQualityReason: analytics.dataQualityReason,
        hasExternalTrafficAnomaly: analytics.hasExternalTrafficAnomaly,
        hasSubscriberBasePollution: analytics.hasSubscriberBasePollution,
        postsWindow: analytics.postsWindow,
        source,
      },
    });
  }

  async audienceSnapshots(channelId: string, limit = 50) {
    const safeLimit = Math.max(1, Math.min(200, limit));
    return this.prisma.telegramChannelAudienceSnapshot.findMany({
      where: { telegramChannelId: channelId },
      orderBy: { collectedAt: 'asc' },
      take: safeLimit,
    });
  }

  async getChannelFinancialSummary(channelId: string) {
    const channel = await this.findChannelById(channelId);
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const audience = await this.getActiveAudienceEstimate(channelId);
    const summaries =
      await this.financialReadService.buildChannelFinancialSummaryPreview(
        channel.workspaceId,
        [{ ...channel, audienceSnapshots: [audience] }],
      );
    const summary = summaries.get(channelId);
    if (!summary) {
      throw new NotFoundException(
        'Telegram channel financial summary not found',
      );
    }
    return summary;
  }
}
