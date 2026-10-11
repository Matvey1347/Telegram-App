import type {
  TelegramChannelAudienceTrend,
  TelegramChannelTrafficAttributionPreview,
} from '@telegram-system/shared';
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
  pendingJoinRequestsCount?: number | null;
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
  audienceTrend?: TelegramChannelAudienceTrend | null;
  trafficAttribution?: TelegramChannelTrafficAttributionPreview | null;
};

function aggregateTrendMetric(
  trends: TelegramChannelAudienceTrend[],
  key: keyof TelegramChannelAudienceTrend['metrics'],
) {
  const metrics = trends.map((trend) => trend.metrics[key]).filter(Boolean);
  if (!metrics.length) return null;
  const previous = metrics.reduce((sum, metric) => sum + metric!.previous, 0);
  const current = metrics.reduce((sum, metric) => sum + metric!.current, 0);
  const absoluteChange = current - previous;
  return {
    current,
    previous,
    absoluteChange,
    percentChange:
      previous === 0 ? null : (absoluteChange / Math.abs(previous)) * 100,
  };
}

function aggregatePendingJoinRequests(
  channelSummaries: ChannelNetworkSummaryInput[],
) {
  const withKnownCounter = channelSummaries.filter(
    (channel) =>
      channel.pendingJoinRequestsCount != null ||
      channel.audienceTrend?.metrics.pendingJoinRequests != null,
  );
  if (!withKnownCounter.length) return null;
  const previous = withKnownCounter.reduce(
    (sum, channel) =>
      sum + (channel.audienceTrend?.metrics.pendingJoinRequests?.previous ?? 0),
    0,
  );
  const current = withKnownCounter.reduce(
    (sum, channel) =>
      sum +
      (channel.pendingJoinRequestsCount ??
        channel.audienceTrend?.metrics.pendingJoinRequests?.current ??
        0),
    0,
  );
  const absoluteChange = current - previous;
  return {
    current,
    previous,
    absoluteChange,
    percentChange:
      previous === 0 ? null : (absoluteChange / Math.abs(previous)) * 100,
  };
}

function aggregateAudienceTrend(
  channelSummaries: ChannelNetworkSummaryInput[],
) {
  const trends = channelSummaries
    .map((channel) => channel.audienceTrend)
    .filter((trend): trend is TelegramChannelAudienceTrend => Boolean(trend));
  if (!trends.length) return null;
  const latest = trends.reduce((current, trend) =>
    trend.currentAt > current.currentAt ? trend : current,
  );
  const earliest = trends.reduce((current, trend) =>
    trend.baselineAt < current.baselineAt ? trend : current,
  );
  return {
    periodDays: Math.max(...trends.map((trend) => trend.periodDays)),
    currentAt: latest.currentAt,
    baselineAt: earliest.baselineAt,
    metrics: {
      subscribers: aggregateTrendMetric(trends, 'subscribers'),
      // Current requests must include every network member. Older snapshots
      // without that counter contribute a zero baseline instead of silently
      // disappearing from the Network Total.
      pendingJoinRequests: aggregatePendingJoinRequests(channelSummaries),
      reach: aggregateTrendMetric(trends, 'reach'),
      reactions: aggregateTrendMetric(trends, 'reactions'),
    },
  } satisfies TelegramChannelAudienceTrend;
}

function aggregateTrafficAttribution(
  channelSummaries: ChannelNetworkSummaryInput[],
) {
  const previews = channelSummaries
    .map((channel) => channel.trafficAttribution)
    .filter((preview): preview is TelegramChannelTrafficAttributionPreview =>
      Boolean(preview),
    );
  if (!previews.length) return null;
  const currency = previews[0].currency;
  const sourcesByKind = new Map<
    string,
    TelegramChannelTrafficAttributionPreview['sources'][number]
  >();
  for (const preview of previews) {
    for (const source of preview.sources) {
      const current = sourcesByKind.get(source.kind);
      sourcesByKind.set(
        source.kind,
        current
          ? {
              ...current,
              acquired: current.acquired + source.acquired,
              retained: current.retained + source.retained,
              unsubscribed: current.unsubscribed + source.unsubscribed,
              spend:
                current.spend == null || source.spend == null
                  ? null
                  : current.spend + source.spend,
              sourceCount: current.sourceCount + source.sourceCount,
              linkCount: current.linkCount + source.linkCount,
            }
          : { ...source },
      );
    }
  }
  const sources = [...sourcesByKind.values()];
  const acquired = sources.reduce((sum, source) => sum + source.acquired, 0);
  const retained = sources.reduce((sum, source) => sum + source.retained, 0);
  const unsubscribed = sources.reduce(
    (sum, source) => sum + source.unsubscribed,
    0,
  );
  const spendSources = sources.filter((source) => source.spend != null);
  const spend = spendSources.length
    ? spendSources.reduce((sum, source) => sum + Number(source.spend), 0)
    : null;
  const periodStarts = previews
    .map((preview) => preview.attributionPeriod?.startsAt)
    .filter((value): value is string => Boolean(value));
  const hasOngoingPeriod = previews.some(
    (preview) => preview.attributionPeriod?.endsAt == null,
  );
  const periodEnds = previews
    .map((preview) => preview.attributionPeriod?.endsAt)
    .filter((value): value is string => Boolean(value));
  const allTimePaidRows = previews.map(
    (preview) =>
      preview.allTimePaid ?? {
        acquired: preview.acquired,
        retained: preview.retained,
        spend: preview.spend,
        averageSubscriberCost: preview.averageSubscriberCost,
        retainedSubscriberCost: preview.retainedSubscriberCost,
      },
  );
  const allTimePaidSpendRows = allTimePaidRows.filter(
    (metrics) => metrics.spend != null,
  );
  const allTimePaidSpend = allTimePaidSpendRows.length
    ? allTimePaidSpendRows.reduce(
        (sum, metrics) => sum + Number(metrics.spend),
        0,
      )
    : null;
  const allTimePaidAcquired = allTimePaidSpendRows.reduce(
    (sum, metrics) => sum + metrics.acquired,
    0,
  );
  const allTimePaidRetained = allTimePaidSpendRows.reduce(
    (sum, metrics) => sum + metrics.retained,
    0,
  );
  return {
    // The network card must use the exact same start/end audience snapshots
    // as its member channels, rather than only showing disconnected deltas.
    observedAudience: aggregateAudienceTrend(channelSummaries),
    acquired,
    retained,
    unsubscribed,
    unsubscribePercent: acquired > 0 ? (unsubscribed / acquired) * 100 : 0,
    spend,
    averageSubscriberCost:
      spend != null && acquired > 0 ? spend / acquired : null,
    retainedSubscriberCost:
      spend != null && retained > 0 ? spend / retained : null,
    currency,
    allTimePaid: {
      acquired: allTimePaidAcquired,
      retained: allTimePaidRetained,
      spend: allTimePaidSpend,
      averageSubscriberCost:
        allTimePaidSpend != null && allTimePaidAcquired > 0
          ? allTimePaidSpend / allTimePaidAcquired
          : null,
      retainedSubscriberCost:
        allTimePaidSpend != null && allTimePaidRetained > 0
          ? allTimePaidSpend / allTimePaidRetained
          : null,
    },
    attributionPeriod: periodStarts.length
      ? {
          startsAt: periodStarts.sort()[0],
          endsAt: hasOngoingPeriod ? null : (periodEnds.sort().at(-1) ?? null),
        }
      : null,
    sources,
  } satisfies TelegramChannelTrafficAttributionPreview;
}

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
  const pendingJoinRequestsCount = channelSummaries.reduce(
    (sum, channel) => sum + Number(channel.pendingJoinRequestsCount || 0),
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
    pendingJoinRequestsCount,
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
    audienceTrend: aggregateAudienceTrend(channelSummaries),
    trafficAttribution: aggregateTrafficAttribution(channelSummaries),
  };
}
