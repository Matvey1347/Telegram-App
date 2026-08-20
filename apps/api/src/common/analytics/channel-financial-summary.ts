import {
  sumInviteLinkAttributedSubscribers,
  sumInviteLinkJoinedSubscribers,
} from './invite-link-metrics';

export type ChannelKpiStatus = 'good' | 'acceptable' | 'bad' | 'unknown';

function toNumberOrNull(value: unknown) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inRange(value: number, from: number | null, to: number | null) {
  if (from == null && to == null) return false;
  if (from != null && value < from) return false;
  if (to != null && value > to) return false;
  return true;
}

export function effectiveCampaignJoinedSubscribers(campaign: {
  inviteLinks?: Array<{ joinedCount?: unknown } | null | undefined> | null;
  joinedCount?: unknown;
  newSubscribers?: unknown;
}) {
  const linkedJoined = sumInviteLinkJoinedSubscribers(
    Array.isArray(campaign.inviteLinks) ? campaign.inviteLinks : [],
  );
  if (linkedJoined > 0) return linkedJoined;
  return Number(campaign.joinedCount ?? campaign.newSubscribers ?? 0);
}

export function effectiveCampaignPendingSubscribers(campaign: {
  inviteLinks?:
    | Array<{ joinedCount?: unknown; requestedCount?: unknown } | null | undefined>
    | null;
  requestedCount?: unknown;
}) {
  const linkedAttributed = sumInviteLinkAttributedSubscribers(
    Array.isArray(campaign.inviteLinks) ? campaign.inviteLinks : [],
  );
  const linkedJoined = sumInviteLinkJoinedSubscribers(
    Array.isArray(campaign.inviteLinks) ? campaign.inviteLinks : [],
  );
  const linkedPending = Math.max(0, linkedAttributed - linkedJoined);
  if (linkedAttributed > 0) return linkedPending;
  return Number(campaign.requestedCount ?? 0);
}

export function effectiveCampaignAttributedSubscribers(campaign: {
  inviteLinks?:
    | Array<{ joinedCount?: unknown; requestedCount?: unknown } | null | undefined>
    | null;
  joinedCount?: unknown;
  requestedCount?: unknown;
  newSubscribers?: unknown;
}) {
  return (
    effectiveCampaignJoinedSubscribers(campaign) +
    effectiveCampaignPendingSubscribers(campaign)
  );
}

export function effectiveCampaignActiveSubscribers(campaign: {
  cappedActiveSubscribersFromAd?: unknown;
  activeSubscribersFromAd?: unknown;
}) {
  return Number(
    campaign.cappedActiveSubscribersFromAd ??
      campaign.activeSubscribersFromAd ??
      0,
  );
}

export function resolveChannelKpiStatus(params: {
  avgCpa: number | null;
  targetCpaFrom?: unknown;
  targetCpa?: unknown;
  acceptableCpaFrom?: unknown;
  acceptableCpa?: unknown;
  stopCpaFrom?: unknown;
  stopCpa?: unknown;
}): ChannelKpiStatus {
  const targetCpaFrom = toNumberOrNull(params.targetCpaFrom);
  const targetCpa = toNumberOrNull(params.targetCpa);
  const acceptableCpaFrom = toNumberOrNull(params.acceptableCpaFrom);
  const acceptableCpa = toNumberOrNull(params.acceptableCpa);
  const stopCpaFrom = toNumberOrNull(params.stopCpaFrom) ?? toNumberOrNull(params.stopCpa);

  if (params.avgCpa == null) return 'unknown';
  // Current lower-is-better CPA semantics. `targetCpa` is "Good up to" and
  // `stopCpaFrom` is "Stop from"; Normal is deliberately the implicit gap.
  // Legacy lower bounds remain readable but are not required for new settings.
  if (targetCpa != null || stopCpaFrom != null) {
    if (targetCpa != null && params.avgCpa <= targetCpa) return 'good';
    if (stopCpaFrom != null && params.avgCpa >= stopCpaFrom) return 'bad';
    if (targetCpa != null && stopCpaFrom != null) return 'acceptable';
  }
  if (inRange(params.avgCpa, targetCpaFrom, targetCpa)) return 'good';
  if (inRange(params.avgCpa, acceptableCpaFrom, acceptableCpa)) {
    return 'acceptable';
  }
  if (inRange(params.avgCpa, stopCpaFrom, null)) return 'bad';
  return 'unknown';
}

export type ChannelAssetEconomics = {
  currency: string;
  invested: number | null;
  revenue: number | null;
  remainingToBreakEven: number | null;
  paybackPercent: number | null;
  adsSold: number;
  estimatedAdPrice: number | null;
  estimatedAdsRemaining: number | null;
  conversionUnavailable: boolean;
};

export function calculateChannelAssetEconomics(input: {
  currency: string;
  invested: number | null;
  revenue: number | null;
  adsSold: number;
  expectedViews: number | null;
  cpm: number | null;
  conversionUnavailable?: boolean;
}): ChannelAssetEconomics {
  const conversionUnavailable = Boolean(input.conversionUnavailable);
  const invested = input.invested;
  const revenue = input.revenue;
  const comparable = !conversionUnavailable && invested != null && revenue != null;
  const remainingToBreakEven = comparable ? Math.max(invested - revenue, 0) : null;
  const paybackPercent = comparable && invested > 0 ? (revenue / invested) * 100 : null;
  const estimatedAdPrice =
    input.expectedViews != null && input.expectedViews > 0 && input.cpm != null && input.cpm > 0
      ? (input.expectedViews / 1000) * input.cpm
      : null;
  return {
    currency: input.currency,
    invested,
    revenue,
    remainingToBreakEven,
    paybackPercent,
    adsSold: input.adsSold,
    estimatedAdPrice,
    estimatedAdsRemaining:
      remainingToBreakEven != null && estimatedAdPrice != null
        ? Math.ceil(remainingToBreakEven / estimatedAdPrice)
        : null,
    conversionUnavailable,
  };
}

export function resolveChannelKpiLabel(status: ChannelKpiStatus) {
  if (status === 'good') return 'Good';
  if (status === 'acceptable') return 'Acceptable';
  if (status === 'bad') return 'Stop';
  return '-';
}
