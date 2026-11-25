import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

export type InviteLinkPeriodActivity = {
  inviteLinkId: string;
  arrivals: number;
  requests: number | null;
  joined: number;
  audienceAtStart: number;
  departures: number;
};

/**
 * Take the last comparable observation before the period and aggregate changes
 * in the database. A first observation with no baseline is only comparable to
 * zero when Telegram itself dates the creation of the link to this period.
 */
export async function readInviteLinkPeriodActivity(
  prisma: PrismaService,
  workspaceId: string,
  inviteLinkIds: string[],
  from: Date,
  to: Date,
): Promise<InviteLinkPeriodActivity[]> {
  if (!inviteLinkIds.length) return [];
  return prisma.$queryRaw<InviteLinkPeriodActivity[]>(Prisma.sql`
    WITH links AS (
      SELECT "id", "createsJoinRequest",
        "telegramCreatedAt" >= ${from} AND "telegramCreatedAt" <= ${to} AS "openedInPeriod"
      FROM "TelegramInviteLink"
      WHERE "workspaceId" = ${workspaceId} AND "id" IN (${Prisma.join(inviteLinkIds)})
    ),
    observations AS (
      SELECT link."id", link."createsJoinRequest", link."openedInPeriod",
        sample."syncedAt", sample."joinedCount", sample."requestedCount"
      FROM links link
      CROSS JOIN LATERAL (
        (
          SELECT "syncedAt", "joinedCount", "requestedCount"
          FROM "TelegramInviteLinkSnapshot"
          WHERE "workspaceId" = ${workspaceId} AND "inviteLinkId" = link."id"
            AND "syncedAt" < ${from}
            AND "joinedCount" IS NOT NULL AND "requestedCount" IS NOT NULL
          ORDER BY "syncedAt" DESC LIMIT 1
        )
        UNION ALL
        (
          SELECT "syncedAt", "joinedCount", "requestedCount"
          FROM "TelegramInviteLinkSnapshot"
          WHERE "workspaceId" = ${workspaceId} AND "inviteLinkId" = link."id"
            AND "syncedAt" >= ${from} AND "syncedAt" <= ${to}
            AND "joinedCount" IS NOT NULL AND "requestedCount" IS NOT NULL
        )
      ) sample
    ),
    changes AS (
      SELECT "id", "createsJoinRequest", "syncedAt",
        LAG("joinedCount", 1, CASE WHEN "openedInPeriod" THEN 0 END)
          OVER link_history AS "previousJoined",
        "joinedCount" - LAG("joinedCount", 1, CASE WHEN "openedInPeriod" THEN 0 END)
          OVER link_history AS "joinedDelta",
        "requestedCount" - LAG("requestedCount", 1, CASE WHEN "openedInPeriod" THEN 0 END)
          OVER link_history AS "pendingDelta"
      FROM observations
      WINDOW link_history AS (PARTITION BY "id" ORDER BY "syncedAt")
    )
    SELECT "id" AS "inviteLinkId",
      SUM(GREATEST(0, "joinedDelta" + "pendingDelta"))::float8 AS "arrivals",
      CASE
        WHEN "createsJoinRequest" THEN SUM(GREATEST(0, "joinedDelta" + "pendingDelta"))::float8
        WHEN "createsJoinRequest" = false THEN SUM(GREATEST(0, "pendingDelta"))::float8
        WHEN BOOL_OR("pendingDelta" > 0) THEN SUM(GREATEST(0, "pendingDelta"))::float8
      END AS "requests",
      ((ARRAY_AGG("previousJoined" ORDER BY "syncedAt"))[1])::float8 AS "audienceAtStart",
      SUM(GREATEST(0, "joinedDelta"))::float8 AS "joined",
      SUM(GREATEST(0, -"joinedDelta"))::float8 AS "departures"
    FROM changes
    WHERE "syncedAt" >= ${from} AND "joinedDelta" IS NOT NULL
    GROUP BY "id", "createsJoinRequest"
  `);
}
