import { Injectable } from '@nestjs/common';
import { Prisma, TelegramManagedPostStatus } from '@prisma/client';
import type { TelegramManagedPostCalendarResult } from '@telegram-system/shared';
import { ResponseCacheService } from '../../../common/response-cache.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ManagedPostsCalendarQueryDto } from './dto';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { telegramPostsBadRequest } from './telegram-posts.errors';

@Injectable()
export class TelegramManagedPostCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly responseCache: ResponseCacheService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelCatalogService: TelegramChannelCatalogService,
  ) {}

  async managedPostsCalendar(
    userId: string,
    channelId: string,
    query: ManagedPostsCalendarQueryDto,
  ): Promise<TelegramManagedPostCalendarResult> {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelCatalogService.findOne(userId, channelId);
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_CALENDAR_RANGE_INVALID',
        'Calendar range is invalid',
      );
    }
    if (to < from) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_CALENDAR_RANGE_INVALID',
        'Calendar range is invalid',
      );
    }
    const maxRangeMs = 366 * 24 * 60 * 60 * 1000;
    if (to.getTime() - from.getTime() > maxRangeMs) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_CALENDAR_RANGE_TOO_LARGE',
        'Calendar range is too large',
        { maxDays: 366 },
      );
    }
    const now = new Date();
    const publishedRangeEnd = to < now ? to : now;

    const fromIso = from.toISOString();
    const toIso = to.toISOString();
    return this.responseCache.getOrSet(
      this.telegramChannelsSupportService.managedPostsCalendarCacheKey(
        userId,
        workspaceId,
        channelId,
        fromIso,
        toIso,
      ),
      15_000,
      async () => {
        const calendarWhere: Prisma.TelegramManagedPostWhereInput = {
          workspaceId,
          telegramChannelId: channelId,
          OR: [
            {
              status: TelegramManagedPostStatus.SCHEDULED,
              scheduledAt: { gte: from, lte: to },
            },
            ...(publishedRangeEnd >= from
              ? [
                  {
                    status: TelegramManagedPostStatus.PUBLISHED,
                    publishedAt: { gte: from, lte: publishedRangeEnd },
                  } satisfies Prisma.TelegramManagedPostWhereInput,
                ]
              : []),
          ],
        };
        const items = await this.prisma.telegramManagedPost.findMany({
          where: calendarWhere,
          orderBy: [
            { scheduledAt: 'asc' },
            { publishedAt: 'asc' },
            { createdAt: 'asc' },
          ],
          include: {
            assignedMember: WorkspaceService.assignedMemberInclude,
            group: { select: { id: true, title: true, icon: true } },
          },
        });

        const [futureScheduledTotal, lastScheduled] = await Promise.all([
          this.prisma.telegramManagedPost.count({
            where: {
              workspaceId,
              telegramChannelId: channelId,
              status: TelegramManagedPostStatus.SCHEDULED,
              scheduledAt: { gt: new Date() },
            },
          }),
          this.prisma.telegramManagedPost.findFirst({
            where: {
              workspaceId,
              telegramChannelId: channelId,
              status: TelegramManagedPostStatus.SCHEDULED,
              scheduledAt: { gt: new Date() },
            },
            orderBy: { scheduledAt: 'desc' },
            select: { scheduledAt: true },
          }),
        ]);

        return {
          from: fromIso,
          to: toIso,
          items: items.map((item) => ({
            id: item.id,
            telegramChannelId: item.telegramChannelId,
            title: item.title,
            text: item.text,
            status: item.status as 'SCHEDULED' | 'PUBLISHED',
            scheduledAt: item.scheduledAt?.toISOString() ?? null,
            publishedAt: item.publishedAt?.toISOString() ?? null,
            origin: item.origin,
            telegramRemoteStatus: item.telegramRemoteStatus,
            telegramMessageUrls: item.telegramMessageUrls,
            telegramIdVerificationStatus: item.telegramIdVerificationStatus,
            telegramLinkSource: item.telegramLinkSource,
            hasMedia: item.imageUrls.length > 0,
            plannerFormatId: item.plannerFormatId,
            plannerSlotId: item.plannerSlotId,
            plannerRunId: item.plannerRunId,
            plannerPlannedAt: item.plannerPlannedAt?.toISOString() ?? null,
            plannerProvenance: item.plannerProvenance,
            isAutoPlanned: Boolean(item.plannerRunId && item.plannerSlotId),
            group: item.group,
            assignedMember: {
              id: item.assignedMember.id,
              workspaceId: item.assignedMember.workspaceId,
              name: item.assignedMember.user?.name ?? item.assignedMember.id,
              email: item.assignedMember.user?.email ?? null,
              photoUrl: item.assignedMember.avatarIcon?.imageUrl ?? null,
              role: item.assignedMember.role,
            },
          })),
          summary: {
            scheduledInRange: items.filter(
              (item) => item.status === 'SCHEDULED',
            ).length,
            publishedInRange: items.filter(
              (item) => item.status === 'PUBLISHED',
            ).length,
            futureScheduledTotal,
            lastScheduledAt: lastScheduled?.scheduledAt?.toISOString() ?? null,
          },
        };
      },
    );
  }
}
