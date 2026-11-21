import { PrismaService } from '../../../prisma/prisma.service';
import { adsChannelWhere } from '../ads-channel-scope';

export async function campaignPerformanceSummary(
  prisma: PrismaService,
  workspaceId: string,
  query: any = {},
) {
  const where: any = {
    workspaceId,
    excludeFromAnalytics: false,
    telegramChannelId: adsChannelWhere(
      query.channelId,
      query.telegramChannelIds,
    ),
    placementDate: {
      gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
      lte: query.dateTo ? new Date(query.dateTo) : undefined,
    },
  };
  if (!query.dateFrom && !query.dateTo) delete where.placementDate;
  if (query.hypothesisId) {
    where.hypothesisLinks = { some: { hypothesisId: query.hypothesisId } };
  }
  const [campaigns, lastDailyAnalyticsSync] = await Promise.all([
    (prisma.adCampaign as any).findMany({
      where,
      include: { telegramChannel: true },
      orderBy: { createdAt: 'desc' },
    }),
    (prisma as any).dailyAnalyticsSyncRun.findFirst({
      where: { OR: [{ workspaceId }, { workspaceId: null }] },
      orderBy: { startedAt: 'desc' },
    }),
  ]);
  const totalSpend = campaigns.reduce(
    (sum, campaign) => sum + Number(campaign.priceInPrimaryCurrency || 0),
    0,
  );
  const totalNewSubscribers = campaigns.reduce(
    (sum, campaign) => sum + Number(campaign.newSubscribers || 0),
    0,
  );
  const totalActiveSubscribersFromAd = campaigns.reduce(
    (sum, campaign) => sum + Number(campaign.activeSubscribersFromAd || 0),
    0,
  );
  const avg = (values: Array<number | null>) => {
    const clean = values.filter((value): value is number => value != null);
    return clean.length
      ? clean.reduce((sum, value) => sum + value, 0) / clean.length
      : null;
  };
  const statusCounts = campaigns.reduce(
    (acc, campaign) => {
      const status = campaign.overallStatus || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { good: 0, acceptable: 0, bad: 0, unknown: 0 },
  );
  const dataQualityCounts = campaigns.reduce(
    (acc, campaign) => {
      const quality = String(campaign.adDataQuality || 'normal');
      if (quality === 'anomalous') acc.anomalousCount += 1;
      else if (quality === 'suspicious') acc.suspiciousCount += 1;
      else if (quality === 'normal' || quality === 'borderline')
        acc.normalDataCount += 1;
      if (campaign.hasSubscriberBasePollution) acc.pollutedCount += 1;
      return acc;
    },
    {
      anomalousCount: 0,
      suspiciousCount: 0,
      pollutedCount: 0,
      normalDataCount: 0,
    },
  );
  const metric = (campaign: any) =>
    Number(
      campaign.cappedActiveCpa ??
        campaign.activeCpa ??
        campaign.cpa ??
        Number.POSITIVE_INFINITY,
    );
  const ranked = campaigns.filter((campaign) =>
    Number.isFinite(metric(campaign)),
  );
  const bestRanked = ranked.filter(
    (campaign) =>
      campaign.adDataQuality !== 'anomalous' && !campaign.excludeFromAnalytics,
  );
  return {
    campaignsCount: campaigns.length,
    totalSpend,
    totalNewSubscribers,
    totalActiveSubscribersFromAd,
    avgCpa: totalNewSubscribers > 0 ? totalSpend / totalNewSubscribers : null,
    avgActiveCpa:
      totalActiveSubscribersFromAd > 0
        ? totalSpend / totalActiveSubscribersFromAd
        : null,
    avgActiveRate: avg(campaigns.map((campaign) => campaign.activeRate)),
    avgRetention7d: avg(campaigns.map((campaign) => campaign.retention7d)),
    ...dataQualityCounts,
    goodCount: statusCounts.good || 0,
    acceptableCount: statusCounts.acceptable || 0,
    badCount: statusCounts.bad || 0,
    unknownCount: statusCounts.unknown || 0,
    bestCampaigns: [...bestRanked]
      .sort((a, b) => metric(a) - metric(b))
      .slice(0, 5),
    worstCampaigns: [...ranked]
      .sort((a, b) => metric(b) - metric(a))
      .slice(0, 5),
    lastDailyAnalyticsSync,
  };
}
