import type {
  DashboardSpendingMix,
  DashboardTrafficKind,
  DashboardTrafficSource,
} from '@telegram-system/shared';
import type { InviteLinkPeriodActivity } from '../../telegram/telegram-channels/telegram-channel-traffic-period';
import { isDashboardChannelExpenseTransaction } from './dashboard-financial-metrics';
import { dashboardCategoryKey } from './dashboard-surface';

type Expense = Parameters<typeof isDashboardChannelExpenseTransaction>[0];
type TrafficLink = {
  kind: DashboardTrafficKind;
  activity?: InviteLinkPeriodActivity;
};
type SpendBySource = Partial<Record<DashboardTrafficKind, number | null>>;

const kinds: DashboardTrafficKind[] = [
  'MUTUAL_PROMOTION',
  'AD_CAMPAIGNS',
  'BOT',
  'AUDIENCE_TRANSFER',
  'BROADCAST',
  'OTHER',
  'FOLDERS',
];

export function dashboardSpendingMix(
  expenses: Expense[],
): DashboardSpendingMix {
  const mix = { advertising: 0, channelPurchases: 0, otherChannelExpenses: 0 };
  for (const expense of expenses) {
    if (!isDashboardChannelExpenseTransaction(expense)) continue;
    const key = dashboardCategoryKey(expense);
    const bucket =
      key === 'buy_channels'
        ? 'channelPurchases'
        : key === 'advertising' || expense.adCampaignId
          ? 'advertising'
          : 'otherChannelExpenses';
    mix[bucket] += Number(expense.amountInPrimaryCurrency ?? 0);
  }
  return mix;
}

export function summarizeDashboardTraffic(
  links: TrafficLink[],
  spendBySource: SpendBySource,
): DashboardTrafficSource[] {
  const tracked = new Map<DashboardTrafficKind, TrafficLink[]>();
  for (const link of links) {
    const group = tracked.get(link.kind) ?? [];
    group.push(link);
    tracked.set(link.kind, group);
  }
  return kinds.map((kind) => {
    const group = tracked.get(kind) ?? [];
    const samples = group.flatMap((link) =>
      link.activity ? [link.activity] : [],
    );
    const sum = (field: keyof Omit<InviteLinkPeriodActivity, 'inviteLinkId'>) =>
      samples.reduce((total, sample) => total + (sample[field] ?? 0), 0);
    const requests =
      samples.some((sample) => sample.requests != null) &&
      samples.every(
        (sample) => sample.requests != null || sample.arrivals === 0,
      )
        ? sum('requests')
        : null;
    const joined = samples.length ? sum('joined') : null;
    const departures = samples.length ? sum('departures') : null;
    const riskPopulation = sum('audienceAtStart') + (joined ?? 0);
    const spend = spendBySource[kind] ?? null;
    const cost = (count: number | null) =>
      spend != null && count != null && count > 0 ? spend / count : null;
    return {
      kind,
      trackedLinks: group.length,
      measuredLinks: samples.length,
      arrivals: samples.length ? sum('arrivals') : null,
      requests,
      joined,
      departures,
      departurePercent:
        departures != null && riskPopulation > 0
          ? (100 * departures) / riskPopulation
          : null,
      spend,
      costPerRequest: cost(requests),
      costPerSubscriber: cost(joined),
    };
  });
}
