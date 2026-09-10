import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type { ImportMutualPromotionInviteLinkDto } from './dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramInviteLinkRegistrationService } from '../../telegram/telegram-channels/telegram-invite-link-registration.service';
import { MutualPromotionReadService } from './mutual-promotion-read.service';

@Injectable()
export class MutualPromotionInviteLinkImportService {
  constructor(
    private readonly registration: TelegramInviteLinkRegistrationService,
    private readonly read: MutualPromotionReadService,
    private readonly prisma: PrismaService,
  ) {}

  async import(userId: string, dto: ImportMutualPromotionInviteLinkDto) {
    const from = dto.startsAt ? new Date(dto.startsAt) : null;
    const until = dto.endsAt
      ? new Date(Math.min(new Date(dto.endsAt).getTime(), Date.now()))
      : new Date();
    const registered = await this.registration.register(
      userId,
      dto.telegramChannelId,
      dto.url,
      from && from < until ? { from, until } : undefined,
    );
    if (
      dto.folderId &&
      from &&
      typeof registered.joinedWithinPeriod === 'number'
    ) {
      const joinedAtStart = Math.max(
        0,
        registered.currentJoinedCount - registered.joinedWithinPeriod,
      );
      await this.prisma.mutualPromotionFolderParticipant.updateMany({
        where: {
          workspaceId: registered.workspaceId,
          folderId: dto.folderId,
          telegramChannelId: dto.telegramChannelId,
          inviteLinkId: registered.id,
        },
        data: {
          inviteJoinedAtStart: joinedAtStart,
          baselineCapturedAt: from,
          inviteJoinedAtEnd:
            dto.endsAt && new Date(dto.endsAt) <= new Date()
              ? joinedAtStart + registered.joinedWithinPeriod
              : null,
        },
      });
    }
    const options = await this.read.inviteLinkOptions(userId, {
      channelIds: [dto.telegramChannelId],
      folderId: dto.folderId,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
    });
    const option = options.find((item) => item.id === registered.id);
    if (!option) {
      throw new InternalServerErrorException(
        'The verified invite link was saved but could not be loaded.',
      );
    }
    return option;
  }
}
