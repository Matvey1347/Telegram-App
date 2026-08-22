import { BadRequestException, Injectable } from '@nestjs/common';
import { TelegramManagedPostStatus } from '@prisma/client';
import type {
  BulkActionResult,
  BulkActionResultItem,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { PostIdsDto } from './dto';
import { bulkActionCounts } from './post-groups.helpers';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { BulkProgressCallback } from './telegram-channels.internal';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import { TelegramPostGroupsService } from './telegram-post-groups.service';

@Injectable()
export class TelegramManagedPostDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramManagedPostRevisionStore: TelegramManagedPostRevisionStore,
    private readonly telegramChannelCatalogService: TelegramChannelCatalogService,
    private readonly telegramPostGroupsService: TelegramPostGroupsService,
    private readonly telegramManagedPostPublicationService: TelegramManagedPostPublicationService,
  ) {}

  async deleteManagedPostsBatch(
    userId: string,
    channelId: string,
    dto: PostIdsDto,
    onProgress?: BulkProgressCallback,
  ): Promise<BulkActionResult> {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelCatalogService.findOne(userId, channelId);
    const postIds = [
      ...new Set(dto.postIds.map((id) => id.trim()).filter(Boolean)),
    ];
    if (!postIds.length) {
      throw new BadRequestException('postIds must contain at least one post');
    }
    const posts = await this.prisma.telegramManagedPost.findMany({
      where: {
        id: { in: postIds },
        workspaceId,
        telegramChannelId: channelId,
      },
      include: { telegramChannel: true },
    });
    const postById = new Map(posts.map((post) => [post.id, post]));
    const total = postIds.length;
    const results: BulkActionResultItem[] = [];
    const affectedGroupIds = new Set<string>();

    for (const [offset, postId] of postIds.entries()) {
      const index = offset + 1;
      const post = postById.get(postId);
      if (!post) {
        await this.appendBulkResult(
          results,
          {
            postId,
            index,
            total,
            action: 'FAILED',
            success: false,
            message: `Post ${index}/${total} failed: post not found`,
            error: 'Post draft not found',
          },
          onProgress,
        );
        continue;
      }
      const previousStatus = post.status;
      try {
        if (
          post.status === TelegramManagedPostStatus.SCHEDULED &&
          post.telegramScheduledMessageIds.length
        ) {
          await this.telegramManagedPostPublicationService.cancelScheduledManagedPost(
            workspaceId,
            post,
          );
        }
        await this.prisma.$transaction(async (tx) => {
          await this.telegramManagedPostRevisionStore.createManagedPostRevision(
            tx,
            post,
            'before_delete',
          );
          await tx.telegramManagedPost.delete({ where: { id: post.id } });
        });
        if (post.groupId) affectedGroupIds.add(post.groupId);
        await this.appendBulkResult(
          results,
          {
            postId: post.id,
            title: post.title,
            index,
            total,
            previousStatus,
            action: 'DELETED',
            success: true,
            message: `Post ${index}/${total} deleted`,
          },
          onProgress,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not delete post';
        await this.appendBulkResult(
          results,
          {
            postId: post.id,
            title: post.title,
            index,
            total,
            previousStatus,
            newStatus: previousStatus,
            action: 'FAILED',
            success: false,
            message: `Post ${index}/${total} failed: ${message}`,
            error: message,
          },
          onProgress,
        );
      }
    }

    if (affectedGroupIds.size) {
      await this.prisma.$transaction((tx) =>
        Promise.all(
          [...affectedGroupIds].map((groupId) =>
            this.telegramPostGroupsService.normalizePostGroupNumbering(
              tx,
              groupId,
            ),
          ),
        ),
      );
    }

    return {
      action: 'DELETE_POSTS',
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
