import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
} from '@prisma/client';
import type {
  BulkActionResult,
  BulkActionResultItem,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { PublishPostGroupDto, SchedulePostGroupSequenceDto } from './dto';
import {
  bulkActionCounts,
  publishGroupPostSkipReason,
  scheduleGroupPostSkipReason,
  scheduleSequenceDates,
} from './post-groups.helpers';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { BulkProgressCallback } from './telegram-channels.internal';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import {
  postGroupNotFound,
  telegramPostsBadRequest,
} from './telegram-posts.errors';

@Injectable()
export class TelegramManagedPostGroupBulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramPostGroupsService: TelegramPostGroupsService,
    private readonly telegramManagedPostPublicationService: TelegramManagedPostPublicationService,
  ) {}

  async publishPostGroup(
    userId: string,
    groupId: string,
    dto: PublishPostGroupDto,
    onProgress?: BulkProgressCallback,
  ): Promise<BulkActionResult> {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const group = await this.prisma.postGroup.findFirst({
      where: { id: groupId, workspaceId },
      include: {
        posts: {
          orderBy: [{ groupPosition: 'asc' }, { createdAt: 'asc' }],
          include: { telegramChannel: true },
        },
      },
    });
    if (!group) throw postGroupNotFound();
    if (!group.posts.length)
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_INVALID_SCHEDULE',
        'Post group is empty',
      );
    const includeScheduled = dto.includeScheduled ?? true;
    const includeFailed = dto.includeFailed ?? true;
    const republishPublished = dto.republishPublished ?? false;
    const total = group.posts.length;
    const results: BulkActionResultItem[] = [];

    for (const [offset, post] of group.posts.entries()) {
      const index = offset + 1;
      const skipReason = publishGroupPostSkipReason(post.status, {
        includeScheduled,
        includeFailed,
        republishPublished,
      });
      if (skipReason) {
        await this.appendBulkResult(
          results,
          this.skippedBulkItem(post, index, total, skipReason),
          onProgress,
        );
        continue;
      }

      const previousStatus = post.status;
      try {
        if (previousStatus === TelegramManagedPostStatus.SCHEDULED) {
          await this.telegramManagedPostPublicationService.cancelScheduledManagedPost(
            workspaceId,
            post,
          );
          await this.prisma.telegramManagedPost.update({
            where: { id: post.id },
            data: {
              status: TelegramManagedPostStatus.DRAFT,
              telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
              scheduledAt: null,
              telegramScheduledMessageIds: [],
              telegramMessageIds: [],
              telegramMessageUrls: [],
              sourceType: null,
              sourceId: null,
              lastError: null,
            },
          });
        }
        const published =
          await this.telegramManagedPostPublicationService.publishManagedPost(
            workspaceId,
            group.telegramChannelId,
            post.id,
            undefined,
            post.publishMode === 'CAPTION_THEN_TEXT'
              ? 'CAPTION_THEN_TEXT'
              : 'IMAGES_THEN_TEXT',
            userId,
          );
        await this.appendBulkResult(
          results,
          {
            postId: post.id,
            title: post.title,
            index,
            total,
            previousStatus,
            newStatus: published.status,
            scheduledAt: null,
            action: 'PUBLISHED',
            success: true,
            message: `Post ${index}/${total} published`,
          },
          onProgress,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not publish post';
        await this.prisma.telegramManagedPost.update({
          where: { id: post.id },
          data: {
            status: TelegramManagedPostStatus.FAILED,
            lastError: message,
          },
        });
        await this.appendBulkResult(
          results,
          {
            postId: post.id,
            title: post.title,
            index,
            total,
            previousStatus,
            newStatus: TelegramManagedPostStatus.FAILED,
            scheduledAt: null,
            action: 'FAILED',
            success: false,
            message: `Post ${index}/${total} failed: ${message}`,
            error: message,
            errorCode: 'TELEGRAM_POST_PUBLISH_FAILED',
          },
          onProgress,
        );
      }
    }
    await this.prisma.$transaction((tx) =>
      this.telegramPostGroupsService.normalizePostGroupNumbering(tx, groupId),
    );
    return {
      groupId,
      action: 'PUBLISH_ALL',
      ...bulkActionCounts(results),
      results,
    };
  }

  async resetPostGroupToDrafts(
    userId: string,
    groupId: string,
    onProgress?: BulkProgressCallback,
  ): Promise<BulkActionResult> {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const group = await this.prisma.postGroup.findFirst({
      where: { id: groupId, workspaceId },
      include: {
        posts: {
          orderBy: [{ groupPosition: 'asc' }, { createdAt: 'asc' }],
          include: { telegramChannel: true },
        },
      },
    });
    if (!group) throw postGroupNotFound();
    if (!group.posts.length)
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_INVALID_SCHEDULE',
        'Post group is empty',
      );
    const total = group.posts.length;
    const results: BulkActionResultItem[] = [];

    for (const [offset, post] of group.posts.entries()) {
      const index = offset + 1;
      const previousStatus = post.status;
      if (previousStatus === TelegramManagedPostStatus.DRAFT) {
        await this.appendBulkResult(
          results,
          this.skippedBulkItem(post, index, total, 'already a draft'),
          onProgress,
        );
        continue;
      }
      try {
        if (previousStatus === TelegramManagedPostStatus.SCHEDULED) {
          await this.telegramManagedPostPublicationService.cancelScheduledManagedPost(
            workspaceId,
            post,
          );
        }
        await this.prisma.telegramManagedPost.update({
          where: { id: post.id },
          data: {
            status: TelegramManagedPostStatus.DRAFT,
            telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
            scheduledAt: null,
            publishedAt: null,
            telegramScheduledMessageIds: [],
            telegramMessageIds: [],
            telegramMessageUrls: [],
            sourceType: null,
            sourceId: null,
            publishMode: null,
            lastError: null,
          },
        });
        await this.appendBulkResult(
          results,
          {
            postId: post.id,
            title: post.title,
            index,
            total,
            previousStatus,
            newStatus: TelegramManagedPostStatus.DRAFT,
            scheduledAt: null,
            action: 'CONVERTED_TO_DRAFT',
            success: true,
            message: `Post ${index}/${total} converted to draft`,
          },
          onProgress,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not reset post';
        await this.appendBulkResult(
          results,
          {
            postId: post.id,
            title: post.title,
            index,
            total,
            previousStatus,
            newStatus: previousStatus,
            scheduledAt: post.scheduledAt?.toISOString() ?? null,
            action: 'FAILED',
            success: false,
            message: `Post ${index}/${total} failed: ${message}`,
            error: message,
            errorCode: 'TELEGRAM_POST_PUBLISH_FAILED',
          },
          onProgress,
        );
      }
    }
    await this.prisma.$transaction((tx) =>
      this.telegramPostGroupsService.normalizePostGroupNumbering(tx, groupId),
    );
    return {
      groupId,
      action: 'RESET_GROUP_TO_DRAFT',
      ...bulkActionCounts(results),
      results,
    };
  }

  async schedulePostGroupSequence(
    userId: string,
    groupId: string,
    dto: SchedulePostGroupSequenceDto,
    onProgress?: BulkProgressCallback,
  ): Promise<BulkActionResult> {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const group = await this.prisma.postGroup.findFirst({
      where: { id: groupId, workspaceId },
      include: {
        posts: {
          orderBy: [{ groupPosition: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!group) throw postGroupNotFound();
    if (!group.posts.length)
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_INVALID_SCHEDULE',
        'Post group is empty',
      );
    const overwriteExistingScheduled = dto.overwriteExistingScheduled ?? false;
    const includeFailed = dto.includeFailed ?? true;
    const includeDraftsOnly = dto.includeDraftsOnly ?? false;
    const timezone = dto.timezone?.trim() || 'UTC';
    const scheduleOptions = {
      includeDraftsOnly,
      overwriteExistingScheduled,
      includeFailed,
    };
    const selectedPosts = group.posts.filter(
      (post) => !scheduleGroupPostSkipReason(post.status, scheduleOptions),
    );
    const dates = scheduleSequenceDates(
      dto.startDate.slice(0, 10),
      dto.time,
      dto.intervalDays,
      selectedPosts.length,
      timezone,
    );
    if (dates.some((date) => date.getTime() <= Date.now())) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_SCHEDULE_IN_PAST',
        'Every schedule date must be in the future',
      );
    }
    const scheduleByPostId = new Map(
      selectedPosts.map((post, index) => [post.id, dates[index]]),
    );
    const total = group.posts.length;
    const results: BulkActionResultItem[] = [];

    for (const [offset, post] of group.posts.entries()) {
      const index = offset + 1;
      const scheduledAt = scheduleByPostId.get(post.id);
      if (!scheduledAt) {
        const reason =
          scheduleGroupPostSkipReason(post.status, scheduleOptions) ||
          'post is not selected';
        await this.appendBulkResult(
          results,
          this.skippedBulkItem(post, index, total, reason),
          onProgress,
        );
        continue;
      }
      const previousStatus = post.status;
      try {
        const scheduled =
          await this.telegramManagedPostPublicationService.publishManagedPost(
            workspaceId,
            group.telegramChannelId,
            post.id,
            scheduledAt,
            post.publishMode === 'CAPTION_THEN_TEXT'
              ? 'CAPTION_THEN_TEXT'
              : 'IMAGES_THEN_TEXT',
            userId,
          );
        await this.appendBulkResult(
          results,
          {
            postId: post.id,
            title: post.title,
            index,
            total,
            previousStatus,
            newStatus: scheduled.status,
            scheduledAt: scheduled.scheduledAt?.toISOString() ?? null,
            action: 'SCHEDULED',
            success: true,
            message: `Post ${index}/${total} scheduled for ${scheduledAt.toISOString()} (${timezone})`,
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
            index,
            total,
            previousStatus,
            newStatus: TelegramManagedPostStatus.FAILED,
            scheduledAt: scheduledAt.toISOString(),
            action: 'FAILED',
            success: false,
            message: `Post ${index}/${total} failed: ${message}`,
            error: message,
            errorCode: 'TELEGRAM_POST_PUBLISH_FAILED',
          },
          onProgress,
        );
      }
    }
    await this.prisma.$transaction((tx) =>
      this.telegramPostGroupsService.normalizePostGroupNumbering(tx, groupId),
    );
    return {
      groupId,
      action: 'SCHEDULE_SEQUENCE',
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
      errorCode: 'TELEGRAM_POST_NOT_EDITABLE',
      errorParams: { reason },
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
