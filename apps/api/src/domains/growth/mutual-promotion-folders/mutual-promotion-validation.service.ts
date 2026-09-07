import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';
import type { MutualPromotionParticipantDto } from './dto';

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class MutualPromotionValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async lockFolder(tx: Prisma.TransactionClient, folderId: string) {
    await acquirePostgresTransactionLock(
      tx,
      `mutual-promotion-folder:${folderId}`,
    );
  }

  parseInterval(startsAtValue: string, endsAtValue: string) {
    const startsAt = new Date(startsAtValue);
    const endsAt = new Date(endsAtValue);
    if (
      !Number.isFinite(startsAt.getTime()) ||
      !Number.isFinite(endsAt.getTime())
    ) {
      throw new BadRequestException('Folder dates are invalid');
    }
    if (endsAt <= startsAt)
      throw new BadRequestException('Folder end must be after its start');
    return { startsAt, endsAt };
  }

  async lockInviteLinks(tx: Prisma.TransactionClient, inviteLinkIds: string[]) {
    for (const id of [...new Set(inviteLinkIds)].sort()) {
      await acquirePostgresTransactionLock(tx, id);
    }
  }

  async validateParticipants(
    tx: DbClient,
    input: {
      workspaceId: string;
      folderId?: string;
      startsAt: Date;
      endsAt: Date;
      participants: MutualPromotionParticipantDto[];
    },
  ) {
    const channelIds = input.participants.map((row) => row.telegramChannelId);
    const inviteIds = input.participants.map((row) => row.inviteLinkId);
    if (new Set(channelIds).size !== channelIds.length) {
      throw new BadRequestException(
        'A channel may participate only once per folder',
      );
    }
    if (new Set(inviteIds).size !== inviteIds.length) {
      throw new BadRequestException(
        'An invite link may be selected only once per folder',
      );
    }
    const links = await tx.telegramInviteLink.findMany({
      where: { id: { in: inviteIds }, workspaceId: input.workspaceId },
      select: {
        id: true,
        telegramChannelId: true,
        isRevoked: true,
        adCampaignId: true,
        snapshots: {
          where: { adCampaignId: { not: null } },
          take: 1,
          select: { id: true },
        },
      },
    });
    const linksById = new Map(links.map((link) => [link.id, link]));
    for (const participant of input.participants) {
      if (participant.role === 'PUBLISHER' && participant.expense) {
        throw new BadRequestException(
          'Expenses are allowed only for paid participants',
        );
      }
      const link = linksById.get(participant.inviteLinkId);
      if (!link || link.telegramChannelId !== participant.telegramChannelId) {
        throw new BadRequestException(
          'Each invite link must belong to its selected channel and workspace',
        );
      }
      if (link.isRevoked)
        throw new BadRequestException('Revoked invite links cannot be used');
      if (link.adCampaignId || link.snapshots.length) {
        throw new BadRequestException(
          'Invite links used by Ads, including history, cannot be used',
        );
      }
    }
    const channels = await tx.telegramChannel.count({
      where: {
        id: { in: channelIds },
        workspaceId: input.workspaceId,
        isActive: true,
        archivedAt: null,
        adminLinks: { some: {} },
      },
    });
    if (channels !== channelIds.length) {
      throw new BadRequestException(
        'One or more participant channels are unavailable',
      );
    }
    const assignments = await tx.mutualPromotionFolderParticipant.findMany({
      where: {
        inviteLinkId: { in: inviteIds },
        ...(input.folderId ? { folderId: { not: input.folderId } } : {}),
      },
      select: {
        inviteLinkId: true,
        inviteLinkMode: true,
        folder: {
          select: { id: true, status: true, startsAt: true, endsAt: true },
        },
      },
    });
    for (const participant of input.participants) {
      const existing = assignments.filter(
        (row) => row.inviteLinkId === participant.inviteLinkId,
      );
      if (
        existing.some((row) => row.inviteLinkMode === 'FOLDER_ONLY') ||
        (participant.inviteLinkMode === 'FOLDER_ONLY' && existing.length > 0)
      ) {
        throw new BadRequestException(
          'Folder-only invite link is already assigned',
        );
      }
      if (
        participant.inviteLinkMode === 'REUSABLE' &&
        existing.some(
          (row) =>
            row.folder.status !== 'CANCELLED' &&
            row.folder.startsAt < input.endsAt &&
            row.folder.endsAt > input.startsAt,
        )
      ) {
        throw new BadRequestException(
          'Reusable invite link overlaps another folder',
        );
      }
    }
  }

  async requireFolder(
    workspaceId: string,
    folderId: string,
    client: DbClient = this.prisma,
  ) {
    const folder = await client.mutualPromotionFolder.findFirst({
      where: { id: folderId, workspaceId },
    });
    if (!folder)
      throw new NotFoundException('Mutual-promotion folder not found');
    return folder;
  }

  requireDraft(status: string) {
    if (status !== 'DRAFT') {
      throw new BadRequestException(
        'Structural edits are allowed only while the folder is a draft',
      );
    }
  }
}
