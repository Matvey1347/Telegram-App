import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DashboardSalesMix } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramChannelTrafficAttributionService } from '../../telegram/telegram-channels/telegram-channel-traffic-attribution.service';

@Injectable()
export class DashboardInsightsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly traffic: TelegramChannelTrafficAttributionService,
  ) {}

  async trafficForPeriod(workspaceId: string, from: Date, to: Date) {
    // Archived channels still contribute to historical reporting.
    const channels = await this.prisma.telegramChannel.findMany({
      where: { workspaceId },
      select: { id: true },
    });
    return this.traffic.periodLinkActivity(
      workspaceId,
      channels.map(({ id }) => id),
      from,
      to,
    );
  }

  async salesForPeriod(
    workspaceId: string,
    from: Date,
    to: Date,
    includeRevenue = false,
  ) {
    const [mix] = await this.prisma.$queryRaw<DashboardSalesMix[]>(Prisma.sql`
      SELECT COUNT(*)::float8 AS "total",
        COUNT(*) FILTER (WHERE seller."role" = 'owner')::float8 AS "owner",
        COUNT(*) FILTER (WHERE seller."role" <> 'owner')::float8 AS "otherSellers",
        COUNT(*) FILTER (WHERE seller."id" IS NULL)::float8 AS "unassigned",
        COUNT(*) FILTER (
          WHERE sale."externalChannelOwner" IS NOT NULL
            OR EXISTS (
              SELECT 1 FROM "TelegramAdSalePlacement" placement
              WHERE placement."workspaceId" = sale."workspaceId"
                AND placement."telegramAdSaleId" = sale."id"
                AND placement."status" NOT IN ('DRAFT', 'CANCELLED', 'MISSED')
                AND NOT EXISTS (
                  SELECT 1 FROM "TelegramChannelAdminLink" admin
                  WHERE admin."workspaceId" = placement."workspaceId"
                    AND admin."telegramChannelId" = placement."telegramChannelId"
                )
            )
        )::float8 AS "external"
      FROM "TelegramAdSale" sale
      LEFT JOIN "WorkspaceMember" seller
        ON seller."id" = sale."sellerMemberId" AND seller."workspaceId" = sale."workspaceId"
      WHERE sale."workspaceId" = ${workspaceId}
        AND (
          EXISTS (
            SELECT 1 FROM "TelegramAdSalePayment" payment
            LEFT JOIN "Transaction" receipt ON receipt."id" = payment."transactionId"
              AND receipt."workspaceId" = payment."workspaceId"
            WHERE payment."workspaceId" = sale."workspaceId"
              AND payment."telegramAdSaleId" = sale."id"
              AND payment."status" = 'ACTIVE'
              AND receipt."deletedAt" IS NULL
              AND COALESCE(receipt."date", payment."paidAt") BETWEEN ${from} AND ${to}
          )
          OR (
            sale."status" IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
            AND sale."createdAt" BETWEEN ${from} AND ${to}
          )
          OR (
            sale."status" IN ('RESERVED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
            AND EXISTS (
              SELECT 1 FROM "TelegramAdSalePlacement" placement
              WHERE placement."workspaceId" = sale."workspaceId"
                AND placement."telegramAdSaleId" = sale."id"
                AND placement."status" NOT IN ('DRAFT', 'CANCELLED', 'MISSED')
                AND (
                  placement."scheduledAt" BETWEEN ${from} AND ${to}
                  OR placement."publishedAt" BETWEEN ${from} AND ${to}
                )
            )
          )
        )
    `);
    if (!includeRevenue) return mix;
    const revenueBySeller = await this.prisma.$queryRaw<
      NonNullable<DashboardSalesMix['revenueBySeller']>
    >`
      SELECT seller."id", COALESCE(NULLIF(u."name", ''), seller."telegramUsername") AS name,
        SUM(receipt."amountInPrimaryCurrency")::float8 AS amount
      FROM "TelegramAdSalePayment" payment
      JOIN "Transaction" receipt ON receipt."id" = payment."transactionId"
        AND receipt."workspaceId" = payment."workspaceId"
      JOIN "TelegramAdSale" sale ON sale."id" = payment."telegramAdSaleId"
        AND sale."workspaceId" = payment."workspaceId"
      LEFT JOIN "WorkspaceMember" seller ON seller."id" = sale."sellerMemberId"
        AND seller."workspaceId" = sale."workspaceId"
      LEFT JOIN "User" u ON u."id" = seller."userId"
      WHERE payment."workspaceId" = ${workspaceId}
        AND payment."status" = 'ACTIVE' AND receipt."deletedAt" IS NULL
        AND receipt."date" BETWEEN ${from} AND ${to}
      GROUP BY seller."id", u."name", seller."telegramUsername"
      ORDER BY amount DESC, seller."id" ASC
    `;
    return { ...mix, revenueBySeller };
  }
}
