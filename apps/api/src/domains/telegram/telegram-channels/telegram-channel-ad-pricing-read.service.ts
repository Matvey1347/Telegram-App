import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { calculateExpectedViews } from '../../../common/analytics/telegram-post-expected-views';
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

type PricingPost = {
  id: string;
  telegramChannelId: string;
  postDate: Date;
  manualOwnViews: number;
  excludeFromAnalytics: boolean;
  adPlacementLinked: boolean;
  h24Views: number | null;
  h48Views: number | null;
  h72Views: number | null;
  permanentViews: number | null;
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
    const posts = await this.prisma.$queryRaw<PricingPost[]>(
      Prisma.sql`
        WITH ranked AS (
          SELECT
            post."id",
            post."telegramChannelId",
            post."postDate",
            post."manualOwnViews",
            post."excludeFromAnalytics",
            ROW_NUMBER() OVER (
              PARTITION BY post."telegramChannelId"
              ORDER BY post."postDate" DESC, post."id" DESC
            ) AS "rowNumber"
          FROM "TelegramPost" AS post
          WHERE post."workspaceId" = ${workspaceId}
            AND post."telegramChannelId" IN (${Prisma.join(channelIds)})
            AND post."postDate" >= ${cutoff}
            AND post."postDate" <= ${now}
        ), bounded AS (
          SELECT * FROM ranked WHERE ranked."rowNumber" <= ${MAX_POSTS_PER_CHANNEL}
        )
        SELECT
          bounded."id",
          bounded."telegramChannelId",
          bounded."postDate",
          bounded."manualOwnViews",
          bounded."excludeFromAnalytics",
          EXISTS (
            SELECT 1
            FROM "TelegramAdSalePlacement" placement
            WHERE placement."telegramPostId" = bounded."id"
          ) AS "adPlacementLinked",
          h24."viewsCount" AS "h24Views",
          h48."viewsCount" AS "h48Views",
          h72."viewsCount" AS "h72Views",
          permanent."viewsCount" AS "permanentViews"
        FROM bounded
        LEFT JOIN LATERAL (
          SELECT snapshot."viewsCount"
          FROM "TelegramPostMetricSnapshot" snapshot
          WHERE snapshot."telegramPostId" = bounded."id"
            AND snapshot."viewsCount" IS NOT NULL
            AND bounded."postDate" + INTERVAL '24 hours' <= ${now}
            AND snapshot."collectedAt" BETWEEN bounded."postDate" + INTERVAL '16 hours'
              AND bounded."postDate" + INTERVAL '32 hours'
            AND snapshot."collectedAt" <= ${now}
          ORDER BY ABS(EXTRACT(EPOCH FROM (snapshot."collectedAt" - (bounded."postDate" + INTERVAL '24 hours')))), snapshot."collectedAt" ASC
          LIMIT 1
        ) h24 ON TRUE
        LEFT JOIN LATERAL (
          SELECT snapshot."viewsCount"
          FROM "TelegramPostMetricSnapshot" snapshot
          WHERE snapshot."telegramPostId" = bounded."id"
            AND snapshot."viewsCount" IS NOT NULL
            AND bounded."postDate" + INTERVAL '48 hours' <= ${now}
            AND snapshot."collectedAt" BETWEEN bounded."postDate" + INTERVAL '36 hours'
              AND bounded."postDate" + INTERVAL '60 hours'
            AND snapshot."collectedAt" <= ${now}
          ORDER BY ABS(EXTRACT(EPOCH FROM (snapshot."collectedAt" - (bounded."postDate" + INTERVAL '48 hours')))), snapshot."collectedAt" ASC
          LIMIT 1
        ) h48 ON TRUE
        LEFT JOIN LATERAL (
          SELECT snapshot."viewsCount"
          FROM "TelegramPostMetricSnapshot" snapshot
          WHERE snapshot."telegramPostId" = bounded."id"
            AND snapshot."viewsCount" IS NOT NULL
            AND bounded."postDate" + INTERVAL '72 hours' <= ${now}
            AND snapshot."collectedAt" BETWEEN bounded."postDate" + INTERVAL '48 hours'
              AND bounded."postDate" + INTERVAL '96 hours'
            AND snapshot."collectedAt" <= ${now}
          ORDER BY ABS(EXTRACT(EPOCH FROM (snapshot."collectedAt" - (bounded."postDate" + INTERVAL '72 hours')))), snapshot."collectedAt" ASC
          LIMIT 1
        ) h72 ON TRUE
        LEFT JOIN LATERAL (
          SELECT snapshot."viewsCount"
          FROM "TelegramPostMetricSnapshot" snapshot
          WHERE snapshot."telegramPostId" = bounded."id"
            AND snapshot."viewsCount" IS NOT NULL
            AND bounded."postDate" + INTERVAL '168 hours' <= ${now}
            AND snapshot."collectedAt" BETWEEN bounded."postDate" + INTERVAL '144 hours'
              AND bounded."postDate" + INTERVAL '192 hours'
            AND snapshot."collectedAt" <= ${now}
          ORDER BY ABS(EXTRACT(EPOCH FROM (snapshot."collectedAt" - (bounded."postDate" + INTERVAL '168 hours')))), snapshot."collectedAt" ASC
          LIMIT 1
        ) permanent ON TRUE
      `,
    );
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
    posts: PricingPost[],
    hours: number,
    now: Date,
  ): ChannelAdPricingWindow {
    const viewsKey =
      hours === 24
        ? 'h24Views'
        : hours === 48
          ? 'h48Views'
          : hours === 72
            ? 'h72Views'
            : 'permanentViews';
    const result = calculateExpectedViews({
      now,
      maxPostsForPrimary: 3,
      posts: posts.map((post) => ({
        id: post.id,
        postDate: post.postDate,
        viewsCount: post[viewsKey],
        manualOwnViews: post.manualOwnViews,
        excludeFromAnalytics: post.excludeFromAnalytics,
        adPlacementLinked: post.adPlacementLinked,
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
