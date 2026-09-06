import { Injectable, NotFoundException } from '@nestjs/common';
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
      select: { id: true },
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
    return this.conversations.create(userId, {
      telegramCrmPeerId: peer.id,
      contactId,
      accountId: dto.accountId,
      telegramDialogId: resolved.telegramUserId,
    });
  }
}
