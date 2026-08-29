import { Prisma } from '@prisma/client';
import { TelegramAdSalesQueryDto } from './dto';

export function normalizeTelegramUsername(value?: string | null) {
  const normalized = value?.trim().replace(/^@+/, '').toLowerCase() || '';
  return normalized || null;
}

export function buildTelegramAdSaleListWhere(
  workspaceId: string,
  query: TelegramAdSalesQueryDto,
  advertiserTelegramUsername?: string | null,
): Prisma.TelegramAdSaleWhereInput {
  const telegramUsername = normalizeTelegramUsername(
    advertiserTelegramUsername,
  );
  const variants = telegramUsername
    ? [telegramUsername, `@${telegramUsername}`]
    : [];
  const advertiserFilter: Prisma.TelegramAdSaleWhereInput | null =
    query.advertiserId
      ? {
          OR: [
            { advertiserId: query.advertiserId },
            ...(variants.length
              ? [
                  {
                    advertiserId: null,
                    advertiserTelegram: {
                      in: variants,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    advertiserId: null,
                    advertiserTelegramSnapshot: {
                      in: variants,
                      mode: 'insensitive' as const,
                    },
                  },
                ]
              : []),
          ],
        }
      : null;
  const search = query.search?.trim();
  const searchFilter: Prisma.TelegramAdSaleWhereInput | null = search
    ? {
        OR: [
          { id: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
          { advertiserName: { contains: search, mode: 'insensitive' } },
          {
            advertiserTelegram: { contains: search, mode: 'insensitive' },
          },
          { advertiserContact: { contains: search, mode: 'insensitive' } },
          {
            advertiserNameSnapshot: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            advertiserTelegramSnapshot: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            advertiserCompanySnapshot: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            placements: {
              some: {
                workspaceId,
                telegramChannel: {
                  workspaceId,
                  OR: [
                    { title: { contains: search, mode: 'insensitive' } },
                    { username: { contains: search, mode: 'insensitive' } },
                  ],
                },
              },
            },
          },
        ],
      }
    : null;
  return {
    workspaceId,
    ...(query.status ? { status: query.status } : {}),
    ...(advertiserFilter && searchFilter
      ? { AND: [advertiserFilter, searchFilter] }
      : (advertiserFilter ?? searchFilter ?? {})),
  };
}
