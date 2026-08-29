import { Injectable } from '@nestjs/common';
import { CurrencyConversionService } from '../../../common/currency-conversion.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramChannelAdPricingReadService } from './telegram-channel-ad-pricing-read.service';
import type { TelegramChannelFinancialPreviewInput } from './telegram-channel-financial-read.types';
import {
  prepareTelegramChannelFinancialSummaries,
  type PreparedTelegramChannelFinancialSummaries,
  type TelegramChannelFinancialSummaryOptions,
} from './telegram-channel-financial-summary-preparation';

@Injectable()
export class TelegramChannelFinancialReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currencyConversionService: CurrencyConversionService,
    private readonly adPricingReadService: TelegramChannelAdPricingReadService,
  ) {}

  public async buildChannelFinancialSummaryPreview(
    workspaceId: string,
    channels: TelegramChannelFinancialPreviewInput[],
    options: TelegramChannelFinancialSummaryOptions = {},
  ) {
    const prepared = await this.prepareChannelFinancialSummaryPreview(
      workspaceId,
      channels,
    );
    return prepared.build(channels, options);
  }

  public async prepareChannelFinancialSummaryPreview(
    workspaceId: string,
    channels: TelegramChannelFinancialPreviewInput[],
  ): Promise<PreparedTelegramChannelFinancialSummaries> {
    if (!channels.length) {
      return { build: () => Promise.resolve(new Map()) };
    }
    const channelIds = [...new Set(channels.map((channel) => channel.id))];
    const purchaseTransactionIds = [
      ...new Set(
        channels
          .map((channel) => channel.purchaseTransactionId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const [
      campaigns,
      inviteLinks,
      transactions,
      adSaleAllocations,
      workspace,
      pricingWindowsByChannel,
    ] = await Promise.all([
      this.prisma.adCampaign.findMany({
        where: {
          workspaceId,
          telegramChannelId: { in: channelIds },
          excludeFromAnalytics: false,
        },
        select: {
          id: true,
          telegramChannelId: true,
          priceInPrimaryCurrency: true,
          currency: true,
          price: true,
          status: true,
          joinedCount: true,
          newSubscribers: true,
          cappedActiveSubscribersFromAd: true,
          activeSubscribersFromAd: true,
          activeRate: true,
          retention7d: true,
        },
      }),
      this.prisma.telegramInviteLink.findMany({
        where: {
          workspaceId,
          telegramChannelId: { in: channelIds },
          adCampaignId: { not: null },
        },
        select: {
          telegramChannelId: true,
          adCampaignId: true,
          joinedCount: true,
          requestedCount: true,
        },
      }),
      this.prisma.transaction.findMany({
        where: {
          workspaceId,
          OR: [
            { telegramChannelId: { in: channelIds } },
            { id: { in: purchaseTransactionIds } },
            {
              adCampaign: {
                telegramChannelId: { in: channelIds },
                excludeFromAnalytics: false,
              },
            },
          ],
        },
        select: {
          id: true,
          telegramChannelId: true,
          type: true,
          amount: true,
          currency: true,
          amountInPrimaryCurrency: true,
          categoryRef: { select: { key: true, name: true } },
          adCampaign: {
            select: { telegramChannelId: true },
          },
          telegramAdSalePayment: { select: { id: true } },
        },
      }),
      this.prisma.telegramAdSalePaymentAllocation.findMany({
        where: {
          workspaceId,
          placement: { telegramChannelId: { in: channelIds } },
          payment: { status: 'ACTIVE' },
        },
        select: {
          amount: true,
          currency: true,
          amountInPrimaryCurrency: true,
          placement: { select: { telegramChannelId: true } },
        },
      }),
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { primaryCurrency: true },
      }),
      this.adPricingReadService.windowsForChannels(workspaceId, channels),
    ]);
    let rateSourcePromise: ReturnType<
      CurrencyConversionService['prepareRateSource']
    > | null = null;
    const rateSource = {
      getRate: async (fromCurrency: string, toCurrency: string) => {
        rateSourcePromise ??=
          this.currencyConversionService.prepareRateSource(workspaceId);
        return (await rateSourcePromise).getRate(fromCurrency, toCurrency);
      },
    };
    return prepareTelegramChannelFinancialSummaries({
      channels,
      campaigns,
      inviteLinks,
      transactions,
      adSaleAllocations,
      primaryCurrency: workspace?.primaryCurrency ?? 'USD',
      pricingWindowsByChannel,
      rateSource,
    });
  }

  public async calculateAdAnalysisMetrics(
    workspaceId: string,
    channelId: string,
    postLimit = 20,
    price?: number | null,
  ) {
    const posts = await this.prisma.telegramPost.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        excludeFromAnalytics: false,
      },
      orderBy: { postDate: 'desc' },
      take: Math.max(1, Math.min(200, postLimit)),
      select: {
        viewsCount: true,
        reactionsCount: true,
        forwardsCount: true,
      },
    });
    const average = (values: Array<number | null>) => {
      const present = values.filter((value): value is number => value != null);
      return present.length
        ? present.reduce((sum, value) => sum + value, 0) / present.length
        : null;
    };
    const avgViews = average(posts.map((post) => post.viewsCount));
    const avgReactions = average(posts.map((post) => post.reactionsCount));
    const avgForwards = average(posts.map((post) => post.forwardsCount));
    return {
      postsCount: posts.length,
      avgViews,
      avgReactions,
      avgForwards,
      cpm:
        price != null && avgViews != null && avgViews > 0
          ? (price / avgViews) * 1000
          : null,
    };
  }
}
