export function campaignInviteWindowMetrics(
  links: Array<{ id: string; joinedCount: number; requestedCount: number }>,
  windows: Array<{ inviteLinkId: string; joinedCount: number | null; pendingCount: number | null }>,
) {
  const byLink = new Map(windows.map((window) => [window.inviteLinkId, window]));
  let joined = 0;
  let pending = 0;
  for (const link of links) {
    const window = byLink.get(link.id);
    if (window && (window.joinedCount == null || window.pendingCount == null)) return null;
    joined += window ? window.joinedCount! : link.joinedCount;
    pending += window ? window.pendingCount! : link.requestedCount;
  }
  return { joined, pending };
}
