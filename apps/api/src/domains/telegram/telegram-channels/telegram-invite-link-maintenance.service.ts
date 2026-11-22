import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramInviteLinkRegistrationService } from './telegram-invite-link-registration.service';

type LinkSlot = {
  field:
    | 'publicInviteLinkId'
    | 'defaultInviteLinkId'
    | 'botInviteLinkId'
    | 'broadcastInviteLinkId'
    | 'audienceTransferInviteLinkId';
  title: string;
  requestNeeded: boolean;
};

const slots: LinkSlot[] = [
  { field: 'publicInviteLinkId', title: 'Public', requestNeeded: false },
  { field: 'defaultInviteLinkId', title: 'Main', requestNeeded: true },
  { field: 'botInviteLinkId', title: 'Bot', requestNeeded: true },
  { field: 'broadcastInviteLinkId', title: 'Newsletter', requestNeeded: true },
  {
    field: 'audienceTransferInviteLinkId',
    title: 'Transfer',
    requestNeeded: true,
  },
];

@Injectable()
export class TelegramInviteLinkMaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly access: TelegramChannelAccessService,
    private readonly mtproto: TelegramMtprotoClient,
    private readonly registration: TelegramInviteLinkRegistrationService,
  ) {}

  async refreshInactive(
    userId: string,
    channelId: string,
    mtprotoAccountId: string,
  ) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      select: {
        id: true,
        title: true,
        username: true,
        telegramChatId: true,
        telegramAccessHash: true,
        inviteLink: true,
        publicInviteLinkId: true,
        defaultInviteLinkId: true,
        botInviteLinkId: true,
        broadcastInviteLinkId: true,
        audienceTransferInviteLinkId: true,
        folderDefaultInviteLinkIds: true,
        mutualPromotionInviteLinkIds: true,
        inviteLinks: { select: { id: true, name: true, url: true } },
      },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    if (!mtprotoAccountId.trim())
      throw new BadRequestException('Select a connected MTProto account.');

    const account = await this.access.connectedAccount(
      workspaceId,
      channelId,
      mtprotoAccountId,
    );
    const credentials = this.access.accountCredentials(account);
    const peer = this.access.mtprotoChannelReference(channel);
    const linksById = new Map(
      channel.inviteLinks.map((link) => [link.id, link]),
    );
    const results: Array<{
      oldLinkId: string;
      newLinkId?: string;
      status: 'active' | 'replaced' | 'unavailable';
    }> = [];
    const replacements = new Map<string, string>();
    const verified = new Map<string, boolean | null>();

    const replaceIfInactive = async (
      oldId: string,
      title: string,
      requestNeeded: boolean,
    ) => {
      const oldLink = linksById.get(oldId);
      if (!oldLink) {
        results.push({ oldLinkId: oldId, status: 'unavailable' });
        return oldId;
      }
      let active = verified.get(oldId);
      if (active === undefined) {
        try {
          const remote = await this.mtproto.getChannelInviteLink({
            ...credentials,
            channel: peer,
            inviteLink: oldLink.url,
          });
          active =
            !remote.revoked &&
            (!remote.expireDate || remote.expireDate.getTime() > Date.now());
        } catch {
          active = null;
        }
        verified.set(oldId, active);
      }
      if (active === true) {
        results.push({ oldLinkId: oldId, status: 'active' });
        return oldId;
      }
      if (active === null) {
        results.push({ oldLinkId: oldId, status: 'unavailable' });
        return oldId;
      }
      const key = `${oldId}:${requestNeeded}`;
      const knownReplacement = replacements.get(key);
      if (knownReplacement) return knownReplacement;
      const replacement = await this.registration.create(userId, channelId, {
        mtprotoAccountId,
        title: `${channel.title.slice(0, 19)} ${title}`.slice(0, 32),
        requestNeeded,
      });
      replacements.set(key, replacement.id);
      results.push({
        oldLinkId: oldId,
        newLinkId: replacement.id,
        status: 'replaced',
      });
      return replacement.id;
    };

    const updated: Record<string, unknown> = {};
    for (const slot of slots) {
      const oldId = channel[slot.field];
      if (oldId) {
        const nextId = await replaceIfInactive(
          oldId,
          slot.title,
          slot.requestNeeded,
        );
        if (nextId !== oldId) updated[slot.field] = nextId;
      }
    }
    const replaceMany = async (ids: string[], title: string) => {
      const next: string[] = [];
      for (const id of ids) next.push(await replaceIfInactive(id, title, true));
      return next;
    };
    if (channel.folderDefaultInviteLinkIds.length) {
      const next = await replaceMany(
        channel.folderDefaultInviteLinkIds,
        'Folders',
      );
      if (
        next.some(
          (id, index) => id !== channel.folderDefaultInviteLinkIds[index],
        )
      )
        updated.folderDefaultInviteLinkIds = next;
    }
    if (channel.mutualPromotionInviteLinkIds.length) {
      const next = await replaceMany(
        channel.mutualPromotionInviteLinkIds,
        'VP',
      );
      if (
        next.some(
          (id, index) => id !== channel.mutualPromotionInviteLinkIds[index],
        )
      )
        updated.mutualPromotionInviteLinkIds = next;
    }

    if (Object.keys(updated).length)
      await this.prisma.telegramChannel.update({
        where: { id: channelId },
        data: updated,
      });

    return {
      channelId,
      checkedLinks: results.length,
      replacedLinks: results.filter((item) => item.status === 'replaced')
        .length,
      unavailableLinks: results.filter((item) => item.status === 'unavailable')
        .length,
      assignments: updated,
      results,
    };
  }
}
