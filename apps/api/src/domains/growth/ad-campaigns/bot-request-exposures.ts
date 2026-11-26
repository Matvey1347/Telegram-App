import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { CampaignWindow } from './bot-request-allocation';

type ChannelExposure = CampaignWindow & { channelId: string };

export async function loadBotRequestExposures(
  prisma: PrismaService,
  workspaceId: string,
  channelIds: string[],
  from: Date,
  until: Date,
) {
  const channels = Prisma.join(channelIds);
  const exposures = await prisma.$queryRaw<ChannelExposure[]>`
    SELECT c.id AS "campaignId", c."telegramChannelId" AS "channelId",
      COALESCE(c."startedAt", c."placementDate") AS "startsAt",
      COALESCE(c."endedAt", COALESCE(c."startedAt", c."placementDate") + interval '24 hours') AS "endsAt",
      c."sourcePostViews" AS views
    FROM "AdCampaign" c
    WHERE c."workspaceId" = ${workspaceId} AND c."telegramChannelId" IN (${channels})
      AND c.status NOT IN ('cancelled', 'archived') AND NOT c."excludeFromAnalytics"
      AND COALESCE(c."startedAt", c."placementDate") < ${until}
      AND COALESCE(c."endedAt", COALESCE(c."startedAt", c."placementDate") + interval '24 hours') > ${from}
    UNION ALL
    SELECT 'promotion:' || p.id, target."telegramChannelId", p."scheduledAt",
      COALESCE(CASE WHEN p."trackingEndsAt" > p."scheduledAt" THEN p."trackingEndsAt" END, p."scheduledAt" + interval '24 hours'), reach.views
    FROM "CrossPromotionPlan" p
    CROSS JOIN LATERAL (
      SELECT DISTINCT entry->>'telegramChannelId' AS "telegramChannelId"
      FROM jsonb_array_elements(p.targets) entry
      UNION
      SELECT unnest(p."publisherChannelIds")
      WHERE p.kind = 'DIRECT_MUTUAL' AND jsonb_array_length(p.targets) = 0
    ) target
    LEFT JOIN LATERAL (
      SELECT SUM(post."viewsCount")::int AS views
      FROM jsonb_array_elements(p."placementPostIds") placement
      JOIN "TelegramManagedPost" managed
        ON managed.id = placement->>'managedPostId' AND managed."workspaceId" = p."workspaceId"
      JOIN "TelegramPost" post ON post.id = managed."telegramPostId"
    ) reach ON true
    WHERE p."workspaceId" = ${workspaceId} AND target."telegramChannelId" IN (${channels})
      AND p.status IN ('ACTIVE', 'COMPLETED')
      AND p."scheduledAt" < ${until}
      AND COALESCE(CASE WHEN p."trackingEndsAt" > p."scheduledAt" THEN p."trackingEndsAt" END, p."scheduledAt" + interval '24 hours') > ${from}
    UNION ALL
    SELECT 'folder:' || f.id, participant."telegramChannelId", f."startsAt", f."endsAt", reach.views
    FROM "MutualPromotionFolderParticipant" participant
    JOIN "MutualPromotionFolder" f ON f.id = participant."folderId" AND f."workspaceId" = participant."workspaceId"
    LEFT JOIN LATERAL (
      SELECT SUM(post."viewsCount")::int AS views
      FROM "MutualPromotionPostDelivery" delivery
      JOIN "TelegramManagedPost" managed ON managed.id = delivery."managedPostId"
      JOIN "TelegramPost" post ON post.id = managed."telegramPostId"
      WHERE delivery."participantId" = participant.id AND delivery."workspaceId" = participant."workspaceId"
    ) reach ON true
    WHERE participant."workspaceId" = ${workspaceId} AND participant."telegramChannelId" IN (${channels})
      AND f.status IN ('ACTIVE', 'DELETING', 'COMPLETED')
      AND f."startsAt" < ${until} AND f."endsAt" > ${from}
  `;
  const byChannel = new Map<string, CampaignWindow[]>();
  for (const { channelId, ...window } of exposures) {
    const existing = byChannel.get(channelId) ?? [];
    existing.push(window);
    byChannel.set(channelId, existing);
  }
  return byChannel;
}
