import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class MutualPromotionBoundaryService {
  constructor(private readonly prisma: PrismaService) {}

  async captureStart(folderId: string, capturedAt: Date) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "MutualPromotionFolderParticipant" participant
        SET "subscribersAtStart" = channel."currentSubscribersCount",
            "inviteJoinedAtStart" = invite."joinedCount",
            "baselineCapturedAt" = ${capturedAt},
            "updatedAt" = ${capturedAt}
        FROM "TelegramChannel" channel, "TelegramInviteLink" invite
        WHERE participant."folderId" = ${folderId}
          AND participant."baselineCapturedAt" IS NULL
          AND channel."currentSubscribersCount" IS NOT NULL
          AND channel."id" = participant."telegramChannelId"
          AND invite."id" = participant."inviteLinkId"
      `);
      await tx.mutualPromotionFolder.updateMany({
        where: { id: folderId, status: 'SCHEDULED' },
        data: { status: 'ACTIVE' },
      });
    });
    const missing = await this.prisma.mutualPromotionFolderParticipant.count({
      where: {
        folderId,
        OR: [
          { baselineCapturedAt: null },
          { subscribersAtStart: null },
          { inviteJoinedAtStart: null },
        ],
      },
    });
    if (missing) throw new Error('Participant start boundaries are not ready');
  }

  async captureFinal(folderId: string, capturedAt: Date) {
    await this.prisma.$transaction(async (tx) => {
      await tx.mutualPromotionFolder.updateMany({
        where: {
          id: folderId,
          status: { notIn: ['CANCELLED', 'COMPLETED'] },
        },
        data: { status: 'DELETING' },
      });
      await tx.$executeRaw(Prisma.sql`
        UPDATE "MutualPromotionFolderParticipant" participant
        SET "subscribersAtEnd" = channel."currentSubscribersCount",
            "inviteJoinedAtEnd" = invite."joinedCount",
            "finalCapturedAt" = ${capturedAt},
            "updatedAt" = ${capturedAt}
        FROM "TelegramChannel" channel, "TelegramInviteLink" invite
        WHERE participant."folderId" = ${folderId}
          AND participant."finalCapturedAt" IS NULL
          AND channel."id" = participant."telegramChannelId"
          AND invite."id" = participant."inviteLinkId"
      `);
    });
  }
}
