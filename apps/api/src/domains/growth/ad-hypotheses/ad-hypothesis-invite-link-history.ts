function inviteLinkHistoryPoints<
  T extends { syncedAt: Date; joinedCount: number; requestedCount: number },
>(rows: T[]) {
  let peakJoinedCount = 0;
  let peakTotalAttributed = 0;
  return rows.map((row) => {
    const joinedCount = Number(row.joinedCount || 0);
    const requestedCount = Number(row.requestedCount || 0);
    const totalAttributed = joinedCount + requestedCount;
    peakJoinedCount = Math.max(peakJoinedCount, joinedCount);
    peakTotalAttributed = Math.max(peakTotalAttributed, totalAttributed);
    const drawdownFromPeak = Math.max(0, peakTotalAttributed - totalAttributed);
    const drawdownPercent =
      peakTotalAttributed > 0
        ? (drawdownFromPeak / peakTotalAttributed) * 100
        : 0;
    return {
      syncedAt: row.syncedAt,
      joinedCount,
      requestedCount,
      totalAttributed,
      peakJoinedCount,
      drawdownFromPeak,
      drawdownPercent,
    };
  });
}

function inviteLinkHistorySummary<
  T extends {
    joinedCount: number;
    requestedCount: number;
    totalAttributed: number;
    peakJoinedCount: number;
    drawdownFromPeak: number;
    drawdownPercent: number;
  },
>(points: T[]) {
  const current = points[points.length - 1] ?? null;
  const peakJoinedCount = points.reduce(
    (max, point) => Math.max(max, Number(point.peakJoinedCount || 0)),
    0,
  );
  const peakRequestedCount = points.reduce(
    (max, point) => Math.max(max, Number(point.requestedCount || 0)),
    0,
  );
  const peakTotalAttributed = points.reduce(
    (max, point) => Math.max(max, Number(point.totalAttributed || 0)),
    0,
  );
  return {
    currentJoinedCount: Number(current?.joinedCount || 0),
    currentRequestedCount: Number(current?.requestedCount || 0),
    currentTotalAttributed:
      Number(current?.joinedCount || 0) + Number(current?.requestedCount || 0),
    peakJoinedCount,
    peakRequestedCount,
    peakTotalAttributed,
    drawdownFromPeak: Number(current?.drawdownFromPeak || 0),
    drawdownPercent: Number(current?.drawdownPercent || 0),
    hasHighDropoff: Number(current?.drawdownPercent || 0) >= 15,
  };
}

export function buildHypothesisInviteLinkHistoryPayload(
  hypothesis: {
    id: string;
    name: string;
    campaigns: Array<{
      id: string;
      telegramChannelId: string;
      inviteLinks: Array<{
        id: string;
        name: string;
        url: string;
        joinedCount: number;
        requestedCount?: number | null;
        isRevoked?: boolean | null;
      }>;
    }>;
  },
  rowsAsc: Array<{
    adCampaignId: string | null;
    inviteLinkId: string;
    syncedAt: Date;
    joinedCount: number;
    requestedCount: number;
    isRevoked: boolean | null;
  }>,
) {
  const flattenedInviteLinks = hypothesis.campaigns.flatMap((campaign) =>
    campaign.inviteLinks.map((link) => ({
      ...link,
      adCampaignId: campaign.id,
      telegramChannelId: campaign.telegramChannelId,
      requestedCount: Number(link.requestedCount ?? 0),
      isRevoked: Boolean(link.isRevoked),
    })),
  );
  const grouped = new Map<
    string,
    { syncedAt: Date; joinedCount: number; requestedCount: number }
  >();
  for (const row of rowsAsc) {
    const key = row.syncedAt.toISOString();
    const current = grouped.get(key);
    if (current) {
      current.joinedCount += Number(row.joinedCount || 0);
      current.requestedCount += Number(row.requestedCount || 0);
    } else {
      grouped.set(key, {
        syncedAt: row.syncedAt,
        joinedCount: Number(row.joinedCount || 0),
        requestedCount: Number(row.requestedCount || 0),
      });
    }
  }
  if (!grouped.size) {
    grouped.set(new Date().toISOString(), {
      syncedAt: new Date(),
      joinedCount: flattenedInviteLinks.reduce(
        (sum, link) => sum + Number(link.joinedCount || 0),
        0,
      ),
      requestedCount: flattenedInviteLinks.reduce(
        (sum, link) => sum + Number(link.requestedCount || 0),
        0,
      ),
    });
  }
  const aggregatePoints = inviteLinkHistoryPoints([...grouped.values()]);

  const rowsByInviteLinkId = new Map<
    string,
    Array<{
      syncedAt: Date;
      joinedCount: number;
      requestedCount: number;
      isRevoked: boolean | null;
    }>
  >();
  for (const row of rowsAsc) {
    const list = rowsByInviteLinkId.get(row.inviteLinkId) ?? [];
    list.push(row);
    rowsByInviteLinkId.set(row.inviteLinkId, list);
  }

  return {
    hypothesis: {
      id: hypothesis.id,
      name: hypothesis.name,
    },
    inviteLinks: flattenedInviteLinks.map((link) => {
      const points = inviteLinkHistoryPoints(
        rowsByInviteLinkId.get(link.id)?.map((row) => ({
          syncedAt: row.syncedAt,
          joinedCount: Number(row.joinedCount || 0),
          requestedCount: Number(row.requestedCount || 0),
        })) ?? [
          {
            syncedAt: new Date(),
            joinedCount: Number(link.joinedCount || 0),
            requestedCount: Number(link.requestedCount || 0),
          },
        ],
      );
      return {
        ...link,
        summary: inviteLinkHistorySummary(points),
      };
    }),
    points: aggregatePoints,
    summary: {
      ...inviteLinkHistorySummary(aggregatePoints),
      inviteLinksCount: flattenedInviteLinks.length,
      campaignsCount: hypothesis.campaigns.length,
    },
  };
}
