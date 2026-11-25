import { Prisma } from '@prisma/client';
import type {
  BotAdCampaignTotals,
  BotAdLinkView,
  BotAdPlacementCampaign,
  BotAdPromoView,
  BotAdsEnvironment,
} from '@telegram-system/shared';
import { normalizeTelegramPostMediaItems } from '@telegram-system/shared';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import type { PrismaService } from '../../../prisma/prisma.service';
import { normalizeTelegramPostButtonRows } from '@api/telegram/shared/markup/telegram-inline-keyboard';

export const BOT_ADS_PAGE_SIZE = 50;
export const botAdPromoSelect = {
  id: true,
  title: true,
  archivedAt: true,
  iconId: true,
  icon: {
    select: { id: true, type: true, emoji: true, name: true, imageUrl: true },
  },
  post: true,
} satisfies Prisma.BotAdPromoSelect;

export function readBotAdCreative(post: Prisma.JsonValue) {
  const data =
    post && typeof post === 'object' && !Array.isArray(post) ? post : {};
  const imageUrls = Array.isArray(data.imageUrls)
    ? data.imageUrls.filter((url): url is string => typeof url === 'string')
    : [];
  return {
    text: typeof data.text === 'string' ? data.text : '',
    plainText: typeof data.plainText === 'string' ? data.plainText : null,
    formattedHtml:
      typeof data.formattedHtml === 'string' ? data.formattedHtml : null,
    imageUrls,
    mediaItems: normalizeTelegramPostMediaItems(data.mediaItems, imageUrls),
    buttonRows: normalizeTelegramPostButtonRows(data.buttonRows),
  };
}

export function botAdPromoView(
  row: Prisma.BotAdPromoGetPayload<{ select: typeof botAdPromoSelect }>,
): BotAdPromoView {
  return {
    ...readBotAdCreative(row.post),
    id: row.id,
    title: row.title,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    iconId: row.iconId,
    iconPresentation: iconToResolvedEmoji(row.icon),
  };
}

export const botAdLinkSelect = {
  id: true,
  title: true,
  clicks: true,
  campaignId: true,
  campaignDetails: true,
  tracked: true,
  publicationIntent: true,
  createdAt: true,
  promo: { select: { id: true, title: true } },
  channel: {
    select: {
      id: true,
      title: true,
      isTest: true,
      presentationIcon: {
        select: {
          id: true,
          type: true,
          emoji: true,
          name: true,
          imageUrl: true,
        },
      },
    },
  },
  managedPost: {
    select: {
      id: true,
      status: true,
      telegramChannelId: true,
      scheduledAt: true,
      publishedAt: true,
      telegramMessageUrls: true,
      telegramPost: { select: { viewsCount: true, reactionsCount: true } },
    },
  },
} satisfies Prisma.BotAdLinkSelect;

type Counts = Pick<BotAdLinkView, 'starts' | 'active' | 'retained' | 'paid'>;
type ConversionScope = {
  runtimeInstanceId: string;
  workspaceId: string;
  botIntegrationId: string;
  environment: BotAdsEnvironment;
};
type LinkRow = Prisma.BotAdLinkGetPayload<{ select: typeof botAdLinkSelect }>;

export function botAdRedirectOrigin(origin: string | undefined) {
  if (!origin) return undefined;
  const { hostname, protocol } = new URL(origin);
  if (
    protocol === 'https:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(hostname)
  )
    return origin;
  return undefined;
}

export function telegramBotAdUrl(username: string, id: string) {
  return `https://t.me/${username}?start=ad_${id}`;
}

export function botAdLinkView(
  row: LinkRow,
  username: string,
  apiOrigin: string | undefined,
  counts: Counts = { starts: 0, active: 0, retained: 0, paid: 0 },
): BotAdLinkView {
  const post =
    row.managedPost?.telegramChannelId === row.channel?.id
      ? row.managedPost
      : null;
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    url:
      row.tracked && apiOrigin
        ? `${apiOrigin}/api/bot-ad-links/${row.id}`
        : telegramBotAdUrl(username, row.id),
    promo: row.promo,
    campaignId: row.campaignId,
    ...(row.campaignDetails
      ? { campaign: row.campaignDetails as BotAdPlacementCampaign }
      : {}),
    channel: row.channel
      ? {
          id: row.channel.id,
          title: row.channel.title,
          isTest: row.channel.isTest,
          avatarPresentation: iconToResolvedEmoji(row.channel.presentationIcon),
        }
      : null,
    post: post
      ? {
          id: post.id,
          requestedPublication: row.publicationIntent,
          status: post.status,
          scheduledAt: post.scheduledAt?.toISOString() ?? null,
          publishedAt: post.publishedAt?.toISOString() ?? null,
          url: post.telegramMessageUrls[0] ?? null,
        }
      : null,
    views: post?.telegramPost?.viewsCount ?? null,
    reactions: post?.telegramPost?.reactionsCount ?? null,
    clicks: row.tracked ? Number(row.clicks) : null,
    ...counts,
  };
}

function conversionColumns(scope: ConversionScope) {
  const mode = scope.environment === 'LOCAL' ? 'TEST' : 'LIVE';
  return Prisma.sql`
    count(*)::int AS starts,
    count(*) FILTER (WHERE a."activatedAt" IS NOT NULL)::int AS active,
    count(*) FILTER (WHERE a."retainedAt" IS NOT NULL)::int AS retained,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM "BotSubscription" s
      JOIN "BotBillingEvent" e ON e."subscriptionId" = s."id"
      WHERE s."telegramBotUserId" = a."telegramBotUserId"
        AND s."workspaceId" = ${scope.workspaceId}
        AND s."botIntegrationId" = ${scope.botIntegrationId}
        AND e."type" = 'PAYMENT_SUCCEEDED'
        AND e."amountMinor" > 0
        AND e."occurredAt" >= a."startedAt"
        AND (
          (e."provider" = 'STRIPE' AND e."mode" = ${mode}::"BotBillingProviderMode")
          OR (e."provider" = 'TELEGRAM_STARS' AND e."runtimeInstanceId" = a."runtimeInstanceId")
        )
    ))::int AS paid
  `;
}

export async function countBotAdConversions(
  prisma: PrismaService,
  scope: ConversionScope,
  ids: string[],
) {
  if (!ids.length) return new Map<string, Counts>();
  const rows = await prisma.$queryRaw<Array<Counts & { linkId: string }>>`
    SELECT a."linkId", ${conversionColumns(scope)}
    FROM "BotAdAttribution" a
    WHERE a."runtimeInstanceId" = ${scope.runtimeInstanceId}
      AND a."linkId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
    GROUP BY a."linkId"
  `;
  return new Map(rows.map(({ linkId, ...counts }) => [linkId, counts]));
}

export async function readBotAdCampaignTotals(
  prisma: PrismaService,
  scope: ConversionScope,
  filter: { promoId?: string; campaignId?: string },
) {
  const [row] = await prisma.$queryRaw<BotAdCampaignTotals[]>`
    WITH placements AS (
      SELECT "id", "managedPostId", "telegramChannelId", "tracked", "clicks"
      FROM "BotAdLink"
      WHERE "runtimeInstanceId" = ${scope.runtimeInstanceId}
      ${filter.campaignId ? Prisma.sql`AND "campaignId" = ${filter.campaignId}::uuid` : Prisma.empty}
      ${filter.promoId ? Prisma.sql`AND "promoId" = ${filter.promoId}` : Prisma.empty}
    ),
    publication AS (
      SELECT count(*)::int AS placements,
        count(*) FILTER (WHERE m."status" = 'PUBLISHED')::int AS published,
        sum(p."viewsCount")::float8 AS views,
        sum(p."reactionsCount")::float8 AS reactions,
        sum(l."clicks") FILTER (WHERE l."tracked")::float8 AS clicks
      FROM placements l
      LEFT JOIN "TelegramManagedPost" m ON m."id" = l."managedPostId" AND m."telegramChannelId" = l."telegramChannelId"
      LEFT JOIN "TelegramPost" p ON p."id" = m."telegramPostId"
    ),
    conversions AS (
      SELECT ${conversionColumns(scope)}
      FROM placements l
      JOIN "BotAdAttribution" a ON a."linkId" = l."id"
      WHERE a."runtimeInstanceId" = ${scope.runtimeInstanceId}
    )
    SELECT * FROM publication CROSS JOIN conversions
  `;
  return row;
}
