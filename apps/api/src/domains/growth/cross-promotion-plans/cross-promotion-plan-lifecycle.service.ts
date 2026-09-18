import { Injectable } from '@nestjs/common';
import type { CrossPromotionPlacementPost } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import { TelegramManagedPostRemoteDeletionService } from '../../telegram/telegram-channels/telegram-managed-post-remote-deletion.service';

type Placement = { telegramChannelId: string; managedPostId: string };
const json = <T>(value: unknown, fallback: T): T =>
  value && typeof value === 'object' ? (value as T) : fallback;

@Injectable()
export class CrossPromotionPlanLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly remoteDeletion: TelegramManagedPostRemoteDeletionService,
  ) {}

  async nextDueAt() {
    return (
      (
        await this.prisma.crossPromotionPlan.findFirst({
          where: {
            status: { in: ['SCHEDULED', 'ACTIVE'] },
            nextDueAt: { not: null },
          },
          orderBy: [{ nextDueAt: 'asc' }, { id: 'asc' }],
          select: { nextDueAt: true },
        })
      )?.nextDueAt ?? null
    );
  }

  async processDueActions(now = new Date(), limit = 20) {
    const plans = await this.prisma.crossPromotionPlan.findMany({
      where: {
        status: { in: ['SCHEDULED', 'ACTIVE'] },
        nextDueAt: { lte: now },
      },
      orderBy: [{ nextDueAt: 'asc' }, { id: 'asc' }],
      take: Math.max(1, Math.min(limit, 100)),
    });
    let completed = 0;
    let retried = 0;
    for (const plan of plans) {
      const post = json<CrossPromotionPlacementPost>(plan.publicationPost, {
        title: '',
        text: '',
        imageUrls: [],
        buttonRows: [],
      });
      const stored = json<Placement[]>(plan.placementPostIds, []);
      const configured = post.publisherPlacements ?? [];
      const legacyDue = configured.every((placement) => !placement.deleteAt);
      const dueIds = stored
        .filter((placement) => {
          const config = configured.find(
            (item) => item.telegramChannelId === placement.telegramChannelId,
          );
          return (
            legacyDue ||
            Boolean(
              config?.deleteAt && Date.parse(config.deleteAt) <= now.getTime(),
            )
          );
        })
        .map((placement) => placement.managedPostId);
      const deletion = await this.remoteDeletion.deletePublishedManagedPosts({
        workspaceId: plan.workspaceId,
        managedPostIds: dueIds,
      });
      if (deletion.failed) {
        await this.prisma.crossPromotionPlan.update({
          where: { id: plan.id },
          data: {
            status: 'ACTIVE',
            nextDueAt: new Date(now.getTime() + 60_000),
            lastError:
              deletion.results.find((item) => !item.success)?.error ??
              'Telegram deletion failed',
          },
        });
        retried += 1;
        continue;
      }
      const future = configured
        .flatMap((placement) =>
          placement.deleteAt ? [Date.parse(placement.deleteAt)] : [],
        )
        .filter(
          (timestamp) =>
            Number.isFinite(timestamp) && timestamp > now.getTime(),
        );
      await this.prisma.crossPromotionPlan.update({
        where: { id: plan.id },
        data: future.length
          ? {
              status: 'ACTIVE',
              nextDueAt: new Date(Math.min(...future)),
              lastError: null,
            }
          : {
              status: 'COMPLETED',
              nextDueAt: null,
              trackingEndsAt: plan.trackingEndsAt ?? now,
              lastError: null,
            },
      });
      if (!future.length) completed += 1;
    }
    notifyScheduledTaskDueWorkChanged('mutual_promotion.lifecycle');
    return {
      considered: plans.length,
      processed: plans.length,
      completed,
      retried,
    };
  }
}
