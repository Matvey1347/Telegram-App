import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  MutualPromotionParticipantDto,
  UpdateMutualPromotionInviteLinksDto,
} from './dto';
import { MutualPromotionReadService } from './mutual-promotion-read.service';
import { MutualPromotionValidationService } from './mutual-promotion-validation.service';

@Injectable()
export class MutualPromotionInviteLinkEditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly validation: MutualPromotionValidationService,
    private readonly read: MutualPromotionReadService,
  ) {}

  async update(
    userId: string,
    folderId: string,
    dto: UpdateMutualPromotionInviteLinksDto,
  ) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.prisma.$transaction(async (tx) => {
      await this.validation.lockFolder(tx, folderId);
      const folder = await this.validation.requireFolder(
        workspaceId,
        folderId,
        tx,
      );
      if (!['SCHEDULED', 'ACTIVE'].includes(folder.status)) {
        throw new BadRequestException(
          'Invite links can be replaced only in scheduled or active folders',
        );
      }
      const participants = await tx.mutualPromotionFolderParticipant.findMany({
        where: { folderId, workspaceId },
        select: {
          id: true,
          telegramChannelId: true,
          inviteLinkId: true,
          role: true,
        },
      });
      const edits = new Map(
        dto.participants.map((item) => [item.participantId, item]),
      );
      if (
        edits.size !== dto.participants.length ||
        edits.size !== participants.length ||
        participants.some((participant) => !edits.has(participant.id))
      ) {
        throw new BadRequestException(
          'Provide one invite-link selection for every folder participant',
        );
      }
      const validationParticipants: MutualPromotionParticipantDto[] =
        participants.map((participant) => {
          const edit = edits.get(participant.id)!;
          return {
            telegramChannelId: participant.telegramChannelId,
            role: participant.role,
            inviteLinkId: edit.inviteLinkId,
            inviteLinkMode: edit.inviteLinkMode,
          };
        });
      await this.validation.lockInviteLinks(
        tx,
        validationParticipants.map((item) => item.inviteLinkId),
      );
      await this.validation.validateParticipants(tx, {
        workspaceId,
        folderId,
        startsAt: folder.startsAt,
        endsAt: folder.endsAt,
        participants: validationParticipants,
      });
      const changed = participants.filter(
        (participant) =>
          edits.get(participant.id)!.inviteLinkId !== participant.inviteLinkId,
      );
      const activeBoundaries =
        folder.status === 'ACTIVE'
          ? await this.activeBoundaries(tx, workspaceId, changed, edits)
          : new Map<string, { subscribers: number; joined: number }>();
      const changedAt = new Date();
      for (const participant of participants) {
        const edit = edits.get(participant.id)!;
        const linkChanged = edit.inviteLinkId !== participant.inviteLinkId;
        const boundary = activeBoundaries.get(participant.id);
        await tx.mutualPromotionFolderParticipant.update({
          where: { id: participant.id },
          data: {
            inviteLinkId: edit.inviteLinkId,
            inviteLinkMode: edit.inviteLinkMode,
            ...(linkChanged
              ? {
                  subscribersAtStart: boundary?.subscribers ?? null,
                  inviteJoinedAtStart: boundary?.joined ?? null,
                  baselineCapturedAt: boundary ? changedAt : null,
                  subscribersAtEnd: null,
                  inviteJoinedAtEnd: null,
                  finalCapturedAt: null,
                }
              : {}),
          },
        });
      }
    });
    return this.read.detailForWorkspace(workspaceId, folderId);
  }

  private async activeBoundaries(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    participants: Array<{
      id: string;
      telegramChannelId: string;
    }>,
    edits: Map<string, { inviteLinkId: string }>,
  ) {
    const channelIds = participants.map((item) => item.telegramChannelId);
    const inviteLinkIds = participants.map(
      (item) => edits.get(item.id)!.inviteLinkId,
    );
    const [channels, links] = await Promise.all([
      tx.telegramChannel.findMany({
        where: { workspaceId, id: { in: channelIds } },
        select: { id: true, currentSubscribersCount: true },
      }),
      tx.telegramInviteLink.findMany({
        where: { workspaceId, id: { in: inviteLinkIds } },
        select: { id: true, joinedCount: true },
      }),
    ]);
    const subscribers = new Map(
      channels.map((channel) => [channel.id, channel.currentSubscribersCount]),
    );
    const joined = new Map(links.map((link) => [link.id, link.joinedCount]));
    const boundaries = new Map<
      string,
      { subscribers: number; joined: number }
    >();
    for (const participant of participants) {
      const subscriberCount = subscribers.get(participant.telegramChannelId);
      const joinedCount = joined.get(edits.get(participant.id)!.inviteLinkId);
      if (subscriberCount == null || joinedCount == null) {
        throw new BadRequestException(
          'Current channel and invite-link counters are required before replacing an active link',
        );
      }
      boundaries.set(participant.id, {
        subscribers: subscriberCount,
        joined: joinedCount,
      });
    }
    return boundaries;
  }
}
