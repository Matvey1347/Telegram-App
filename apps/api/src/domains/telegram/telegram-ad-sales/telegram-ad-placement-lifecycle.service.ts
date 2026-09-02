import { Injectable } from '@nestjs/common';
import { TelegramAdPlacementStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { calculateAdPlacementDeleteAt } from './domain/sales-text';
import { adPlacementLifecycleReadyWhere } from '../../operations/scheduled-tasks/due-work-predicates';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import { TelegramAdSalesCustomerAutomationFactsService } from './telegram-ad-sales-customer-automation-facts.service';

/** Synchronizes the sales lifecycle only after the managed post identity is verified. */
@Injectable()
export class TelegramAdPlacementLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly automationFacts?: TelegramAdSalesCustomerAutomationFactsService,
  ) {}

  async reconcilePublishedPlacements(limit = 100) {
    const placements = await this.prisma.telegramAdSalePlacement.findMany({
      where: adPlacementLifecycleReadyWhere(),
      select: {
        id: true,
        workspaceId: true,
        telegramAdSaleId: true,
        telegramChannelId: true,
        scheduledAt: true,
        status: true,
        telegramPostId: true,
        deleteAfterHoursSnapshot: true,
        isPermanentSnapshot: true,
        managedPost: {
          select: { publishedAt: true, telegramMessageIds: true },
        },
        telegramPost: { select: { id: true, postDate: true } },
      },
      take: Math.max(1, Math.min(500, limit)),
    });
    let reconciled = 0;
    const publicationFacts: Array<{ workspaceId: string; dealId: string }> = [];
    for (const placement of placements) {
      const managedPost = placement.managedPost;
      const publishedAt =
        placement.telegramPost?.postDate ?? managedPost?.publishedAt;
      if (!publishedAt) continue;
      const telegramPost =
        placement.telegramPost ??
        (!managedPost?.telegramMessageIds.length
          ? null
          : await this.prisma.telegramPost.findFirst({
              where: {
                workspaceId: placement.workspaceId,
                telegramChannelId: placement.telegramChannelId,
                telegramMessageId: { in: managedPost.telegramMessageIds },
              },
              orderBy: { postDate: 'desc' },
              select: { id: true, postDate: true },
            }));
      await this.prisma.telegramAdSalePlacement.update({
        where: { id: placement.id },
        data: {
          status: TelegramAdPlacementStatus.PUBLISHED,
          publishedAt: telegramPost?.postDate ?? publishedAt,
          plannedDeleteAt: calculateAdPlacementDeleteAt({
            scheduledAt: placement.scheduledAt,
            publishedAt: telegramPost?.postDate ?? publishedAt,
            deleteAfterHoursSnapshot: placement.deleteAfterHoursSnapshot,
            isPermanentSnapshot: placement.isPermanentSnapshot,
          }),
          ...(telegramPost ? { telegramPostId: telegramPost.id } : {}),
        },
      });
      reconciled += 1;
      publicationFacts.push({
        workspaceId: placement.workspaceId,
        dealId: placement.telegramAdSaleId,
      });
    }
    if (reconciled) {
      notifyScheduledTaskDueWorkChanged('telegram_ad_sales.due_deletions');
      await this.automationFacts?.verifiedPublications(publicationFacts);
    }
    return { reconciled };
  }
}
