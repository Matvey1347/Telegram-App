import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class TelegramInviteSnapshotStore {
  constructor(private readonly prisma: PrismaService) {}
  private readonly logger = new Logger('TelegramChannelsService');

  private telegramInviteLinkSnapshotStorageState:
    | 'unknown'
    | 'available'
    | 'missing' = 'unknown';

  private ensureTelegramInviteLinkSnapshotStoragePromise: Promise<boolean> | null =
    null;

  public isInviteLinkSnapshotStorageMissing(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2021') return true;
    if (error.code !== 'P2010') return false;

    const originalCode =
      (
        error.meta as
          | {
              driverAdapterError?: {
                cause?: { originalCode?: string };
              };
            }
          | undefined
      )?.driverAdapterError?.cause?.originalCode ?? null;

    return originalCode === '42P01';
  }

  public async ensureTelegramInviteLinkSnapshotStorageAvailable() {
    if (this.telegramInviteLinkSnapshotStorageState === 'available') {
      return true;
    }
    if (this.ensureTelegramInviteLinkSnapshotStoragePromise) {
      return this.ensureTelegramInviteLinkSnapshotStoragePromise;
    }
    this.ensureTelegramInviteLinkSnapshotStoragePromise = (async () => {
      if (typeof this.prisma.$executeRawUnsafe !== 'function') {
        return false;
      }
      await this.prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "TelegramInviteLinkSnapshot" (
            "id" TEXT NOT NULL,
            "workspaceId" TEXT NOT NULL,
            "telegramChannelId" TEXT NOT NULL,
            "inviteLinkId" TEXT NOT NULL,
            "adCampaignId" TEXT,
            "syncedAt" TIMESTAMP(3) NOT NULL,
            "joinedCount" INTEGER NOT NULL DEFAULT 0,
            "requestedCount" INTEGER NOT NULL DEFAULT 0,
            "isRevoked" BOOLEAN NOT NULL DEFAULT false,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "TelegramInviteLinkSnapshot_pkey" PRIMARY KEY ("id")
          )
        `);
      await this.prisma.$executeRawUnsafe(`
          CREATE UNIQUE INDEX IF NOT EXISTS "TelegramInviteLinkSnapshot_inviteLinkId_syncedAt_key"
          ON "TelegramInviteLinkSnapshot"("inviteLinkId", "syncedAt")
        `);
      await this.prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS "TelegramInviteLinkSnapshot_workspaceId_telegramChannelId_syncedAt_idx"
          ON "TelegramInviteLinkSnapshot"("workspaceId", "telegramChannelId", "syncedAt")
        `);
      await this.prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS "TelegramInviteLinkSnapshot_workspaceId_adCampaignId_syncedAt_idx"
          ON "TelegramInviteLinkSnapshot"("workspaceId", "adCampaignId", "syncedAt")
        `);
      await this.prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS "TelegramInviteLinkSnapshot_workspaceId_inviteLinkId_syncedAt_idx"
          ON "TelegramInviteLinkSnapshot"("workspaceId", "inviteLinkId", "syncedAt")
        `);
      await this.prisma.$executeRawUnsafe(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint
              WHERE conname = 'TelegramInviteLinkSnapshot_workspaceId_fkey'
            ) THEN
              ALTER TABLE "TelegramInviteLinkSnapshot"
              ADD CONSTRAINT "TelegramInviteLinkSnapshot_workspaceId_fkey"
              FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
              ON DELETE CASCADE ON UPDATE CASCADE;
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint
              WHERE conname = 'TelegramInviteLinkSnapshot_telegramChannelId_fkey'
            ) THEN
              ALTER TABLE "TelegramInviteLinkSnapshot"
              ADD CONSTRAINT "TelegramInviteLinkSnapshot_telegramChannelId_fkey"
              FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id")
              ON DELETE CASCADE ON UPDATE CASCADE;
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint
              WHERE conname = 'TelegramInviteLinkSnapshot_inviteLinkId_fkey'
            ) THEN
              ALTER TABLE "TelegramInviteLinkSnapshot"
              ADD CONSTRAINT "TelegramInviteLinkSnapshot_inviteLinkId_fkey"
              FOREIGN KEY ("inviteLinkId") REFERENCES "TelegramInviteLink"("id")
              ON DELETE CASCADE ON UPDATE CASCADE;
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint
              WHERE conname = 'TelegramInviteLinkSnapshot_adCampaignId_fkey'
            ) THEN
              ALTER TABLE "TelegramInviteLinkSnapshot"
              ADD CONSTRAINT "TelegramInviteLinkSnapshot_adCampaignId_fkey"
              FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id")
              ON DELETE SET NULL ON UPDATE CASCADE;
            END IF;
          END
          $$;
        `);
      this.telegramInviteLinkSnapshotStorageState = 'available';
      this.logger.warn(
        'TelegramInviteLinkSnapshot table was missing in the database and was created automatically for compatibility.',
      );
      return true;
    })();
    try {
      return await this.ensureTelegramInviteLinkSnapshotStoragePromise;
    } finally {
      this.ensureTelegramInviteLinkSnapshotStoragePromise = null;
    }
  }

  public inviteLinkSyntheticHistoryPoint(params: {
    syncedAt?: Date | null;
    joinedCount?: number | null;
    requestedCount?: number | null;
    isRevoked?: boolean | null;
  }) {
    return {
      syncedAt: params.syncedAt ?? new Date(),
      joinedCount: Number(params.joinedCount ?? 0),
      requestedCount: Number(params.requestedCount ?? 0),
      isRevoked: Boolean(params.isRevoked),
    };
  }

  public appendCurrentInviteLinkHistoryRowIfChanged<
    T extends {
      syncedAt: Date;
      joinedCount: number;
      requestedCount: number;
      isRevoked?: boolean | null;
    },
  >(
    rows: T[],
    current: {
      syncedAt?: Date | null;
      joinedCount?: number | null;
      requestedCount?: number | null;
      isRevoked?: boolean | null;
    },
  ) {
    const currentJoinedCount = Number(current.joinedCount ?? 0);
    const currentRequestedCount = Number(current.requestedCount ?? 0);
    const currentRevoked = Boolean(current.isRevoked);
    const latest = rows[rows.length - 1] ?? null;
    if (
      latest &&
      Number(latest.joinedCount || 0) === currentJoinedCount &&
      Number(latest.requestedCount || 0) === currentRequestedCount &&
      Boolean(latest.isRevoked) === currentRevoked
    ) {
      return rows;
    }
    return [
      ...rows,
      this.inviteLinkSyntheticHistoryPoint({
        syncedAt: current.syncedAt ?? new Date(),
        joinedCount: currentJoinedCount,
        requestedCount: currentRequestedCount,
        isRevoked: currentRevoked,
      }),
    ];
  }

  public async readInviteLinkSnapshotsOrEmpty(params: {
    where: Prisma.TelegramInviteLinkSnapshotWhereInput;
    orderBy:
      | Prisma.TelegramInviteLinkSnapshotOrderByWithRelationInput
      | Prisma.TelegramInviteLinkSnapshotOrderByWithRelationInput[];
    take: number;
  }) {
    if (this.telegramInviteLinkSnapshotStorageState === 'missing') {
      return [];
    }
    try {
      const rows = await this.prisma.telegramInviteLinkSnapshot.findMany({
        where: params.where,
        orderBy: params.orderBy,
        take: params.take,
      });
      this.telegramInviteLinkSnapshotStorageState = 'available';
      return rows;
    } catch (error) {
      if (!this.isInviteLinkSnapshotStorageMissing(error)) throw error;
      this.telegramInviteLinkSnapshotStorageState = 'missing';
      const repaired =
        await this.ensureTelegramInviteLinkSnapshotStorageAvailable();
      if (!repaired) return [];
      const rows = await this.prisma.telegramInviteLinkSnapshot.findMany({
        where: params.where,
        orderBy: params.orderBy,
        take: params.take,
      });
      this.telegramInviteLinkSnapshotStorageState = 'available';
      return rows;
    }
  }

  public async persistInviteLinkSnapshots(params: {
    workspaceId: string;
    channelId: string;
    syncedAt: Date;
    links: Array<{
      id: string;
      telegramChannelId: string;
      adCampaignId: string | null;
      joinedCount: number;
      requestedCount: number;
      isRevoked: boolean;
    }>;
  }) {
    if (!params.links.length) return;
    if (this.telegramInviteLinkSnapshotStorageState === 'missing') return;
    try {
      await this.prisma.telegramInviteLinkSnapshot.createMany({
        data: params.links.map((link) => ({
          workspaceId: params.workspaceId,
          telegramChannelId: params.channelId,
          inviteLinkId: link.id,
          adCampaignId: link.adCampaignId ?? null,
          syncedAt: params.syncedAt,
          joinedCount: Number(link.joinedCount || 0),
          requestedCount: Number(link.requestedCount || 0),
          isRevoked: Boolean(link.isRevoked),
        })),
        skipDuplicates: true,
      });
      this.telegramInviteLinkSnapshotStorageState = 'available';
    } catch (error) {
      if (!this.isInviteLinkSnapshotStorageMissing(error)) throw error;
      this.telegramInviteLinkSnapshotStorageState = 'missing';
      const repaired =
        await this.ensureTelegramInviteLinkSnapshotStorageAvailable();
      if (!repaired) {
        this.logger.warn(
          'TelegramInviteLinkSnapshot table is missing; invite-link history snapshots are skipped until migrations are applied.',
        );
        return;
      }
      await this.prisma.telegramInviteLinkSnapshot.createMany({
        data: params.links.map((link) => ({
          workspaceId: params.workspaceId,
          telegramChannelId: params.channelId,
          inviteLinkId: link.id,
          adCampaignId: link.adCampaignId ?? null,
          syncedAt: params.syncedAt,
          joinedCount: Number(link.joinedCount || 0),
          requestedCount: Number(link.requestedCount || 0),
          isRevoked: Boolean(link.isRevoked),
        })),
        skipDuplicates: true,
      });
      this.telegramInviteLinkSnapshotStorageState = 'available';
    }
  }
}
