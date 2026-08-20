import { Injectable } from '@nestjs/common';
import { TelegramAdPlacementStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { calculateAdPlacementDeleteAt } from './domain/sales-text';
import { adPlacementLifecycleReadyWhere } from '../../operations/scheduled-tasks/due-work-predicates';
import { notifyScheduledTaskDueWorkChanged } from '../../operations/scheduled-tasks/scheduled-task-wake-notifier';

/** Synchronizes the sales lifecycle only after the managed post identity is verified. */
@Injectable()
export class TelegramAdPlacementLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  async reconcilePublishedPlacements(limit = 100) {
    const placements = await this.prisma.telegramAdSalePlacement.findMany({
      where: adPlacementLifecycleReadyWhere(),
      select: {
        id: true,
        workspaceId: true,
        telegramChannelId: true,
        status: true,
        telegramPostId: true,
        deleteAfterHoursSnapshot: true,
        isPermanentSnapshot: true,
        managedPost: {
          select: { publishedAt: true, telegramMessageIds: true },
        },
      },
      take: Math.max(1, Math.min(500, limit)),
    });
    let reconciled = 0;
    for (const placement of placements) {
      const managedPost = placement.managedPost;
      const publishedAt = managedPost?.publishedAt;
      if (!publishedAt || !managedPost) continue;
      const telegramPost =
        placement.telegramPostId || !managedPost.telegramMessageIds.length
          ? null
          : await this.prisma.telegramPost.findFirst({
              where: {
                workspaceId: placement.workspaceId,
                telegramChannelId: placement.telegramChannelId,
                telegramMessageId: { in: managedPost.telegramMessageIds },
              },
              orderBy: { postDate: 'desc' },
              select: { id: true },
            });
      await this.prisma.telegramAdSalePlacement.update({
        where: { id: placement.id },
        data: {
          status: TelegramAdPlacementStatus.PUBLISHED,
          publishedAt,
          plannedDeleteAt: calculateAdPlacementDeleteAt({
            publishedAt,
            deleteAfterHoursSnapshot: placement.deleteAfterHoursSnapshot,
            isPermanentSnapshot: placement.isPermanentSnapshot,
          }),
          ...(telegramPost ? { telegramPostId: telegramPost.id } : {}),
        },
      });
      reconciled += 1;
    }
    if (reconciled) {
      notifyScheduledTaskDueWorkChanged('telegram_ad_sales.due_deletions');
    }
    return { reconciled };
  }
}
