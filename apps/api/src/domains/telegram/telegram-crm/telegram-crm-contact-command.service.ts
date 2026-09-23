import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, TelegramCrmContactStage } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import {
  CreateCrmContactDto,
  CreateCrmTagDto,
  SetCrmReplyAlertMuteDto,
  UpdateCrmContactDto,
  SetCrmContactTagsDto,
} from './telegram-crm.dto';
import { crmContactSelect, mapCrmContact } from './telegram-crm-contact.mapper';
import { TelegramCrmInternalNotificationProjector } from './telegram-crm-internal-notification-projector.service';
import { loadCrmReplySummaries } from './telegram-crm-reply-summary';
import { ResponseCacheService } from '../../../common/response-cache.service';
import { TelegramCrmRuntimeManager } from './telegram-crm-runtime-manager.service';
import {
  crmTagSelect,
  mapCrmTag,
  TELEGRAM_FOLDER_TAG_PREFIX,
  TelegramCrmSystemTagsService,
} from './telegram-crm-system-tags.service';

@Injectable()
export class TelegramCrmContactCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly notifications: TelegramCrmInternalNotificationProjector,
    @Optional() private readonly responseCache?: ResponseCacheService,
    @Optional() private readonly systemTags?: TelegramCrmSystemTagsService,
    @Optional() private readonly runtime?: TelegramCrmRuntimeManager,
  ) {}

  async createTag(userId: string, dto: CreateCrmTagDto) {
    const access = await this.writeContext(userId);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Tag name is required');
    const tag = await this.prisma.telegramAdvertiserTag.upsert({
      where: { workspaceId_name: { workspaceId: access.workspaceId, name } },
      create: {
        workspaceId: access.workspaceId,
        name,
        color: dto.color ?? null,
        position: 1000,
      },
      update: {},
      select: crmTagSelect,
    });
    this.responseCache?.clearWorkspacePath(
      access.workspaceId,
      '/telegram-crm/contacts',
    );
    return mapCrmTag(tag);
  }

  async setTags(userId: string, contactId: string, dto: SetCrmContactTagsDto) {
    const contact = await this.requireWritableContact(userId, contactId);
    const tagIds = [...new Set(dto.tagIds)];
    const tags = tagIds.length
      ? await this.prisma.telegramAdvertiserTag.findMany({
          where: {
            id: { in: tagIds },
            workspaceId: contact.workspaceId,
            OR: [
              { systemKey: null },
              { systemKey: { startsWith: 'WORKFLOW:' } },
              { systemKey: { startsWith: TELEGRAM_FOLDER_TAG_PREFIX } },
            ],
          },
          select: { id: true },
        })
      : [];
    if (tags.length !== tagIds.length) {
      throw new BadRequestException(
        'One or more tags are invalid or managed automatically',
      );
    }
    const currentFolderTags = await this.prisma.telegramAdvertiserTag.findMany({
      where: {
        workspaceId: contact.workspaceId,
        systemKey: { startsWith: TELEGRAM_FOLDER_TAG_PREFIX },
        advertisers: { some: { advertiserId: contact.id } },
      },
      select: crmTagSelect,
    });
    const requestedFolderTags = await this.prisma.telegramAdvertiserTag.findMany({
      where: {
        workspaceId: contact.workspaceId,
        id: { in: tagIds },
        systemKey: { startsWith: TELEGRAM_FOLDER_TAG_PREFIX },
      },
      select: crmTagSelect,
    });
    await this.syncTelegramFolderMemberships({
      workspaceId: contact.workspaceId,
      contactId: contact.id,
      current: currentFolderTags,
      requested: requestedFolderTags,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.telegramAdvertiserTagAssignment.deleteMany({
        where: {
          workspaceId: contact.workspaceId,
          advertiserId: contact.id,
          tag: {
            OR: [
              { systemKey: null },
              { systemKey: { startsWith: 'WORKFLOW:' } },
              { systemKey: { startsWith: TELEGRAM_FOLDER_TAG_PREFIX } },
            ],
          },
        },
      });
      if (tagIds.length) {
        await tx.telegramAdvertiserTagAssignment.createMany({
          data: tagIds.map((tagId) => ({
            workspaceId: contact.workspaceId,
            advertiserId: contact.id,
            tagId,
            assignedByUserId: userId,
          })),
          skipDuplicates: true,
        });
      }
    });
    const assigned = await this.prisma.telegramAdvertiserTag.findMany({
      where: {
        workspaceId: contact.workspaceId,
        advertisers: { some: { advertiserId: contact.id } },
      },
      orderBy: [{ position: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: crmTagSelect,
    });
    this.responseCache?.clearWorkspacePath(
      contact.workspaceId,
      '/telegram-crm/contacts',
    );
    return assigned.map((tag) => mapCrmTag(tag));
  }

  private async syncTelegramFolderMemberships(input: {
    workspaceId: string;
    contactId: string;
    current: Array<{ id: string; systemKey: string | null }>;
    requested: Array<{ id: string; systemKey: string | null }>;
  }) {
    if (!this.runtime) return;
    const current = new Set(input.current.map((tag) => tag.id));
    const requested = new Set(input.requested.map((tag) => tag.id));
    const changes = [...new Map([...input.current, ...input.requested].map((tag) => [tag.id, tag])).values()]
      .flatMap((tag) => {
        const parsed = this.telegramFolderKey(tag.systemKey);
        if (!parsed || current.has(tag.id) === requested.has(tag.id)) return [];
        return [{ ...parsed, included: requested.has(tag.id) }];
      });
    if (!changes.length) return;
    const conversations = await this.prisma.telegramCrmConversation.findMany({
      where: {
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        mtprotoAccountId: { in: [...new Set(changes.map((change) => change.accountId))] },
      },
      select: {
        mtprotoAccountId: true,
        telegramAccessHash: true,
        peer: { select: { telegramUserId: true } },
      },
    });
    for (const change of changes) {
      const conversation = conversations.find(
        (item) => item.mtprotoAccountId === change.accountId,
      );
      if (!conversation?.telegramAccessHash) {
        // The same CRM tag can classify an Instagram lead or a contact owned
        // by another Telegram account. Keep that local classification; there
        // is simply no Telegram dialog to move for this account.
        continue;
      }
      const telegramAccessHash = conversation.telegramAccessHash;
      await this.runtime.withAccountHandle(
        input.workspaceId,
        change.accountId,
        'sync',
        (handle) =>
          handle.setDialogFolderMembership({
            folderId: change.folderId,
            telegramUserId: conversation.peer.telegramUserId,
            telegramAccessHash,
            included: change.included,
          }),
      );
    }
  }

  private telegramFolderKey(systemKey: string | null) {
    const match = systemKey?.match(/^TELEGRAM_FOLDER:([^:]+):(\d+)$/);
    return match
      ? { accountId: match[1], folderId: Number(match[2]) }
      : null;
  }

  async create(userId: string, dto: CreateCrmContactDto) {
    const access = await this.writeContext(userId);
    const ownerMemberId = await this.resolveCreateOwner(
      userId,
      access.workspaceId,
      access.memberId,
      dto.ownerMemberId,
    );
    const row = await this.prisma.telegramAdvertiser.create({
      data: {
        workspaceId: access.workspaceId,
        displayName: this.requiredText(dto.displayName, 'Display name'),
        companyName: dto.companyName ?? null,
        telegramUsername: this.username(dto.telegramUsername),
        phone: dto.phone ?? null,
        email: dto.email?.toLowerCase() ?? null,
        website: dto.website ?? null,
        description: dto.description ?? null,
        source: dto.source ?? null,
        stage: dto.stage ?? TelegramCrmContactStage.NEW,
        ownerMemberId,
        createdByUserId: userId,
        nextContactAt: dto.nextContactAt ? new Date(dto.nextContactAt) : null,
        archivedAt:
          null,
      },
      select: crmContactSelect,
    });
    return mapCrmContact(row);
  }

  async update(userId: string, contactId: string, dto: UpdateCrmContactDto) {
    const existing = await this.requireWritableContact(userId, contactId);
    if (dto.ownerMemberId !== undefined) {
      await this.requireOwnerInWorkspace(
        existing.workspaceId,
        dto.ownerMemberId,
      );
      if (
        !(await this.authorization.can(userId, 'adSales.crm.editAny')) &&
        dto.ownerMemberId !== existing.ownerMemberId
      ) {
        throw new ForbiddenException(
          'Changing Contact ownership requires edit-all permission',
        );
      }
    }
    const data: Prisma.TelegramAdvertiserUpdateInput = {
      ...(dto.displayName === undefined
        ? {}
        : { displayName: this.requiredText(dto.displayName, 'Display name') }),
      ...(dto.companyName === undefined
        ? {}
        : { companyName: dto.companyName }),
      ...(dto.telegramUsername === undefined
        ? {}
        : { telegramUsername: this.username(dto.telegramUsername) }),
      ...(dto.phone === undefined ? {} : { phone: dto.phone }),
      ...(dto.email === undefined
        ? {}
        : { email: dto.email?.toLowerCase() ?? null }),
      ...(dto.website === undefined ? {} : { website: dto.website }),
      ...(dto.description === undefined
        ? {}
        : { description: dto.description }),
      ...(dto.source === undefined ? {} : { source: dto.source }),
      ...(dto.stage === undefined
        ? {}
        : {
            stage: dto.stage,
            archivedAt:
              null,
          }),
      ...(dto.ownerMemberId === undefined
        ? {}
        : {
            ownerMember: {
              connect: dto.ownerMemberId
                ? { id: dto.ownerMemberId }
                : undefined,
              disconnect: dto.ownerMemberId === null,
            },
          }),
      ...(dto.nextContactAt === undefined
        ? {}
        : {
            nextContactAt: dto.nextContactAt
              ? new Date(dto.nextContactAt)
              : null,
          }),
    };
    if (!Object.keys(data).length) throw new BadRequestException('No changes');
    const update = (tx: Prisma.TransactionClient) =>
      tx.telegramAdvertiser.update({
        where: { id: existing.id },
        data,
        select: crmContactSelect,
      });
    const ownerChanged =
      dto.ownerMemberId !== undefined &&
      dto.ownerMemberId !== existing.ownerMemberId;
    let invalidatedMemberIds: string[] = [];
    const row = ownerChanged
      ? await this.prisma.$transaction(async (tx) => {
          const updated = await update(tx);
          invalidatedMemberIds =
            await this.notifications.contactVisibilityChanged(
              tx,
              existing.workspaceId,
              existing.id,
            );
          return updated;
        })
      : await update(this.prisma);
    if (invalidatedMemberIds.length) {
      this.notifications.invalidateVisibility(
        existing.workspaceId,
        invalidatedMemberIds,
      );
    }
    return mapCrmContact(row);
  }

  archive(userId: string, contactId: string) {
    return this.setArchiveState(userId, contactId, true);
  }

  restore(userId: string, contactId: string) {
    return this.setArchiveState(userId, contactId, false);
  }

  async setReplyAlertMuted(
    userId: string,
    contactId: string,
    dto: SetCrmReplyAlertMuteDto,
  ) {
    const existing = await this.requireWritableContact(userId, contactId);
    const contact = await this.prisma.telegramAdvertiser.update({
      where: { id: existing.id },
      data: { replyAlertMutedAt: dto.muted ? new Date() : null },
      select: { id: true, replyAlertMutedAt: true },
    });
    const summaries = await loadCrmReplySummaries(
      this.prisma,
      existing.workspaceId,
      [contact],
    );
    this.responseCache?.clearWorkspacePath(
      existing.workspaceId,
      '/telegram-crm/contacts',
    );
    return {
      replySummary: summaries.get(contact.id) ?? {
        hasTelegramConversation: false,
        status: 'NONE' as const,
        inboundMessageCount: 0,
        outboundMessageCount: 0,
        countsComplete: false,
        unreadCount: 0,
        muted: false,
      },
    };
  }

  private async setArchiveState(
    userId: string,
    contactId: string,
    archived: boolean,
  ) {
    const existing = await this.requireWritableContact(userId, contactId);
    const row = await this.prisma.telegramAdvertiser.update({
      where: { id: existing.id },
      data: {
        stage: archived
          ? TelegramCrmContactStage.ANOTHER
          : TelegramCrmContactStage.LEAD,
        archivedAt: archived ? (existing.archivedAt ?? new Date()) : null,
      },
      select: crmContactSelect,
    });
    return mapCrmContact(row);
  }

  private async writeContext(userId: string) {
    await this.authorization.require(userId, 'adSales.crm.view');
    const access = await this.authorization.context(userId);
    if (
      !(await this.authorization.can(userId, 'adSales.crm.editOwn')) &&
      !(await this.authorization.can(userId, 'adSales.crm.editAny'))
    ) {
      throw new ForbiddenException('Insufficient CRM edit permission');
    }
    return access;
  }

  private async requireWritableContact(userId: string, contactId: string) {
    const access = await this.writeContext(userId);
    const row = await this.prisma.telegramAdvertiser.findFirst({
      where: { id: contactId, workspaceId: access.workspaceId },
      select: {
        id: true,
        workspaceId: true,
        ownerMemberId: true,
        archivedAt: true,
      },
    });
    if (!row) throw new NotFoundException('CRM Contact not found');
    await this.authorization.requireOwnOrAny(
      userId,
      { assignedMemberId: row.ownerMemberId },
      'adSales.crm.editOwn',
      'adSales.crm.editAny',
    );
    return row;
  }

  private async resolveCreateOwner(
    userId: string,
    workspaceId: string,
    memberId: string,
    requested: string | null | undefined,
  ) {
    const canEditAny = await this.authorization.can(
      userId,
      'adSales.crm.editAny',
    );
    if (!canEditAny) {
      if (requested && requested !== memberId) {
        throw new ForbiddenException(
          'Creating a Contact for another owner requires edit-all permission',
        );
      }
      return memberId;
    }
    await this.requireOwnerInWorkspace(workspaceId, requested);
    return requested ?? null;
  }

  private async requireOwnerInWorkspace(
    workspaceId: string,
    ownerMemberId: string | null | undefined,
  ) {
    if (!ownerMemberId) return;
    const owner = await this.prisma.workspaceMember.findFirst({
      where: { id: ownerMemberId, workspaceId },
      select: { id: true },
    });
    if (!owner)
      throw new BadRequestException('Contact owner is not in workspace');
  }

  private requiredText(value: string, label: string) {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException(`${label} is required`);
    return normalized;
  }

  private username(value: string | null | undefined) {
    return value?.trim().replace(/^@+/, '').toLowerCase() || null;
  }
}
