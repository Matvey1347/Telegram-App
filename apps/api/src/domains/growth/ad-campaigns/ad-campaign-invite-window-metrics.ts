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
  windows: Array<{ inviteLinkId: string; joinedCount: number | null; pendingCount: number | null }>,
) {
  const byLink = new Map(windows.map((window) => [window.inviteLinkId, window]));
  let joined: number | null = 0;
  let pending: number | null = 0;
  for (const link of links) {
    const window = byLink.get(link.id);
    const joinedValue = window ? window.joinedCount :
      link.joinedObserved !== undefined && !link.joinedObserved && !link.joinedObservedAt && !link.lastSyncedAt ? null : link.joinedCount;
    const pendingValue = window ? window.pendingCount :
      link.requestedObserved !== undefined && !link.requestedObserved && !link.requestedObservedAt && !link.lastSyncedAt ? null : link.requestedCount;
    joined = joined == null || joinedValue == null ? null : joined + joinedValue;
    pending = pending == null || pendingValue == null ? null : pending + pendingValue;
  }
  return { joined, pending };
}
