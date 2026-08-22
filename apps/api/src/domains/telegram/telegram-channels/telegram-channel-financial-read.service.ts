import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

@Injectable()
export class TelegramChannelFinancialReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currencyConversionService: CurrencyConversionService,
  ) {}

  public async buildChannelFinancialSummaryPreview(
    workspaceId: string,
    channels: Array<{
      id: string;
      purchaseTransactionId?: string | null;
      currentSubscribersCount?: number | null;
      activeSubscribersWindow?: number | null;
      targetCpaFrom?: Prisma.Decimal | number | null;
      targetCpa?: Prisma.Decimal | number | null;
      acceptableCpaFrom?: Prisma.Decimal | number | null;
      acceptableCpa?: Prisma.Decimal | number | null;
      stopCpaFrom?: Prisma.Decimal | number | null;
      stopCpa?: Prisma.Decimal | number | null;
      kpiCurrency?: string | null;
      ownViewsPerPost?: number | null;
      adBaseCpm?: Prisma.Decimal | number | null;
      adBaseCurrency?: string | null;
      audienceSnapshots?: Array<{
        activeSubscribersEstimate?: number | null;
        dataQuality?: string | null;
        dataQualityReason?: string | null;
        hasExternalTrafficAnomaly?: boolean | null;
        hasSubscriberBasePollution?: boolean | null;
      }>;
    }>,
  ) {
    if (!channels.length) {
      return new Map<string, Record<string, unknown>>();
    }
    const channelIds = channels.map((channel) => channel.id);
    const [campaigns, inviteLinks, transactions, workspace] = await Promise.all(
      [
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
          where: { workspaceId, telegramChannelId: { in: channelIds } },
          select: {
            id: true,
            telegramChannelId: true,
            type: true,
            amount: true,
            currency: true,
            amountInPrimaryCurrency: true,
            categoryRef: { select: { key: true, name: true } },
          },
        }),
        this.prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { primaryCurrency: true },
        }),
      ],
    );

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
      if (!transaction.telegramChannelId) continue;
      const list =
        transactionsByChannelId.get(transaction.telegramChannelId) ?? [];
      list.push(transaction);
      transactionsByChannelId.set(transaction.telegramChannelId, list);
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
          (transaction.categoryRef?.key === 'channel_advertising_revenue' ||
            transaction.categoryRef?.name?.trim().toLowerCase() ===
              'channel advertising revenue'),
      );
      const acquisitionCost = purchaseTransactions.reduce(
        (sum, transaction) =>
          sum + Number(transaction.amountInPrimaryCurrency || 0),
        0,
      );
      const totalAdSpend = channelCampaigns.reduce(
        (sum, campaign) => sum + Number(campaign.priceInPrimaryCurrency || 0),
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
        ...channelCampaigns.map((campaign) => ({
          currency: campaign.currency,
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
      const investedPrimary = totalSpend;
      const revenuePrimary = revenueTransactions.reduce(
        (sum, transaction) =>
          sum + Number(transaction.amountInPrimaryCurrency || 0),
        0,
      );
      const [invested, purchasePrice, revenue, adSpend, cpm] =
        await Promise.all([
          convertPrimary(investedPrimary, dominantCurrency),
          convertPrimary(acquisitionCost, dominantCurrency),
          convertPrimary(revenuePrimary, dominantCurrency),
          convertPrimary(totalAdSpend, dominantCurrency),
          channel.adBaseCpm == null
            ? Promise.resolve(null)
            : this.currencyConversionService
              ? this.currencyConversionService.convertCurrency(
                  Number(channel.adBaseCpm),
                  String(channel.adBaseCurrency || primaryCurrency),
                  dominantCurrency,
                  workspaceId,
                )
              : Promise.resolve(null),
        ]);
      const economics = calculateChannelAssetEconomics({
        currency: dominantCurrency,
        invested,
        purchasePrice,
        revenue,
        adSpend,
        adsSold: channelCampaigns.filter(
          (campaign) => campaign.status === 'finished',
        ).length,
        expectedViews: channel.ownViewsPerPost ?? null,
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
        assetEconomics: economics,
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
