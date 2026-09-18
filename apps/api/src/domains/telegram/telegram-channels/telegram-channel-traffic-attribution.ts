import type {
  TelegramChannelTrafficAttributionItem,
  TelegramChannelTrafficAttributionMetrics,
  TelegramChannelTrafficAttributionPoint,
  TelegramChannelTrafficAttributionPreview,
  TelegramChannelTrafficSourceKind,
} from '@telegram-system/shared';

export const TRAFFIC_SOURCE_LABELS: Record<
  TelegramChannelTrafficSourceKind,
  string
> = {
  MUTUAL_PROMOTION: 'Mutual promotion',
  FOLDERS: 'Folders',
  AD_CAMPAIGNS: 'Ad campaigns',
  AUDIENCE_TRANSFER: 'Audience transfer',
  BOT: 'Bot',
  BROADCAST: 'Broadcasts',
  OTHER: 'Other links',
};

export function trafficAttributionMetrics(input: {
  acquired: number;
  retained: number;
  spend?: number | null;
  currency: string;
}): TelegramChannelTrafficAttributionMetrics {
  const acquired = Math.max(0, Math.round(input.acquired));
  const retained = Math.min(acquired, Math.max(0, Math.round(input.retained)));
  const unsubscribed = Math.max(0, acquired - retained);
  const spend = input.spend == null ? null : Math.max(0, input.spend);
  return {
    acquired,
    retained,
    unsubscribed,
    unsubscribePercent: acquired > 0 ? (unsubscribed / acquired) * 100 : 0,
    spend,
    averageSubscriberCost:
      spend != null && acquired > 0 ? spend / acquired : null,
    retainedSubscriberCost:
      spend != null && retained > 0 ? spend / retained : null,
    currency: input.currency,
  };
}

export function summarizeTrafficAttribution(
  items: TelegramChannelTrafficAttributionItem[],
  currency: string,
): TelegramChannelTrafficAttributionPreview {
  const kinds = Object.keys(
    TRAFFIC_SOURCE_LABELS,
  ) as TelegramChannelTrafficSourceKind[];
  const sources = kinds.flatMap((kind) => {
    const matching = items.filter((item) => item.kind === kind);
    if (!matching.length) return [];
    const spendRows = matching.filter((item) => item.spend != null);
    const metrics = trafficAttributionMetrics({
      acquired: matching.reduce((sum, item) => sum + item.acquired, 0),
      retained: matching.reduce((sum, item) => sum + item.retained, 0),
      spend: spendRows.length
        ? spendRows.reduce((sum, item) => sum + Number(item.spend ?? 0), 0)
        : null,
      currency,
    });
    return [
      {
        kind,
        label: TRAFFIC_SOURCE_LABELS[kind],
        ...metrics,
        sourceCount: matching.length,
        linkCount: new Set(matching.flatMap((item) => item.inviteLinkIds)).size,
      },
    ];
  });
  const spendSources = sources.filter((source) => source.spend != null);
  const acquiredFromPaidSources = spendSources.reduce(
    (sum, source) => sum + source.acquired,
    0,
  );
  const retainedFromPaidSources = spendSources.reduce(
    (sum, source) => sum + source.retained,
    0,
  );
  const totalSpend = spendSources.length
    ? spendSources.reduce((sum, source) => sum + Number(source.spend ?? 0), 0)
    : null;
  const totals = trafficAttributionMetrics({
    acquired: sources.reduce((sum, source) => sum + source.acquired, 0),
    retained: sources.reduce((sum, source) => sum + source.retained, 0),
    spend: null,
    currency,
  });
  return {
    ...totals,
    spend: totalSpend,
    averageSubscriberCost:
      totalSpend != null && acquiredFromPaidSources > 0
        ? totalSpend / acquiredFromPaidSources
        : null,
    retainedSubscriberCost:
      totalSpend != null && retainedFromPaidSources > 0
        ? totalSpend / retainedFromPaidSources
        : null,
    sources: sources.sort(
      (left, right) =>
        right.acquired - left.acquired || left.label.localeCompare(right.label),
    ),
  };
}

export function buildTrafficAttributionHistoryPoints(
  rows: Array<{
    inviteLinkId: string;
    syncedAt: Date;
    joinedCount: number;
    requestedCount: number;
  }>,
  currentLinks: Array<{
    id: string;
    joinedCount: number;
    requestedCount: number;
  }>,
  linkKinds: Map<string, TelegramChannelTrafficSourceKind>,
  now = new Date(),
): TelegramChannelTrafficAttributionPoint[] {
  const events = [
    ...rows,
    ...currentLinks.map((link) => ({
      inviteLinkId: link.id,
      syncedAt: now,
      joinedCount: link.joinedCount,
      requestedCount: link.requestedCount,
    })),
  ].sort((left, right) => left.syncedAt.getTime() - right.syncedAt.getTime());
  const current = new Map<string, number>();
  const peak = new Map<string, number>();
  const output = new Map<string, TelegramChannelTrafficAttributionPoint>();
  for (const event of events) {
    const kind = linkKinds.get(event.inviteLinkId);
    if (!kind) continue;
    const value = event.joinedCount + event.requestedCount;
    const previousPeak = peak.get(event.inviteLinkId) ?? 0;
    const nextPeak = Math.max(value, previousPeak);
    current.set(event.inviteLinkId, value);
    peak.set(event.inviteLinkId, nextPeak);
    const day = event.syncedAt.toISOString().slice(0, 10);
    output.set(`${day}:${event.inviteLinkId}`, {
      at: `${day}T00:00:00.000Z`,
      inviteLinkId: event.inviteLinkId,
      kind,
      acquired: nextPeak,
      retained: value,
      unsubscribed: Math.max(0, nextPeak - value),
    });
  }
  return [...output.values()].sort(
    (left, right) =>
      left.at.localeCompare(right.at) || left.kind.localeCompare(right.kind),
  );
}
