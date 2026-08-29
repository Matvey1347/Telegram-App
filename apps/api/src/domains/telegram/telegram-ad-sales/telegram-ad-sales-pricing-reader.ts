import { NotFoundException } from '@nestjs/common';
import { Prisma, TelegramAdPricingMode } from '@prisma/client';
import {
  calculateExpectedViews,
  ExpectedViewsResult,
  selectExpectedViewsAtWindow,
} from '../../../common/analytics/telegram-post-expected-views';
import { PrismaService } from '../../../prisma/prisma.service';
import { decimal, decimalToString } from './domain/decimal';
import { calculatePricing } from './domain/pricing';

export const AD_SALES_PRICING_CHANNEL_BATCH_SIZE = 100;
export const MAX_AD_SALES_PRICING_POSTS_PER_CHANNEL = 60;
export const STANDARD_AD_SALES_PRICING_WINDOW_HOURS = [
  24, 48, 72, 168,
] as const;
export const STANDARD_AD_SALES_PRICING_ROWS_PER_POST =
  STANDARD_AD_SALES_PRICING_WINDOW_HOURS.length + 1;

export type AdSalesPricingChannel = {
  id: string;
  currentSubscribersCount?: number | null;
  ownViewsPerPost?: number | null;
  adBaseCpm?: Prisma.Decimal | null;
  adBaseCurrency?: string | null;
  updatedAt?: Date;
};

export type AdSalesPricingProduct = {
  id?: string | null;
  deleteAfterHours?: number | null;
  isPermanent?: boolean;
  defaultPricingMode?: TelegramAdPricingMode;
  defaultCpm?: Prisma.Decimal | null;
  defaultFixedPrice?: Prisma.Decimal | null;
};

type PricingPost = {
  id: string;
  telegramChannelId: string;
  postDate: Date;
  viewsCount: number | null;
  manualOwnViews: number;
  excludeFromAnalytics: boolean;
  adSalePlacements: Array<{ id: string }>;
  metricSnapshots: Array<{ viewsCount: number | null; collectedAt: Date }>;
};

type PricingSourceRow = {
  id: string;
  telegramChannelId: string;
  postDate: Date;
  viewsCount: number | null;
  manualOwnViews: number;
  excludeFromAnalytics: boolean;
  adPlacementLinked: boolean;
  metricSnapshotId: string | null;
  metricSnapshotViewsCount: number | null;
  metricSnapshotCollectedAt: Date | null;
};

export type AdSalesPricingSource = {
  channel: AdSalesPricingChannel;
  posts: PricingPost[];
  asOf?: Date;
  evaluatedAt?: Date;
};

export type AdSalesPricingPreview = ExpectedViewsResult & {
  pricingWindowHours: number | null;
  pricingWindowLabel: string;
  currency: string;
  recommendedPrice: string;
  minimumPrice: string;
  targetCpm: string;
};

export class TelegramAdSalesPricingReader {
  constructor(private readonly prisma: PrismaService) {}

  async sourcesForChannels(
    workspaceId: string,
    channels: AdSalesPricingChannel[],
    asOf?: Date,
  ) {
    if (!channels.length) return new Map<string, AdSalesPricingSource>();
    const channelIds = [...new Set(channels.map((channel) => channel.id))];
    const snapshotCutoff = asOf ?? new Date();
    const rows: PricingSourceRow[] = [];
    for (
      let offset = 0;
      offset < channelIds.length;
      offset += AD_SALES_PRICING_CHANNEL_BATCH_SIZE
    ) {
      const batchChannelIds = channelIds.slice(
        offset,
        offset + AD_SALES_PRICING_CHANNEL_BATCH_SIZE,
      );
      rows.push(
        ...(await this.prisma.$queryRaw<PricingSourceRow[]>(Prisma.sql`
      WITH "requiredWindows"("targetHours") AS (
        VALUES ${Prisma.join(
          STANDARD_AD_SALES_PRICING_WINDOW_HOURS.map(
            (hours) => Prisma.sql`(${hours}::integer)`,
          ),
        )}
        UNION
        SELECT DISTINCT
          CASE
            WHEN product."isPermanent" THEN 168
            ELSE product."deleteAfterHours"
          END AS "targetHours"
        FROM "TelegramAdProduct" AS product
        WHERE product."workspaceId" = ${workspaceId}
          AND product."telegramChannelId" IN (${Prisma.join(batchChannelIds)})
          AND (
            product."isPermanent"
            OR product."deleteAfterHours" IS NOT NULL
          )
      ),
      "rankedPosts" AS (
        SELECT
          post."id",
          post."telegramChannelId",
          post."postDate",
          post."viewsCount",
          post."manualOwnViews",
          post."excludeFromAnalytics",
          ROW_NUMBER() OVER (
            PARTITION BY post."telegramChannelId"
            ORDER BY post."postDate" DESC, post."id" DESC
          ) AS "rowNumber"
        FROM "TelegramPost" AS post
        WHERE post."workspaceId" = ${workspaceId}
          AND post."telegramChannelId" IN (${Prisma.join(batchChannelIds)})
          ${asOf ? Prisma.sql`AND post."postDate" <= ${asOf}` : Prisma.empty}
      ),
      "selectedPosts" AS (
        SELECT *
        FROM "rankedPosts"
        WHERE "rowNumber" <= ${MAX_AD_SALES_PRICING_POSTS_PER_CHANNEL}
      )
      SELECT
        post."id",
        post."telegramChannelId",
        post."postDate",
        post."viewsCount",
        post."manualOwnViews",
        post."excludeFromAnalytics",
        EXISTS (
          SELECT
            1
          FROM "TelegramAdSalePlacement" AS placement
          WHERE placement."workspaceId" = ${workspaceId}
            AND placement."telegramPostId" = post."id"
        ) AS "adPlacementLinked",
        candidate."id" AS "metricSnapshotId",
        candidate."viewsCount" AS "metricSnapshotViewsCount",
        candidate."collectedAt" AS "metricSnapshotCollectedAt"
      FROM "selectedPosts" AS post
      LEFT JOIN LATERAL (
        SELECT
          nearest."id",
          nearest."viewsCount",
          nearest."collectedAt",
          requiredWindow."targetHours"
        FROM "requiredWindows" AS requiredWindow
        CROSS JOIN LATERAL (
          SELECT edge.*
          FROM (
            (
              SELECT
                snapshot."id",
                snapshot."viewsCount",
                snapshot."collectedAt"
              FROM "TelegramPostMetricSnapshot" AS snapshot
              WHERE snapshot."telegramPostId" = post."id"
                AND snapshot."viewsCount" IS NOT NULL
                AND snapshot."collectedAt" >= post."postDate"
                AND snapshot."collectedAt" <= ${snapshotCutoff}
                AND snapshot."collectedAt" <= post."postDate"
                  + requiredWindow."targetHours" * INTERVAL '1 hour'
              ORDER BY snapshot."collectedAt" DESC, snapshot."id" ASC
              LIMIT 1
            )
            UNION ALL
            (
              SELECT
                snapshot."id",
                snapshot."viewsCount",
                snapshot."collectedAt"
              FROM "TelegramPostMetricSnapshot" AS snapshot
              WHERE snapshot."telegramPostId" = post."id"
                AND snapshot."viewsCount" IS NOT NULL
                AND snapshot."collectedAt" >= post."postDate"
                AND snapshot."collectedAt" <= ${snapshotCutoff}
                AND snapshot."collectedAt" >= post."postDate"
                  + requiredWindow."targetHours" * INTERVAL '1 hour'
              ORDER BY snapshot."collectedAt" ASC, snapshot."id" ASC
              LIMIT 1
            )
          ) AS edge
          ORDER BY
            ABS(
              EXTRACT(
                EPOCH FROM edge."collectedAt"
                  - (
                    post."postDate"
                    + requiredWindow."targetHours" * INTERVAL '1 hour'
                  )
              )
            ),
            edge."collectedAt" ASC,
            edge."id" ASC
          LIMIT 1
        ) AS nearest
        UNION ALL
        SELECT
          latest."id",
          latest."viewsCount",
          latest."collectedAt",
          NULL::integer AS "targetHours"
        FROM LATERAL (
          SELECT
            snapshot."id",
            snapshot."viewsCount",
            snapshot."collectedAt"
          FROM "TelegramPostMetricSnapshot" AS snapshot
          WHERE snapshot."telegramPostId" = post."id"
            AND snapshot."viewsCount" IS NOT NULL
            AND snapshot."collectedAt" >= post."postDate"
            AND snapshot."collectedAt" <= ${snapshotCutoff}
          ORDER BY snapshot."collectedAt" DESC, snapshot."id" ASC
          LIMIT 1
        ) AS latest
      ) AS candidate ON TRUE
      ORDER BY
        post."postDate" DESC,
        post."id" DESC,
        candidate."targetHours" ASC NULLS LAST,
        candidate."collectedAt" ASC
      `)),
      );
    }
    const postsById = new Map<string, PricingPost>();
    const snapshotIdsByPost = new Map<string, Set<string>>();
    for (const row of rows) {
      let post = postsById.get(row.id);
      if (!post) {
        post = {
          id: row.id,
          telegramChannelId: row.telegramChannelId,
          postDate: row.postDate,
          viewsCount: row.viewsCount,
          manualOwnViews: row.manualOwnViews,
          excludeFromAnalytics: row.excludeFromAnalytics,
          adSalePlacements: row.adPlacementLinked ? [{ id: 'linked' }] : [],
          metricSnapshots: [],
        };
        postsById.set(row.id, post);
      }
      if (
        row.metricSnapshotId &&
        row.metricSnapshotViewsCount != null &&
        row.metricSnapshotCollectedAt
      ) {
        const snapshotIds = snapshotIdsByPost.get(row.id) ?? new Set<string>();
        if (!snapshotIds.has(row.metricSnapshotId)) {
          snapshotIds.add(row.metricSnapshotId);
          post.metricSnapshots.push({
            viewsCount: row.metricSnapshotViewsCount,
            collectedAt: row.metricSnapshotCollectedAt,
          });
          snapshotIdsByPost.set(row.id, snapshotIds);
        }
      }
    }
    const postsByChannel = new Map<string, PricingPost[]>();
    for (const post of postsById.values()) {
      const current = postsByChannel.get(post.telegramChannelId) ?? [];
      current.push(post);
      postsByChannel.set(post.telegramChannelId, current);
    }
    return new Map(
      channels.map((channel) => [
        channel.id,
        {
          channel,
          posts: postsByChannel.get(channel.id) ?? [],
          evaluatedAt: snapshotCutoff,
          ...(asOf ? { asOf } : {}),
        },
      ]),
    );
  }

  async latestSnapshotsForChannels(workspaceId: string, channelIds: string[]) {
    if (!channelIds.length) return new Map();
    const latestIds = await this.prisma.$queryRaw<
      Array<{ id: string; telegramChannelId: string }>
    >(Prisma.sql`
      SELECT ranked."id", ranked."telegramChannelId"
      FROM (
        SELECT
          snapshot."id",
          snapshot."telegramChannelId",
          ROW_NUMBER() OVER (
            PARTITION BY snapshot."telegramChannelId"
            ORDER BY snapshot."calculatedAt" DESC, snapshot."id" DESC
          ) AS "rowNumber"
        FROM "TelegramAdPriceSnapshot" AS snapshot
        WHERE snapshot."workspaceId" = ${workspaceId}
          AND snapshot."telegramChannelId" IN (${Prisma.join(channelIds)})
      ) AS ranked
      WHERE ranked."rowNumber" = 1
    `);
    const snapshots = latestIds.length
      ? await this.prisma.telegramAdPriceSnapshot.findMany({
          where: { workspaceId, id: { in: latestIds.map((row) => row.id) } },
        })
      : [];
    return new Map(
      snapshots.map((snapshot) => [snapshot.telegramChannelId, snapshot]),
    );
  }

  async preview(
    workspaceId: string,
    channel: AdSalesPricingChannel,
    product?: AdSalesPricingProduct | null,
    overrides?: {
      pricingMode?: TelegramAdPricingMode;
      targetCpm?: number | Prisma.Decimal | null;
      minimumCpm?: number | Prisma.Decimal | null;
      fixedPrice?: number | Prisma.Decimal | null;
      asOf?: Date | null;
    },
  ) {
    const sources = await this.sourcesForChannels(
      workspaceId,
      [channel],
      overrides?.asOf ?? undefined,
    );
    const source = sources.get(channel.id);
    if (!source) throw new NotFoundException('Telegram channel not found');
    return this.previewFromSource(source, product, overrides);
  }

  previewFromSource(
    source: AdSalesPricingSource,
    product?: AdSalesPricingProduct | null,
    overrides?: {
      pricingMode?: TelegramAdPricingMode;
      targetCpm?: number | Prisma.Decimal | null;
      minimumCpm?: number | Prisma.Decimal | null;
      fixedPrice?: number | Prisma.Decimal | null;
    },
  ): AdSalesPricingPreview {
    const { hours, ...window } = this.resolveWindow(product);
    const expectedViews = this.expectedViews(source, hours);
    const targetCpm =
      overrides?.targetCpm ??
      source.channel.adBaseCpm ??
      product?.defaultCpm ??
      0;
    if (expectedViews.expectedViews == null) {
      return {
        ...expectedViews,
        ...window,
        currency: source.channel.adBaseCurrency || 'USD',
        recommendedPrice: '0.00',
        minimumPrice: '0.00',
        targetCpm: decimalToString(decimal(targetCpm)) || '0.00',
      };
    }
    const pricing = calculatePricing({
      expectedViews: expectedViews.expectedViews,
      pricingMode:
        overrides?.pricingMode ??
        product?.defaultPricingMode ??
        TelegramAdPricingMode.CPM,
      targetCpm,
      minimumCpm: overrides?.minimumCpm ?? targetCpm,
      fixedPrice: overrides?.fixedPrice ?? product?.defaultFixedPrice ?? 0,
    });
    return {
      ...expectedViews,
      ...window,
      currency: source.channel.adBaseCurrency || 'USD',
      recommendedPrice: decimalToString(pricing.recommendedPrice) ?? '0.00',
      minimumPrice: decimalToString(pricing.minimumPrice) ?? '0.00',
      targetCpm: decimalToString(pricing.targetCpm) ?? '0.00',
    };
  }

  expectedViews(source: AdSalesPricingSource, targetHours: number | null) {
    const now = source.asOf ?? source.evaluatedAt ?? new Date();
    return calculateExpectedViews({
      now,
      maxPostsForPrimary: 3,
      posts: source.posts.map((post) => ({
        id: post.id,
        postDate: post.postDate,
        viewsCount: selectExpectedViewsAtWindow(post, targetHours, now, {
          historicalAsOf: Boolean(source.asOf),
        }),
        manualOwnViews: post.manualOwnViews,
        excludeFromAnalytics: post.excludeFromAnalytics,
        adPlacementLinked: post.adSalePlacements.length > 0,
      })),
      currentSubscribersCount: source.channel.currentSubscribersCount,
      ownViewsPerPost: source.channel.ownViewsPerPost,
      audienceSnapshot: null,
    });
  }

  resolveWindow(product?: AdSalesPricingProduct | null) {
    if (!product) {
      return {
        pricingWindowHours: null as number | null,
        pricingWindowLabel: 'Post',
        hours: null as number | null,
      };
    }
    const hours = product.isPermanent
      ? 168
      : (product.deleteAfterHours ?? null);
    return {
      pricingWindowHours: hours,
      pricingWindowLabel: product.isPermanent
        ? '7d placement'
        : hours == null
          ? 'Post'
          : `${hours}h placement`,
      hours,
    };
  }
}

export function pricingSettingsForChannel(channel: AdSalesPricingChannel) {
  return {
    channelId: channel.id,
    baseCpm: decimalToString(channel.adBaseCpm),
    currency: channel.adBaseCurrency || 'USD',
    updatedAt: channel.updatedAt?.toISOString() ?? null,
  };
}

export function pricingWindowSummary(result: ExpectedViewsResult) {
  return {
    expectedViews: result.expectedViews,
    averageViews: result.averageViews,
    medianViews: result.medianViews,
    postsSampleCount: result.postsSampleCount,
    dataQuality: result.dataQuality,
  };
}
