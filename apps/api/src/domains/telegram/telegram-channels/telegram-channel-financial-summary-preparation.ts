import {
  calculateChannelAssetEconomics,
  effectiveCampaignAttributedSubscribers,
  effectiveCampaignJoinedSubscribers,
  effectiveCampaignPendingSubscribers,
  resolveChannelKpiLabel,
  resolveChannelKpiStatus,
} from '../../../common/analytics/channel-financial-summary';
import type { PreparedCurrencyRateSource } from '../../../common/currency-conversion.service';
import {
  priceChannelAdFormatWindows,
  resolveChannelCardExpectedViews,
  type ChannelAdPricingWindows,
} from './telegram-channel-ad-pricing-read.service';
import type { TelegramChannelFinancialPreviewInput } from './telegram-channel-financial-read.types';

export type TelegramChannelFinancialSummaryOptions = {
  normalizeToPrimaryCurrency?: boolean;
  targetCurrency?: string;
};

type Campaign = {
  id: string;
  telegramChannelId: string;
  status: string;
  joinedCount: number;
  newSubscribers: number | null;
  cappedActiveSubscribersFromAd: number | null;
  activeSubscribersFromAd: number | null;
  activeRate: unknown;
  retention7d: unknown;
};

type InviteLink = {
  adCampaignId: string | null;
  joinedCount: number;
  requestedCount: number;
};

type FinancialRow = {
  amount: unknown;
  currency: string;
  amountInPrimaryCurrency?: unknown;
};

type Transaction = FinancialRow & {
  id: string;
  telegramChannelId: string | null;
  type: string;
  categoryRef: { key: string | null; name: string } | null;
  adCampaign: { telegramChannelId: string } | null;
  telegramAdSalePayment: { id: string } | null;
};

type AdSaleAllocation = FinancialRow & {
  placement: { telegramChannelId: string };
};

export type TelegramChannelFinancialSummarySources = {
  channels: TelegramChannelFinancialPreviewInput[];
  campaigns: Campaign[];
  inviteLinks: InviteLink[];
  transactions: Transaction[];
  adSaleAllocations: AdSaleAllocation[];
  primaryCurrency: string;
  pricingWindowsByChannel: Map<string, ChannelAdPricingWindows>;
  rateSource: Pick<PreparedCurrencyRateSource, 'getRate'>;
};

export type PreparedTelegramChannelFinancialSummaries = {
  build: (
    channels: TelegramChannelFinancialPreviewInput[],
    options?: TelegramChannelFinancialSummaryOptions,
  ) => Promise<Map<string, Record<string, unknown>>>;
};

function appendByKey<T>(map: Map<string, T[]>, key: string, value: T) {
  map.set(key, [...(map.get(key) ?? []), value]);
}

export function prepareTelegramChannelFinancialSummaries(
  sources: TelegramChannelFinancialSummarySources,
): PreparedTelegramChannelFinancialSummaries {
  const preparedChannelsById = new Map(
    sources.channels.map((channel) => [channel.id, channel]),
  );
  const inviteLinksByCampaignId = new Map<
    string,
    Array<{ joinedCount: number; requestedCount: number }>
  >();
  for (const inviteLink of sources.inviteLinks) {
    if (!inviteLink.adCampaignId) continue;
    appendByKey(inviteLinksByCampaignId, inviteLink.adCampaignId, {
      joinedCount: Number(inviteLink.joinedCount || 0),
      requestedCount: Number(inviteLink.requestedCount || 0),
    });
  }

  const campaignsByChannelId = new Map<string, Campaign[]>();
  for (const campaign of sources.campaigns) {
    appendByKey(campaignsByChannelId, campaign.telegramChannelId, campaign);
  }

  const purchaseChannelIdByTransactionId = new Map(
    sources.channels.flatMap((channel) =>
      channel.purchaseTransactionId
        ? [[channel.purchaseTransactionId, channel.id] as const]
        : [],
    ),
  );
  const transactionsByChannelId = new Map<string, Transaction[]>();
  for (const transaction of sources.transactions) {
    const channelId =
      transaction.telegramChannelId ??
      transaction.adCampaign?.telegramChannelId ??
      purchaseChannelIdByTransactionId.get(transaction.id);
    if (channelId) appendByKey(transactionsByChannelId, channelId, transaction);
  }

  const adSaleAllocationsByChannelId = new Map<string, AdSaleAllocation[]>();
  for (const allocation of sources.adSaleAllocations) {
    appendByKey(
      adSaleAllocationsByChannelId,
      allocation.placement.telegramChannelId,
      allocation,
    );
  }

  const pairConversionCache = new Map<string, Promise<number | null>>();
  const convertAmount = async (
    amount: number,
    fromCurrency: string,
    toCurrency: string,
  ) => {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();
    if (from === to) return amount;
    const key = `${from}:${to}`;
    if (!pairConversionCache.has(key)) {
      pairConversionCache.set(key, sources.rateSource.getRate(from, to));
    }
    const rate = await pairConversionCache.get(key)!;
    return rate == null ? null : amount * rate;
  };
  const convertPrimary = async (amount: number, currency: string) => {
    if (amount === 0) return 0;
    return convertAmount(amount, sources.primaryCurrency, currency);
  };
  const sumInCurrency = async (
    rows: FinancialRow[],
    targetCurrency: string,
  ) => {
    const converted = await Promise.all(
      rows.map(async (row) => {
        const sourceCurrency = String(row.currency).toUpperCase();
        if (sourceCurrency === targetCurrency) return Number(row.amount);
        const nativeValue = await convertAmount(
          Number(row.amount),
          sourceCurrency,
          targetCurrency,
        );
        if (nativeValue != null) return nativeValue;
        return row.amountInPrimaryCurrency == null
          ? null
          : convertPrimary(Number(row.amountInPrimaryCurrency), targetCurrency);
      }),
    );
    return converted.some((value) => value == null)
      ? null
      : converted.reduce<number>((sum, value) => sum + Number(value ?? 0), 0);
  };

  const summaryCache = new Map<string, Record<string, unknown>>();
  const build = async (
    channels: TelegramChannelFinancialPreviewInput[],
    options: TelegramChannelFinancialSummaryOptions = {},
  ) => {
    const summaries = new Map<string, Record<string, unknown>>();
    for (const requestedChannel of channels) {
      const channel =
        preparedChannelsById.get(requestedChannel.id) ?? requestedChannel;
      const requestedCurrency = options.targetCurrency?.trim().toUpperCase();
      const cacheKey = `${channel.id}:${requestedCurrency ?? ''}:${Boolean(options.normalizeToPrimaryCurrency)}`;
      let summary = summaryCache.get(cacheKey);
      if (!summary) {
        summary = await buildChannelSummary(
          channel,
          options,
          sources,
          campaignsByChannelId,
          inviteLinksByCampaignId,
          transactionsByChannelId,
          adSaleAllocationsByChannelId,
          sumInCurrency,
          convertAmount,
        );
        summaryCache.set(cacheKey, summary);
      }
      summaries.set(requestedChannel.id, summary);
    }
    return summaries;
  };

  return { build };
}

async function buildChannelSummary(
  channel: TelegramChannelFinancialPreviewInput,
  options: TelegramChannelFinancialSummaryOptions,
  sources: TelegramChannelFinancialSummarySources,
  campaignsByChannelId: Map<string, Campaign[]>,
  inviteLinksByCampaignId: Map<
    string,
    Array<{ joinedCount: number; requestedCount: number }>
  >,
  transactionsByChannelId: Map<string, Transaction[]>,
  adSaleAllocationsByChannelId: Map<string, AdSaleAllocation[]>,
  sumInCurrency: (
    rows: FinancialRow[],
    targetCurrency: string,
  ) => Promise<number | null>,
  convertAmount: (
    amount: number,
    fromCurrency: string,
    toCurrency: string,
  ) => Promise<number | null>,
) {
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
        transaction.categoryRef?.name?.trim().toLowerCase() === 'advertising'),
  );
  const kpiCurrency = String(
    channel.kpiCurrency || sources.primaryCurrency,
  ).toUpperCase();
  const [acquisitionCost, totalAdSpend] = await Promise.all([
    sumInCurrency(purchaseTransactions, kpiCurrency),
    sumInCurrency(advertisingExpenseTransactions, kpiCurrency),
  ]);
  const totalSpend =
    acquisitionCost == null || totalAdSpend == null
      ? null
      : totalAdSpend + acquisitionCost;
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
    (sum, campaign) => sum + effectiveCampaignAttributedSubscribers(campaign),
    0,
  );
  const avgCpa =
    totalAdSpend != null && totalAttributedSubscribers > 0
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
    totalAdSpend != null &&
    paidActiveSubscribersEstimate &&
    paidActiveSubscribersEstimate > 0
      ? totalAdSpend / paidActiveSubscribersEstimate
      : null;
  const activeRates = channelCampaigns
    .map((campaign) => Number(campaign.activeRate))
    .filter((value) => Number.isFinite(value));
  const retentionRates = channelCampaigns
    .map((campaign) => Number(campaign.retention7d))
    .filter((value) => Number.isFinite(value));
  const kpiStatus = resolveChannelKpiStatus({
    avgCpa,
    targetCpaFrom: channel.targetCpaFrom,
    targetCpa: channel.targetCpa,
    acceptableCpaFrom: channel.acceptableCpaFrom,
    acceptableCpa: channel.acceptableCpa,
    stopCpaFrom: channel.stopCpaFrom,
    stopCpa: channel.stopCpa,
  });
  const economicsTransactions = [
    ...advertisingExpenseTransactions,
    ...purchaseTransactions,
  ];
  const currencyCounts = new Map<string, number>();
  for (const transaction of economicsTransactions) {
    const currency = String(
      transaction.currency || sources.primaryCurrency,
    ).toUpperCase();
    currencyCounts.set(currency, (currencyCounts.get(currency) ?? 0) + 1);
  }
  const maxCount = Math.max(0, ...currencyCounts.values());
  const tiedCurrencies = [...currencyCounts.entries()]
    .filter(([, count]) => count === maxCount)
    .map(([currency]) => currency)
    .sort();
  const requestedCurrency = options.targetCurrency?.trim().toUpperCase();
  const dominantCurrency = requestedCurrency
    ? requestedCurrency
    : options.normalizeToPrimaryCurrency
      ? sources.primaryCurrency.toUpperCase()
      : (tiedCurrencies.find((currency) => currency === kpiCurrency) ??
        tiedCurrencies.find(
          (currency) => currency === sources.primaryCurrency.toUpperCase(),
        ) ??
        tiedCurrencies[0] ??
        kpiCurrency);
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
      : String(
            channel.adBaseCurrency || sources.primaryCurrency,
          ).toUpperCase() === dominantCurrency
        ? Promise.resolve(Number(channel.adBaseCpm))
        : convertAmount(
            Number(channel.adBaseCpm),
            String(channel.adBaseCurrency || sources.primaryCurrency),
            dominantCurrency,
          ),
  ]);
  const invested =
    purchasePrice == null && purchaseTransactions.length
      ? null
      : adSpend == null
        ? null
        : (purchasePrice ?? 0) + adSpend;
  const pricingWindows = sources.pricingWindowsByChannel.get(channel.id);
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
  return {
    acquisitionCost,
    totalSpend,
    totalAdSpend,
    campaignsCount: channelCampaigns.length,
    totalJoinedSubscribers,
    totalPendingSubscribers,
    totalAttributedSubscribers,
    avgCpa,
    activeSubscribersEstimate: audience?.activeSubscribersEstimate ?? null,
    paidActiveSubscribersEstimate,
    activeCpa,
    avgActiveRate: activeRates.length
      ? activeRates.reduce((sum, value) => sum + value, 0) / activeRates.length
      : null,
    avgRetention7d: retentionRates.length
      ? retentionRates.reduce((sum, value) => sum + value, 0) /
        retentionRates.length
      : null,
    dataQuality: audience?.dataQuality ?? null,
    dataQualityReason: audience?.dataQualityReason ?? null,
    dataQualityWarning: null,
    hasExternalTrafficAnomaly: audience?.hasExternalTrafficAnomaly ?? false,
    hasSubscriberBasePollution: audience?.hasSubscriberBasePollution ?? false,
    kpiStatus,
    kpiLabel: resolveChannelKpiLabel(kpiStatus),
    currency: kpiCurrency,
    assetEconomics: { ...economics, formatPricing },
  };
}
