import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { TelegramManagedPostStatus, TelegramSourceType } from '@prisma/client';
import type { BulkActionResultItem } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { MovePostChannelDto } from './dto';
import {
  bulkActionCounts,
  movedPostDatabaseState,
  movedPostState,
} from './post-groups.helpers';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { BulkProgressCallback } from './telegram-channels.internal';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import { TelegramPostGroupsService } from './telegram-post-groups.service';

@Injectable()
export class TelegramManagedPostMoveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramManagedPostRevisionStore: TelegramManagedPostRevisionStore,
    private readonly telegramPostGroupsService: TelegramPostGroupsService,
    private readonly telegramManagedPostPublicationService: TelegramManagedPostPublicationService,
  ) {}

  private readonly iconSelect = {
    id: true,
    type: true,
    name: true,
    emoji: true,
    imageUrl: true,
  } as const;

  private readonly memberSummarySelect = {
    id: true,
    role: true,
    telegramUsername: true,
    avatarIconId: true,
    avatarIcon: { select: this.iconSelect },
    user: { select: { id: true, name: true } },
  } as const;

  private readonly managedPostInclude = {
    assignedMember: { select: this.memberSummarySelect },
    group: {
      select: {
        id: true,
        workspaceId: true,
        telegramChannelId: true,
        title: true,
        icon: true,
        isSystem: true,
        systemKey: true,
        statusNumberingEnabled: true,
        sidebarPosition: true,
      },
    },
  } as const;

  public async moveManagedPostInternal(
    workspaceId: string,
    postId: string,
    targetTelegramChannelId: string,
    keepGroup: boolean,
  ) {
    const post = await this.prisma.telegramManagedPost.findFirst({
      where: { id: postId, workspaceId },
      include: { telegramChannel: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    const previousStatus = post.status;
    const transition = movedPostState(previousStatus);
    let cancellationError: string | null = null;

    if (
      previousStatus === TelegramManagedPostStatus.SCHEDULED &&
      post.telegramScheduledMessageIds.length
    ) {
      try {
        await this.telegramManagedPostPublicationService.cancelScheduledManagedPost(
          workspaceId,
          post,
        );
      } catch (error) {
        cancellationError =
          error instanceof Error
            ? error.message
            : 'Could not cancel the old scheduled message';
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.telegramManagedPost.update({
        where: { id: post.id },
        data: {
          telegramChannelId: targetTelegramChannelId,
          ...movedPostDatabaseState(
            previousStatus,
            post.scheduledAt,
            keepGroup,
            cancellationError,
          ),
          telegramScheduledMessageIds: cancellationError
            ? post.telegramScheduledMessageIds
            : [],
        },
      });
      if (post.groupId) {
        await this.telegramPostGroupsService.normalizePostGroupNumbering(
          tx,
          post.groupId,
        );
      }
    });

    if (cancellationError) {
      const failedPost = await this.prisma.telegramManagedPost.findUnique({
        where: { id: post.id },
        include: this.managedPostInclude,
      });
      return {
        post: failedPost,
        result: {
          postId: post.id,
          title: post.title,
          previousStatus,
          newStatus: TelegramManagedPostStatus.FAILED,
          scheduledAt: post.scheduledAt?.toISOString() ?? null,
          action: 'SCHEDULE_CANCEL_FAILED',
          success: false,
          error: cancellationError,
        },
      };
    }

    if (
      previousStatus === TelegramManagedPostStatus.SCHEDULED &&
      post.scheduledAt
    ) {
      try {
        const scheduledPost =
          await this.telegramManagedPostPublicationService.publishManagedPost(
            workspaceId,
            targetTelegramChannelId,
            post.id,
            post.scheduledAt,
            post.publishMode === 'CAPTION_THEN_TEXT'
              ? 'CAPTION_THEN_TEXT'
              : 'IMAGES_THEN_TEXT',
          );
        return {
          post: scheduledPost,
          result: {
            postId: post.id,
            title: post.title,
            previousStatus,
            newStatus: scheduledPost.status,
            scheduledAt: scheduledPost.scheduledAt?.toISOString() ?? null,
            action: transition.action,
            success: true,
          },
        };
      } catch (error) {
        const failedPost = await this.prisma.telegramManagedPost.findUnique({
          where: { id: post.id },
          include: this.managedPostInclude,
        });
        return {
          post: failedPost,
          result: {
            postId: post.id,
            title: post.title,
            previousStatus,
            newStatus: failedPost?.status ?? TelegramManagedPostStatus.FAILED,
            scheduledAt: failedPost?.scheduledAt?.toISOString() ?? null,
            action: 'RESCHEDULE_FAILED',
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Could not schedule post in target channel',
          },
        };
      }
    }

    const movedPost = await this.prisma.telegramManagedPost.findUnique({
      where: { id: post.id },
      include: this.managedPostInclude,
    });
    return {
      post: movedPost,
      result: {
        postId: post.id,
        title: post.title,
        previousStatus,
        newStatus: transition.status,
        scheduledAt: null,
        action: transition.action,
        success: true,
      },
    };
  }

  public moveBulkResultItem(
    result: {
      postId: string;
      title: string;
      previousStatus: TelegramManagedPostStatus;
      newStatus: TelegramManagedPostStatus;
      scheduledAt?: string | null;
      success: boolean;
      error?: string;
    },
    index: number,
    total: number,
  ): BulkActionResultItem {
    const action: BulkActionResultItem['action'] = result.success
      ? result.previousStatus === TelegramManagedPostStatus.PUBLISHED ||
        result.previousStatus === TelegramManagedPostStatus.FAILED ||
        result.previousStatus === TelegramManagedPostStatus.PUBLISHING
        ? 'CONVERTED_TO_DRAFT'
        : 'MOVED'
      : 'FAILED';
    const message = result.success
      ? action === 'CONVERTED_TO_DRAFT'
        ? `Post ${index}/${total} moved and converted to draft`
        : `Post ${index}/${total} moved`
      : `Post ${index}/${total} failed: ${result.error || 'Could not move post'}`;
    return {
      postId: result.postId,
      title: result.title,
      index,
      total,
      previousStatus: result.previousStatus,
      newStatus: result.newStatus,
      scheduledAt: result.scheduledAt ?? null,
      action,
      success: result.success,
      message,
      error: result.error,
    };
  }

  async moveManagedPost(
    userId: string,
    channelId: string,
    postId: string,
    dto: MovePostChannelDto,
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const [post, targetChannel] = await Promise.all([
      this.prisma.telegramManagedPost.findFirst({
        where: { id: postId, workspaceId, telegramChannelId: channelId },
        select: { id: true },
      }),
      this.prisma.telegramChannel.findFirst({
        where: {
          id: dto.targetTelegramChannelId,
          workspaceId,
          isActive: true,
        },
        select: { id: true },
      }),
    ]);
    if (!post) throw new NotFoundException('Post not found');
    if (!targetChannel)
      throw new NotFoundException('Target Telegram channel not found');
    if (channelId === targetChannel.id) {
      throw new BadRequestException('Post already belongs to target channel');
    }
    const moved = await this.moveManagedPostInternal(
      workspaceId,
      postId,
      targetChannel.id,
      false,
    );
    const results = [this.moveBulkResultItem(moved.result, 1, 1)];
    return {
      post: moved.post,
      postId,
      action: 'MOVE_POST_CHANNEL' as const,
      ...bulkActionCounts(results),
      results,
    };
  }

  async movePostGroup(
    userId: string,
    groupId: string,
    dto: MovePostChannelDto,
    onProgress?: BulkProgressCallback,
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const [group, targetChannel] = await Promise.all([
      this.prisma.postGroup.findFirst({
        where: { id: groupId, workspaceId },
        include: {
          posts: {
            orderBy: [{ groupPosition: 'asc' }, { createdAt: 'asc' }],
            select: { id: true },
          },
        },
      }),
      this.prisma.telegramChannel.findFirst({
        where: {
          id: dto.targetTelegramChannelId,
          workspaceId,
          isActive: true,
        },
        select: { id: true },
      }),
    ]);
    if (!group) throw new NotFoundException('Post group not found');
    if (!targetChannel)
      throw new NotFoundException('Target Telegram channel not found');
    if (group.telegramChannelId === targetChannel.id) {
      throw new BadRequestException('Group already belongs to target channel');
    }
    const originalChannelId = group.telegramChannelId;

    const rawResults: Array<{
      postId: string;
      title: string;
      previousStatus: TelegramManagedPostStatus;
      newStatus: TelegramManagedPostStatus;
      scheduledAt?: string | null;
      success: boolean;
      error?: string;
    }> = [];
    const movedPostIds: string[] = [];
    for (const [index, post] of group.posts.entries()) {
      const moved = await this.moveManagedPostInternal(
        workspaceId,
        post.id,
        targetChannel.id,
        true,
      );
      rawResults.push(moved.result);
      await onProgress?.(
        this.moveBulkResultItem(moved.result, index + 1, group.posts.length),
        index + 1,
        group.posts.length,
      );
      if (moved.result.success) {
        movedPostIds.push(post.id);
        continue;
      }

      const rollbackFailures: string[] = [];
      for (const movedPostId of movedPostIds.reverse()) {
        try {
          const rolledBack = await this.moveManagedPostInternal(
            workspaceId,
            movedPostId,
            originalChannelId,
            true,
          );
          if (!rolledBack.result.success) {
            rollbackFailures.push(
              `${rolledBack.result.title}: ${rolledBack.result.error || 'rollback failed'}`,
            );
          }
        } catch (error) {
          rollbackFailures.push(
            `${movedPostId}: ${error instanceof Error ? error.message : 'rollback failed'}`,
          );
        }
      }

      const moveError = moved.result.error || 'Could not move post';
      if (rollbackFailures.length) {
        throw new InternalServerErrorException(
          `Could not move group. ${moveError}. Rollback also failed for: ${rollbackFailures.join('; ')}`,
        );
      }
      throw new BadRequestException(
        `Could not move group. ${moveError}. The group was left in the original channel.`,
      );
    }
    await this.prisma.postGroup.update({
      where: { id: group.id },
      data: { telegramChannelId: targetChannel.id },
    });
    const results = rawResults.map((result, index) =>
      this.moveBulkResultItem(result, index + 1, rawResults.length),
    );
    return {
      group: await this.telegramPostGroupsService.postGroupForWorkspace(
        workspaceId,
        group.id,
      ),
      groupId,
      action: 'MOVE_GROUP_CHANNEL' as const,
      ...bulkActionCounts(results),
      results,
    };
  }

  async deleteManagedPost(userId: string, channelId: string, postId: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const post = await this.prisma.telegramManagedPost.findFirst({
      where: { id: postId, workspaceId, telegramChannelId: channelId },
      include: { telegramChannel: true },
    });
    if (!post) throw new NotFoundException('Post draft not found');
    if (
      post.status === 'SCHEDULED' &&
      post.telegramScheduledMessageIds.length
    ) {
      if (post.sourceType !== TelegramSourceType.MTPROTO || !post.sourceId) {
        throw new BadRequestException(
          'Scheduled post has no MTProto source and cannot be cancelled safely',
        );
      }
      const account = await this.telegramChannelAccessService.connectedAccount(
        workspaceId,
        channelId,
        post.sourceId,
      );
      const channelReference =
        this.telegramChannelAccessService.mtprotoChannelReference(
          post.telegramChannel,
        );
      if (!channelReference.telegramChatId && !channelReference.username)
        throw new BadRequestException('Channel has no Telegram reference');
      await this.mtprotoClient.deleteScheduledPost({
        ...this.telegramChannelAccessService.accountCredentials(account),
        channel: channelReference,
        messageIds: post.telegramScheduledMessageIds,
      });
    }
    return this.prisma.$transaction(async (tx) => {
      await this.telegramManagedPostRevisionStore.createManagedPostRevision(
        tx,
        post,
        'before_delete',
      );
      const deleted = await tx.telegramManagedPost.delete({
        where: { id: postId },
      });
      if (post.groupId) {
        await this.telegramPostGroupsService.normalizePostGroupNumbering(
          tx,
          post.groupId,
        );
      }
      return deleted;
    });
  }
}
