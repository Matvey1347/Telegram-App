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
import {
  crmAccountSummarySelect,
  crmMessagePreviewSelect,
  mapCrmAccountSummary,
  mapCrmMessagePreview,
} from './telegram-crm-read-model.mapper';

export const CRM_INBOX_CONVERSATION_SUMMARY_LIMIT = 5;

const inboxConversationSelect = {
  id: true,
  mtprotoAccountId: true,
  state: true,
  lastMessageAt: true,
  lastInboundAt: true,
  lastOutboundAt: true,
  unreadCount: true,
  readState: true,
  mtprotoAccount: { select: crmAccountSummarySelect },
  messages: {
    orderBy: [{ sentAt: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
    select: crmMessagePreviewSelect,
  },
} satisfies Prisma.TelegramCrmConversationSelect;

type InboxConversationRow = Prisma.TelegramCrmConversationGetPayload<{
  select: typeof inboxConversationSelect;
}>;

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
    const conversationWhere: Prisma.TelegramCrmConversationWhereInput = {
      contactId: null,
      ...(query.state ? { state: query.state } : {}),
    };
    const where: Prisma.TelegramCrmPeerWhereInput = {
      workspaceId: access.workspaceId,
      contactId: null,
      conversations: { some: conversationWhere },
    };
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
    const [rows, totalItems, aggregates] = await this.prisma.$transaction([
      this.prisma.telegramCrmPeer.findMany({
        where: { ...where, id: { in: orderedPeerIds } },
        select: {
          ...crmPeerSelect,
          conversations: {
            where: conversationWhere,
            orderBy: [
              { lastMessageAt: { sort: 'desc', nulls: 'last' } },
              { id: 'desc' },
            ],
            take: CRM_INBOX_CONVERSATION_SUMMARY_LIMIT,
            select: inboxConversationSelect,
          },
        },
      }),
      this.prisma.telegramCrmPeer.count({ where }),
      this.prisma.telegramCrmConversation.groupBy({
        by: ['telegramCrmPeerId'] as const,
        where: {
          workspaceId: access.workspaceId,
          telegramCrmPeerId: { in: orderedPeerIds },
          ...conversationWhere,
        },
        orderBy: { telegramCrmPeerId: 'asc' },
        _count: { _all: true },
        _sum: { unreadCount: true },
      }),
    ]);
    const aggregateByPeerId = new Map(
      aggregates.map((row) => [
        row.telegramCrmPeerId,
        {
          conversationCount:
            row._count && typeof row._count === 'object'
              ? (row._count._all ?? 0)
              : 0,
          unreadCount:
            row._sum && typeof row._sum === 'object'
              ? (row._sum.unreadCount ?? 0)
              : 0,
        },
      ]),
    );
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const orderedRows = orderedPeerIds.flatMap((id) => {
      const row = rowsById.get(id);
      return row ? [row] : [];
    });
    return createPaginatedResponse(
      orderedRows.map((row) => {
        const { conversations: rawConversations, ...peer } = row;
        const conversations = rawConversations.map((conversation) =>
          this.mapConversation(conversation),
        );
        const aggregate = aggregateByPeerId.get(row.id);
        return {
          peer: mapCrmPeer(peer),
          conversationCount: aggregate?.conversationCount ?? 0,
          unreadCount: aggregate?.unreadCount ?? 0,
          conversations,
          latestConversation: conversations[0] ?? null,
        };
      }),
      totalItems,
      pagination,
    );
  }

  private mapConversation(
    row: InboxConversationRow,
  ): CrmInboxConversationSummary {
    return {
      id: row.id,
      mtprotoAccountId: row.mtprotoAccountId,
      state: row.state,
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      lastInboundAt: row.lastInboundAt?.toISOString() ?? null,
      lastOutboundAt: row.lastOutboundAt?.toISOString() ?? null,
      unreadCount: row.unreadCount,
      readState: row.readState,
      account: mapCrmAccountSummary(row.mtprotoAccount),
      lastMessage: mapCrmMessagePreview(row.messages[0]),
    };
  }
}
