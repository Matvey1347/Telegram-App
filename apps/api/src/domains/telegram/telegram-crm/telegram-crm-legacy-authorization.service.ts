import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';

export type TelegramCrmLegacyOwnershipScope = {
  workspaceId: string;
  ownerMemberId?: string;
};

@Injectable()
export class TelegramCrmLegacyAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
  ) {}

  readScope(userId: string) {
    return this.scope(userId, 'viewOwn', 'viewAny');
  }

  editScope(userId: string) {
    return this.scope(userId, 'editOwn', 'editAny');
  }

  requireReadContact(userId: string, contactId: string) {
    return this.requireContact(userId, contactId, 'viewOwn', 'viewAny');
  }

  requireEditContact(userId: string, contactId: string) {
    return this.requireContact(userId, contactId, 'editOwn', 'editAny');
  }

  async requireContactDetail(
    userId: string,
    contactId: string,
    detailId: string,
  ) {
    const workspaceId = await this.requireEditContact(userId, contactId);
    const detail = await this.prisma.telegramAdvertiserContact.findFirst({
      where: { id: detailId, workspaceId, advertiserId: contactId },
      select: { id: true },
    });
    if (!detail) {
      throw new NotFoundException('Telegram advertiser contact not found');
    }
    return workspaceId;
  }

  async createContactContext(
    userId: string,
    requestedOwnerMemberId: string | null | undefined,
  ) {
    const scope = await this.editScope(userId);
    if (scope.ownerMemberId) {
      if (
        requestedOwnerMemberId &&
        requestedOwnerMemberId !== scope.ownerMemberId
      ) {
        throw new ForbiddenException(
          'Creating a Contact for another owner requires edit-all permission',
        );
      }
      return { ...scope, resolvedOwnerMemberId: scope.ownerMemberId };
    }
    await this.requireMemberInWorkspace(
      scope.workspaceId,
      requestedOwnerMemberId,
    );
    return {
      ...scope,
      resolvedOwnerMemberId: requestedOwnerMemberId ?? null,
    };
  }

  async requireOwnerChange(
    userId: string,
    contactId: string,
    requestedOwnerMemberId: string | null,
  ) {
    const context = await this.contactContext(
      userId,
      contactId,
      'editOwn',
      'editAny',
    );
    await this.requireMemberInWorkspace(
      context.workspaceId,
      requestedOwnerMemberId,
    );
    if (
      context.ownerMemberId &&
      requestedOwnerMemberId !== context.contactOwnerMemberId
    ) {
      throw new ForbiddenException(
        'Changing Contact ownership requires edit-all permission',
      );
    }
    return context.workspaceId;
  }

  async requireEditTask(userId: string, taskId: string) {
    const scope = await this.editScope(userId);
    const task = await this.prisma.telegramAdvertiserTask.findFirst({
      where: {
        id: taskId,
        workspaceId: scope.workspaceId,
        ...(scope.ownerMemberId
          ? { advertiser: { ownerMemberId: scope.ownerMemberId } }
          : {}),
      },
    });
    if (!task)
      throw new NotFoundException('Telegram advertiser task not found');
    return task;
  }

  private async scope(
    userId: string,
    ownCapability: 'viewOwn' | 'editOwn',
    anyCapability: 'viewAny' | 'editAny',
  ): Promise<TelegramCrmLegacyOwnershipScope> {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const ownership = await this.authorization.scope(
      userId,
      `adSales.crm.${ownCapability}`,
      `adSales.crm.${anyCapability}`,
    );
    return {
      workspaceId: access.workspaceId,
      ...('assignedMemberId' in ownership
        ? { ownerMemberId: ownership.assignedMemberId }
        : {}),
    };
  }

  private async requireContact(
    userId: string,
    contactId: string,
    ownCapability: 'viewOwn' | 'editOwn',
    anyCapability: 'viewAny' | 'editAny',
  ) {
    return (
      await this.contactContext(userId, contactId, ownCapability, anyCapability)
    ).workspaceId;
  }

  private async contactContext(
    userId: string,
    contactId: string,
    ownCapability: 'viewOwn' | 'editOwn',
    anyCapability: 'viewAny' | 'editAny',
  ) {
    const scope = await this.scope(userId, ownCapability, anyCapability);
    const contact = await this.prisma.telegramAdvertiser.findFirst({
      where: { id: contactId, workspaceId: scope.workspaceId },
      select: { ownerMemberId: true },
    });
    if (!contact) throw new NotFoundException('CRM Contact not found');
    if (scope.ownerMemberId && contact.ownerMemberId !== scope.ownerMemberId) {
      throw new ForbiddenException('Insufficient CRM ownership permission');
    }
    return {
      ...scope,
      contactOwnerMemberId: contact.ownerMemberId,
    };
  }

  private async requireMemberInWorkspace(
    workspaceId: string,
    memberId: string | null | undefined,
  ) {
    if (!memberId) return;
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
      select: { id: true },
    });
    if (!member)
      throw new BadRequestException('Contact owner is not in workspace');
  }
}
