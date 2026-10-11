import type {
  TelegramChannelTrafficAttributionPoint,
  TelegramChannelTrafficAttributionPreview,
  TelegramChannelTrafficSourceKind,
} from '@telegram-system/shared';
import { trafficAttributionMetrics } from './telegram-channel-traffic-attribution';

export function aggregateTrafficAttributionPreviews(
  previews: TelegramChannelTrafficAttributionPreview[],
  currency: string,
  startsAt: Date,
  endsAt: Date,
): TelegramChannelTrafficAttributionPreview {
  const sourceByKind = new Map<
    TelegramChannelTrafficSourceKind,
    TelegramChannelTrafficAttributionPreview['sources'][number]
  >();
  for (const preview of previews) for (const source of preview.sources) {
    const prior = sourceByKind.get(source.kind);
    sourceByKind.set(source.kind, prior ? {
      ...prior,
      acquired: prior.acquired + source.acquired,
      retained: prior.retained + source.retained,
      unsubscribed: prior.unsubscribed + source.unsubscribed,
      sourceCount: prior.sourceCount + source.sourceCount,
      linkCount: prior.linkCount + source.linkCount,
      spend: prior.spend == null || source.spend == null ? null : prior.spend + source.spend,
    } : { ...source });
  }
  const sources = [...sourceByKind.values()].map((source) => ({
    ...trafficAttributionMetrics({
      acquired: source.acquired, retained: source.retained,
      unsubscribed: source.unsubscribed, spend: source.spend, currency,
    }),
    kind: source.kind, label: source.label,
    sourceCount: source.sourceCount, linkCount: source.linkCount,
  }));
  const totals = trafficAttributionMetrics({
    acquired: sources.reduce((sum, source) => sum + source.acquired, 0),
    retained: sources.reduce((sum, source) => sum + source.retained, 0),
    unsubscribed: sources.reduce((sum, source) => sum + source.unsubscribed, 0),
    spend: null, currency,
  });
  const paid = previews.map((preview) => preview.allTimePaid)
    .filter((metrics) => metrics.spend != null);
  const spend = paid.length ? paid.reduce((sum, metrics) => sum + Number(metrics.spend), 0) : null;
  const acquired = paid.reduce((sum, metrics) => sum + metrics.acquired, 0);
  const retained = paid.reduce((sum, metrics) => sum + metrics.retained, 0);
  return {
    ...totals,
    allTimePaid: {
      acquired, retained, spend,
      averageSubscriberCost: spend != null && acquired > 0 ? spend / acquired : null,
      retainedSubscriberCost: spend != null && retained > 0 ? spend / retained : null,
    },
    attributionPeriod: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
    sources: sources.sort((left, right) => right.acquired - left.acquired || left.label.localeCompare(right.label)),
  };
}

export function unattributedTrafficHistoryPoints(
  entityId: string, previous: number, current: number, now: Date,
): TelegramChannelTrafficAttributionPoint[] {
  if (!previous && !current) return [];
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 30);
  const inviteLinkId = `unattributed:${entityId}`;
  return [
    { at: from.toISOString(), inviteLinkId, kind: 'UNATTRIBUTED', acquired: 0, retained: previous, unsubscribed: 0 },
    { at: now.toISOString(), inviteLinkId, kind: 'UNATTRIBUTED', acquired: 0, retained: current, unsubscribed: 0 },
  ];
}
