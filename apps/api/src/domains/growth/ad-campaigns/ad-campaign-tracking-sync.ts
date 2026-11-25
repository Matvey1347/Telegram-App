import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { savedTrackingScope, trackingInviteLinkIds } from './ad-campaign-link-selection';

/** Attach newly configured links before the existing scheduled channel sync reads them. */
export async function attachNewCampaignTrackingLinks(prisma: PrismaService, workspaceId: string) {
  return prisma.$transaction(async (tx) => {
    await acquirePostgresTransactionLock(tx, `campaign-tracking:${workspaceId}`);
    const campaigns = await tx.adCampaign.findMany({
      where: { workspaceId, endedAt: null, trackingScope: { not: Prisma.DbNull } },
      select: {
        id: true, telegramChannelId: true, trackingScope: true,
        botInviteLinks: { select: { inviteLinkId: true } },
      },
    });
    if (!campaigns.length) return;
    const channels = await tx.telegramChannel.findMany({
      where: { workspaceId, isActive: true, archivedAt: null, adminLinks: { some: {} } },
      select: {
        id: true, defaultInviteLinkId: true, publicInviteLinkId: true, botInviteLinkId: true,
        broadcastInviteLinkId: true, audienceTransferInviteLinkId: true,
        mutualPromotionInviteLinkIds: true, folderDefaultInviteLinkIds: true,
      },
    });
    const candidates = campaigns.flatMap((campaign) => {
      const scope = savedTrackingScope(campaign.trackingScope);
      if (!scope) return [];
      const selected = scope.channelIds ? new Set(scope.channelIds) : null;
      const existing = new Set(campaign.botInviteLinks.map((link) => link.inviteLinkId));
      return channels.flatMap((channel) => {
        if (channel.id === campaign.telegramChannelId || (selected && !selected.has(channel.id))) return [];
        return trackingInviteLinkIds(channel, scope.kind).filter((id) => !existing.has(id)).map((id) => ({
          adCampaignId: campaign.id, kind: scope.kind, inviteLinkId: id, channelId: channel.id,
        }));
      });
    });
    if (!candidates.length) return;
    const links = await tx.telegramInviteLink.findMany({
      where: { workspaceId, isRevoked: false, id: { in: [...new Set(candidates.map(({ inviteLinkId }) => inviteLinkId))] } },
      select: { id: true, telegramChannelId: true, joinedCount: true, requestedCount: true },
    });
    const byId = new Map(links.map((link) => [link.id, link]));
    const data = candidates.flatMap(({ channelId, ...candidate }) => {
      const link = byId.get(candidate.inviteLinkId);
      return link?.telegramChannelId === channelId ? [{
        ...candidate, baselineJoinedCount: link.joinedCount, baselineRequestedCount: link.requestedCount,
      }] : [];
    });
    if (data.length) await tx.adCampaignBotInviteLink.createMany({ data, skipDuplicates: true });
  });
}

/** Pick one stale interval per included channel. Each interval is eligible once per day. */
export async function loadDueCampaignInviteWindows(
  prisma: PrismaService,
  workspaceId: string,
  channelIds: string[],
  now: Date,
) {
  if (!channelIds.length) return new Map<string, { campaignId: string; inviteLinkId: string }>();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<Array<{ channelId: string; campaignId: string; inviteLinkId: string }>>`
    SELECT DISTINCT ON (l."telegramChannelId")
      l."telegramChannelId" AS "channelId", c.id AS "campaignId", l.id AS "inviteLinkId"
    FROM "AdCampaignInviteLinkWindow" w
    JOIN "AdCampaign" c ON c.id = w."adCampaignId"
    JOIN "TelegramInviteLink" l ON l.id = w."inviteLinkId" AND l."adCampaignId" = c.id
    WHERE c."workspaceId" = ${workspaceId} AND c."endedAt" IS NULL
      AND l."workspaceId" = ${workspaceId} AND l."isRevoked" = false
      AND l."telegramChannelId" IN (${Prisma.join(channelIds)})
      AND COALESCE(w."lastAttemptAt", w."computedAt", 'epoch'::timestamp) <= ${cutoff}
    ORDER BY l."telegramChannelId", COALESCE(w."lastAttemptAt", w."computedAt", 'epoch'::timestamp), l.id
  `;
  return new Map(rows.map((row) => [row.channelId, row]));
}
