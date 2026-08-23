import { calculateChannelAssetEconomics } from '../../../common/analytics/channel-financial-summary';

type KpiStatus = 'good' | 'acceptable' | 'bad' | 'unknown';

type FormatWindow = {
  expectedViews: number | null;
  estimatedPrice: number | null;
  postsSampleCount: number;
  dataQuality: 'READY' | 'NOT_ENOUGH_DATA';
};

type FormatPricing = {
  currency: string;
  cpm: number | null;
  h24: FormatWindow;
  h48: FormatWindow;
  h72: FormatWindow;
  permanent: FormatWindow;
};

type AssetEconomics = {
  currency: string;
  invested: number | null;
  purchasePrice: number | null;
  revenue: number | null;
  adSpend: number | null;
  adsSold: number;
  conversionUnavailable: boolean;
  formatPricing?: FormatPricing | null;
};

function hasAmount(value: number | null | undefined) {
  return Number.isFinite(Number(value)) && Math.abs(Number(value)) > 0.0001;
}

function hasMeaningfulPricing(pricing?: FormatPricing | null) {
  return Boolean(
    hasAmount(pricing?.cpm) ||
    hasAmount(pricing?.h24?.estimatedPrice) ||
    hasAmount(pricing?.h48?.estimatedPrice) ||
    hasAmount(pricing?.h72?.estimatedPrice) ||
    hasAmount(pricing?.permanent?.estimatedPrice),
  );
}

function hasMeaningfulEconomics(economics?: AssetEconomics | null) {
  return Boolean(
    hasAmount(economics?.invested) ||
    hasAmount(economics?.purchasePrice) ||
    hasAmount(economics?.revenue) ||
    hasAmount(economics?.adSpend) ||
    Number(economics?.adsSold || 0) > 0 ||
    hasMeaningfulPricing(economics?.formatPricing),
  );
}

function hasMonetaryActivity(channel: ChannelNetworkSummaryInput) {
  return (
    hasAmount(channel.totalAdSpend) ||
    hasMeaningfulEconomics(channel.assetEconomics)
  );
}

export type ChannelNetworkSummaryInput = {
  currency?: string | null;
  subscribersCount?: number | null;
  activeSubscribersEstimate?: number | null;
  paidActiveSubscribersEstimate?: number | null;
  avgViewsAdjusted?: number | null;
  avgReactionsAdjusted?: number | null;
  totalAdSpend?: number | null;
  campaignsCount?: number | null;
  totalJoinedSubscribers?: number | null;
  totalPendingSubscribers?: number | null;
  totalAttributedSubscribers?: number | null;
  kpiStatus: KpiStatus;
  assetEconomics?: AssetEconomics | null;
};

function kpiLabel(status: KpiStatus) {
  if (status === 'good') return 'Good';
  if (status === 'acceptable') return 'Acceptable';
  if (status === 'bad') return 'Stop';
  return '-';
}

function aggregateKpiStatus(statuses: KpiStatus[]): KpiStatus {
  if (statuses.includes('bad')) return 'bad';
  if (statuses.includes('acceptable')) return 'acceptable';
  if (statuses.includes('good')) return 'good';
  return 'unknown';
}

function aggregateFormatPricing(
  channelSummaries: ChannelNetworkSummaryInput[],
  currency: string,
) {
  const pricing = channelSummaries
    .map((channel) => channel.assetEconomics?.formatPricing)
    .filter(
      (value): value is FormatPricing =>
        Boolean(value) &&
        value?.currency.toUpperCase() === currency &&
        hasMeaningfulPricing(value),
    );
  if (!pricing.length) return null;
  const aggregateWindow = (
    key: keyof Omit<FormatPricing, 'currency' | 'cpm'>,
  ) => {
    const windows = pricing.map((item) => item[key]);
    const expectedViews = windows.reduce(
      (sum, window) => sum + Number(window?.expectedViews || 0),
      0,
    );
    const prices = windows.map((window) => window?.estimatedPrice);
    return {
      expectedViews: expectedViews || null,
      estimatedPrice:
        prices.length > 0 && prices.every((price) => price != null)
          ? prices.reduce((sum, price) => sum + Number(price || 0), 0)
          : null,
      postsSampleCount: windows.reduce(
        (sum, window) => sum + Number(window?.postsSampleCount || 0),
        0,
      ),
      dataQuality: windows.every((window) => window.dataQuality === 'READY')
        ? 'READY'
        : 'NOT_ENOUGH_DATA',
    };
  };
  const result = {
    currency,
    h24: aggregateWindow('h24'),
    h48: aggregateWindow('h48'),
    h72: aggregateWindow('h72'),
    permanent: aggregateWindow('permanent'),
  };
  const cpm =
    result.permanent.expectedViews && result.permanent.estimatedPrice != null
      ? (result.permanent.estimatedPrice / result.permanent.expectedViews) *
        1000
      : null;
  return { ...result, cpm };
}

function aggregateAssetEconomics(
  channelSummaries: ChannelNetworkSummaryInput[],
) {
  const economics = channelSummaries
    .map((channel) => channel.assetEconomics)
    .filter((value): value is AssetEconomics => hasMeaningfulEconomics(value));
  const currencies = [
    ...new Set(
      economics
        .map((item) => String(item.currency || '').toUpperCase())
        .filter(Boolean),
    ),
  ];
  const currency = currencies.length === 1 ? currencies[0] : null;
  const comparable =
    Boolean(currency) &&
    economics.length > 0 &&
    economics.every(
      (item) =>
        !item.conversionUnavailable &&
        item.invested != null &&
        item.revenue != null,
    );
  const sum = (
    key: 'invested' | 'purchasePrice' | 'revenue' | 'adSpend' | 'adsSold',
  ) => economics.reduce((total, item) => total + Number(item[key] || 0), 0);
  const formatPricing = currency
    ? aggregateFormatPricing(channelSummaries, currency)
    : null;
  const permanent = formatPricing?.permanent;
  const permanentCpm =
    permanent?.expectedViews && permanent.estimatedPrice != null
      ? (permanent.estimatedPrice / permanent.expectedViews) * 1000
      : null;
  return {
    ...calculateChannelAssetEconomics({
      currency: currency || '',
      invested: comparable ? sum('invested') : null,
      purchasePrice: comparable ? sum('purchasePrice') : null,
      revenue: comparable ? sum('revenue') : null,
      adSpend: comparable ? sum('adSpend') : null,
      adsSold: sum('adsSold'),
      expectedViews: permanent?.expectedViews ?? null,
      cpm: permanentCpm,
      conversionUnavailable: !comparable,
    }),
    currency,
    formatPricing,
  };
}

export function aggregateChannelNetworkSummary(
  channelSummaries: ChannelNetworkSummaryInput[],
) {
  const monetaryChannels = channelSummaries.filter(hasMonetaryActivity);
  const currencies = [
    ...new Set(
      monetaryChannels
        .map((channel) => String(channel.currency || '').toUpperCase())
        .filter(Boolean),
    ),
  ];
  const totalSubscribers = channelSummaries.reduce(
    (sum, channel) => sum + Number(channel.subscribersCount || 0),
    0,
  );
  const activeSubscribersEstimate = channelSummaries.reduce(
    (sum, channel) => sum + Number(channel.activeSubscribersEstimate || 0),
    0,
  );
  const paidActiveSubscribersEstimate = channelSummaries.reduce(
    (sum, channel) => sum + Number(channel.paidActiveSubscribersEstimate || 0),
    0,
  );
  const adjustedViews = channelSummaries.reduce(
    (sum, channel) => sum + Number(channel.avgViewsAdjusted || 0),
    0,
  );
  const adjustedReactions = channelSummaries.reduce(
    (sum, channel) => sum + Number(channel.avgReactionsAdjusted || 0),
    0,
  );
  const monetaryComparable = currencies.length <= 1;
  const totalAdSpend = monetaryComparable
    ? channelSummaries.reduce(
        (sum, channel) => sum + Number(channel.totalAdSpend || 0),
        0,
      )
    : null;
  const campaignsCount = channelSummaries.reduce(
    (sum, channel) => sum + Number(channel.campaignsCount || 0),
    0,
  );
  const totalJoinedSubscribers = channelSummaries.reduce(
    (sum, channel) => sum + Number(channel.totalJoinedSubscribers || 0),
    0,
  );
  const totalPendingSubscribers = channelSummaries.reduce(
    (sum, channel) => sum + Number(channel.totalPendingSubscribers || 0),
    0,
  );
  const totalAttributedSubscribers = channelSummaries.reduce(
    (sum, channel) => sum + Number(channel.totalAttributedSubscribers || 0),
    0,
  );
  const kpiStatus = aggregateKpiStatus(
    channelSummaries.map((channel) => channel.kpiStatus),
  );
  return {
    channelsCount: channelSummaries.length,
    totalSubscribers,
    activeSubscribersEstimate,
    paidActiveSubscribersEstimate,
    viewRate:
      totalSubscribers > 0
        ? (activeSubscribersEstimate / totalSubscribers) * 100
        : null,
    reactionRate:
      adjustedViews > 0 ? (adjustedReactions / adjustedViews) * 100 : null,
    currency: currencies.length === 1 ? currencies[0] : null,
    totalAdSpend,
    campaignsCount,
    totalJoinedSubscribers,
    totalPendingSubscribers,
    totalAttributedSubscribers,
    avgCpa:
      totalAdSpend != null && totalAttributedSubscribers > 0
        ? totalAdSpend / totalAttributedSubscribers
        : null,
    activeCpa:
      totalAdSpend != null && paidActiveSubscribersEstimate > 0
        ? totalAdSpend / paidActiveSubscribersEstimate
        : null,
    kpiStatus,
    kpiLabel: kpiLabel(kpiStatus),
    assetEconomics: aggregateAssetEconomics(channelSummaries),
  };
}
