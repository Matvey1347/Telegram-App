import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

/** Pick one stale interval per included channel. Each interval is eligible once per day. */
export async function loadDueCampaignInviteWindows(
  prisma: PrismaService,
  workspaceId: string,
  channelIds: string[],
  now: Date,
) {
  if (!channelIds.length)
    return new Map<string, { campaignId: string; inviteLinkId: string }>();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<
    Array<{ channelId: string; campaignId: string; inviteLinkId: string }>
  >`
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
