import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  attributeInviteLinkCreator,
  buildInviteLinkAttributionMaps,
} from '@api/telegram/shared/invites/telegram-invite-link-attribution';

@Injectable()
export class TelegramInviteAttributionService {
  constructor(private readonly prisma: PrismaService) {}

  public async buildInviteAttributionMaps(workspaceId: string) {
    const [members, integrations] = await Promise.all([
      this.prisma.workspaceMember.findMany({
        where: { workspaceId },
        select: { id: true, telegramUsername: true },
      }),
      this.prisma.telegramUserAccountIntegration.findMany({
        where: { workspaceId },
        select: {
          telegramUserId: true,
          username: true,
          assignedMemberId: true,
        },
      }),
    ]);
    return buildInviteLinkAttributionMaps({ members, integrations });
  }

  async reattributeWorkspaceInviteLinks(workspaceId: string) {
    const maps = await this.buildInviteAttributionMaps(workspaceId);
    const links = await this.prisma.telegramInviteLink.findMany({
      where: { workspaceId },
      select: {
        id: true,
        creatorTelegramUserId: true,
        creatorUsername: true,
        creatorFirstName: true,
        creatorLastName: true,
        creatorPhotoUrl: true,
      },
    });
    await this.prisma.$transaction(
      links.map((link) => {
        const attribution = attributeInviteLinkCreator(
          {
            creatorTelegramUserId: link.creatorTelegramUserId,
            creatorUsername: link.creatorUsername,
            creatorFirstName: link.creatorFirstName,
            creatorLastName: link.creatorLastName,
            creatorPhotoUrl: link.creatorPhotoUrl,
          },
          maps,
        );
        return this.prisma.telegramInviteLink.update({
          where: { id: link.id },
          data: {
            creatorMemberId: attribution.creatorMemberId,
            creatorMatchSource: attribution.creatorMatchSource,
            creatorUsername: attribution.creatorUsername,
          },
        });
      }),
    );
  }
}
