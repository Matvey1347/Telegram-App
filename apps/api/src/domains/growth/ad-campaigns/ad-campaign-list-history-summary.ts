import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

type CampaignWithInviteLinks = {
  id: string;
  inviteLinks: Array<{
    id: string;
    joinedCount: number;
    requestedCount: number | null;
  }>;
};

type CampaignHistoryPeakRow = {
  adCampaignId: string;
  peakJoinedCount: bigint | number;
  peakRequestedCount: bigint | number;
  peakTotalAttributed: bigint | number;
};

export type CampaignListHistorySummary = {
  currentJoinedCount: number;
  currentRequestedCount: number;
  currentTotalAttributed: number;
  peakJoinedCount: number;
  peakRequestedCount: number;
  peakTotalAttributed: number;
  drawdownFromPeak: number;
  drawdownPercent: number;
  hasHighDropoff: boolean;
  inviteLinksCount: number;
};

export async function loadCampaignListHistorySummaries(
  prisma: PrismaService,
  workspaceId: string,
  campaigns: CampaignWithInviteLinks[],
) {
  const campaignsWithLinks = campaigns.filter(
    (campaign) => campaign.inviteLinks.length > 0,
  );
  if (!campaignsWithLinks.length) {
    return new Map<string, CampaignListHistorySummary>();
  }

  // Snapshots retain their former adCampaignId after a link is removed. Build
  // history from the campaign's current links, otherwise a removed link would
  // inflate the peak and make the remaining links look like they dropped.
  const campaignInviteLinkPairs = campaignsWithLinks.flatMap((campaign) =>
    campaign.inviteLinks.map((inviteLink) => ({
      campaignId: campaign.id,
      inviteLinkId: inviteLink.id,
    })),
  );
  const peakRows = await prisma.$queryRaw<CampaignHistoryPeakRow[]>(Prisma.sql`
    WITH "CurrentCampaignInviteLinks" ("adCampaignId", "inviteLinkId") AS (
      VALUES ${Prisma.join(
        campaignInviteLinkPairs.map(
          ({ campaignId, inviteLinkId }) =>
            Prisma.sql`(${campaignId}, ${inviteLinkId})`,
        ),
      )}
    )
    SELECT
      point."adCampaignId",
      MAX(point."joinedCount") AS "peakJoinedCount",
      MAX(point."requestedCount") AS "peakRequestedCount",
      MAX(point."totalAttributed") AS "peakTotalAttributed"
    FROM (
      SELECT
        currentLinks."adCampaignId",
        snapshot."syncedAt",
        SUM(snapshot."joinedCount") AS "joinedCount",
        SUM(snapshot."requestedCount") AS "requestedCount",
        SUM(snapshot."joinedCount" + snapshot."requestedCount") AS "totalAttributed"
      FROM "TelegramInviteLinkSnapshot" AS snapshot
      INNER JOIN "CurrentCampaignInviteLinks" AS currentLinks
        ON currentLinks."adCampaignId" = snapshot."adCampaignId"
        AND currentLinks."inviteLinkId" = snapshot."inviteLinkId"
      WHERE
        snapshot."workspaceId" = ${workspaceId}
      GROUP BY currentLinks."adCampaignId", snapshot."syncedAt"
    ) AS point
    GROUP BY point."adCampaignId"
  `);
  const peakByCampaignId = new Map(
    peakRows.map((row) => [row.adCampaignId, row]),
  );

  return new Map(
    campaignsWithLinks.map((campaign) => {
      const currentJoinedCount = campaign.inviteLinks.reduce(
        (sum, link) => sum + Number(link.joinedCount || 0),
        0,
      );
      const currentRequestedCount = campaign.inviteLinks.reduce(
        (sum, link) => sum + Number(link.requestedCount || 0),
        0,
      );
      const currentTotalAttributed = currentJoinedCount + currentRequestedCount;
      const peak = peakByCampaignId.get(campaign.id);
      const peakJoinedCount = Math.max(
        currentJoinedCount,
        Number(peak?.peakJoinedCount ?? 0),
      );
      const peakRequestedCount = Math.max(
        currentRequestedCount,
        Number(peak?.peakRequestedCount ?? 0),
      );
      const peakTotalAttributed = Math.max(
        currentTotalAttributed,
        Number(peak?.peakTotalAttributed ?? 0),
      );
      const drawdownFromPeak = Math.max(
        0,
        peakTotalAttributed - currentTotalAttributed,
      );
      const drawdownPercent =
        peakTotalAttributed > 0
          ? (drawdownFromPeak / peakTotalAttributed) * 100
          : 0;
      return [
        campaign.id,
        {
          currentJoinedCount,
          currentRequestedCount,
          currentTotalAttributed,
          peakJoinedCount,
          peakRequestedCount,
          peakTotalAttributed,
          drawdownFromPeak,
          drawdownPercent,
          hasHighDropoff: drawdownPercent >= 15,
          inviteLinksCount: campaign.inviteLinks.length,
        },
      ];
    }),
  );
}
