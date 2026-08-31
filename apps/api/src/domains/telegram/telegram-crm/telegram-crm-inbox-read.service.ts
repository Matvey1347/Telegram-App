import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CrmInboxConversationSummary,
  CrmInboxListResult,
} from '@telegram-system/shared';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { CrmInboxQueryDto } from './telegram-crm-inbox.dto';
import { crmPeerSelect, mapCrmPeer } from './telegram-crm-peer.service';

@Injectable()
export class TelegramCrmInboxReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
  ) {}

  async list(
    userId: string,
    query: CrmInboxQueryDto,
  ): Promise<CrmInboxListResult> {
    const access = await this.authorization.require(
      userId,
      'adSales.crm.viewAny',
    );
    const pagination = normalizePagination(query);
    const conversationWhere = query.state ? { state: query.state } : {};
    const where = {
      workspaceId: access.workspaceId,
      contactId: null,
      conversations: { some: conversationWhere },
    } as const;
    const activityRows = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT peer."id"
        FROM "TelegramCrmPeer" peer
        INNER JOIN "TelegramCrmConversation" conversation
          ON conversation."telegramCrmPeerId" = peer."id"
          AND conversation."workspaceId" = peer."workspaceId"
        WHERE peer."workspaceId" = ${access.workspaceId}
          AND peer."contactId" IS NULL
          AND conversation."contactId" IS NULL
          ${
            query.state
              ? Prisma.sql`AND conversation."state"::text = ${query.state}`
              : Prisma.empty
          }
        GROUP BY peer."id"
        ORDER BY MAX(conversation."lastMessageAt") DESC NULLS LAST,
          MAX(conversation."updatedAt") DESC,
          peer."id" DESC
        OFFSET ${pagination.skip}
        LIMIT ${pagination.take}
      `,
    );
    const orderedPeerIds = activityRows.map((row) => row.id);
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.telegramCrmPeer.findMany({
        where: { ...where, id: { in: orderedPeerIds } },
        select: {
          ...crmPeerSelect,
          conversations: {
            where: conversationWhere,
            orderBy: [
              {
                lastMessageAt: {
                  sort: 'desc' as const,
                  nulls: 'last' as const,
                },
              },
              { id: 'desc' as const },
            ],
            select: {
              id: true,
              mtprotoAccountId: true,
              state: true,
              lastMessageAt: true,
              lastInboundAt: true,
              lastOutboundAt: true,
              unreadCount: true,
              readState: true,
            },
          },
        },
      }),
      this.prisma.telegramCrmPeer.count({ where }),
    ]);
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const orderedRows = orderedPeerIds.flatMap((id) => {
      const row = rowsById.get(id);
      return row ? [row] : [];
    });
    return createPaginatedResponse(
      orderedRows.map((row) => {
        const { conversations, ...peer } = row;
        const latest = conversations[0];
        const latestConversation: CrmInboxConversationSummary | null = latest
          ? {
              ...latest,
              lastMessageAt: latest.lastMessageAt?.toISOString() ?? null,
              lastInboundAt: latest.lastInboundAt?.toISOString() ?? null,
              lastOutboundAt: latest.lastOutboundAt?.toISOString() ?? null,
            }
          : null;
        return {
          peer: mapCrmPeer(peer),
          conversationCount: conversations.length,
          unreadCount: conversations.reduce(
            (sum, conversation) => sum + conversation.unreadCount,
            0,
          ),
          latestConversation,
        };
      }),
      totalItems,
      pagination,
    );
  }
}
