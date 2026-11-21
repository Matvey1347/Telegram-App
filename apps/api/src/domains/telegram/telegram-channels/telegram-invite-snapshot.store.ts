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

  public inviteLinkSyntheticHistoryPoint(params: {
    syncedAt?: Date | null;
    joinedCount?: number | null;
    requestedCount?: number | null;
    isRevoked?: boolean | null;
  }) {
    return {
      syncedAt: params.syncedAt ?? new Date(),
      joinedCount: params.joinedCount ?? null,
      requestedCount: params.requestedCount ?? null,
      isRevoked: Boolean(params.isRevoked),
    };
  }

  public appendCurrentInviteLinkHistoryRowIfChanged<
    T extends {
      syncedAt: Date;
      joinedCount: number | null;
      requestedCount: number | null;
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
    const currentJoinedCount = current.joinedCount ?? null;
    const currentRequestedCount = current.requestedCount ?? null;
    const currentRevoked = Boolean(current.isRevoked);
    const latest = rows[rows.length - 1] ?? null;
    if (
      latest &&
      latest.joinedCount === currentJoinedCount &&
      latest.requestedCount === currentRequestedCount &&
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
      return [];
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
      joinedCount: number | null;
      requestedCount: number | null;
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
          joinedCount: link.joinedCount,
          requestedCount: link.requestedCount,
          isRevoked: Boolean(link.isRevoked),
        })),
        skipDuplicates: true,
      });
      this.telegramInviteLinkSnapshotStorageState = 'available';
    } catch (error) {
      if (!this.isInviteLinkSnapshotStorageMissing(error)) throw error;
      this.telegramInviteLinkSnapshotStorageState = 'missing';
      this.logger.warn(
        'TelegramInviteLinkSnapshot is unavailable. Apply the migration before syncing invite history.',
      );
    }
  }
}
