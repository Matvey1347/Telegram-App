import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';

@Injectable()
export class MutualPromotionBoundaryService {
  constructor(private readonly prisma: PrismaService) {}

  async captureStart(folderId: string, capturedAt: Date) {
    await this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(
        tx,
        `mutual-promotion-folder:${folderId}`,
      );
      await tx.$executeRaw(Prisma.sql`
        UPDATE "MutualPromotionFolderParticipant" participant
        SET "subscribersAtStart" = channel."currentSubscribersCount",
            "inviteJoinedAtStart" = COALESCE(participant."inviteJoinedAtStart",
              CASE WHEN invite."joinedObserved" IS TRUE OR
                (invite."joinedObserved" IS NULL AND invite."lastSyncedAt" IS NOT NULL)
              THEN invite."joinedCount" END),
            "inviteRequestedAtStart" = COALESCE(participant."inviteRequestedAtStart",
              CASE WHEN invite."requestedObserved" IS TRUE OR
                (invite."requestedObserved" IS NULL AND invite."lastSyncedAt" IS NOT NULL)
              THEN invite."requestedCount" END),
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
          { inviteRequestedAtStart: null },
        ],
      },
    });
    if (missing) throw new Error('Participant start boundaries are not ready');
  }

  async captureFinal(folderId: string, capturedAt: Date) {
    await this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(
        tx,
        `mutual-promotion-folder:${folderId}`,
      );
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
            "inviteJoinedAtEnd" = COALESCE(participant."inviteJoinedAtEnd",
              CASE WHEN invite."joinedObserved" IS TRUE OR
                (invite."joinedObserved" IS NULL AND invite."lastSyncedAt" IS NOT NULL)
              THEN invite."joinedCount" END),
            "inviteRequestedAtEnd" = COALESCE(participant."inviteRequestedAtEnd",
              CASE WHEN invite."requestedObserved" IS TRUE OR
                (invite."requestedObserved" IS NULL AND invite."lastSyncedAt" IS NOT NULL)
              THEN invite."requestedCount" END),
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
