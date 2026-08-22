import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  calculateExpectedViews,
  selectExpectedViewsAtWindow,
} from '../../../common/analytics/telegram-post-expected-views';
import { PrismaService } from '../../../prisma/prisma.service';

const PRICING_WINDOW_DAYS = 50;
const MAX_POSTS_PER_CHANNEL = 60;

export type ChannelAdPricingWindow = {
  expectedViews: number | null;
  postsSampleCount: number;
  dataQuality: 'READY' | 'NOT_ENOUGH_DATA';
};

export type ChannelAdPricingWindows = {
  h24: ChannelAdPricingWindow;
  h48: ChannelAdPricingWindow;
  h72: ChannelAdPricingWindow;
  permanent: ChannelAdPricingWindow;
};

export type ChannelAdFormatPricing =
  ChannelAdPricingWindows[keyof ChannelAdPricingWindows] & {
    estimatedPrice: number | null;
  };

export type ChannelAdFormatPricingSummary = {
  currency: string;
  cpm: number | null;
  h24: ChannelAdFormatPricing;
  h48: ChannelAdFormatPricing;
  h72: ChannelAdFormatPricing;
  permanent: ChannelAdFormatPricing;
};

type PricingChannel = {
  id: string;
  currentSubscribersCount?: number | null;
  ownViewsPerPost?: number | null;
};

@Injectable()
export class TelegramChannelAdPricingReadService {
  constructor(private readonly prisma: PrismaService) {}

  async windowsForChannels(
    workspaceId: string,
    channels: PricingChannel[],
    now = new Date(),
  ) {
    if (!channels.length) return new Map<string, ChannelAdPricingWindows>();
    const channelIds = channels.map((channel) => channel.id);
    const cutoff = new Date(
      now.getTime() - PRICING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const recentIds = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT ranked."id"
        FROM (
          SELECT
            post."id",
            ROW_NUMBER() OVER (
              PARTITION BY post."telegramChannelId"
              ORDER BY post."postDate" DESC, post."id" DESC
            ) AS "rowNumber"
          FROM "TelegramPost" AS post
          WHERE post."workspaceId" = ${workspaceId}
            AND post."telegramChannelId" IN (${Prisma.join(channelIds)})
            AND post."postDate" >= ${cutoff}
            AND post."postDate" <= ${now}
        ) AS ranked
        WHERE ranked."rowNumber" <= ${MAX_POSTS_PER_CHANNEL}
      `,
    );
    const postIds = recentIds.map((row) => row.id);
    const posts = postIds.length
      ? await this.prisma.telegramPost.findMany({
          where: { workspaceId, id: { in: postIds } },
          select: {
            id: true,
            telegramChannelId: true,
            postDate: true,
            viewsCount: true,
            manualOwnViews: true,
            excludeFromAnalytics: true,
            adSalePlacements: { select: { id: true }, take: 1 },
            metricSnapshots: {
              where: { collectedAt: { gte: cutoff, lte: now } },
              select: { viewsCount: true, collectedAt: true },
              orderBy: { collectedAt: 'asc' },
            },
          },
        })
      : [];
    const postsByChannel = new Map<string, typeof posts>();
    for (const post of posts) {
      const list = postsByChannel.get(post.telegramChannelId) ?? [];
      list.push(post);
      postsByChannel.set(post.telegramChannelId, list);
    }
    return new Map(
      channels.map((channel) => {
        const channelPosts = postsByChannel.get(channel.id) ?? [];
        return [
          channel.id,
          {
            h24: this.window(channel, channelPosts, 24, now),
            h48: this.window(channel, channelPosts, 48, now),
            h72: this.window(channel, channelPosts, 72, now),
            permanent: this.window(channel, channelPosts, 168, now),
          },
        ];
      }),
    );
  }

  private window(
    channel: PricingChannel,
    posts: Array<{
      id: string;
      postDate: Date;
      viewsCount: number | null;
      manualOwnViews: number;
      excludeFromAnalytics: boolean;
      adSalePlacements: Array<{ id: string }>;
      metricSnapshots: Array<{ viewsCount: number | null; collectedAt: Date }>;
    }>,
    hours: number,
    now: Date,
  ): ChannelAdPricingWindow {
    const result = calculateExpectedViews({
      now,
      maxPostsForPrimary: 3,
      posts: posts.map((post) => ({
        id: post.id,
        postDate: post.postDate,
        viewsCount: selectExpectedViewsAtWindow(post, hours, now),
        manualOwnViews: post.manualOwnViews,
        excludeFromAnalytics: post.excludeFromAnalytics,
        adPlacementLinked: post.adSalePlacements.length > 0,
      })),
      currentSubscribersCount: channel.currentSubscribersCount,
      ownViewsPerPost: channel.ownViewsPerPost,
      audienceSnapshot: null,
    });
    return {
      expectedViews: result.expectedViews,
      postsSampleCount: result.postsSampleCount,
      dataQuality: result.dataQuality,
    };
  }
}

export function priceChannelAdFormatWindows(
  windows: ChannelAdPricingWindows | undefined,
  cpm: number | null,
  currency: string,
): ChannelAdFormatPricingSummary | null {
  if (!windows) return null;
  const price = (window: ChannelAdPricingWindow): ChannelAdFormatPricing => ({
    ...window,
    estimatedPrice:
      cpm == null || window.expectedViews == null
        ? null
        : Math.round(((window.expectedViews * cpm) / 1000) * 100) / 100,
  });
  return {
    currency,
    cpm,
    h24: price(windows.h24),
    h48: price(windows.h48),
    h72: price(windows.h72),
    permanent: price(windows.permanent),
  };
}

export function resolveChannelCardExpectedViews(
  windows: ChannelAdPricingWindows | undefined,
  channel: {
    ownViewsPerPost?: number | null;
    currentSubscribersCount?: number | null;
  },
  audience?: {
    activeSubscribersEstimate?: number | null;
    viewRate?: Prisma.Decimal | number | null;
  },
) {
  const ownViews = Number(channel.ownViewsPerPost);
  return (
    windows?.permanent.expectedViews ??
    (Number.isFinite(ownViews) && ownViews > 0 ? ownViews : null) ??
    audience?.activeSubscribersEstimate ??
    (audience?.viewRate != null && channel.currentSubscribersCount
      ? (Number(audience.viewRate) / 100) * channel.currentSubscribersCount
      : null)
  );
}
