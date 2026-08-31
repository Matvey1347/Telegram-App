import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TelegramCrmContactStage } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { CreateCrmContactDto, UpdateCrmContactDto } from './telegram-crm.dto';
import { crmContactSelect, mapCrmContact } from './telegram-crm-contact.mapper';

@Injectable()
export class TelegramCrmContactCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
  ) {}

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
        automatedMessagesEnabled: false,
        automatedMessagesEnabledAt: null,
        archivedAt:
          dto.stage === TelegramCrmContactStage.ARCHIVED ? new Date() : null,
      },
      select: crmContactSelect,
    });
    return mapCrmContact(row);
  }

  async update(userId: string, contactId: string, dto: UpdateCrmContactDto) {
    const existing = await this.requireWritableContact(userId, contactId);
    if (dto.automatedMessagesEnabled !== undefined) {
      await this.authorization.require(userId, 'adSales.crm.manageAutomation');
    }
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
              dto.stage === TelegramCrmContactStage.ARCHIVED
                ? (existing.archivedAt ?? new Date())
                : null,
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
      ...(dto.automatedMessagesEnabled === undefined
        ? {}
        : {
            automatedMessagesEnabled: dto.automatedMessagesEnabled,
            automatedMessagesEnabledAt: dto.automatedMessagesEnabled
              ? existing.automatedMessagesEnabled
                ? existing.automatedMessagesEnabledAt
                : new Date()
              : null,
          }),
    };
    if (!Object.keys(data).length) throw new BadRequestException('No changes');
    const row = await this.prisma.telegramAdvertiser.update({
      where: { id: existing.id },
      data,
      select: crmContactSelect,
    });
    return mapCrmContact(row);
  }

  archive(userId: string, contactId: string) {
    return this.setArchiveState(userId, contactId, true);
  }

  restore(userId: string, contactId: string) {
    return this.setArchiveState(userId, contactId, false);
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
          ? TelegramCrmContactStage.ARCHIVED
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
        automatedMessagesEnabled: true,
        automatedMessagesEnabledAt: true,
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
