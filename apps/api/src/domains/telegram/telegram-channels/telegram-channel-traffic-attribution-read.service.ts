import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CrossPromotionTargetInput } from '@telegram-system/shared';
import type { TelegramChannelFinancialPreviewInput } from './telegram-channel-financial-read.types';
import { PrismaService } from '../../../prisma/prisma.service';

const MAX_DETAIL_SNAPSHOTS = 5_000;

export type TrafficAttributionChannelSettings = {
  id: string;
  photoUrl: string | null;
  purchaseTransactionId: string | null;
  currentSubscribersCount: number | null;
  mutualPromotionInviteLinkIds: string[];
  folderDefaultInviteLinkIds: string[];
  audienceTransferInviteLinkId: string | null;
  botInviteLinkId: string | null;
  broadcastInviteLinkId: string | null;
};

export type TrafficAttributionInviteLinkRow = {
  id: string;
  telegramChannelId: string;
  adCampaignId: string | null;
  name: string;
  url: string;
  joinedCount: number;
  requestedCount: number;
  peakAttributedCount: number;
};

export type TrafficAttributionPlanBoundaryCounter = {
  planId: string;
  inviteLinkId: string;
  joinedCount: number | null;
  requestedCount: number | null;
};

function targets(value: unknown): CrossPromotionTargetInput[] {
  return Array.isArray(value) ? (value as CrossPromotionTargetInput[]) : [];
}

@Injectable()
export class TelegramChannelTrafficAttributionReadService {
  constructor(private readonly prisma: PrismaService) {}

  async channelExists(workspaceId: string, channelId: string) {
    return Boolean(
      await this.prisma.telegramChannel.findFirst({
        where: { id: channelId, workspaceId, isActive: true },
        select: { id: true },
      }),
    );
  }

  async financialChannel(
    workspaceId: string,
    channelId: string,
  ): Promise<TelegramChannelFinancialPreviewInput | null> {
    return this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      select: {
        id: true,
        purchaseTransactionId: true,
        currentSubscribersCount: true,
      },
    });
  }

  async detailSnapshots(workspaceId: string, channelId: string) {
    const snapshots = await this.prisma.telegramInviteLinkSnapshot.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: [{ syncedAt: 'desc' }, { id: 'desc' }],
      take: MAX_DETAIL_SNAPSHOTS + 1,
      select: {
        inviteLinkId: true,
        syncedAt: true,
        joinedCount: true,
        requestedCount: true,
      },
    });
    return {
      rows: snapshots.slice(0, MAX_DETAIL_SNAPSHOTS).reverse(),
      historyTruncated: snapshots.length > MAX_DETAIL_SNAPSHOTS,
    };
  }

  async batch(workspaceId: string, channelIds: string[]) {
    const [channels, links, campaigns, participants, plans, workspace] =
      await Promise.all([
        this.prisma.telegramChannel.findMany({
          where: { workspaceId, id: { in: channelIds } },
          select: {
            id: true,
            photoUrl: true,
            purchaseTransactionId: true,
            currentSubscribersCount: true,
            mutualPromotionInviteLinkIds: true,
            folderDefaultInviteLinkIds: true,
            audienceTransferInviteLinkId: true,
            botInviteLinkId: true,
            broadcastInviteLinkId: true,
          },
        }),
        this.prisma.telegramInviteLink.findMany({
          where: { workspaceId, telegramChannelId: { in: channelIds } },
          select: {
            id: true,
            telegramChannelId: true,
            adCampaignId: true,
            name: true,
            url: true,
            joinedCount: true,
            requestedCount: true,
            peakAttributedCount: true,
          },
        }),
        this.prisma.adCampaign.findMany({
          where: {
            workspaceId,
            telegramChannelId: { in: channelIds },
            excludeFromAnalytics: false,
          },
          select: {
            id: true,
            telegramChannelId: true,
            title: true,
            status: true,
            startedAt: true,
            endedAt: true,
            price: true,
            currency: true,
            priceInPrimaryCurrency: true,
            joinedCount: true,
            newSubscribers: true,
            advertisingSource: { select: { imageUrl: true } },
          },
        }),
        this.prisma.mutualPromotionFolderParticipant.findMany({
          where: { workspaceId, telegramChannelId: { in: channelIds } },
          orderBy: [{ folder: { startsAt: 'desc' } }, { id: 'asc' }],
          select: {
            id: true,
            telegramChannelId: true,
            inviteLinkId: true,
            role: true,
            subscribersAtStart: true,
            subscribersAtEnd: true,
            inviteJoinedAtStart: true,
            inviteJoinedAtEnd: true,
            inviteRequestedAtStart: true,
            inviteRequestedAtEnd: true,
            baselineCapturedAt: true,
            finalCapturedAt: true,
            folder: { select: { title: true, startsAt: true, endsAt: true } },
            expense: {
              select: {
                amount: true,
                currency: true,
                amountInPrimaryCurrency: true,
              },
            },
          },
        }),
        this.prisma.crossPromotionPlan.findMany({
          where: {
            workspaceId,
            kind: 'DIRECT_MUTUAL',
            OR: channelIds.map((telegramChannelId) => ({
              targets: { array_contains: [{ telegramChannelId }] },
            })),
          },
          orderBy: [{ scheduledAt: 'desc' }, { id: 'asc' }],
          select: {
            id: true,
            title: true,
            targets: true,
            baselineTargetCounters: true,
            scheduledAt: true,
            trackingEndsAt: true,
          },
        }),
        this.prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { primaryCurrency: true },
        }),
      ]);
    const boundaryTargets = plans.flatMap((plan) =>
      plan.trackingEndsAt
        ? targets(plan.targets).map((target) => ({
            planId: plan.id,
            inviteLinkId: target.inviteLinkId,
            trackingEndsAt: plan.trackingEndsAt!,
          }))
        : [],
    );
    const planBoundaryCounters = boundaryTargets.length
      ? await this.prisma.$queryRaw<
          TrafficAttributionPlanBoundaryCounter[]
        >(Prisma.sql`
          SELECT
            boundary."planId",
            boundary."inviteLinkId",
            snapshot."joinedCount",
            snapshot."requestedCount"
          FROM (
            VALUES ${Prisma.join(
              boundaryTargets.map(
                (target) =>
                  Prisma.sql`(${target.planId}, ${target.inviteLinkId}, CAST(${target.trackingEndsAt} AS TIMESTAMP(3)))`,
              ),
            )}
          ) AS boundary("planId", "inviteLinkId", "trackingEndsAt")
          LEFT JOIN LATERAL (
            SELECT snapshot_row."joinedCount", snapshot_row."requestedCount"
            FROM "TelegramInviteLinkSnapshot" AS snapshot_row
            WHERE snapshot_row."workspaceId" = ${workspaceId}
              AND snapshot_row."inviteLinkId" = boundary."inviteLinkId"
              AND snapshot_row."syncedAt" <= boundary."trackingEndsAt"
            ORDER BY snapshot_row."syncedAt" DESC, snapshot_row."id" DESC
            LIMIT 1
          ) AS snapshot ON TRUE
        `)
      : [];
    return {
      channels,
      links,
      campaigns,
      participants,
      plans,
      planBoundaryCounters,
      currency: workspace?.primaryCurrency ?? 'USD',
    };
  }
}
