import {
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { TelegramManagedPostStatus } from '@prisma/client';
import { TELEGRAM_POST_GROUP_SUMMARY_MAX_ITEMS } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramManagedPostGroupPresentationService } from './telegram-managed-post-group-presentation.service';

type StatusCount = {
  status: TelegramManagedPostStatus;
  count: number;
};

function statusSummary(rows: StatusCount[]) {
  const count = (status: TelegramManagedPostStatus) =>
    rows.find((row) => row.status === status)?.count ?? 0;
  const totalPosts = rows.reduce((total, row) => total + row.count, 0);
  const draftCount = count(TelegramManagedPostStatus.DRAFT);
  const scheduledCount = count(TelegramManagedPostStatus.SCHEDULED);
  const publishedCount = count(TelegramManagedPostStatus.PUBLISHED);
  const failedCount = count(TelegramManagedPostStatus.FAILED);
  const computedStatus =
    totalPosts === 0
      ? 'EMPTY'
      : failedCount > 0
        ? 'HAS_ERRORS'
        : draftCount === totalPosts
          ? 'ALL_DRAFT'
          : scheduledCount === totalPosts
            ? 'ALL_SCHEDULED'
            : publishedCount === totalPosts
              ? 'ALL_PUBLISHED'
              : 'MIXED';
  return {
    totalPosts,
    draftCount,
    scheduledCount,
    publishedCount,
    failedCount,
    computedStatus,
  };
}

@Injectable()
export class TelegramPostGroupSummaryReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: TelegramChannelsSupportService,
    private readonly presentation: TelegramManagedPostGroupPresentationService,
  ) {}

  private readonly iconSelect = {
    id: true,
    type: true,
    name: true,
    emoji: true,
    imageUrl: true,
  } as const;

  private readonly postGroupSelect = {
    id: true,
    workspaceId: true,
    telegramChannelId: true,
    title: true,
    description: true,
    icon: true,
    isSystem: true,
    systemKey: true,
    statusNumberingEnabled: true,
    createdByMemberId: true,
    sidebarPosition: true,
    createdAt: true,
    updatedAt: true,
    createdByMember: {
      select: {
        id: true,
        role: true,
        telegramUsername: true,
        avatarIconId: true,
        avatarIcon: { select: this.iconSelect },
        user: { select: { id: true, name: true } },
      },
    },
    telegramChannel: { select: { id: true, title: true } },
  } as const;

  async summaries(userId: string, channelId: string) {
    const workspaceId = await this.support.workspace(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');

    const groups = await this.prisma.postGroup.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      select: this.postGroupSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: TELEGRAM_POST_GROUP_SUMMARY_MAX_ITEMS + 1,
    });
    if (groups.length > TELEGRAM_POST_GROUP_SUMMARY_MAX_ITEMS) {
      throw new PayloadTooLargeException(
        `Channel has more than ${TELEGRAM_POST_GROUP_SUMMARY_MAX_ITEMS} post groups`,
      );
    }

    const statusCounts = groups.length
      ? await this.prisma.telegramManagedPost.groupBy({
          by: ['groupId', 'status'],
          where: {
            workspaceId,
            telegramChannelId: channelId,
            groupId: { in: groups.map((group) => group.id) },
          },
          _count: { _all: true },
        })
      : [];
    const statusesByGroupId = new Map<string, StatusCount[]>();
    for (const row of statusCounts) {
      if (!row.groupId) continue;
      const statuses = statusesByGroupId.get(row.groupId) ?? [];
      statuses.push({ status: row.status, count: row._count._all });
      statusesByGroupId.set(row.groupId, statuses);
    }
    const summaries = groups.map((group) => {
      const statuses = statusesByGroupId.get(group.id) ?? [];
      return {
        ...group,
        postsCount: statuses.reduce((total, row) => total + row.count, 0),
        statusSummary: statusSummary(statuses),
      };
    });
    return this.presentation.attachPostGroupIcons(summaries);
  }
}
