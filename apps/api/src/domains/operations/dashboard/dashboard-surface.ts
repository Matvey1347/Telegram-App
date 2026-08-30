export type DashboardReadAccess = {
  finance: boolean;
  advertising: boolean;
  channels: boolean;
  members: boolean;
};

export function dashboardCategoryKey(transaction: {
  categoryRef?: { key?: string | null; name?: string | null } | null;
  category?: string | null;
}) {
  return (
    transaction.categoryRef?.key ??
    String(transaction.categoryRef?.name ?? transaction.category ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
  );
}

export function dashboardReadAccess(
  featureIds: readonly string[],
  permissionKeys: readonly string[] = [],
): DashboardReadAccess {
  const features = new Set(featureIds);
  const permissions = new Set(permissionKeys);
  const canReadAggregate = (featureId: string) => {
    if (!features.has(featureId)) return false;
    const ownOnly =
      (permissions.has(`${featureId}.editOwn`) ||
        permissions.has(`${featureId}.deleteOwn`)) &&
      !permissions.has(`${featureId}.editAny`) &&
      !permissions.has(`${featureId}.deleteAny`) &&
      !permissions.has(`${featureId}.manage`);
    return !ownOnly;
  };
  return {
    finance: canReadAggregate('finance'),
    // Existing advertising widgets embed channel identity and metrics. Treat
    // Channels as a data dependency until a channel-free ad read model exists.
    advertising:
      canReadAggregate('advertising') && canReadAggregate('channels'),
    channels: canReadAggregate('channels'),
    members: canReadAggregate('members'),
  };
}

const KEYS_BY_FEATURE = {
  finance: [
    'totalBalancePrimary',
    'totalBalanceSecondary',
    'primaryCurrency',
    'secondaryCurrency',
    'incomeForPeriod',
    'expensesForPeriod',
    'profitForPeriod',
    'investedCapital',
    'investedCapitalForPeriod',
    'operatingProfitAllTime',
    'remainingToBreakEven',
    'projectedMonthlyProfit',
    'projectedPaybackMonths',
    'revenueTransactionsCount',
    'channelsWithRevenueCount',
    'dailyTrend',
    'categoryBreakdown',
    'accountBalances',
  ],
  advertising: [
    'adSpendForPeriod',
    'totalJoinedFromAds',
    'averageCPA',
    'campaignsCount',
    'periodCampaignsCount',
    'campaignStatusCounts',
    'adQualityCounts',
    'hypothesisStatusCounts',
    'bestCampaigns',
    'worstCampaigns',
  ],
  channels: [
    'telegramChannelsCount',
    'ownChannelsCount',
    'externalChannelsCount',
    'totalSubscribers',
    'activeSubscribersEstimate',
    'anomalousChannelsCount',
    'topOwnChannels',
  ],
  members: ['workspaceMembersCount'],
} as const;

export function filterDashboardSurface<T extends Record<string, unknown>>(
  summary: T,
  access: DashboardReadAccess,
  featureIds: readonly string[],
) {
  const filtered: Record<string, unknown> = { ...summary };
  for (const [feature, keys] of Object.entries(KEYS_BY_FEATURE)) {
    if (access[feature as keyof DashboardReadAccess]) continue;
    for (const key of keys) delete filtered[key];
  }
  if (!(access.finance && access.advertising && access.channels)) {
    delete filtered.channelPerformance;
  }
  filtered.availableWidgetIds = [
    ...(featureIds.includes('dashboard') ? ['workspaceOverview'] : []),
    ...(access.finance ? ['financeMetrics'] : []),
    ...(access.advertising ? ['advertisingMetrics'] : []),
    ...(access.channels ? ['channelMetrics'] : []),
  ];
  return filtered as T & { availableWidgetIds: string[] };
}
