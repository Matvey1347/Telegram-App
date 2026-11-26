import { utcDateKey } from '../../telegram/telegram-ad-sales/domain/timezone';

type InviteLinkCounters = {
  id: string;
  joinedCount: number;
  requestedCount: number;
  joinedObserved?: boolean | null;
  requestedObserved?: boolean | null;
  joinedObservedAt?: Date | null;
  requestedObservedAt?: Date | null;
  lastSyncedAt?: Date | null;
};

export function campaignInviteWindowMetrics(
  links: InviteLinkCounters[],
  windows: Array<{
    inviteLinkId: string;
    joinedCount: number | null;
    pendingCount: number | null;
    fromDate?: string | null;
    currentRequests?: boolean;
    timezone?: string;
  }>,
  campaignStart?: Date | null,
) {
  const byLink = new Map(windows.map((window) => [window.inviteLinkId, window]));
  let joined: number | null = 0;
  let pending: number | null = 0;
  for (const link of links) {
    const window = byLink.get(link.id);
    if (window?.fromDate && window.timezone && campaignStart &&
        window.fromDate < utcDateKey(campaignStart, window.timezone)) {
      joined = null;
      if (!window.currentRequests) { pending = null; continue; }
    }
    const joinedValue = window ? window.joinedCount :
      link.joinedObserved === false && !link.joinedObservedAt || link.joinedObserved === null && !link.joinedObservedAt && !link.lastSyncedAt ? null : link.joinedCount;
    const pendingValue = window && !window.currentRequests ? window.pendingCount :
      link.requestedObserved === false && !link.requestedObservedAt || link.requestedObserved === null && !link.requestedObservedAt && !link.lastSyncedAt ? null : link.requestedCount;
    joined = joined == null || joinedValue == null ? null : joined + joinedValue;
    pending = pending == null || pendingValue == null ? null : pending + pendingValue;
  }
  return { joined, pending };
}
