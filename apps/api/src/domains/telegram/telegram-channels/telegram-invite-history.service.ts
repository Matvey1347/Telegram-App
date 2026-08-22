import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramInvitePersistenceService } from './telegram-invite-persistence.service';
import { TelegramInviteSnapshotStore } from './telegram-invite-snapshot.store';

@Injectable()
export class TelegramInviteHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramInviteSnapshotStore: TelegramInviteSnapshotStore,
    private readonly telegramInvitePersistenceService: TelegramInvitePersistenceService,
  ) {}
  private readonly logger = new Logger('TelegramChannelsService');
  private telegramInviteLinkSnapshotStorageState:
    | 'unknown'
    | 'available'
    | 'missing' = 'unknown';

  public inviteLinkHistoryPoints<
    T extends {
      syncedAt: Date;
      joinedCount: number;
      requestedCount: number;
      isRevoked?: boolean | null;
    },
  >(rows: T[]) {
    let peakJoinedCount = 0;
    let peakTotalAttributed = 0;
    return rows.map((row) => {
      const joinedCount = Number(row.joinedCount || 0);
      const requestedCount = Number(row.requestedCount || 0);
      const totalAttributed = joinedCount + requestedCount;
      peakJoinedCount = Math.max(peakJoinedCount, joinedCount);
      peakTotalAttributed = Math.max(peakTotalAttributed, totalAttributed);
      const drawdownFromPeak = Math.max(
        0,
        peakTotalAttributed - totalAttributed,
      );
      const drawdownPercent =
        peakTotalAttributed > 0
          ? (drawdownFromPeak / peakTotalAttributed) * 100
          : 0;
      return {
        syncedAt: row.syncedAt,
        joinedCount,
        requestedCount,
        totalAttributed,
        peakJoinedCount,
        drawdownFromPeak,
        drawdownPercent,
        isRevoked: Boolean(row.isRevoked),
      };
    });
  }

  public inviteLinkHistorySummary<
    T extends {
      joinedCount: number;
      requestedCount: number;
      totalAttributed: number;
      peakJoinedCount: number;
      drawdownFromPeak: number;
      drawdownPercent: number;
    },
  >(points: T[]) {
    const current = points[points.length - 1] ?? null;
    const peakJoinedCount = points.reduce(
      (max, point) => Math.max(max, Number(point.peakJoinedCount || 0)),
      0,
    );
    const peakRequestedCount = points.reduce(
      (max, point) => Math.max(max, Number(point.requestedCount || 0)),
      0,
    );
    const peakTotalAttributed = points.reduce(
      (max, point) => Math.max(max, Number(point.totalAttributed || 0)),
      0,
    );
    return {
      currentJoinedCount: Number(current?.joinedCount || 0),
      currentRequestedCount: Number(current?.requestedCount || 0),
      currentTotalAttributed:
        Number(current?.joinedCount || 0) +
        Number(current?.requestedCount || 0),
      peakJoinedCount,
      peakRequestedCount,
      peakTotalAttributed,
      drawdownFromPeak: Number(current?.drawdownFromPeak || 0),
      drawdownPercent: Number(current?.drawdownPercent || 0),
      hasHighDropoff: Number(current?.drawdownPercent || 0) >= 15,
    };
  }

  public buildInviteLinkHistoryPayload(
    inviteLink: {
      joinedCount: number;
      requestedCount?: number | null;
      isRevoked: boolean;
      lastSyncedAt?: Date | null;
      updatedAt?: Date | null;
      createdAt?: Date | null;
    } & Record<string, unknown>,
    rowsAsc: Array<{
      syncedAt: Date;
      joinedCount: number;
      requestedCount: number;
      isRevoked?: boolean | null;
    }>,
    limit = 120,
  ) {
    const maxPoints = Math.max(2, Math.min(365, limit));
    const historyRows = this.telegramInviteSnapshotStore
      .appendCurrentInviteLinkHistoryRowIfChanged(rowsAsc.slice(-maxPoints), {
        syncedAt:
          inviteLink.lastSyncedAt ??
          inviteLink.updatedAt ??
          inviteLink.createdAt,
        joinedCount: inviteLink.joinedCount,
        requestedCount: inviteLink.requestedCount,
        isRevoked: inviteLink.isRevoked,
      })
      .slice(-maxPoints);
    const points = this.inviteLinkHistoryPoints(
      historyRows.length
        ? historyRows
        : [
            this.telegramInviteSnapshotStore.inviteLinkSyntheticHistoryPoint({
              syncedAt:
                inviteLink.lastSyncedAt ??
                inviteLink.updatedAt ??
                inviteLink.createdAt,
              joinedCount: inviteLink.joinedCount,
              requestedCount: inviteLink.requestedCount,
              isRevoked: inviteLink.isRevoked,
            }),
          ],
    );
    return {
      inviteLink:
        this.telegramInvitePersistenceService.normalizeInviteLinkRequestedCount(
          inviteLink,
        ),
      points,
      summary: this.inviteLinkHistorySummary(points),
    };
  }

  public buildCampaignInviteLinkHistoryPayload(
    campaign: {
      id: string;
      title: string;
      inviteLinks: Array<{
        id: string;
        name: string | null;
        url: string;
        joinedCount: number;
        requestedCount?: number | null;
        isRevoked: boolean;
        lastSyncedAt?: Date | null;
        updatedAt?: Date | null;
        createdAt?: Date | null;
      }>;
    },
    rowsAsc: Array<{
      inviteLinkId: string;
      syncedAt: Date;
      joinedCount: number;
      requestedCount: number;
      isRevoked?: boolean | null;
    }>,
    limit = 120,
  ) {
    const maxPoints = Math.max(2, Math.min(365, limit));
    const aggregateBySync = new Map<
      string,
      {
        syncedAt: Date;
        joinedCount: number;
        requestedCount: number;
        isRevoked: boolean;
      }
    >();

    for (const row of rowsAsc) {
      const key = row.syncedAt.toISOString();
      const current = aggregateBySync.get(key) ?? {
        syncedAt: row.syncedAt,
        joinedCount: 0,
        requestedCount: 0,
        isRevoked: true,
      };
      current.joinedCount += Number(row.joinedCount || 0);
      current.requestedCount += Number(row.requestedCount || 0);
      current.isRevoked = current.isRevoked && Boolean(row.isRevoked);
      aggregateBySync.set(key, current);
    }

    const aggregateRows = Array.from(aggregateBySync.values())
      .sort((a, b) => a.syncedAt.getTime() - b.syncedAt.getTime())
      .slice(-maxPoints);
    const aggregatePoints = this.inviteLinkHistoryPoints(
      this.telegramInviteSnapshotStore
        .appendCurrentInviteLinkHistoryRowIfChanged(aggregateRows, {
          syncedAt: null,
          joinedCount: campaign.inviteLinks.reduce(
            (sum, link) => sum + Number(link.joinedCount || 0),
            0,
          ),
          requestedCount: campaign.inviteLinks.reduce(
            (sum, link) => sum + Number(link.requestedCount || 0),
            0,
          ),
          isRevoked:
            campaign.inviteLinks.length > 0 &&
            campaign.inviteLinks.every((link) => Boolean(link.isRevoked)),
        })
        .slice(-maxPoints),
    );

    const perLinkRows = new Map<
      string,
      Array<{
        syncedAt: Date;
        joinedCount: number;
        requestedCount: number;
        isRevoked: boolean;
      }>
    >();
    for (const row of rowsAsc) {
      const list = perLinkRows.get(row.inviteLinkId) ?? [];
      list.push({
        syncedAt: row.syncedAt,
        joinedCount: Number(row.joinedCount || 0),
        requestedCount: Number(row.requestedCount || 0),
        isRevoked: Boolean(row.isRevoked),
      });
      perLinkRows.set(row.inviteLinkId, list);
    }

    const inviteLinks = campaign.inviteLinks.map((link) => {
      const linkRows = this.telegramInviteSnapshotStore
        .appendCurrentInviteLinkHistoryRowIfChanged(
          (perLinkRows.get(link.id) ?? []).slice(-maxPoints),
          {
            syncedAt:
              link.lastSyncedAt ?? link.updatedAt ?? link.createdAt ?? null,
            joinedCount: link.joinedCount,
            requestedCount: link.requestedCount,
            isRevoked: link.isRevoked,
          },
        )
        .slice(-maxPoints);
      const points = this.inviteLinkHistoryPoints(
        linkRows.length
          ? linkRows
          : [
              this.telegramInviteSnapshotStore.inviteLinkSyntheticHistoryPoint({
                joinedCount: link.joinedCount,
                requestedCount: link.requestedCount,
                isRevoked: link.isRevoked,
              }),
            ],
      );
      return {
        ...link,
        points,
        summary: this.inviteLinkHistorySummary(points),
      };
    });

    return {
      campaign: {
        id: campaign.id,
        title: campaign.title,
      },
      inviteLinks,
      points: aggregatePoints,
      summary: {
        ...this.inviteLinkHistorySummary(aggregatePoints),
        inviteLinksCount: campaign.inviteLinks.length,
      },
    };
  }

  public async preloadCampaignInviteLinkHistories(
    workspaceId: string,
    rows: Array<{
      id: string;
      title: string;
      inviteLinks?: Array<{
        id: string;
        name: string | null;
        url: string;
        joinedCount: number;
        requestedCount?: number | null;
        isRevoked: boolean;
        lastSyncedAt?: Date | null;
        updatedAt?: Date | null;
        createdAt?: Date | null;
      }>;
    }>,
    limit = 120,
  ) {
    if (!rows.length) {
      return new Map<
        string,
        ReturnType<
          TelegramInviteHistoryService['buildCampaignInviteLinkHistoryPayload']
        >
      >();
    }
    const campaignIds = rows.map((row) => row.id);
    let snapshotRows: Array<{
      adCampaignId: string | null;
      inviteLinkId: string;
      syncedAt: Date;
      joinedCount: number;
      requestedCount: number;
      isRevoked: boolean | null;
    }> = [];
    if (this.telegramInviteLinkSnapshotStorageState !== 'missing') {
      try {
        snapshotRows = await this.prisma.telegramInviteLinkSnapshot.findMany({
          where: {
            workspaceId,
            adCampaignId: { in: campaignIds },
          },
          orderBy: [
            { adCampaignId: 'asc' },
            { syncedAt: 'asc' },
            { inviteLinkId: 'asc' },
          ],
          take: Math.max(
            2,
            Math.min(5000, limit * Math.max(1, campaignIds.length)),
          ),
          select: {
            adCampaignId: true,
            inviteLinkId: true,
            syncedAt: true,
            joinedCount: true,
            requestedCount: true,
            isRevoked: true,
          },
        });
        this.telegramInviteLinkSnapshotStorageState = 'available';
      } catch (error) {
        if (
          !this.telegramInviteSnapshotStore.isInviteLinkSnapshotStorageMissing(
            error,
          )
        )
          throw error;
        this.telegramInviteLinkSnapshotStorageState = 'missing';
      }
    }

    const rowsByCampaignId = new Map<string, typeof snapshotRows>();
    for (const row of snapshotRows) {
      if (!row.adCampaignId) continue;
      const list = rowsByCampaignId.get(row.adCampaignId) ?? [];
      list.push(row);
      rowsByCampaignId.set(row.adCampaignId, list);
    }

    const historyByCampaignId = new Map<
      string,
      ReturnType<
        TelegramInviteHistoryService['buildCampaignInviteLinkHistoryPayload']
      >
    >();
    for (const row of rows) {
      historyByCampaignId.set(
        row.id,
        this.buildCampaignInviteLinkHistoryPayload(
          {
            id: row.id,
            title: row.title,
            inviteLinks: Array.isArray(row.inviteLinks)
              ? row.inviteLinks.map((link) => ({
                  ...link,
                  requestedCount: Number(link.requestedCount ?? 0),
                }))
              : [],
          },
          rowsByCampaignId.get(row.id) ?? [],
          limit,
        ),
      );
    }
    return historyByCampaignId;
  }

  public async attachInviteLinkHistories<
    T extends {
      id: string;
      telegramChannelId: string;
      joinedCount: number;
      requestedCount?: number | null;
      isRevoked: boolean;
      lastSyncedAt?: Date | null;
      updatedAt?: Date | null;
      createdAt?: Date | null;
    } & Record<string, unknown>,
  >(workspaceId: string, channelId: string, links: T[], limit = 120) {
    const normalizedLinks =
      this.telegramInvitePersistenceService.normalizeInviteLinksRequestedCount(
        links,
      );
    if (!normalizedLinks.length) return normalizedLinks;
    const rows =
      await this.telegramInviteSnapshotStore.readInviteLinkSnapshotsOrEmpty({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          inviteLinkId: { in: normalizedLinks.map((link) => link.id) },
        },
        orderBy: [{ inviteLinkId: 'asc' }, { syncedAt: 'asc' }],
        take: Math.max(
          2,
          Math.min(5000, limit * Math.max(1, normalizedLinks.length)),
        ),
      });
    const rowsByInviteLinkId = new Map<
      string,
      Array<{
        syncedAt: Date;
        joinedCount: number;
        requestedCount: number;
        isRevoked?: boolean | null;
      }>
    >();
    for (const row of rows) {
      const list = rowsByInviteLinkId.get(row.inviteLinkId) ?? [];
      list.push({
        syncedAt: row.syncedAt,
        joinedCount: Number(row.joinedCount || 0),
        requestedCount: Number(row.requestedCount || 0),
        isRevoked: Boolean(row.isRevoked),
      });
      rowsByInviteLinkId.set(row.inviteLinkId, list);
    }
    return normalizedLinks.map((link) => ({
      ...link,
      history: this.buildInviteLinkHistoryPayload(
        link,
        rowsByInviteLinkId.get(link.id) ?? [],
        limit,
      ),
    }));
  }
}
