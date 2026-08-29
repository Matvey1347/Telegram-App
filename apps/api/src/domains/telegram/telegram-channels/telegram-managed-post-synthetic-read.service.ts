import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TelegramPostEngagementRow } from './telegram-post-engagement';

@Injectable()
export class TelegramManagedPostSyntheticReadService {
  constructor(private readonly prisma: PrismaService) {}

  private unlinkedPredicate(workspaceId: string, channelId: string) {
    return Prisma.sql`
      tp."workspaceId" = ${workspaceId}
      AND tp."telegramChannelId" = ${channelId}
      AND NOT EXISTS (
        SELECT 1
        FROM "TelegramManagedPost" mp
        WHERE mp."workspaceId" = ${workspaceId}
          AND mp."telegramChannelId" = ${channelId}
          AND (
            tp."telegramMessageId" = ANY(mp."telegramMessageIds")
            OR EXISTS (
              SELECT 1
              FROM unnest(mp."telegramMessageUrls") AS managed_url
              WHERE regexp_replace(split_part(managed_url, '?', 1), '/+$', '')
                LIKE '%/' || tp."telegramMessageId"
            )
          )
      )
    `;
  }

  private searchPredicate(search?: string) {
    const normalized = search?.trim();
    if (!normalized) return Prisma.empty;
    const pattern = `%${normalized}%`;
    return Prisma.sql`
      AND (
        COALESCE(tp."text", '') ILIKE ${pattern}
        OR COALESCE(tp."formattedText", '') ILIKE ${pattern}
        OR tp."telegramMessageId" ILIKE ${pattern}
      )
    `;
  }

  async count(workspaceId: string, channelId: string, search?: string) {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "TelegramPost" tp
        WHERE ${this.unlinkedPredicate(workspaceId, channelId)}
        ${this.searchPredicate(search)}
      `,
    );
    return Number(rows[0]?.count ?? 0);
  }

  async findPage(
    workspaceId: string,
    channelId: string,
    search: string | undefined,
    skip: number,
    take: number,
  ): Promise<TelegramPostEngagementRow[]> {
    if (take <= 0) return [];
    return this.prisma.$queryRaw<TelegramPostEngagementRow[]>(Prisma.sql`
      SELECT
        tp.id,
        tp."telegramMessageId",
        tp."text",
        tp."formattedText",
        tp."hasMedia",
        tp."mediaKind",
        tp."imageUrls",
        tp."postDate",
        tp."viewsCount",
        tp."forwardsCount",
        tp."reactionsCount",
        tp."commentsCount",
        tp."manualOwnViews",
        tp."manualOwnReactions",
        tp.reactions,
        tp."createdAt",
        tp."updatedAt"
      FROM "TelegramPost" tp
      WHERE ${this.unlinkedPredicate(workspaceId, channelId)}
      ${this.searchPredicate(search)}
      ORDER BY tp."postDate" DESC, tp.id DESC
      OFFSET ${skip}
      LIMIT ${take}
    `);
  }

  async findOne(workspaceId: string, channelId: string, id: string) {
    return this.prisma.telegramPost.findFirst({
      where: { id, workspaceId, telegramChannelId: channelId },
      select: {
        id: true,
        telegramMessageId: true,
        text: true,
        formattedText: true,
        hasMedia: true,
        mediaKind: true,
        imageUrls: true,
        postDate: true,
        viewsCount: true,
        forwardsCount: true,
        reactionsCount: true,
        commentsCount: true,
        manualOwnViews: true,
        manualOwnReactions: true,
        reactions: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
