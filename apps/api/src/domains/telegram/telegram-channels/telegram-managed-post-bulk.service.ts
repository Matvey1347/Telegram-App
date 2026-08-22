import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TelegramManagedPostStatus } from '@prisma/client';
import type {
  BulkActionResult,
  BulkActionResultItem,
  ScheduleManagedPostsBatchPayload,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { ApplicationLoggerService } from '../../operations/application-logs/application-logger.service';
import { ScheduleManagedPostsBatchDto } from './dto';
import { bulkActionCounts } from './post-groups.helpers';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { BulkProgressCallback } from './telegram-channels.internal';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import { TelegramPostGroupsService } from './telegram-post-groups.service';

@Injectable()
export class TelegramManagedPostBulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applicationLogger: ApplicationLoggerService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramManagedPostRevisionStore: TelegramManagedPostRevisionStore,
    private readonly telegramChannelCatalogService: TelegramChannelCatalogService,
    private readonly telegramPostGroupsService: TelegramPostGroupsService,
    private readonly telegramManagedPostPublicationService: TelegramManagedPostPublicationService,
  ) {}

  async scheduleManagedPostsBatch(
    userId: string,
    channelId: string,
    dto: ScheduleManagedPostsBatchDto | ScheduleManagedPostsBatchPayload,
    onProgress?: BulkProgressCallback,
  ): Promise<BulkActionResult> {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelCatalogService.findOne(userId, channelId);
    const items = dto.items ?? [];
    if (!items.length) {
      throw new BadRequestException('At least one post is required');
    }
    if (items.length > 50) {
      throw new BadRequestException('Batch schedule is limited to 50 posts');
    }
    const uniquePostIds = new Set(items.map((item) => item.postId));
    if (uniquePostIds.size !== items.length) {
      throw new BadRequestException('Duplicate postId in batch');
    }
    const uniqueScheduledAt = new Set(items.map((item) => item.scheduledAt));
    if (uniqueScheduledAt.size !== items.length) {
      throw new BadRequestException('Duplicate scheduledAt in batch');
    }

    const posts = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        id: { in: items.map((item) => item.postId) },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (posts.length !== items.length) {
      throw new NotFoundException('One or more posts were not found');
    }

    const postById = new Map(posts.map((post) => [post.id, post]));
    const requestedDates = items.map((item) => {
      const parsed = new Date(item.scheduledAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('One or more schedule dates are invalid');
      }
      if (parsed.getTime() <= Date.now()) {
        throw new BadRequestException('Schedule date must be in the future');
      }
      return parsed;
    });
    const occupiedPosts = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        status: TelegramManagedPostStatus.SCHEDULED,
        scheduledAt: { in: requestedDates },
        id: { notIn: items.map((item) => item.postId) },
      },
      select: { scheduledAt: true },
    });
    const occupiedTimes = new Set(
      occupiedPosts
        .map((post) => post.scheduledAt?.toISOString() ?? null)
        .filter((value): value is string => Boolean(value)),
    );
    if (requestedDates.some((date) => occupiedTimes.has(date.toISOString()))) {
      throw new BadRequestException(
        'One or more schedule times are already occupied',
      );
    }

    const results: BulkActionResultItem[] = [];
    const orderedItems = items
      .map((item, originalIndex) => ({ item, originalIndex }))
      .sort(
        (left, right) =>
          new Date(left.item.scheduledAt).getTime() -
            new Date(right.item.scheduledAt).getTime() ||
          left.originalIndex - right.originalIndex,
      );
    for (const [index, entry] of orderedItems.entries()) {
      const item = entry.item;
      const post = postById.get(item.postId)!;
      const scheduledAt = new Date(item.scheduledAt);
      const total = items.length;
      if (post.status === TelegramManagedPostStatus.PUBLISHED) {
        await this.appendBulkResult(
          results,
          this.skippedBulkItem(
            post,
            index + 1,
            total,
            'published posts cannot be scheduled',
          ),
          onProgress,
        );
        continue;
      }
      if (post.origin === 'TELEGRAM') {
        await this.appendBulkResult(
          results,
          this.skippedBulkItem(
            post,
            index + 1,
            total,
            'imported Telegram posts cannot be rescheduled',
          ),
          onProgress,
        );
        continue;
      }
      try {
        const scheduled =
          await this.telegramManagedPostPublicationService.publishManagedPost(
            workspaceId,
            channelId,
            post.id,
            scheduledAt,
            item.longTextMode === 'CAPTION_THEN_TEXT'
              ? 'CAPTION_THEN_TEXT'
              : 'IMAGES_THEN_TEXT',
          );
        await this.appendBulkResult(
          results,
          {
            postId: post.id,
            title: post.title,
            index: index + 1,
            total,
            previousStatus: post.status,
            newStatus: scheduled.status,
            scheduledAt: scheduled.scheduledAt?.toISOString() ?? null,
            action: 'SCHEDULED',
            success: true,
            message: `Post ${index + 1}/${total} scheduled`,
          },
          onProgress,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not schedule post';
        await this.appendBulkResult(
          results,
          {
            postId: post.id,
            title: post.title,
            index: index + 1,
            total,
            previousStatus: post.status,
            newStatus: TelegramManagedPostStatus.FAILED,
            scheduledAt: scheduledAt.toISOString(),
            action: 'FAILED',
            success: false,
            message: `Post ${index + 1}/${total} failed: ${message}`,
            error: message,
          },
          onProgress,
        );
      }
    }

    this.applicationLogger.info({
      event: 'telegram.managed_posts.batch_schedule.completed',
      message: 'Managed posts batch schedule completed',
      workspaceId,
      metadata: {
        telegramChannelId: channelId,
        total: items.length,
        successCount: results.filter((item) => item.success).length,
        failedCount: results.filter((item) => !item.success && !item.skipped)
          .length,
        skippedCount: results.filter((item) => item.skipped).length,
      },
    });

    return {
      action: 'SCHEDULE_SEQUENCE',
      postId: undefined,
      ...bulkActionCounts(results),
      results,
    };
  }

  public skippedBulkItem(
    post: {
      id: string;
      title: string;
      status: TelegramManagedPostStatus;
      scheduledAt?: Date | null;
    },
    index: number,
    total: number,
    reason: string,
  ): BulkActionResultItem {
    return {
      postId: post.id,
      title: post.title,
      index,
      total,
      previousStatus: post.status,
      newStatus: post.status,
      scheduledAt: post.scheduledAt?.toISOString() ?? null,
      action: 'SKIPPED',
      success: false,
      skipped: true,
      message: `Post ${index}/${total} skipped: ${reason}`,
    };
  }

  public async appendBulkResult(
    results: BulkActionResultItem[],
    item: BulkActionResultItem,
    onProgress?: BulkProgressCallback,
  ) {
    results.push(item);
    await onProgress?.(item, results.length, item.total);
  }
}
