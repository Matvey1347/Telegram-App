import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  MutualPromotionFolderDetail,
  MutualPromotionFolderListItem,
  MutualPromotionInviteLinkOption,
  PaginatedResponse,
} from '@telegram-system/shared';
import { normalizeTelegramPostMediaItems } from '@telegram-system/shared';
import { WorkspaceService } from '../../../common/workspace.service';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeTelegramPostButtonRows } from '../../../telegram/shared/telegram-inline-keyboard';
import { hydrateTelegramInviteCreatorProfiles } from '../../../telegram/shared/telegram-invite-creator-profile';
import type {
  MutualPromotionFolderQueryDto,
  MutualPromotionInviteOptionsQueryDto,
} from './dto';
import { MutualPromotionStatisticsService } from './mutual-promotion-statistics.service';
import { MutualPromotionAttributionHistoryService } from './mutual-promotion-attribution-history.service';

const detailInclude = {
  participants: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      telegramChannel: {
        select: {
          id: true,
          title: true,
          username: true,
          photoUrl: true,
          currentSubscribersCount: true,
          kpiCurrency: true,
          targetCpaFrom: true,
          targetCpa: true,
          acceptableCpaFrom: true,
          acceptableCpa: true,
          stopCpaFrom: true,
          stopCpa: true,
        },
      },
      inviteLink: {
        select: {
          id: true,
          name: true,
          url: true,
          joinedCount: true,
          creatorTelegramUserId: true,
          creatorUsername: true,
          creatorFirstName: true,
          creatorPhotoUrl: true,
          creatorMember: {
            select: {
              id: true,
              user: { select: { name: true } },
              avatarIcon: {
                select: {
                  id: true,
                  type: true,
                  name: true,
                  emoji: true,
                  imageUrl: true,
                },
              },
            },
          },
        },
      },
      expense: { include: { account: { select: { name: true } } } },
    },
  },
  posts: {
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    include: {
      deliveries: { orderBy: { createdAt: 'asc' } },
    },
  },
} satisfies Prisma.MutualPromotionFolderInclude;

@Injectable()
export class MutualPromotionReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly statistics: MutualPromotionStatisticsService,
    private readonly attributionHistory: MutualPromotionAttributionHistoryService,
  ) {}

  private async workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  async list(
    userId: string,
    query: MutualPromotionFolderQueryDto,
  ): Promise<PaginatedResponse<MutualPromotionFolderListItem>> {
    const workspaceId = await this.workspace(userId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const [rows, totalItems] = await Promise.all([
      this.prisma.mutualPromotionFolder.findMany({
        where: { workspaceId },
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { participants: true, posts: true } },
          participants: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              role: true,
              subscribersAtStart: true,
              subscribersAtEnd: true,
              inviteJoinedAtStart: true,
              inviteJoinedAtEnd: true,
              baselineCapturedAt: true,
              finalCapturedAt: true,
              telegramChannel: {
                select: {
                  id: true,
                  title: true,
                  username: true,
                  photoUrl: true,
                  currentSubscribersCount: true,
                  kpiCurrency: true,
                  targetCpaFrom: true,
                  targetCpa: true,
                  acceptableCpaFrom: true,
                  acceptableCpa: true,
                  stopCpaFrom: true,
                  stopCpa: true,
                },
              },
              inviteLink: { select: { joinedCount: true } },
              expense: {
                include: { account: { select: { name: true } } },
              },
            },
          },
        },
      }),
      this.prisma.mutualPromotionFolder.count({ where: { workspaceId } }),
    ]);
    const items = rows.map((row) => ({
      id: row.id,
      title: row.title,
      titleTemplate: row.titleTemplate,
      status: row.status,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      notes: row.notes,
      participantCount: row._count.participants,
      publisherCount: row.participants.filter(
        (item) => item.role === 'PUBLISHER',
      ).length,
      paidCount: row.participants.filter((item) => item.role === 'PAID').length,
      postCount: row._count.posts,
      channels: row.participants.map((participant) => ({
        id: participant.telegramChannel.id,
        title: participant.telegramChannel.title,
        username: participant.telegramChannel.username,
        photoUrl: participant.telegramChannel.photoUrl,
        role: participant.role,
        kpi: channelKpi(participant.telegramChannel),
        stats: this.statistics.participant(
          {
            ...participant,
            currentSubscribersCount:
              participant.telegramChannel.currentSubscribersCount,
            currentInviteJoinedCount: participant.inviteLink.joinedCount,
          },
          { useCurrentCounters: row.status === 'ACTIVE' },
        ),
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    return {
      items,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async detail(
    userId: string,
    id: string,
  ): Promise<MutualPromotionFolderDetail> {
    const workspaceId = await this.workspace(userId);
    return this.detailForWorkspace(workspaceId, id);
  }

  async detailForWorkspace(
    workspaceId: string,
    id: string,
  ): Promise<MutualPromotionFolderDetail> {
    const row = await this.prisma.mutualPromotionFolder.findFirst({
      where: { id, workspaceId },
      include: detailInclude,
    });
    if (!row) throw new NotFoundException('Mutual-promotion folder not found');
    const [hydratedInviteLinks, attributionHistory] = await Promise.all([
      hydrateTelegramInviteCreatorProfiles(
        this.prisma,
        workspaceId,
        row.participants.map((participant) => participant.inviteLink),
      ),
      this.attributionHistory.load({
        workspaceId,
        folderId: row.id,
        folderStartsAt: row.startsAt,
        participants: row.participants,
      }),
    ]);
    const inviteLinkById = new Map(
      hydratedInviteLinks.map((inviteLink) => [inviteLink.id, inviteLink]),
    );
    const publisherCount = row.participants.filter(
      (item) => item.role === 'PUBLISHER',
    ).length;
    return {
      id: row.id,
      title: row.title,
      titleTemplate: row.titleTemplate,
      status: row.status,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      notes: row.notes,
      assignedMemberId: row.assignedMemberId,
      participantCount: row.participants.length,
      publisherCount,
      paidCount: row.participants.length - publisherCount,
      postCount: row.posts.length,
      channels: row.participants.map((participant) => ({
        id: participant.telegramChannel.id,
        title: participant.telegramChannel.title,
        username: participant.telegramChannel.username,
        photoUrl: participant.telegramChannel.photoUrl,
        role: participant.role,
        kpi: channelKpi(participant.telegramChannel),
        stats: this.statistics.participant(
          {
            ...participant,
            currentSubscribersCount:
              participant.telegramChannel.currentSubscribersCount,
            currentInviteJoinedCount: participant.inviteLink.joinedCount,
          },
          { useCurrentCounters: row.status === 'ACTIVE' },
        ),
      })),
      participants: row.participants.map((participant) => {
        const inviteLink =
          inviteLinkById.get(participant.inviteLink.id) ??
          participant.inviteLink;
        return {
          id: participant.id,
          telegramChannelId: participant.telegramChannelId,
          role: participant.role,
          inviteLinkMode: participant.inviteLinkMode,
          channel: {
            id: participant.telegramChannel.id,
            title: participant.telegramChannel.title,
            username: participant.telegramChannel.username,
            photoUrl: participant.telegramChannel.photoUrl,
          },
          inviteLink: {
            id: inviteLink.id,
            name: inviteLink.name,
            url: inviteLink.url,
            joinedCount: inviteLink.joinedCount,
            creatorUsername: inviteLink.creatorUsername,
            creatorFirstName: inviteLink.creatorFirstName,
            creatorPhotoUrl: inviteLink.creatorPhotoUrl,
            creatorMember: inviteLink.creatorMember
              ? {
                  id: inviteLink.creatorMember.id,
                  name: inviteLink.creatorMember.user.name,
                  avatarPresentation: iconToResolvedEmoji(
                    inviteLink.creatorMember.avatarIcon,
                  ),
                }
              : null,
          },
          subscribersAtStart: participant.subscribersAtStart,
          subscribersAtEnd: participant.subscribersAtEnd,
          inviteJoinedAtStart: participant.inviteJoinedAtStart,
          inviteJoinedAtEnd: participant.inviteJoinedAtEnd,
          baselineCapturedAt:
            participant.baselineCapturedAt?.toISOString() ?? null,
          finalCapturedAt: participant.finalCapturedAt?.toISOString() ?? null,
          expense: this.statistics.expense(participant),
          stats: this.statistics.participant(
            {
              ...participant,
              currentSubscribersCount:
                participant.telegramChannel.currentSubscribersCount,
              currentInviteJoinedCount: inviteLink.joinedCount,
            },
            { useCurrentCounters: row.status === 'ACTIVE' },
          ),
          attributionHistory: attributionHistory.get(participant.id)!,
        };
      }),
      posts: row.posts.map((post) => ({
        id: post.id,
        title: post.title,
        text: post.text,
        imageUrls: post.imageUrls,
        mediaItems: normalizeTelegramPostMediaItems(
          post.mediaItems,
          post.imageUrls,
        ),
        buttonRows: normalizeTelegramPostButtonRows(post.buttonRows),
        scheduledAt: post.scheduledAt.toISOString(),
        position: post.position,
        deliveries: post.deliveries.map((delivery) => ({
          id: delivery.id,
          participantId: delivery.participantId,
          telegramChannelId: delivery.telegramChannelId,
          managedPostId: delivery.managedPostId,
          status: delivery.status,
          publishedAt: delivery.publishedAt?.toISOString() ?? null,
          deletedAt: delivery.deletedAt?.toISOString() ?? null,
          lastError: delivery.lastError,
        })),
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async inviteLinkOptions(
    userId: string,
    query: MutualPromotionInviteOptionsQueryDto,
  ): Promise<MutualPromotionInviteLinkOption[]> {
    const workspaceId = await this.workspace(userId);
    let startsAt = query.startsAt ? new Date(query.startsAt) : null;
    let endsAt = query.endsAt ? new Date(query.endsAt) : null;
    if (query.folderId && (!startsAt || !endsAt)) {
      const folder = await this.prisma.mutualPromotionFolder.findFirst({
        where: { id: query.folderId, workspaceId },
        select: { startsAt: true, endsAt: true },
      });
      if (!folder)
        throw new NotFoundException('Mutual-promotion folder not found');
      startsAt = startsAt ?? folder.startsAt;
      endsAt = endsAt ?? folder.endsAt;
    }
    const channelIds = [...new Set(query.channelIds ?? [])];
    if (!channelIds.length) return [];
    const links = await this.prisma.telegramInviteLink.findMany({
      where: { workspaceId, telegramChannelId: { in: channelIds } },
      orderBy: [{ telegramChannelId: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        telegramChannelId: true,
        name: true,
        url: true,
        joinedCount: true,
        requestedCount: true,
        isRevoked: true,
        creatorUsername: true,
        creatorFirstName: true,
        creatorPhotoUrl: true,
        creatorMember: {
          select: {
            id: true,
            user: { select: { name: true } },
            avatarIcon: {
              select: {
                id: true,
                type: true,
                name: true,
                emoji: true,
                imageUrl: true,
              },
            },
          },
        },
        adCampaignId: true,
        snapshots: {
          where: { adCampaignId: { not: null } },
          take: 1,
          select: { id: true },
        },
        mutualPromotionParticipants: {
          where: query.folderId
            ? { folderId: { not: query.folderId } }
            : undefined,
          select: {
            inviteLinkMode: true,
            folder: { select: { status: true, startsAt: true, endsAt: true } },
          },
        },
      },
    });
    const hydratedLinks = await hydrateTelegramInviteCreatorProfiles(
      this.prisma,
      workspaceId,
      links,
    );
    return hydratedLinks.map((link) => {
      const ads = Boolean(link.adCampaignId || link.snapshots.length);
      const folderOnly = link.mutualPromotionParticipants.some(
        (assignment) => assignment.inviteLinkMode === 'FOLDER_ONLY',
      );
      const overlap =
        startsAt && endsAt
          ? link.mutualPromotionParticipants.some(
              (assignment) =>
                assignment.folder.status !== 'CANCELLED' &&
                assignment.folder.startsAt < endsAt &&
                assignment.folder.endsAt > startsAt,
            )
          : false;
      const unavailableReason = ads
        ? 'ADS'
        : folderOnly
          ? 'FOLDER_ONLY'
          : overlap
            ? 'OVERLAP'
            : null;
      return {
        id: link.id,
        telegramChannelId: link.telegramChannelId,
        name: link.name,
        url: link.url,
        joinedCount: link.joinedCount,
        requestedCount: link.requestedCount,
        isRevoked: link.isRevoked,
        available: !link.isRevoked && unavailableReason === null,
        unavailableReason,
        creatorUsername: link.creatorUsername,
        creatorFirstName: link.creatorFirstName,
        creatorPhotoUrl: link.creatorPhotoUrl,
        creatorMember: link.creatorMember
          ? {
              id: link.creatorMember.id,
              name: link.creatorMember.user.name,
              avatarPresentation: iconToResolvedEmoji(
                link.creatorMember.avatarIcon,
              ),
            }
          : null,
      };
    });
  }
}

function channelKpi(channel: {
  kpiCurrency: string;
  targetCpaFrom: Prisma.Decimal | null;
  targetCpa: Prisma.Decimal | null;
  acceptableCpaFrom: Prisma.Decimal | null;
  acceptableCpa: Prisma.Decimal | null;
  stopCpaFrom: Prisma.Decimal | null;
  stopCpa: Prisma.Decimal | null;
}) {
  const number = (value: Prisma.Decimal | null) =>
    value == null ? null : Number(value);
  return {
    currency: channel.kpiCurrency,
    targetFrom: number(channel.targetCpaFrom),
    targetTo: number(channel.targetCpa),
    acceptableFrom: number(channel.acceptableCpaFrom),
    acceptableTo: number(channel.acceptableCpa),
    stopFrom: number(channel.stopCpaFrom),
    stopTo: number(channel.stopCpa),
  };
}
