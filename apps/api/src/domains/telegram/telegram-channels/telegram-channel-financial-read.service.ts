import { Injectable } from '@nestjs/common';
import {
  calculateChannelAssetEconomics,
  effectiveCampaignAttributedSubscribers,
  effectiveCampaignJoinedSubscribers,
  effectiveCampaignPendingSubscribers,
  resolveChannelKpiLabel,
  resolveChannelKpiStatus,
} from '../../../common/analytics/channel-financial-summary';
import { CurrencyConversionService } from '../../../common/currency-conversion.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  priceChannelAdFormatWindows,
  resolveChannelCardExpectedViews,
  TelegramChannelAdPricingReadService,
} from './telegram-channel-ad-pricing-read.service';
import type { TelegramChannelFinancialPreviewInput } from './telegram-channel-financial-read.types';

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
  ) {
    if (!channels.length) {
      return new Map<string, Record<string, unknown>>();
    }
    const channelIds = channels.map((channel) => channel.id);
    const purchaseTransactionIds = channels
      .map((channel) => channel.purchaseTransactionId)
      .filter((id): id is string => Boolean(id));
    const purchaseChannelIdByTransactionId = new Map(
      channels.flatMap((channel) =>
        channel.purchaseTransactionId
          ? [[channel.purchaseTransactionId, channel.id] as const]
          : [],
      ),
    );
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

    const inviteLinksByCampaignId = new Map<
      string,
      Array<{ joinedCount: number; requestedCount: number }>
    >();
    for (const inviteLink of inviteLinks) {
      if (!inviteLink.adCampaignId) continue;
      const list = inviteLinksByCampaignId.get(inviteLink.adCampaignId) ?? [];
      list.push({
        joinedCount: Number(inviteLink.joinedCount || 0),
        requestedCount: Number(inviteLink.requestedCount || 0),
      });
      inviteLinksByCampaignId.set(inviteLink.adCampaignId, list);
    }

    const campaignsByChannelId = new Map<string, typeof campaigns>();
    for (const campaign of campaigns) {
      const list = campaignsByChannelId.get(campaign.telegramChannelId) ?? [];
      list.push(campaign);
      campaignsByChannelId.set(campaign.telegramChannelId, list);
    }

    const transactionsByChannelId = new Map<string, typeof transactions>();
    for (const transaction of transactions) {
      const channelId =
        transaction.telegramChannelId ??
        transaction.adCampaign?.telegramChannelId ??
        purchaseChannelIdByTransactionId.get(transaction.id);
      if (!channelId) continue;
      const list = transactionsByChannelId.get(channelId) ?? [];
      list.push(transaction);
      transactionsByChannelId.set(channelId, list);
    }
    const adSaleAllocationsByChannelId = new Map<
      string,
      typeof adSaleAllocations
    >();
    for (const allocation of adSaleAllocations) {
      const channelId = allocation.placement.telegramChannelId;
      const list = adSaleAllocationsByChannelId.get(channelId) ?? [];
      list.push(allocation);
      adSaleAllocationsByChannelId.set(channelId, list);
    }
    const primaryCurrency = workspace?.primaryCurrency ?? 'USD';
    const conversionCache = new Map<string, number | null>();
    const convertPrimary = async (amount: number, currency: string) => {
      if (amount === 0) return 0;
      const target = currency.toUpperCase();
      if (target === primaryCurrency.toUpperCase()) return amount;
      if (!this.currencyConversionService) return null;
      if (!conversionCache.has(target)) {
        conversionCache.set(
          target,
          await this.currencyConversionService.getRate(
            primaryCurrency,
            target,
            workspaceId,
          ),
        );
      }
      const rate = conversionCache.get(target);
      return rate == null ? null : amount * rate;
    };

    const summaries = new Map<string, Record<string, unknown>>();

    for (const channel of channels) {
      const audience = channel.audienceSnapshots?.[0];
      const channelCampaigns = campaignsByChannelId.get(channel.id) ?? [];
      const channelTransactions = transactionsByChannelId.get(channel.id) ?? [];
      const channelAdSaleAllocations =
        adSaleAllocationsByChannelId.get(channel.id) ?? [];
      const purchaseTransactions = channelTransactions.filter(
        (transaction) =>
          transaction.type === 'expense' &&
          (transaction.id === channel.purchaseTransactionId ||
            transaction.categoryRef?.key === 'buy_channels' ||
            transaction.categoryRef?.name?.trim().toLowerCase() ===
              'buy channels' ||
            transaction.categoryRef?.name?.trim().toLowerCase() ===
              'buy channels (legacy)'),
      );
      const revenueTransactions = channelTransactions.filter(
        (transaction) =>
          transaction.type === 'income' &&
          !transaction.telegramAdSalePayment &&
          (transaction.categoryRef?.key === 'channel_advertising_revenue' ||
            transaction.categoryRef?.name?.trim().toLowerCase() ===
              'channel advertising revenue'),
      );
      const advertisingExpenseTransactions = channelTransactions.filter(
        (transaction) =>
          transaction.type === 'expense' &&
          (transaction.categoryRef?.key === 'advertising' ||
            transaction.categoryRef?.name?.trim().toLowerCase() ===
              'advertising'),
      );
      const acquisitionCost = purchaseTransactions.reduce(
        (sum, transaction) =>
          sum + Number(transaction.amountInPrimaryCurrency || 0),
        0,
      );
      const totalAdSpend = advertisingExpenseTransactions.reduce(
        (sum, transaction) =>
          sum + Number(transaction.amountInPrimaryCurrency || 0),
        0,
      );
      const totalSpend = totalAdSpend + acquisitionCost;
      const normalizedCampaigns = channelCampaigns.map((campaign) => ({
        ...campaign,
        inviteLinks: inviteLinksByCampaignId.get(campaign.id) ?? [],
      }));
      const totalJoinedSubscribers = normalizedCampaigns.reduce(
        (sum, campaign) => sum + effectiveCampaignJoinedSubscribers(campaign),
        0,
      );
      const totalPendingSubscribers = normalizedCampaigns.reduce(
        (sum, campaign) => sum + effectiveCampaignPendingSubscribers(campaign),
        0,
      );
      const totalAttributedSubscribers = normalizedCampaigns.reduce(
        (sum, campaign) =>
          sum + effectiveCampaignAttributedSubscribers(campaign),
        0,
      );
      const avgCpa =
        totalAttributedSubscribers > 0
          ? totalAdSpend / totalAttributedSubscribers
          : null;
      const campaignActiveSubscribersEstimate = channelCampaigns.reduce(
        (sum, campaign) =>
          sum +
          Number(
            campaign.cappedActiveSubscribersFromAd ??
              campaign.activeSubscribersFromAd ??
              0,
          ),
        0,
      );
      const paidActiveSubscribersEstimate =
        campaignActiveSubscribersEstimate > 0
          ? campaignActiveSubscribersEstimate
          : (audience?.activeSubscribersEstimate ?? null);
      const activeCpa =
        paidActiveSubscribersEstimate && paidActiveSubscribersEstimate > 0
          ? totalAdSpend / paidActiveSubscribersEstimate
          : null;
      const activeRates = channelCampaigns
        .map((campaign) => Number(campaign.activeRate))
        .filter((value) => Number.isFinite(value));
      const retentionRates = channelCampaigns
        .map((campaign) => Number(campaign.retention7d))
        .filter((value) => Number.isFinite(value));
      const kpiCurrency = String(
        channel.kpiCurrency || primaryCurrency,
      ).toUpperCase();
      const avgCpaInKpiCurrency =
        avgCpa == null ? null : await convertPrimary(avgCpa, kpiCurrency);
      const kpiStatus = resolveChannelKpiStatus({
        avgCpa: avgCpaInKpiCurrency,
        targetCpaFrom: channel.targetCpaFrom,
        targetCpa: channel.targetCpa,
        acceptableCpaFrom: channel.acceptableCpaFrom,
        acceptableCpa: channel.acceptableCpa,
        stopCpaFrom: channel.stopCpaFrom,
        stopCpa: channel.stopCpa,
      });
      // Use the currency of costs, not revenue, for a channel's payback card.
      // A UAH acquisition/ad spend must not turn into a mixed-currency view
      // just because an ad sale was recorded in another currency.
      const economicsTransactions = [
        ...advertisingExpenseTransactions.map((transaction) => ({
          currency: transaction.currency,
        })),
        ...purchaseTransactions.map((transaction) => ({
          currency: transaction.currency,
        })),
      ];
      const currencyCounts = new Map<string, number>();
      for (const transaction of economicsTransactions) {
        const currency = String(
          transaction.currency || primaryCurrency,
        ).toUpperCase();
        currencyCounts.set(currency, (currencyCounts.get(currency) ?? 0) + 1);
      }
      const maxCount = Math.max(0, ...currencyCounts.values());
      const tiedCurrencies = [...currencyCounts.entries()]
        .filter(([, count]) => count === maxCount)
        .map(([currency]) => currency)
        .sort();
      const dominantCurrency =
        tiedCurrencies.find((currency) => currency === kpiCurrency) ??
        tiedCurrencies.find(
          (currency) => currency === primaryCurrency.toUpperCase(),
        ) ??
        tiedCurrencies[0] ??
        kpiCurrency;
      const sumInCurrency = async (
        rows: Array<{ amount: unknown; currency: string }>,
        targetCurrency: string,
      ) => {
        const converted = await Promise.all(
          rows.map((transaction) => {
            const sourceCurrency = String(transaction.currency).toUpperCase();
            if (sourceCurrency === targetCurrency) {
              return Promise.resolve(Number(transaction.amount));
            }
            return this.currencyConversionService
              ? this.currencyConversionService.convertCurrency(
                  Number(transaction.amount),
                  sourceCurrency,
                  targetCurrency,
                  workspaceId,
                )
              : Promise.resolve(null);
          }),
        );
        return converted.some((value) => value == null)
          ? null
          : converted.reduce<number>(
              (sum, value) => sum + Number(value ?? 0),
              0,
            );
      };
      const [purchasePrice, revenue, adSpend, cpm] = await Promise.all([
        purchaseTransactions.length
          ? sumInCurrency(purchaseTransactions, dominantCurrency)
          : Promise.resolve(null),
        sumInCurrency(
          [...revenueTransactions, ...channelAdSaleAllocations],
          dominantCurrency,
        ),
        sumInCurrency(advertisingExpenseTransactions, dominantCurrency),
        channel.adBaseCpm == null
          ? Promise.resolve(null)
          : String(channel.adBaseCurrency || primaryCurrency).toUpperCase() ===
              dominantCurrency
            ? Promise.resolve(Number(channel.adBaseCpm))
            : this.currencyConversionService
              ? this.currencyConversionService.convertCurrency(
                  Number(channel.adBaseCpm),
                  String(channel.adBaseCurrency || primaryCurrency),
                  dominantCurrency,
                  workspaceId,
                )
              : Promise.resolve(null),
      ]);
      const invested =
        purchasePrice == null && purchaseTransactions.length
          ? null
          : adSpend == null
            ? null
            : (purchasePrice ?? 0) + adSpend;
      const pricingWindows = pricingWindowsByChannel.get(channel.id);
      const expectedViews = resolveChannelCardExpectedViews(
        pricingWindows,
        channel,
        audience,
      );
      const formatPricing = priceChannelAdFormatWindows(
        pricingWindows,
        cpm,
        dominantCurrency,
      );
      const economics = calculateChannelAssetEconomics({
        currency: dominantCurrency,
        invested,
        purchasePrice,
        revenue,
        adSpend,
        adsSold: channelCampaigns.filter(
          (campaign) => campaign.status === 'finished',
        ).length,
        expectedViews,
        cpm,
        conversionUnavailable:
          invested == null ||
          revenue == null ||
          adSpend == null ||
          (channel.adBaseCpm != null && cpm == null),
      });
      summaries.set(channel.id, {
        acquisitionCost,
        totalSpend,
        totalAdSpend,
        campaignsCount: channelCampaigns.length,
        totalJoinedSubscribers,
        totalPendingSubscribers,
        totalAttributedSubscribers,
        avgCpa: avgCpaInKpiCurrency,
        activeSubscribersEstimate: audience?.activeSubscribersEstimate ?? null,
        paidActiveSubscribersEstimate,
        activeCpa,
        avgActiveRate: activeRates.length
          ? activeRates.reduce((sum, value) => sum + value, 0) /
            activeRates.length
          : null,
        avgRetention7d: retentionRates.length
          ? retentionRates.reduce((sum, value) => sum + value, 0) /
            retentionRates.length
          : null,
        dataQuality: audience?.dataQuality ?? null,
        dataQualityReason: audience?.dataQualityReason ?? null,
        dataQualityWarning: null,
        hasExternalTrafficAnomaly: audience?.hasExternalTrafficAnomaly ?? false,
        hasSubscriberBasePollution:
          audience?.hasSubscriberBasePollution ?? false,
        kpiStatus,
        kpiLabel: resolveChannelKpiLabel(kpiStatus),
        currency: kpiCurrency,
        assetEconomics: { ...economics, formatPricing },
      });
    }

    return summaries;
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
