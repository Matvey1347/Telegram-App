import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CrmConversation,
  CrmConversationListItem,
  CrmConversationsListResult,
} from '@telegram-system/shared';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmAccountAccessService } from './telegram-crm-account-access.service';
import {
  CreateCrmConversationDto,
  CrmConversationsQueryDto,
} from './telegram-crm.dto';
import { isPrismaUniqueConflict } from './telegram-crm-prisma-errors';
import {
  crmAccountSummarySelect,
  crmPeerSummarySelect,
  mapCrmAccountSummary,
  mapCrmPeerSummary,
} from './telegram-crm-read-model.mapper';

export const crmConversationSelect = {
  id: true,
  workspaceId: true,
  telegramCrmPeerId: true,
  contactId: true,
  mtprotoAccountId: true,
  telegramDialogId: true,
  state: true,
  historyCursorTelegramMessageId: true,
  historyExhausted: true,
  lastMessageAt: true,
  lastInboundAt: true,
  lastOutboundAt: true,
  unreadCount: true,
  readState: true,
  lastReadTelegramMessageId: true,
  lastReadInboxTelegramMessageId: true,
  lastReadOutboxTelegramMessageId: true,
  lastReadAt: true,
  incrementalSyncCheckpoint: true,
  recoveryCheckpoint: true,
  lastMeaningfulSyncAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TelegramCrmConversationSelect;

type ConversationRow = Prisma.TelegramCrmConversationGetPayload<{
  select: typeof crmConversationSelect;
}>;

const crmConversationListSelect = {
  ...crmConversationSelect,
  mtprotoAccount: { select: crmAccountSummarySelect },
  peer: { select: crmPeerSummarySelect },
} satisfies Prisma.TelegramCrmConversationSelect;

type ConversationListRow = Prisma.TelegramCrmConversationGetPayload<{
  select: typeof crmConversationListSelect;
}>;

export const mapCrmConversation = (row: ConversationRow): CrmConversation => ({
  ...row,
  lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
  lastInboundAt: row.lastInboundAt?.toISOString() ?? null,
  lastOutboundAt: row.lastOutboundAt?.toISOString() ?? null,
  lastReadAt: row.lastReadAt?.toISOString() ?? null,
  lastMeaningfulSyncAt: row.lastMeaningfulSyncAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const mapCrmConversationListItem = (
  row: ConversationListRow,
): CrmConversationListItem => ({
  ...mapCrmConversation(row),
  account: mapCrmAccountSummary(row.mtprotoAccount),
  peer: mapCrmPeerSummary(row.peer),
});

@Injectable()
export class TelegramCrmConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly accountAccess: TelegramCrmAccountAccessService,
  ) {}

  async create(userId: string, dto: CreateCrmConversationDto) {
    await this.authorization.require(userId, 'adSales.crm.view');
    const access = await this.authorization.context(userId);
    const peer = await this.prisma.telegramCrmPeer.findFirst({
      where: { id: dto.telegramCrmPeerId, workspaceId: access.workspaceId },
      select: { id: true, contactId: true, telegramUserId: true },
    });
    if (!peer) throw new BadRequestException('CRM peer is not in workspace');
    if (dto.contactId !== undefined && dto.contactId !== peer.contactId) {
      throw new BadRequestException(
        'Conversation Contact must match the CRM peer Contact',
      );
    }
    await this.requireWriteAccess(userId, access.workspaceId, peer.contactId);
    const accountId =
      dto.accountId ?? (await this.defaultSenderId(access.workspaceId));
    if (!accountId) {
      throw new BadRequestException('A default CRM sender account is required');
    }
    await this.accountAccess.requireUsableSender(access.workspaceId, accountId);

    try {
      const row = await this.prisma.telegramCrmConversation.create({
        data: {
          workspaceId: access.workspaceId,
          telegramCrmPeerId: peer.id,
          contactId: peer.contactId,
          mtprotoAccountId: accountId,
          telegramDialogId: peer.telegramUserId,
        },
        select: crmConversationListSelect,
      });
      return mapCrmConversationListItem(row);
    } catch (error) {
      if (!isPrismaUniqueConflict(error)) throw error;
      const existing = await this.prisma.telegramCrmConversation.findUnique({
        where: {
          workspaceId_telegramCrmPeerId_mtprotoAccountId: {
            workspaceId: access.workspaceId,
            telegramCrmPeerId: peer.id,
            mtprotoAccountId: accountId,
          },
        },
        select: crmConversationListSelect,
      });
      if (!existing) throw error;
      return mapCrmConversationListItem(existing);
    }
  }

  async list(
    userId: string,
    query: CrmConversationsQueryDto,
  ): Promise<CrmConversationsListResult> {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const ownership = await this.authorization.scope(
      userId,
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    const pagination = normalizePagination(query);
    const where: Prisma.TelegramCrmConversationWhereInput = {
      workspaceId: access.workspaceId,
      ...('assignedMemberId' in ownership
        ? { contact: { ownerMemberId: ownership.assignedMemberId } }
        : {}),
      ...(query.contactId ? { contactId: query.contactId } : {}),
      ...(query.accountId ? { mtprotoAccountId: query.accountId } : {}),
      ...(query.telegramCrmPeerId
        ? { telegramCrmPeerId: query.telegramCrmPeerId }
        : {}),
      ...(query.state ? { state: query.state } : {}),
    };
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.telegramCrmConversation.findMany({
        where,
        select: crmConversationListSelect,
        orderBy: [
          { lastMessageAt: { sort: 'desc', nulls: 'last' } },
          { id: 'desc' },
        ],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.telegramCrmConversation.count({ where }),
    ]);
    return createPaginatedResponse(
      rows.map(mapCrmConversationListItem),
      totalItems,
      pagination,
    );
  }

  async get(
    userId: string,
    conversationId: string,
  ): Promise<CrmConversationListItem> {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const ownership = await this.authorization.scope(
      userId,
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    const row = await this.prisma.telegramCrmConversation.findFirst({
      where: {
        id: conversationId,
        workspaceId: access.workspaceId,
        ...('assignedMemberId' in ownership
          ? { contact: { ownerMemberId: ownership.assignedMemberId } }
          : {}),
      },
      select: crmConversationListSelect,
    });
    if (!row) throw new NotFoundException('CRM Conversation not found');
    return mapCrmConversationListItem(row);
  }

  private async requireWriteAccess(
    userId: string,
    workspaceId: string,
    contactId: string | null,
  ) {
    if (!contactId) {
      await this.authorization.require(userId, 'adSales.crm.editAny');
      return;
    }
    const contact = await this.prisma.telegramAdvertiser.findFirst({
      where: { id: contactId, workspaceId },
      select: { ownerMemberId: true },
    });
    if (!contact)
      throw new BadRequestException('CRM Contact is not in workspace');
    await this.authorization.requireOwnOrAny(
      userId,
      { assignedMemberId: contact.ownerMemberId },
      'adSales.crm.editOwn',
      'adSales.crm.editAny',
    );
  }

  private async defaultSenderId(workspaceId: string) {
    const settings =
      await this.prisma.telegramAdCrmWorkspaceSettings.findUnique({
        where: { workspaceId },
        select: { defaultCrmSenderAccountId: true },
      });
    return settings?.defaultCrmSenderAccountId ?? null;
  }
}
