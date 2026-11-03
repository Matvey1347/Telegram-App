import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { deriveCrmSalesAttention } from '@telegram-system/shared';
import type {
  CrmInboxConversationItem,
  CrmInboxConversationsPage,
  CrmInboxFilter,
  ResolvedEmoji,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { crmFolderSelect } from './telegram-crm-folder-sync';
import { CrmInboxConversationsQueryDto } from './telegram-crm-inbox-conversations.dto';
import {
  crmAccountSummarySelect,
  crmMessagePreviewSelect,
  crmPeerSummarySelect,
  mapCrmAccountSummary,
  mapCrmMessagePreview,
  mapCrmPeerSummary,
} from './telegram-crm-read-model.mapper';

const inboxSelect = {
  id: true,
  workspaceId: true,
  state: true,
  mtprotoAccountId: true,
  lastMessageAt: true,
  lastInboundAt: true,
  lastOutboundAt: true,
  unreadCount: true,
  ignoreInUnread: true,
  readState: true,
  contact: {
    select: {
      id: true,
      displayName: true,
      telegramUsername: true,
      stage: true,
      nextContactAt: true,
      manualSalesStatus: true,
      archivedAt: true,
    },
  },
  folderMemberships: {
    where: { folder: { isActive: true } },
    select: {
      workspaceId: true,
      mtprotoAccountId: true,
      folder: { select: crmFolderSelect },
    },
  },
  peer: { select: crmPeerSummarySelect },
  mtprotoAccount: { select: crmAccountSummarySelect },
  messages: {
    where: { deletedAt: null },
    select: crmMessagePreviewSelect,
    orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
    take: 1,
  },
} satisfies Prisma.TelegramCrmConversationSelect;

type InboxRow = Prisma.TelegramCrmConversationGetPayload<{
  select: typeof inboxSelect;
}>;
type InboxCursor = { lastMessageAt: Date | null; id: string };

@Injectable()
export class TelegramCrmInboxConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
  ) {}

  async list(
    userId: string,
    query: CrmInboxConversationsQueryDto,
  ): Promise<CrmInboxConversationsPage> {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const ownership = await this.authorization.scope(
      userId,
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    const filter = query.filter ?? 'ALL';
    // Leads use /lead-discovery/candidates, not synthetic Telegram conversations.
    if (filter === 'AI_LEADS')
      return { items: [], nextCursor: null, hasMore: false };
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));
    const search = query.search?.trim().replace(/^@+/, '').slice(0, 100);
    const and: Prisma.TelegramCrmConversationWhereInput[] = [
      this.filterWhere(filter),
    ];
    if (cursor) and.push(this.cursorWhere(cursor));
    if (query.folderId) {
      const folder = await this.prisma.telegramCrmFolder.findFirst({
        where: {
          id: query.folderId,
          workspaceId: access.workspaceId,
          isActive: true,
        },
        select: { mtprotoAccountId: true, excludeRead: true },
      });
      if (!folder) return { items: [], nextCursor: null, hasMore: false };
      and.push({
        mtprotoAccountId: folder.mtprotoAccountId,
        ...(folder.excludeRead ? { unreadCount: { gt: 0 } } : {}),
        folderMemberships: {
          some: {
            workspaceId: access.workspaceId,
            mtprotoAccountId: folder.mtprotoAccountId,
            folderId: query.folderId,
          },
        },
      });
    }
    if (search) {
      const contains = { contains: search, mode: 'insensitive' as const };
      and.push({
        OR: [
          { peer: { firstName: contains } },
          { peer: { lastName: contains } },
          { peer: { username: contains } },
          { contact: { displayName: contains } },
          { contact: { telegramUsername: contains } },
        ],
      });
    }
    const rows = await this.prisma.telegramCrmConversation.findMany({
      where: {
        workspaceId: access.workspaceId,
        state: filter === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
        ...('assignedMemberId' in ownership
          ? { contact: { ownerMemberId: ownership.assignedMemberId } }
          : {}),
        AND: and,
      },
      select: inboxSelect,
      orderBy: [
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        { id: 'desc' },
      ],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      items: page.map((row) => this.mapRow(row)),
      hasMore,
      nextCursor:
        hasMore && page.length
          ? this.encodeCursor(page[page.length - 1])
          : null,
    };
  }

  async setIgnoreInUnread(userId: string, conversationId: string, ignored: boolean) {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const view = await this.authorization.scope(userId, 'adSales.crm.viewOwn', 'adSales.crm.viewAny');
    const edit = await this.authorization.scope(userId, 'adSales.crm.editOwn', 'adSales.crm.editAny');
    const ownership = 'assignedMemberId' in view ? view : edit;
    const result = await this.prisma.telegramCrmConversation.updateMany({
      where: {
        id: conversationId,
        workspaceId: access.workspaceId,
        ...('assignedMemberId' in ownership
          ? { contact: { ownerMemberId: ownership.assignedMemberId } }
          : {}),
        ignoreInUnread: { not: ignored },
      },
      data: { ignoreInUnread: ignored },
    });
    if (!result.count) {
      const existing = await this.prisma.telegramCrmConversation.findFirst({
        where: { id: conversationId, workspaceId: access.workspaceId,
          ...('assignedMemberId' in ownership ? { contact: { ownerMemberId: ownership.assignedMemberId } } : {}) },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('CRM Conversation not found');
    }
    return { id: conversationId, ignoreInUnread: ignored };
  }

  private filterWhere(
    filter: CrmInboxFilter,
  ): Prisma.TelegramCrmConversationWhereInput {
    if (filter === 'UNREAD') return { unreadCount: { gt: 0 }, ignoreInUnread: false };
    if (filter === 'FOLLOW_UP') {
      return {
        contact: {
          OR: [
            { manualSalesStatus: null },
            { manualSalesStatus: { notIn: ['CLOSED', 'DO_NOT_CONTACT'] } },
          ],
          archivedAt: null,
          nextContactAt: { lte: new Date() },
        },
      };
    }
    if (filter === 'NEEDS_REPLY') {
      return {
        AND: [
          {
            OR: [
              { contactId: null },
              { contact: { manualSalesStatus: null, archivedAt: null } },
            ],
          },
          {
            OR: [
              { contactId: null },
              {
                contact: {
                  OR: [
                    { nextContactAt: null },
                    { nextContactAt: { gt: new Date() } },
                  ],
                },
              },
            ],
          },
        ],
        lastInboundAt: { not: null },
        OR: [
          { lastOutboundAt: null },
          {
            lastInboundAt: {
              gt: this.prisma.telegramCrmConversation.fields.lastOutboundAt,
            },
          },
        ],
      };
    }
    return {};
  }

  private cursorWhere(
    cursor: InboxCursor,
  ): Prisma.TelegramCrmConversationWhereInput {
    if (!cursor.lastMessageAt)
      return { lastMessageAt: null, id: { lt: cursor.id } };
    return {
      OR: [
        { lastMessageAt: { lt: cursor.lastMessageAt } },
        { lastMessageAt: cursor.lastMessageAt, id: { lt: cursor.id } },
        { lastMessageAt: null },
      ],
    };
  }

  private mapRow(row: InboxRow): CrmInboxConversationItem {
    const preview = mapCrmMessagePreview(row.messages[0]);
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      state: row.state,
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      lastInboundAt: row.lastInboundAt?.toISOString() ?? null,
      lastOutboundAt: row.lastOutboundAt?.toISOString() ?? null,
      unreadCount: row.unreadCount,
      ignoreInUnread: row.ignoreInUnread,
      readState: row.readState,
      attentionStatus: deriveCrmSalesAttention({
        state: row.state,
        archivedAt: row.contact?.archivedAt?.toISOString() ?? null,
        manualStatus: row.contact?.manualSalesStatus ?? null,
        nextContactAt: row.contact?.nextContactAt?.toISOString() ?? null,
        lastInboundAt: row.lastInboundAt?.toISOString() ?? null,
        lastOutboundAt: row.lastOutboundAt?.toISOString() ?? null,
      }),
      contact: row.contact
        ? {
            id: row.contact.id,
            displayName: row.contact.displayName,
            telegramUsername: row.contact.telegramUsername,
            stage: row.contact.stage,
            manualSalesStatus: row.contact.manualSalesStatus ?? null,
            archivedAt: row.contact.archivedAt?.toISOString() ?? null,
            nextContactAt: row.contact.nextContactAt?.toISOString() ?? null,
          }
        : null,
      folders: (row.folderMemberships ?? []).flatMap(
        ({ folder, workspaceId, mtprotoAccountId }) =>
          workspaceId === row.workspaceId &&
          folder.workspaceId === row.workspaceId &&
          mtprotoAccountId === row.mtprotoAccountId &&
          folder.mtprotoAccountId === row.mtprotoAccountId &&
          folder.isActive
            ? [
                {
                  id: folder.id,
                  name: folder.name,
                  color: folder.color,
                  emojiPresentation:
                    folder.emojiPresentation as ResolvedEmoji | null,
                  excludeRead: folder.excludeRead,
                },
              ]
            : [],
      ),
      peer: mapCrmPeerSummary(row.peer),
      account: mapCrmAccountSummary(row.mtprotoAccount),
      lastMessage: preview
        ? { ...preview, text: preview.text?.slice(0, 240) ?? null }
        : null,
    };
  }

  private encodeCursor(value: InboxCursor) {
    return Buffer.from(
      JSON.stringify({
        version: 1,
        lastMessageAt: value.lastMessageAt?.toISOString() ?? null,
        id: value.id,
      }),
      'utf8',
    ).toString('base64url');
  }

  private decodeCursor(value: string): InboxCursor {
    try {
      const parsed = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      ) as {
        version?: unknown;
        lastMessageAt?: unknown;
        id?: unknown;
      };
      if (
        parsed.version !== 1 ||
        typeof parsed.id !== 'string' ||
        !parsed.id ||
        parsed.id.length > 128 ||
        (parsed.lastMessageAt !== null &&
          typeof parsed.lastMessageAt !== 'string')
      ) {
        throw new Error('Invalid cursor payload');
      }
      const lastMessageAt =
        parsed.lastMessageAt === null ? null : new Date(parsed.lastMessageAt);
      if (
        lastMessageAt &&
        (!Number.isFinite(lastMessageAt.getTime()) ||
          lastMessageAt.toISOString() !== parsed.lastMessageAt)
      ) {
        throw new Error('Invalid cursor date');
      }
      return { lastMessageAt, id: parsed.id };
    } catch {
      throw new BadRequestException('Invalid CRM inbox cursor');
    }
  }
}
