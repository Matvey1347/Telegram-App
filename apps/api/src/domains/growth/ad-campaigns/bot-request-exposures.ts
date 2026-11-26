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
      COALESCE(c."endedAt", GREATEST(COALESCE(c."startedAt", c."placementDate") + interval '24 hours', traffic."peakAt")) AS "endsAt",
      c."sourcePostViews" AS views, traffic.requests
    FROM "AdCampaign" c
    LEFT JOIN LATERAL (
      SELECT SUM(GREATEST(0, last.total - first.total))::int AS requests,
        MAX(last."syncedAt") FILTER (WHERE last.total > first.total) AS "peakAt"
      FROM "TelegramInviteLink" link
      CROSS JOIN LATERAL (
        SELECT s."joinedCount" + s."requestedCount" AS total
        FROM "TelegramInviteLinkSnapshot" s
        WHERE s."workspaceId" = c."workspaceId" AND s."inviteLinkId" = link.id
          AND s."syncedAt" BETWEEN COALESCE(c."startedAt", c."placementDate") - interval '48 hours'
                              AND COALESCE(c."startedAt", c."placementDate")
          AND s."joinedCount" IS NOT NULL AND s."requestedCount" IS NOT NULL
        ORDER BY s."syncedAt" DESC LIMIT 1
      ) first
      CROSS JOIN LATERAL (
        SELECT s."joinedCount" + s."requestedCount" AS total, s."syncedAt"
        FROM "TelegramInviteLinkSnapshot" s
        WHERE s."workspaceId" = c."workspaceId" AND s."inviteLinkId" = link.id
          AND s."syncedAt" > COALESCE(c."startedAt", c."placementDate")
          AND s."syncedAt" <= COALESCE(c."endedAt", COALESCE(c."startedAt", c."placementDate") + interval '24 hours') + interval '12 hours'
          AND s."joinedCount" IS NOT NULL AND s."requestedCount" IS NOT NULL
        ORDER BY total DESC, s."syncedAt" ASC LIMIT 1
      ) last
      WHERE link."workspaceId" = c."workspaceId" AND link."adCampaignId" = c.id
    ) traffic ON true
    WHERE c."workspaceId" = ${workspaceId} AND c."telegramChannelId" IN (${channels})
      AND c.status NOT IN ('cancelled', 'archived') AND NOT c."excludeFromAnalytics"
      AND COALESCE(c."startedAt", c."placementDate") < ${until}
      AND COALESCE(c."endedAt", GREATEST(COALESCE(c."startedAt", c."placementDate") + interval '24 hours', traffic."peakAt")) > ${from}
    UNION ALL
    SELECT 'promotion:' || p.id, target."telegramChannelId", p."scheduledAt",
      COALESCE(CASE WHEN p."trackingEndsAt" > p."scheduledAt" THEN p."trackingEndsAt" END, p."scheduledAt" + interval '24 hours'), reach.views, NULL::int
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
    SELECT 'folder:' || f.id, participant."telegramChannelId", f."startsAt", f."endsAt", reach.views, NULL::int
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
