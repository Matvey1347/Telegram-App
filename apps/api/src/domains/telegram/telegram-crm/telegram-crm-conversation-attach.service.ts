import { Injectable, NotFoundException } from '@nestjs/common';
import { TelegramAdvertiserContactType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { AttachCrmConversationDto } from './telegram-crm.dto';
import { TelegramCrmAccountAccessService } from './telegram-crm-account-access.service';
import { TelegramCrmContactMergeService } from './telegram-crm-contact-merge.service';
import { TelegramCrmConversationService } from './telegram-crm-conversation.service';
import { TelegramCrmPeerService } from './telegram-crm-peer.service';
import { TelegramCrmRuntimeManager } from './telegram-crm-runtime-manager.service';

@Injectable()
export class TelegramCrmConversationAttachService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly accountAccess: TelegramCrmAccountAccessService,
    private readonly runtime: TelegramCrmRuntimeManager,
    private readonly peers: TelegramCrmPeerService,
    private readonly conversations: TelegramCrmConversationService,
    private readonly merges: TelegramCrmContactMergeService,
  ) {}

  async attach(
    userId: string,
    contactId: string,
    dto: AttachCrmConversationDto,
  ) {
    const access = await this.authorization.require(
      userId,
      'adSales.crm.editAny',
    );
    const contact = await this.prisma.telegramAdvertiser.findFirst({
      where: { id: contactId, workspaceId: access.workspaceId },
      select: { id: true, phone: true },
    });
    if (!contact) throw new NotFoundException('CRM Contact not found');
    await this.accountAccess.requireUsableSession(
      access.workspaceId,
      dto.accountId,
    );
    const resolved = await this.runtime.withAccountHandle(
      access.workspaceId,
      dto.accountId,
      'sync',
      (handle) => handle.resolvePrivatePeerReference(dto.reference),
    );
    const existing = await this.prisma.telegramCrmPeer.findUnique({
      where: {
        workspaceId_telegramUserId: {
          workspaceId: access.workspaceId,
          telegramUserId: resolved.telegramUserId,
        },
      },
      select: { contactId: true },
    });
    if (existing?.contactId && existing.contactId !== contactId) {
      await this.merges.merge(userId, contactId, existing.contactId);
    }
    const peer = await this.peers.upsert(userId, {
      telegramUserId: resolved.telegramUserId,
      username: resolved.username,
      firstName: resolved.firstName,
      lastName: resolved.lastName,
      photoUrl: resolved.photoUrl,
      contactId,
    });
    await this.ensureTelegramContact(
      access.workspaceId,
      contactId,
      resolved.username,
    );
    await this.linkUnassignedSalesByPhone(
      access.workspaceId,
      contact.id,
      contact.phone,
    );
    return this.conversations.create(userId, {
      telegramCrmPeerId: peer.id,
      contactId,
      accountId: dto.accountId,
      telegramDialogId: resolved.telegramUserId,
    });
  }

  /** A synced conversation is itself a contact channel. Keep the CRM record
   * idempotent and make it primary only when the contact has none yet. */
  private async ensureTelegramContact(
    workspaceId: string,
    advertiserId: string,
    username: string | null,
  ) {
    const value = username?.trim().replace(/^@+/, '');
    if (!value) return;
    const normalizedValue = value.toLowerCase();
    const existing = await this.prisma.telegramAdvertiserContact.findUnique({
      where: {
        workspaceId_type_normalizedValue: {
          workspaceId,
          type: TelegramAdvertiserContactType.TELEGRAM_USERNAME,
          normalizedValue,
        },
      },
      select: { id: true, isPrimary: true },
    });
    if (existing) {
      if (!existing.isPrimary) {
        await this.prisma.$transaction([
          this.prisma.telegramAdvertiserContact.updateMany({
            where: { workspaceId, advertiserId },
            data: { isPrimary: false },
          }),
          this.prisma.telegramAdvertiserContact.update({
            where: { id: existing.id },
            data: { isPrimary: true },
          }),
        ]);
      }
      return;
    }
    await this.prisma.telegramAdvertiserContact.updateMany({
      where: { workspaceId, advertiserId },
      data: { isPrimary: false },
    });
    await this.prisma.telegramAdvertiserContact.create({
      data: {
        workspaceId,
        advertiserId,
        type: TelegramAdvertiserContactType.TELEGRAM_USERNAME,
        value,
        normalizedValue,
        label: 'Telegram',
        isPrimary: true,
      },
    });
  }

  private async linkUnassignedSalesByPhone(
    workspaceId: string,
    advertiserId: string,
    phone: string | null,
  ) {
    const normalized = phone?.replace(/[^\d+]/g, '').trim();
    if (!normalized) return;
    // This is intentionally limited to unassigned historical sales. It cannot
    // steal a sale already attributed to another CRM client.
    await this.prisma.telegramAdSale.updateMany({
      where: {
        workspaceId,
        advertiserId: null,
        advertiserContact: { in: [...new Set([phone!, normalized])] },
      },
      data: { advertiserId },
    });
  }

  async attachFromAnyConnectedAccount(
    userId: string,
    contactId: string,
    reference: string,
  ) {
    const access = await this.authorization.require(
      userId,
      'adSales.crm.editAny',
    );
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: {
        workspaceId: access.workspaceId,
        isActive: true,
        status: 'connected',
        sessionEncrypted: { not: null },
        sessionIv: { not: null },
        sessionAuthTag: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException(
        'Connect an active MTProto account before syncing Telegram details',
      );
    }
    return this.attach(userId, contactId, {
      accountId: account.id,
      reference,
    });
  }
}
