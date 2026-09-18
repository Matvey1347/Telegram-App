import { Prisma } from '@prisma/client';
import { AdCampaignQueryDto } from './dto';
import { adsChannelWhere, parseAdsChannelIds } from '../ads-channel-scope';

export type AdCampaignPageId = { id: string };

type DateBounds = { from?: Date; toExclusive?: Date };

function dateBounds(query: AdCampaignQueryDto): DateBounds {
  const from = query.dateFrom ? new Date(query.dateFrom) : undefined;
  if (!query.dateTo) return { from };
  const to = new Date(query.dateTo);
  const toExclusive = /^\d{4}-\d{2}-\d{2}$/.test(query.dateTo)
    ? new Date(to.getTime() + 24 * 60 * 60 * 1_000)
    : new Date(to.getTime() + 1);
  return { from, toExclusive };
}

function campaignDateWhere(bounds: DateBounds): Prisma.AdCampaignWhereInput {
  const range = {
    ...(bounds.from ? { gte: bounds.from } : {}),
    ...(bounds.toExclusive ? { lt: bounds.toExclusive } : {}),
  };
  if (!Object.keys(range).length) return {};
  return {
    OR: [
      { placementDate: range },
      { placementDate: null, startedAt: range },
      { placementDate: null, startedAt: null, createdAt: range },
    ],
  };
}

function campaignSearchWhere(
  workspaceId: string,
  search: string,
): Prisma.AdCampaignWhereInput {
  const contains = { contains: search, mode: 'insensitive' as const };
  return {
    OR: [
      { title: contains },
      {
        telegramChannel: {
          workspaceId,
          OR: [{ title: contains }, { username: contains }],
        },
      },
      { promo: { workspaceId, title: contains } },
      { promos: { some: { promo: { workspaceId, title: contains } } } },
      {
        advertisingTelegramChannels: {
          some: {
            telegramChannel: {
              workspaceId,
              OR: [{ title: contains }, { username: contains }],
            },
          },
        },
      },
      {
        advertisingChannels: {
          some: { advertisingSource: { workspaceId, name: contains } },
        },
      },
      {
        hypothesisLinks: {
          some: { workspaceId, hypothesis: { workspaceId, name: contains } },
        },
      },
    ],
  };
}

export function buildAdCampaignListWhere(
  workspaceId: string,
  query: AdCampaignQueryDto,
): Prisma.AdCampaignWhereInput {
  const search = query.search?.trim();
  const filters = [
    campaignDateWhere(dateBounds(query)),
    ...(search ? [campaignSearchWhere(workspaceId, search)] : []),
  ].filter((filter) => Object.keys(filter).length > 0);
  return {
    workspaceId,
    telegramChannel: { archivedAt: null },
    telegramChannelId: adsChannelWhere(
      query.telegramChannelId,
      query.telegramChannelIds,
    ),
    assignedMemberId: query.assignedMemberId || undefined,
    ...(filters.length ? { AND: filters } : {}),
  };
}

function searchSql(workspaceId: string, search: string) {
  const pattern = `%${search}%`;
  return Prisma.sql`(
    campaign."title" ILIKE ${pattern}
    OR EXISTS (
      SELECT 1 FROM "TelegramChannel" target
      WHERE target."id" = campaign."telegramChannelId"
        AND target."workspaceId" = ${workspaceId}
        AND (target."title" ILIKE ${pattern} OR target."username" ILIKE ${pattern})
    )
    OR EXISTS (
      SELECT 1 FROM "Promo" promo
      WHERE promo."id" = campaign."promoId"
        AND promo."workspaceId" = ${workspaceId}
        AND promo."title" ILIKE ${pattern}
    )
    OR EXISTS (
      SELECT 1 FROM "AdCampaignPromo" link
      JOIN "Promo" promo ON promo."id" = link."promoId"
      WHERE link."adCampaignId" = campaign."id"
        AND promo."workspaceId" = ${workspaceId}
        AND promo."title" ILIKE ${pattern}
    )
    OR EXISTS (
      SELECT 1 FROM "AdCampaignTelegramChannelPlacement" link
      JOIN "TelegramChannel" source ON source."id" = link."telegramChannelId"
      WHERE link."adCampaignId" = campaign."id"
        AND source."workspaceId" = ${workspaceId}
        AND (source."title" ILIKE ${pattern} OR source."username" ILIKE ${pattern})
    )
    OR EXISTS (
      SELECT 1 FROM "AdCampaignAdvertisingChannel" link
      JOIN "AdvertisingSource" source ON source."id" = link."advertisingSourceId"
      WHERE link."adCampaignId" = campaign."id"
        AND source."workspaceId" = ${workspaceId}
        AND source."name" ILIKE ${pattern}
    )
    OR EXISTS (
      SELECT 1 FROM "AdHypothesisCampaign" link
      JOIN "AdHypothesis" hypothesis ON hypothesis."id" = link."hypothesisId"
      WHERE link."adCampaignId" = campaign."id"
        AND link."workspaceId" = ${workspaceId}
        AND hypothesis."workspaceId" = ${workspaceId}
        AND hypothesis."name" ILIKE ${pattern}
    )
  )`;
}

function orderSql(sort: AdCampaignQueryDto['sort']) {
  if (sort === 'date_asc') {
    return Prisma.sql`COALESCE(campaign."placementDate", campaign."startedAt", campaign."createdAt") ASC, campaign."id" ASC`;
  }
  if (sort === 'cost_desc' || sort === 'cost_asc') {
    const direction = sort === 'cost_asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    return Prisma.sql`campaign."priceInPrimaryCurrency" ${direction}, campaign."id" ${direction}`;
  }
  if (sort === 'joined_desc' || sort === 'joined_asc') {
    const direction =
      sort === 'joined_asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    return Prisma.sql`COALESCE(
      NULLIF((
        SELECT SUM(link."joinedCount")
        FROM "TelegramInviteLink" link
        WHERE link."adCampaignId" = campaign."id"
          AND link."workspaceId" = campaign."workspaceId"
      ), 0),
      campaign."joinedCount"
    ) ${direction}, campaign."id" ${direction}`;
  }
  return Prisma.sql`COALESCE(campaign."placementDate", campaign."startedAt", campaign."createdAt") DESC, campaign."id" DESC`;
}

export function buildAdCampaignPageIdQuery(
  workspaceId: string,
  query: AdCampaignQueryDto,
  skip: number,
  take: number,
) {
  const bounds = dateBounds(query);
  const conditions: Prisma.Sql[] = [
    Prisma.sql`campaign."workspaceId" = ${workspaceId}`,
    Prisma.sql`EXISTS (
      SELECT 1 FROM "TelegramChannel" active_channel
      WHERE active_channel."id" = campaign."telegramChannelId"
        AND active_channel."workspaceId" = ${workspaceId}
        AND active_channel."archivedAt" IS NULL
    )`,
  ];
  const channelIds = parseAdsChannelIds(query.telegramChannelIds);
  if (channelIds.length) {
    conditions.push(
      Prisma.sql`campaign."telegramChannelId" IN (${Prisma.join(channelIds)})`,
    );
  } else if (query.telegramChannelId) {
    conditions.push(
      Prisma.sql`campaign."telegramChannelId" = ${query.telegramChannelId}`,
    );
  }
  if (query.assignedMemberId) {
    conditions.push(
      Prisma.sql`campaign."assignedMemberId" = ${query.assignedMemberId}`,
    );
  }
  if (bounds.from) {
    conditions.push(
      Prisma.sql`COALESCE(campaign."placementDate", campaign."startedAt", campaign."createdAt") >= ${bounds.from}`,
    );
  }
  if (bounds.toExclusive) {
    conditions.push(
      Prisma.sql`COALESCE(campaign."placementDate", campaign."startedAt", campaign."createdAt") < ${bounds.toExclusive}`,
    );
  }
  const search = query.search?.trim();
  if (search) conditions.push(searchSql(workspaceId, search));
  return Prisma.sql`
    SELECT campaign."id"
    FROM "AdCampaign" campaign
    WHERE ${Prisma.join(conditions, ' AND ')}
    ORDER BY ${orderSql(query.sort)}
    OFFSET ${skip}
    LIMIT ${take}
  `;
}
